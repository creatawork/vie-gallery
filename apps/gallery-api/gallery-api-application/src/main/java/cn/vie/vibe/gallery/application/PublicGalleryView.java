package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.PublicAccessState;

/**
 * 公开相册视图，只包含展示所需字段，不泄露内部信息
 */
public record PublicGalleryView(
        String slug,
        String title,
        GalleryVisibility visibility,
        PublicAccessState accessState,
        CoverView cover,
        int photoCount
) {
    /**
     * 封面信息
     */
    public record CoverView(
            String url,
            int width,
            int height
    ) {}
}
