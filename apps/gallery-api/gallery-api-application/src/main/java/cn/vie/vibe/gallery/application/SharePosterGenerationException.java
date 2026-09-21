package cn.vie.vibe.gallery.application;

/**
 * 分享海报生成异常
 */
public class SharePosterGenerationException extends RuntimeException {
    public SharePosterGenerationException(String message) {
        super(message);
    }

    public SharePosterGenerationException(String message, Throwable cause) {
        super(message, cause);
    }
}
