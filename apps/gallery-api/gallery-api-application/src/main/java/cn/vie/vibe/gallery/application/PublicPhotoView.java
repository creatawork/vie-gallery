package cn.vie.vibe.gallery.application;

/**
 * 公开照片视图，只包含展示所需字段
 */
public record PublicPhotoView(
        String title,
        String thumbnailUrl,
        int width,
        int height,
        int sortOrder,
        String mediumUrl,
        String textureUrl
) {
    public PublicPhotoView(String title, String thumbnailUrl, int width, int height, int sortOrder) {
        this(title, thumbnailUrl, width, height, sortOrder, null, null);
    }
}
