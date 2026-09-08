# M7 真实环境验收报告

> 验收日期：2026-09-08
> 环境：Docker Compose、本地 MySQL 8.4、Redis 7.4、MinIO、Gallery API `http://localhost:8088`、Viewer `http://localhost:5174`
> 分支：`feat/gallery-workspace-slice`

## 结论

M7.1 配置版本化和 M7.2 TEXTURE 阶段已通过真实环境验收。M7.3 的基础设备自适应逻辑存在，但完整的 LOD、持续低 FPS 阶梯降级和 WebGL 失败回退尚未形成可验收闭环，因此不能将 M7 整体标记为完成。

## 已通过项目

### 1. Docker、Flyway 和历史数据

- Compose 四项服务均为 healthy：`gallery-api`、`mysql`、`redis`、`minio`。
- `/actuator/health` 返回 `{"status":"UP"}`。
- Flyway V1–V10 全部成功，V9、V10 的 `success=1`。
- `gallery_viewer_config_version` 已创建，现有配置迁移为历史版本。
- `gallery_viewer_config` 已包含 `schema_version`、`updated_by_user_id`、`last_published_at`、`published_version_id`。

### 2. M7.1 配置版本化真实 API

使用独立验收账号和真实 HTTP API 完成：

1. `PUT /api/galleries/{id}/viewer-config` 保存草稿，返回 200。
2. 草稿保存不新增版本，公开发布快照不改变。
3. `POST /viewer-config/publish` 连续发布两次，版本历史 `total=2`，两个版本 ID 不同。
4. `GET /viewer-config/versions` 返回版本列表。
5. `POST /viewer-config/rollback` 回滚首个版本，新增第三个版本。
6. 回滚后配置恢复为首个版本内容，数据库 `published_version_id` 指向新回滚版本。
7. 错误请求体正确返回 `400 MALFORMED_JSON`，说明异常映射生效。

验收 Gallery：`fb08f2fc-d68c-4d5c-9c3d-575b5ae042fb`

### 3. M7.2 3D TEXTURE 真实链路

- 将 Gallery 配置为 `viewMode=3d`、`layout.mode=sphere`、`presetName=3d`。
- 上传真实图片后任务返回 202，任务最终为 `SUCCEEDED`，`attempts=1`，阶段完成于 `FINALIZE`。
- Worker 日志确认任务完成；数据库 `photo_asset_variant` 记录：
  - `HIGH`：JPEG，1042×654，READY。
  - `TEXTURE`：WebP，1042×654，59430 bytes，READY。
- 公开照片 API 返回 `textureUrl`，并保留 `thumbnailUrl` 兼容字段。
- 直接请求 MinIO 签名 URL 返回 `200`、`Content-Type: image/webp`、`Content-Length: 59430`。
- 文件头为 `RIFF .... WEBP`，确认对象内容确为 WebP。
- 当前签名 URL 使用 900 秒 TTL，未暴露永久对象地址。

### 4. M7.2 2D 对照链路

- 将独立 Gallery 配置为 `viewMode=2d`、`layout.mode=grid`、`presetName=2d`。
- 上传同一真实图片后任务最终为 `SUCCEEDED`。
- 数据库只生成 `HIGH` JPEG 变体，没有 `TEXTURE` 记录。
- 因此 3D/2D 纹理策略差异真实生效。

### 5. 自动化回归

- 后端 `mvn test`：48 项通过，0 failures，0 errors，0 skipped。
- Admin `npm run build`：通过，包含 `vue-tsc --noEmit`。
- Viewer `npm run build`：通过。
- 原有 `bash test-mcp-flow.sh`：主流程通过，覆盖注册、登录、Gallery、上传 READY、发布、PRIVATE Token、PASSWORD 前置状态和登出。

## 未通过或尚未覆盖

### M7.3 性能降级

代码中已存在 `ConfigManager.autoAdjustForDevice()`，会读取 `deviceMemory`、CPU 核数和移动端标识，并在低端设备关闭 Bloom、降低质量。但本次验收发现：

- `App.vue` 当前直接加载 `textureUrl || thumbnailUrl`，没有按相机距离在 `mediumUrl` 和 `textureUrl` 之间切换的 LOD 实现。
- 没有发现“低 FPS 持续 10 秒后依次关闭 particles → bloom → fog → DPR”的完整阶梯降级逻辑。
- ViewerEngine 监听 WebGL context lost/restored，但没有在 WebGL 初始化失败时切换到 2D 网格并显示 Toast 的完整流程。
- 浏览器页面真实加载成功并显示 3D/2D 控件；标准语义点击在画布层遮挡下超时，因此本次不把 2D 控件点击标记为通过。

### 其他 M7 待补项

- texture 编码失败、重试、取消、租约丢失的运行态专项场景尚未执行。
- 社交爬虫 Meta 壳、媒体子域 CDN、真实 CDN 命中率尚未验收。
- 100 张照片加载时间、低端设备 FPS、峰值内存、首屏时间等性能基准尚未采集。
- PASSWORD 成功解锁仍受限于尚未提供 Gallery 密码设置 API/UI。

## 数据库验收摘要

截至验收结束，`photo_asset_variant` 聚合结果：

| variant_kind | count |
| --- | ---: |
| HIGH | 70 |
| TEXTURE | 1 |

其中 1 条 TEXTURE 记录来自本次真实 3D Gallery 验收；2D 对照 Gallery 未产生 TEXTURE。

## 下一步

1. 补齐 Viewer 的 LOD、FPS 阶梯降级和 WebGL fallback 后重新执行 M7.3 验收。
2. 增加 Worker 失败/重试/取消/租约丢失的集成测试和运行态证据。
3. 再执行 CDN、Meta、社交预览和性能基准，完成 M7.4/M7.5 验收。
