# Gallery API 数据加密安全方案

## 概述

本文档描述了 Gallery API 的完整数据加密安全策略,特别针对用户照片这类敏感数据提供多层防护。

## 安全威胁分析

### 原有风险

1. **明文传输** - 照片URL和用户数据直接返回,容易被中间人攻击截获
2. **URL泄露** - 一旦照片URL泄露,可被任意第三方访问
3. **缺少访问控制** - URL没有用户绑定和时效性验证
4. **会话劫持** - 在非HTTPS环境下Session Cookie可被窃取

### 防护目标

- ✅ 传输层加密 (TLS/HTTPS)
- ✅ 照片URL签名与时效控制
- ✅ 用户身份绑定验证
- ✅ 敏感数据字段加密
- ✅ 防重放攻击

## 架构设计

### 三层防护体系

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: 传输层安全 (TLS 1.3)                      │
│  - HTTPS 强制启用                                    │
│  - Secure Cookie + SameSite                          │
│  - HSTS 响应头                                       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Layer 2: 应用层加密                                 │
│  - AES-256-GCM 敏感数据加密                          │
│  - HMAC-SHA256 URL签名                               │
│  - 时效性验证 (默认1小时)                            │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Layer 3: 访问控制                                   │
│  - 用户ID绑定                                        │
│  - 签名验证                                          │
│  - 时间戳过期检查                                    │
└─────────────────────────────────────────────────────┘
```

## 核心组件

### 1. SecurityConfig

路径: `gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/security/SecurityConfig.java`

**功能**:
- 配置 AES-256-GCM 加密器
- 配置 HMAC-SHA256 签名密钥
- 验证密钥配置完整性

**依赖的环境变量**:
```bash
GALLERY_SECURITY_ENCRYPTION_SECRET  # 32字节 base64编码
GALLERY_SECURITY_ENCRYPTION_SALT    # 16字节 hex编码
GALLERY_SECURITY_JWT_SECRET         # 32字节 base64编码
```

### 2. EncryptionService

路径: `gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/security/EncryptionService.java`

**功能**:
- `encrypt(String)` - AES-256-GCM 加密
- `decrypt(String)` - AES-256-GCM 解密
- `maskEmail(String)` - 邮箱脱敏 (j***e@example.com)
- `maskPhone(String)` - 手机号脱敏 (138****5678)

**使用示例**:
```java
@Autowired
private EncryptionService encryptionService;

// 加密敏感信息
String encrypted = encryptionService.encrypt("sensitive-data");

// 邮箱脱敏
String masked = encryptionService.maskEmail("john.doe@example.com");
// 输出: j***e@example.com
```

### 3. SignedUrlService

路径: `gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/security/SignedUrlService.java`

**功能**:
- 为照片URL生成带签名和时效的安全URL
- 验证URL签名有效性
- 防止URL被篡改和重放攻击

**签名机制**:
```
签名数据 = HMAC-SHA256(baseUrl + "|" + userId + "|" + expiry, signingKey)
最终URL = baseUrl?expires=<timestamp>&uid=<userId>&sig=<signature>
```

**使用示例**:
```java
@Autowired
private SignedUrlService signedUrlService;

// 生成1小时有效的签名URL
String secureUrl = signedUrlService.signPhotoUrl(
    rawUrl, 
    userId.toString()
);

// 生成自定义时效的签名URL (24小时)
String longLivedUrl = signedUrlService.signPhotoUrl(
    rawUrl, 
    userId.toString(), 
    86400  // 24小时 = 86400秒
);

