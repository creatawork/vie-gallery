#!/bin/bash

# 生成安全密钥脚本
# 用于生成 AES 加密密钥、盐值和 JWT 签名密钥

set -e

echo "======================================"
echo "Gallery API 安全密钥生成工具"
echo "======================================"
echo ""

# 检查 openssl 是否可用
if ! command -v openssl &> /dev/null; then
    echo "❌ 错误: 需要安装 openssl"
    exit 1
fi

# 生成 AES-256 加密密钥 (32 字节 base64)
echo "1️⃣  生成 AES-256 加密密钥..."
ENCRYPTION_SECRET=$(openssl rand -base64 32)
echo "   ✅ GALLERY_SECURITY_ENCRYPTION_SECRET"

# 生成加密盐值 (16 字节 hex)
echo "2️⃣  生成加密盐值..."
ENCRYPTION_SALT=$(openssl rand -hex 16)
echo "   ✅ GALLERY_SECURITY_ENCRYPTION_SALT"

# 生成 JWT 签名密钥 (32 字节 base64)
echo "3️⃣  生成 JWT 签名密钥..."
JWT_SECRET=$(openssl rand -base64 32)
echo "   ✅ GALLERY_SECURITY_JWT_SECRET"

echo ""
echo "======================================"
echo "生成完成! 请将以下内容添加到环境变量:"
echo "======================================"
echo ""
echo "# AES-256 加密密钥"
echo "export GALLERY_SECURITY_ENCRYPTION_SECRET=\"$ENCRYPTION_SECRET\""
echo ""
echo "# 加密盐值"
echo "export GALLERY_SECURITY_ENCRYPTION_SALT=\"$ENCRYPTION_SALT\""
echo ""
echo "# JWT 签名密钥"
echo "export GALLERY_SECURITY_JWT_SECRET=\"$JWT_SECRET\""
echo ""
echo "======================================"
echo "⚠️  重要提示:"
echo "======================================"
echo "1. 请妥善保管这些密钥,不要提交到代码仓库"
echo "2. 生产环境和开发环境应使用不同的密钥"
echo "3. 密钥泄露后应立即重新生成并更换"
echo "4. 建议使用密钥管理服务(如 AWS Secrets Manager)存储"
echo ""

# 可选: 保存到 .env.local 文件
read -p "是否保存到 .env.local 文件? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ENV_FILE=".env.local"
    echo "# Gallery API 安全密钥 - 生成于 $(date)" > "$ENV_FILE"
    echo "# ⚠️ 请勿提交此文件到 Git 仓库" >> "$ENV_FILE"
    echo "" >> "$ENV_FILE"
    echo "GALLERY_SECURITY_ENCRYPTION_SECRET=$ENCRYPTION_SECRET" >> "$ENV_FILE"
    echo "GALLERY_SECURITY_ENCRYPTION_SALT=$ENCRYPTION_SALT" >> "$ENV_FILE"
    echo "GALLERY_SECURITY_JWT_SECRET=$JWT_SECRET" >> "$ENV_FILE"
    echo ""
    echo "✅ 已保存到 $ENV_FILE"
    echo "⚠️  请确保 .gitignore 包含 .env.local"
fi

echo ""
echo "✨ 密钥生成完成!"
