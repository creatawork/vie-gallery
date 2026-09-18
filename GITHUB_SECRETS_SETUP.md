# GitHub Secrets 配置步骤

## 如何配置

1. 访问 GitHub 仓库页面
2. 进入 **Settings** > **Secrets and variables** > **Actions**
3. 点击 **New repository secret** 添加以下密钥

## 需要添加的 Secrets

### 1. SERVER_HOST
- Name: `SERVER_HOST`
- Secret: `43.130.250.22`

### 2. SERVER_USER
- Name: `SERVER_USER`
- Secret: `ubuntu`

### 3. SERVER_SSH_KEY
- Name: `SERVER_SSH_KEY`
- Secret: 你的 SSH 私钥内容

#### 如何获取 SSH 私钥：

**Windows (Git Bash):**
```bash
cat ~/.ssh/id_rsa
```

**复制整个输出内容**，包括：
```
-----BEGIN OPENSSH PRIVATE KEY-----
...私钥内容...
-----END OPENSSH PRIVATE KEY-----
```

**注意**: 确保复制的是**私钥** (id_rsa)，不是公钥 (id_rsa.pub)

### 4. 数据库密码（可选，建议配置）

#### MYSQL_ROOT_PASSWORD
- Name: `MYSQL_ROOT_PASSWORD`
- Secret: 设置一个强密码，例如: `Vie@Gallery#Root2026!`

#### MYSQL_PASSWORD
- Name: `MYSQL_PASSWORD`
- Secret: 设置一个强密码，例如: `Vie@Gallery#User2026!`

#### MINIO_ROOT_USER
- Name: `MINIO_ROOT_USER`
- Secret: `admin` (或自定义)

#### MINIO_ROOT_PASSWORD
- Name: `MINIO_ROOT_PASSWORD`
- Secret: 设置一个强密码，例如: `Vie@Minio#2026!`

## 配置完成后

1. 提交当前的更改到 Git
2. 推送到 GitHub main 分支
3. 工作流会自动触发部署

或者手动触发工作流：
1. 进入 **Actions** 标签
2. 选择 **Deploy to Production** 工作流
3. 点击 **Run workflow**

## 验证部署

部署完成后，访问以下地址验证：

- http://gallery.vie-vibe.cn/
- http://gallery.vie-vibe.cn/app/
- http://gallery.vie-vibe.cn/api/health

## 安全建议

1. ✅ 使用强密码（至少 16 个字符，包含大小写字母、数字和特殊符号）
2. ✅ 不要将密码提交到代码仓库
3. ✅ 定期轮换密码
4. ✅ 限制服务器访问权限
5. ✅ 配置 HTTPS（推荐使用 Let's Encrypt）
