package cn.vie.vibe.gallery.application;

/**
 * 生成分享海报命令
 */
public record GenerateSharePosterCommand(
        String galleryId,
        String template  // MINIMAL, ELEGANT, VIBRANT, CLASSIC, MODERN
) {}
