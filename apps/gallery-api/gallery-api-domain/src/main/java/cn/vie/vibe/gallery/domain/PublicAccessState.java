package cn.vie.vibe.gallery.domain;

/**
 * 公开访问状态，用于前端展示逻辑判定
 */
public enum PublicAccessState {
    /**
     * 可以直接访问照片
     */
    READY,

    /**
     * 需要密码解锁
     */
    PASSWORD_REQUIRED,

    /**
     * 需要有效的分享链接
     */
    SHARE_LINK_REQUIRED,

    /**
     * 相册为空，没有照片
     */
    EMPTY
}
