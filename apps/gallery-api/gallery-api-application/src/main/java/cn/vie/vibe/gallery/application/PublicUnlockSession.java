package cn.vie.vibe.gallery.application;

/**
 * 访客密码解锁会话证明：绑定 galleryId 与当前 passwordHash 指纹，
 * 相册改密或清密后旧 Session 立即失效。
 */
public record PublicUnlockSession(java.util.UUID galleryId, String passwordFingerprint) {
}
