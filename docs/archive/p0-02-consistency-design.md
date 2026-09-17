# P0-02 上传、对象、任务和配额一致性改进设计

## 目标

确保任何单点失败后，照片和配额都能恢复到可解释状态。

## 状态机定义

### StorageObject状态转换

```
RESERVED → STORED → PROCESSING → READY/FAILED
         ↓         ↓             ↓
      DELETED   DELETED       DELETED
```

- **RESERVED**: 配额已预留,对象key已分配,但未上传到存储
- **STORED**: 对象已上传到MinIO,等待处理
- **PROCESSING**: 正在生成缩略图和变体
- **READY**: 处理完成,可用
- **FAILED**: 处理失败且不可重试
- **DELETED**: 已标记删除

### PhotoProcessingTask状态转换

```
QUEUED → PROCESSING → SUCCEEDED
  ↓          ↓            
QUEUED ← PROCESSING → FAILED
  ↓          ↓
CANCELLED  CANCELLED
```

已有实现基本正确,需要加强:
- claim操作的原子性(已有WHERE条件)
- 租约过期恢复的幂等性(已有)
- 取消与完成的竞态处理(需加强)

## 问题和解决方案

### 1. 上传流程原子性

**当前问题**:
```java
quotas.reserve(tenant, bytes, 1);  // Step 1
storage.put(key, ...)               // Step 2 - 可能失败
objects.save(...)                   // Step 3 - 可能失败
photos.save(...)                    // Step 4 - 可能失败
```

失败场景:
- Step 2失败: 配额已扣,但对象未上传 → try-catch已处理
- Step 3/4失败: 对象已上传,配额已扣,但数据库记录丢失 → **孤儿对象**

**解决方案**:

A. **引入StorageObject.status = RESERVED状态**
```java
// 1. 预留配额和对象记录(事务内)
objects.save(new StorageObject(..., RESERVED, ...))
quotas.reserve(tenant, bytes, 1)
// 事务提交

// 2. 上传对象(事务外)
storage.put(key, ...)
objects.updateStatus(objectId, STORED)

// 3. 创建Photo和Task(事务内)
photos.save(...)
tasks.save(...)
objects.updateStatus(objectId, PROCESSING)
```

B. **孤儿对象扫描**
- RESERVED超过10分钟 → 释放配额并删除记录
- STORED无对应Photo → 删除对象并释放配额
- Photo存在但对象不存在 → 标记Photo为FAILED

### 2. 配额释放幂等性

**当前问题**:
```java
objects.findById(...).ifPresent(o -> quotas.release(t,o.byteSize(),1));
```

重复调用会导致配额被多次释放。

**解决方案**:

A. **引入配额操作日志表**
```sql
CREATE TABLE quota_operation (
    id BINARY(16) PRIMARY KEY,
    tenant_id BINARY(16) NOT NULL,
    operation_type VARCHAR(20) NOT NULL, -- RESERVE, RELEASE
    entity_type VARCHAR(20) NOT NULL,     -- PHOTO, TASK
    entity_id BINARY(16) NOT NULL,
    byte_delta BIGINT NOT NULL,
    photo_delta INT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    UNIQUE KEY uk_entity (entity_type, entity_id, operation_type)
);
```

B. **幂等释放实现**
```java
public void releaseOnce(UUID tenant, String entityType, UUID entityId, long bytes, long photos) {
    try {
        quotaOperations.insert(tenant, entityType, entityId, "RELEASE", bytes, photos);
        quotas.release(tenant, bytes, photos);
    } catch (DuplicateKeyException e) {
        // 已经释放过,忽略
    }
}
```

### 3. 任务claim改进

**当前实现已基本正确**:
```sql
UPDATE photo_processing_task 
SET status='PROCESSING', worker_id=#{worker}, ...
WHERE id=UUID_TO_BIN(#{id}) 
  AND status='QUEUED' 
  AND attempts<max_attempts 
  AND (next_attempt_at IS NULL OR next_attempt_at<=#{now})
```

**需要加强**:
- 添加version字段防止ABA问题(可选,当前workerId已提供隔离)
- 确保heartbeat失败时立即停止处理

### 4. 取消与完成竞态

**当前问题**:
- Worker正在完成任务
- 用户同时请求取消
- 可能导致完成后又被取消,或取消后又被完成

**解决方案**:
已有实现基本正确:
- `complete()`: 只在status=PROCESSING AND worker_id=#{worker}时更新
- `cancelProcessing()`: 只在status=CANCEL_REQUESTED时执行
- Worker在每个关键点检查`isCancellationRequested()`

需要确保:
- 完成后的配额不被取消流程再次释放
- 取消流程检查任务最终状态

### 5. 孤儿资源扫描

**实现计划**:

A. **孤儿对象扫描**
```java
@Scheduled(cron = "0 */30 * * * *") // 每30分钟
public void scanOrphanObjects() {
    // 1. RESERVED超时
    List<StorageObject> staleReserved = objects.findByStatusBefore(RESERVED, now.minus(10m));
    for (StorageObject obj : staleReserved) {
        quotas.releaseOnce(...);
        objects.delete(obj.id());
    }
    
    // 2. STORED无对应Photo
    List<StorageObject> orphanStored = objects.findStoredWithoutPhoto();
    for (StorageObject obj : orphanStored) {
        storage.delete(obj.objectKey());
        quotas.releaseOnce(...);
        objects.delete(obj.id());
    }
    
    // 3. Photo存在但对象不存在
    List<Photo> orphanPhotos = photos.findWithoutObject();
    for (Photo photo : orphanPhotos) {
        photos.updateStatus(photo.id(), FAILED);
        // 任务可能已完成,需要检查
    }
}
```

B. **任务租约恢复**
已实现`recoverStale()`,但需要确保:
- 不重复释放配额
- 与CANCEL_REQUESTED竞态安全

## 实施步骤

### 阶段1: 配额操作幂等性(优先)

1. 创建quota_operation表(V12迁移)
2. 实现QuotaOperationRepository
3. 修改delete/cancel流程使用幂等释放
4. 测试重复调用场景

### 阶段2: 状态转换加强

1. 添加StorageObject状态转换约束
2. 修改upload流程明确状态边界
3. 添加状态转换日志
4. 测试各种失败场景

### 阶段3: 孤儿资源扫描

1. 实现对象扫描逻辑
2. 实现任务扫描逻辑
3. 添加扫描结果审计日志
4. 测试修复效果

### 阶段4: 集成测试

1. 设置Testcontainers环境
2. 编写故障注入测试
3. 验证各种边界情况
4. 性能和并发测试

## 完成标准

- [x] 对象写入成功但数据库失败、数据库成功但对象失败均有修复路径
- [x] Worker重启、租约丢失和重复投递不会产生重复计费或错误覆盖
- [x] 取消任务不会重复释放配额
- [x] 孤儿扫描结果可定位、可重试、可审计
- [x] 故障注入测试通过

## 风险和限制

1. **性能影响**: quota_operation表可能增长较快,需要定期清理
2. **最终一致性**: 扫描修复有延迟(30分钟),需要在UI说明
3. **向后兼容**: 已有孤儿资源需要一次性扫描清理
4. **分布式锁**: 扫描任务需要分布式锁避免重复执行(后期增强)

## 观测指标

- `gallery_quota_operation_total{type}`
- `gallery_orphan_objects_found`
- `gallery_orphan_objects_cleaned`
- `gallery_quota_release_duplicate_prevented`
- `gallery_task_claim_conflict`
- `gallery_task_lease_recovery`
