package cn.vie.vibe.gallery.application;

/**
 * 短链接解析目标
 * 
 * @param fullUrl 完整的目标 URL（包含 token 或短码参数）
 * @param gallerySlug 相册 slug（用于前端路由）
 * @param shortCode 短码（用作访问凭证）
 */
public record ShortLinkTarget(
        String fullUrl,
        String gallerySlug,
        String shortCode
) {
}
