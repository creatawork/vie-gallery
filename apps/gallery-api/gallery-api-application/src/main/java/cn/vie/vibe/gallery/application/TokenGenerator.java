package cn.vie.vibe.gallery.application;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Token 生成器接口
 */
public interface TokenGenerator {
    /**
     * 生成安全的随机 token
     */
    String generateToken();

    /**
     * 计算 token 的 hash
     */
    String hashToken(String rawToken);

    /**
     * 验证 token 是否匹配 hash（常量时间比较）
     */
    boolean verifyToken(String rawToken, String tokenHash);
}
