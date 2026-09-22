# 下一步行动 - API 健康检查问题解决

## ✅ 已完成

1. **诊断工具** - 创建了完整的诊断和修复脚本
2. **部署工作流改进** - 增强了错误检测和报告
3. **文档** - 详细的问题分析和解决方案文档

## 🚀 立即执行

### 步骤 1: 将修复工具部署到服务器

```bash
# 本地推送更改
git push origin main

# 登录服务器
ssh root@gallery.vie-vibe.cn

# 拉取最新代码（包含诊断和修复脚本）
cd ~/vie-gallery
git pull origin main

# 运行诊断
cd infra
bash ../scripts/diagnose-api.sh
```

### 步骤 2: 根据诊断结果采取行动

**如果诊断显示 raw_token 列缺失或 V15 迁移失败**:
```bash
cd ~/vie-gallery/infra
bash ../scripts/fix-raw-token-migration.sh
```

**如果诊断显示其他错误**:
查看完整日志并参考 [api-health-check-diagnosis.md](./api-health-check-diagnosis.md)

### 步骤 3: 验证修复

```bash
# 检查容器健康状态
docker ps | grep vie-gallery-api

# 测试健康检查端点
curl http://localhost:8088/actuator/health

# 测试通过 Nginx 的 API 访问
curl -H 'Host: gallery.vie-vibe.cn' http://localhost/api/auth/csrf
```

### 步骤 4: 如果问题仍未解决

1. 保存完整日志用于分析:
   ```bash
   docker logs vie-gallery-api > /tmp/api-full.log 2>&1
   ```

2. 检查数据库完整性:
   ```bash
   docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery -e "SHOW TABLES;"
   docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery -e "SELECT COUNT(*) FROM flyway_schema_history;"
   ```

3. 考虑完全重启（最后手段）:
   ```bash
   cd ~/vie-gallery/infra
   docker compose -f docker-compose.production.yml down
   docker compose -f docker-compose.production.yml --env-file .env.production up -d --wait
   ```

## 📋 后续优化（可选）

### 1. 添加监控告警

为 API 健康检查失败设置告警通知，避免长时间停机未被发现。

### 2. 数据库备份验证

确保定期备份数据库，并验证备份可恢复性:
```bash
# 备份
docker exec vie-gallery-mysql mysqldump -uvie_user -pvie_password_2026 vie_gallery > backup.sql

# 测试恢复（在测试环境）
docker exec -i vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery < backup.sql
```

### 3. 迁移前测试流程

在 CI 中添加迁移测试步骤，在部署前验证迁移可以成功运行。

### 4. 蓝绿部署

考虑实施蓝绿部署策略，减少部署风险和停机时间。

## 📊 预期结果

执行上述步骤后，应该看到：

- ✅ API 容器状态从 `unhealthy` 变为 `healthy`
- ✅ `/actuator/health` 端点返回 `{"status":"UP"}`
- ✅ 前端可以正常访问 API，不再出现 502 错误
- ✅ `share_link` 表包含 `raw_token` 列
- ✅ Flyway 历史显示 V15 迁移成功（`success = 1`）

## 🆘 需要帮助

如果遇到无法解决的问题：

1. 收集诊断输出: `./diagnose-api.sh > diagnosis.txt 2>&1`
2. 收集 API 日志: `docker logs vie-gallery-api > api.log 2>&1`
3. 收集数据库状态: `docker exec vie-gallery-mysql mysql ... > db-status.txt`
4. 将这些文件发送给开发团队进行分析

## 📚 相关文档

- [API 健康检查诊断报告](./api-health-check-diagnosis.md) - 详细的根本原因分析
- [部署状态报告](./deployment-status.md) - 当前部署状态快照
- [部署指南](./DEPLOYMENT.md) - 完整的部署文档

---

**最后更新**: 2026-09-22  
**状态**: 等待在服务器上执行诊断和修复
