package cn.vie.vibe.gallery.application;

import java.util.UUID;

/**
 * 创建短链接结果
 * 
 * @param shareLinkId 分享链接 ID
 * @param shortCode 短码（6-8位 Base62）
 * @param shortUrl 完整的短链接 URL（例如：https://vie.gallery/s/abc123）
 */
public record CreateShortUrlResult(
        UUID shareLinkId,
        String shortCode,
        String shortUrl
) {
}
