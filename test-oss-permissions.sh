#!/bin/bash

# OSS 权限测试脚本
# 用于验证 RAM 用户是否有正确的 OSS 权限

echo "=== OSS 权限测试 ==="
echo ""

# 从最新的 URL 提取信息
TEST_URL="https://vie-gallery.oss-cn-hangzhou.aliyuncs.com/tenant/5dd30423-d6e4-425b-b311-c034adc667bb/photos/77dc0171-7de8-47b1-810c-7216b1dc0028/thumbnail?Expires=1789969262&OSSAccessKeyId=LTAI5t6P9ZqZWyBkXQxaB79V&Signature=9Y226l%2BSI7zrkoxXf8fZX5RMlzI%3D"

echo "测试 URL: $TEST_URL"
echo ""

echo "1. 测试 HTTP 响应..."
curl -s -o /dev/null -w "HTTP 状态码: %{http_code}\n" "$TEST_URL"
echo ""

echo "2. 获取详细错误信息..."
RESPONSE=$(curl -s "$TEST_URL")
echo "$RESPONSE" | grep -E "<Code>|<Message>|<EC>" | sed 's/<[^>]*>//g' | sed 's/^/  /'
echo ""

echo "3. 解析错误代码..."
ERROR_CODE=$(echo "$RESPONSE" | grep -oP '(?<=<Code>)[^<]+')
ERROR_EC=$(echo "$RESPONSE" | grep -oP '(?<=<EC>)[^<]+')

if [ "$ERROR_CODE" = "AccessDenied" ]; then
    echo "  ❌ 错误类型: AccessDenied"
    echo "  原因: RAM 用户没有 oss:GetObject 权限"
    echo ""
    echo "  解决方法："
    echo "  1. 登录阿里云 RAM 控制台"
    echo "  2. 找到 AccessKey 为 LTAI5t6P9ZqZWyBkXQxaB79V 的用户"
    echo "  3. 添加权限策略，包含："
    echo "     - Action: oss:GetObject"
    echo "     - Resource: acs:oss:*:*:vie-gallery/*"
elif [ "$ERROR_CODE" = "SignatureDoesNotMatch" ]; then
    echo "  ❌ 错误类型: SignatureDoesNotMatch"
    echo "  原因: AccessKey Secret 不正确或签名计算错误"
elif [ "$ERROR_CODE" = "InvalidAccessKeyId" ]; then
    echo "  ❌ 错误类型: InvalidAccessKeyId"
    echo "  原因: AccessKey ID 不存在或已禁用"
else
    echo "  错误代码: $ERROR_CODE"
    echo "  EC 代码: $ERROR_EC"
fi

echo ""
echo "4. 测试不带签名访问（验证 Bucket ACL）..."
NOSIG_URL="https://vie-gallery.oss-cn-hangzhou.aliyuncs.com/tenant/5dd30423-d6e4-425b-b311-c034adc667bb/photos/77dc0171-7de8-47b1-810c-7216b1dc0028/thumbnail"
NOSIG_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$NOSIG_URL")

if [ "$NOSIG_CODE" = "200" ]; then
    echo "  ✅ Bucket 是公共读 - 任何人都能访问"
elif [ "$NOSIG_CODE" = "403" ]; then
    echo "  ℹ️  Bucket 是私有 - 需要签名或权限才能访问"
else
    echo "  HTTP 状态码: $NOSIG_CODE"
fi

echo ""
echo "=== 测试完成 ==="
echo ""
echo "如果显示 AccessDenied，请检查 RAM 用户权限配置。"
