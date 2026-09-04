package cn.vie.vibe.gallery.domain;

/**
 * 公开访问异常，用于分享链接和公开展示场景
 */
public class PublicAccessException extends RuntimeException {
    private final String code;

    public PublicAccessException(String code, String message) {
        super(message);
        this.code = code;
    }

    public PublicAccessException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    // 常见错误码
    public static final String GALLERY_NOT_FOUND = "GALLERY_NOT_FOUND";
    public static final String SHARE_LINK_REQUIRED = "SHARE_LINK_REQUIRED";
    public static final String SHARE_LINK_INVALID = "SHARE_LINK_INVALID";
    public static final String SHARE_LINK_EXPIRED = "SHARE_LINK_EXPIRED";
    public static final String SHARE_LINK_REVOKED = "SHARE_LINK_REVOKED";
    public static final String PASSWORD_REQUIRED = "PASSWORD_REQUIRED";
    public static final String PASSWORD_INVALID = "PASSWORD_INVALID";
    public static final String PUBLIC_SESSION_EXPIRED = "PUBLIC_SESSION_EXPIRED";
    public static final String RATE_LIMITED = "RATE_LIMITED";

    public static PublicAccessException galleryNotFound() {
        return new PublicAccessException(GALLERY_NOT_FOUND, "Gallery not found or not accessible");
    }

    public static PublicAccessException shareLinkRequired() {
        return new PublicAccessException(SHARE_LINK_REQUIRED, "This gallery requires a valid share link");
    }

    public static PublicAccessException shareLinkInvalid() {
        return new PublicAccessException(SHARE_LINK_INVALID, "The share link is invalid");
    }

    public static PublicAccessException shareLinkExpired() {
        return new PublicAccessException(SHARE_LINK_EXPIRED, "The share link has expired");
    }

    public static PublicAccessException shareLinkRevoked() {
        return new PublicAccessException(SHARE_LINK_REVOKED, "The share link has been revoked");
    }

    public static PublicAccessException passwordRequired() {
        return new PublicAccessException(PASSWORD_REQUIRED, "Password is required to access this gallery");
    }

    public static PublicAccessException passwordInvalid() {
        return new PublicAccessException(PASSWORD_INVALID, "The password is incorrect");
    }

    public static PublicAccessException sessionExpired() {
        return new PublicAccessException(PUBLIC_SESSION_EXPIRED, "Your access session has expired");
    }

    public static PublicAccessException rateLimited() {
        return new PublicAccessException(RATE_LIMITED, "Too many requests, please try again later");
    }
}
