package cn.vie.vibe.gallery.application;

/**
 * 分享链接二维码生成结果
 *
 * @param shareUrl 二维码编码的分享 URL（短链接）
 * @param pngBytes 二维码 PNG 图片字节
 */
public record GenerateShareLinkQrResult(
        String shareUrl,
        byte[] pngBytes
) {
}
