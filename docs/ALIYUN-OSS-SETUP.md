# 阿里云OSS配置指南

## 概述

项目现在支持两种对象存储方案：
- **MinIO**（自建对象存储）- 默认配置
- **阿里云OSS**（推荐用于生产环境）

## 切换到阿里云OSS

### 1. 准备阿里云OSS信息

在阿里云控制台获取以下信息：
- **Endpoint**: OSS访问域名（如：`https://oss-cn-hangzhou.aliyuncs.com`）
- **Bucket名称**: 你的OSS Bucket名称
- **AccessKey ID**: RAM用户的AccessKey ID
- **AccessKey Secret**: RAM用户的AccessKey Secret

### 2. 配置环境变量

#### 方式A：修改 `docker-compose.production.yml`

在 `api` 服务的 `environment` 部分添加：

```yaml
services:
  api:
    environment:
      # 启用阿里云OSS配置
      SPRING_PROFILES_ACTIVE: prod,aliyun-oss
      
      # 阿里云OSS配置
      GALLERY_STORAGE_ALIYUN_ENDPOINT: ${ALIYUN_OSS_ENDPOINT}
      GALLERY_STORAGE_ALIYUN_ACCESS_KEY_ID: ${ALIYUN_OSS_ACCESS_KEY_ID}
      GALLERY_STORAGE_ALIYUN_ACCESS_KEY_SECRET: ${ALIYUN_OSS_ACCESS_KEY_SECRET}
      GALLERY_STORAGE_ALIYUN_BUCKET: ${ALIYUN_OSS_BUCKET}
```

#### 方式B：修改 `.env.production` 文件

```bash
# Spring Profile - 添加 aliyun-oss
SPRING_PROFILES_ACTIVE=prod,aliyun-oss

# 阿里云OSS配置
ALIYUN_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
ALIYUN_OSS_ACCESS_KEY_ID=你的AccessKeyID
ALIYUN_OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
ALIYUN_OSS_BUCKET=vie-gallery
```

### 3. 阿里云OSS Bucket配置

#### 3.1 创建Bucket
1. 登录阿里云OSS控制台
2. 创建新的Bucket
3. 建议配置：
   - **读写权限**: 私有（推荐）
   - **区域**: 选择离用户最近的区域
   - **存储类型**: 标准存储

#### 3.2 配置CORS（如果前端直传）
```json
[
  {
    "allowedOrigins": ["https://gallery.vie-vibe.cn"],
    "allowedMethods": ["GET", "PUT", "POST"],
    "allowedHeaders": ["*"],
    "exposeHeaders": ["ETag"],
    "maxAgeSeconds": 3600
  }
]
```

#### 3.3 配置RAM用户权限
为安全起见，创建专用RAM用户，授予以下权限：
```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:DeleteObject",
        "oss:ListObjects"
      ],
      "Resource": [
        "acs:oss:*:*:vie-gallery",
        "acs:oss:*:*:vie-gallery/*"
      ]
    }
  ],
  "Version": "1"
}
```

### 4. 重新构建并部署

#### 本地构建
```bash
cd /e/workspace/vie-gallery/apps/gallery-api
mvn clean package -DskipTests
```

#### 构建Docker镜像
```bash
cd /e/workspace/vie-gallery/apps/gallery-api
docker build -t vie-gallery-api:latest -f gallery-api-boot/Dockerfile .
```

#### 上传到服务器
```bash
# 保存镜像
docker save vie-gallery-api:latest | gzip > vie-gallery-api.tar.gz

# 上传到服务器
scp vie-gallery-api.tar.gz ubuntu@43.130.250.22:/home/ubuntu/

# 在服务器上加载镜像
ssh ubuntu@43.130.250.22
docker load < /home/ubuntu/vie-gallery-api.tar.gz
```

#### 重启服务
```bash
cd /home/ubuntu/vie-gallery/infra
docker compose -f docker-compose.production.yml --env-file .env.production down
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

### 5. 验证

检查API日志：
```bash
docker logs vie-gallery-api
```

应该看到类似的日志：
```
Successfully connected to Aliyun OSS
Bucket: vie-gallery
Endpoint: https://oss-cn-hangzhou.aliyuncs.com
```

### 6. 迁移现有数据（可选）

如果你已经有MinIO中的数据，需要迁移到阿里云OSS：

```bash
# 使用ossutil工具迁移
ossutil cp oss://vie-gallery-old/ oss://vie-gallery/ --recursive
```

## 配置对比

| 项目 | MinIO | 阿里云OSS |
|-----|-------|----------|
| 成本 | 服务器成本 | 按量付费 |
| 运维 | 需要自己维护 | 托管服务 |
| 可靠性 | 取决于服务器 | 99.995% SLA |
| CDN | 需要自己配置 | 可直接配置CDN加速 |
| HTTPS | 需要配置SSL | 默认支持HTTPS |
| 带宽 | 受服务器限制 | 弹性扩展 |

## 优化建议

### 1. 使用CDN加速
配置阿里云CDN加速域名，提升图片访问速度：
```
https://cdn.gallery.vie-vibe.cn
```

### 2. 配置图片处理
使用阿里云OSS图片处理服务，实时生成缩略图：
```
https://your-bucket.oss-cn-hangzhou.aliyuncs.com/photo.jpg?x-oss-process=image/resize,w_200
```

### 3. 启用传输加速
在OSS控制台启用传输加速，提升上传速度。

## 故障排查

### 问题1: 连接失败
```
Object storage unavailable
```

**解决方案**:
- 检查Endpoint是否正确
- 检查AccessKey是否有效
- 检查网络连接

### 问题2: 权限不足
```
Access denied
```

**解决方案**:
- 检查RAM用户权限配置
- 确认Bucket名称正确

### 问题3: 图片无法访问
```
SignatureDoesNotMatch
```

**解决方案**:
- 检查AccessKey Secret是否正确
- 确认系统时间同步

## 回滚到MinIO

如果需要回滚：

1. 修改 `.env.production`：
```bash
SPRING_PROFILES_ACTIVE=prod
```

2. 重启服务：
```bash
docker compose -f docker-compose.production.yml restart api
```

## 支持

如有问题，请查看：
- [阿里云OSS官方文档](https://help.aliyun.com/product/31815.html)
- [Java SDK文档](https://help.aliyun.com/document_detail/32008.html)