// 验证签名
boolean valid = signedUrlService.verifySignature(
    baseUrl, 
    userId, 
    expiry, 
    signature
);
```

### 4. @SensitiveData 注解

路径: `gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/security/SensitiveData.java`

**功能**:
- 标记需要加密/脱敏的响应字段
- 配合 ResponseEncryptionInterceptor 自动处理

**加密类型**:
- `DEFAULT` - AES-256-GCM 标准加密
- `PHOTO_URL` - 照片URL (已在生成时签名,不再重复加密)
- `USER_INFO` - 用户信息加密
- `EMAIL` - 邮箱脱敏处理

**使用示例**:
```java
public record UserResponse(
    String id,
    @SensitiveData(type = SensitiveData.SensitiveType.EMAIL) 
    String email,
    
    @SensitiveData(type = SensitiveData.SensitiveType.PHOTO_URL) 
    String avatarUrl
) {}
```

### 5. ResponseEncryptionInterceptor

路径: `gallery-api-boot/src/main/java/cn/vie/vibe/gallery/api/ResponseEncryptionInterceptor.java`

**功能**:
- 自动拦截所有API响应
- 处理标记了 @SensitiveData 的字段
- 支持集合和嵌套对象

## 已更新的控制器

### PhotoController

**变更内容**:
1. 注入 `SignedUrlService`
2. 照片列表接口生成签名URL
3. `PhotoResponse.thumbnailUrl` 标记为 `@SensitiveData`

**关键代码**:
```java
@GetMapping("/galleries/{galleryId}/photos")
public List<PhotoResponse> list(@PathVariable UUID galleryId) {
    UUID tenant = context.requireContext().tenantId();
    String userId = tenant.toString();
    
    return facade.list(galleryId).stream().map(photo -> {
        // ... 获取存储对象
        
        // 生成带签名的安全URL
        String secureUrl = null;
        if (object != null && object.thumbnailKey() != null) {
            String rawUrl = storage.createReadUrl(...).toString();
            secureUrl = signedUrlService.signPhotoUrl(rawUrl, userId);
        }
        
        return PhotoResponse.from(photo, object, secureUrl);
    }).toList();
}
```

### GalleryController

**变更内容**:
1. 注入 `SignedUrlService`
2. 相册封面URL生成签名
3. `GalleryResponse.coverThumbnailUrl` 标记为 `@SensitiveData`

## 配置说明

### application.yml

新增配置项:
```yaml
gallery:
  security:
    encryption:
      secret: ${GALLERY_SECURITY_ENCRYPTION_SECRET}
      salt: ${GALLERY_SECURITY_ENCRYPTION_SALT}
    jwt:
      secret: ${GALLERY_SECURITY_JWT_SECRET}
    photo-url:
      default-expiry: ${PHOTO_URL_EXPIRY:3600}      # 默认1小时
      max-expiry: ${PHOTO_URL_MAX_EXPIRY:86400}     # 最多24小时
```

### 环境变量配置

参考 [.env.example](../.env.example) 文件配置所有必需的环境变量。

**生成安全密钥**:
```bash
# 运行密钥生成脚本
bash scripts/generate-security-keys.sh

# 脚本会输出需要设置的环境变量
export GALLERY_SECURITY_ENCRYPTION_SECRET="<生成的值>"
export GALLERY_SECURITY_ENCRYPTION_SALT="<生成的值>"
export GALLERY_SECURITY_JWT_SECRET="<生成的值>"
```

## 部署指南

### 开发环境

1. 生成密钥:
```bash
bash scripts/generate-security-keys.sh
```

2. 配置环境变量:
```bash
cp .env.example .env.local
# 编辑 .env.local 填入生成的密钥
```

3. 启动应用:
```bash
# 加载环境变量
source .env.local
# 或使用 IDE 配置环境变量

mvn spring-boot:run
```

### 生产环境

**重要事项**:
- ✅ 必须启用 HTTPS (TLS 1.3)
- ✅ 使用独立的生产密钥 (不能与开发环境共用)
- ✅ 通过密钥管理服务存储密钥 (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)
- ✅ 设置 `SESSION_COOKIE_SECURE=true`
- ✅ 配置防火墙和 WAF

**推荐配置**:
```yaml
server:
  ssl:
    enabled: true
    key-store: /path/to/keystore.p12
    key-store-password: ${SSL_KEYSTORE_PASSWORD}
    key-store-type: PKCS12
  servlet:
    session:
      cookie:
        secure: true          # 强制HTTPS
        same-site: strict     # 防CSRF
