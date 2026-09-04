package cn.vie.vibe.gallery.domain;

/**
 * 分享链接状态
 */
public enum ShareLinkStatus {
    /**
     * 活跃可用
     */
    ACTIVE,

    /**
     * 已过期
     */
    EXPIRED,

    /**
     * 已撤销
     */
    REVOKED
}
