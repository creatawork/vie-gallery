package cn.vie.vibe.gallery.application;

/**
 * 生成分享海报命令
 */
public record GenerateSharePosterCommand(
        String galleryId,
        String template,
        String format,
        String title,
        String description,
        Integer focalPoint
) {
    public GenerateSharePosterCommand(String galleryId, String template) {
        this(galleryId, template, null, null, null, null);
    }
}