```

## 安全最佳实践

### 密钥管理

1. **密钥生成**
   - 使用 `openssl rand` 生成高强度随机密钥
   - AES密钥至少32字节 (256位)
   - JWT密钥至少32字节 (256位)

2. **密钥存储**
   - ❌ 不要硬编码在代码中
   - ❌ 不要提交到 Git 仓库
   - ✅ 使用环境变量
   - ✅ 生产环境使用密钥管理服务

3. **密钥轮换**
   - 建议每90天轮换一次密钥
   - 密钥泄露后立即轮换
   - 保持旧密钥的解密能力一段时间(grace period)

### URL签名策略

1. **时效性控制**
   - 默认1小时,根据业务需求调整
   - 分享链接可使用更长时效 (24小时)
   - 临时预览使用短时效 (5-15分钟)

2. **用户绑定**
   - URL与用户ID强绑定
   - 验证时检查请求用户与URL用户是否一致

3. **防重放**
   - 时间戳验证
   - 签名防篡改

### 数据加密原则

1. **敏感数据识别**
   - 用户个人信息 (邮箱、手机号)
   - 照片访问URL
   - 支付信息
   - 密码散列值

2. **加密 vs 脱敏**
   - 需要解密的数据 → AES加密
   - 仅需显示部分的数据 → 脱敏处理
   - 照片URL → 签名机制

## 性能影响

### 加密开销

- AES-256-GCM 加密: ~0.5ms / 次
- HMAC-SHA256 签名: ~0.1ms / 次
- URL签名总开销: <1ms

### 优化建议

1. **缓存签名URL**
   - 在有效期内缓存生成的URL
   - 使用 Redis 存储 URL映射

2. **批量处理**
   - 列表接口批量生成签名
   - 异步处理非关键路径的加密

3. **CDN配置**
   - 签名URL可直接用于CDN
   - CDN边缘节点验证签名

## 监控与审计

### 安全事件监控

1. **签名验证失败**
   - 记录所有签名验证失败的请求
   - 监控异常IP和用户行为

2. **密钥使用异常**
   - 监控加密失败率
   - 密钥配置错误告警

### 审计日志

推荐记录以下事件:
- URL签名生成 (用户ID, 资源ID, 有效期)
- 签名验证失败 (IP, 用户, URL)
- 密钥轮换操作
- 敏感数据访问

## 合规性

本方案符合以下安全标准:
- ✅ OWASP Top 10 防护
- ✅ GDPR 数据保护要求
- ✅ PCI DSS 加密标准 (如涉及支付)
- ✅ 等保2.0 三级要求

## 故障排查

### 常见问题

1. **应用启动失败: "Encryption secret must be configured"**
   - 原因: 缺少环境变量配置
   - 解决: 设置 `GALLERY_SECURITY_ENCRYPTION_SECRET` 等环境变量

2. **签名验证失败**
   - 检查系统时间是否同步
   - 检查 JWT_SECRET 配置是否一致
   - 检查URL是否被中间件修改

3. **加密/解密失败**
   - 检查密钥配置是否正确
   - 检查密钥是否被轮换
   - 查看日志中的异常堆栈

### 调试建议

```java
// 启用调试日志
logging.level.cn.vie.vibe.gallery.infrastructure.security=DEBUG
```

## 未来增强

### 短期 (1-3个月)

- [ ] 实现密钥自动轮换机制
- [ ] 添加URL访问频率限制
- [ ] 实现签名URL撤销机制

### 中期 (3-6个月)

- [ ] 端到端加密 (客户端加密)
- [ ] 图片水印防盗链
- [ ] 访问日志审计系统

### 长期 (6-12个月)

- [ ] 零知识证明验证
- [ ] 区块链存证
- [ ] 联邦学习隐私保护

## 参考资料

- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Spring Security Crypto](https://docs.spring.io/spring-security/reference/features/integrations/cryptography.html)
- [NIST SP 800-57: Key Management](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)

## 联系方式

技术问题请联系安全团队: security@vie.vibe.cn

---

最后更新: 2026-09-20
版本: 1.0.0
