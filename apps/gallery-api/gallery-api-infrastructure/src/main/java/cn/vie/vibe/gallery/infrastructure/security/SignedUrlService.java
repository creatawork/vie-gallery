package cn.vie.vibe.gallery.infrastructure.security;

import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

/**
 * 签名URL服务
 * 为照片URL生成带时效性和用户绑定的安全签名
 */
@Service
public class SignedUrlService {
    
    private final SecretKey signingKey;
    private static final long DEFAULT_EXPIRY_SECONDS = 3600; // 1小时
    
    public SignedUrlService(SecretKey jwtSigningKey) {
        this.signingKey = jwtSigningKey;
    }
    
    /**
     * 生成带签名的照片访问URL
     * 
     * @param baseUrl 原始URL
     * @param userId 用户ID,用于访问控制
     * @param expirySeconds URL有效期(秒)
     * @return 带签名的安全URL
     */
    public String signPhotoUrl(String baseUrl, String userId, long expirySeconds) {
        if (baseUrl == null || baseUrl.isEmpty()) {
            return baseUrl;
        }
        
        long expiry = Instant.now().getEpochSecond() + expirySeconds;
        
        // 生成签名: HMAC-SHA256(baseUrl + userId + expiry)
        String payload = baseUrl + "|" + userId + "|" + expiry;
        String signature = generateSignature(payload);
        
        try {
            // 构造最终URL: baseUrl?expires=xxx&uid=xxx&sig=xxx
            String separator = baseUrl.contains("?") ? "&" : "?";
            return baseUrl + separator +
                "expires=" + expiry +
                "&uid=" + URLEncoder.encode(userId, StandardCharsets.UTF_8) +
                "&sig=" + URLEncoder.encode(signature, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Failed to sign URL", e);
        }
    }
    
    /**
     * 使用默认过期时间生成签名URL
     */
    public String signPhotoUrl(String baseUrl, String userId) {
        return signPhotoUrl(baseUrl, userId, DEFAULT_EXPIRY_SECONDS);
    }
    
    /**
     * 验证URL签名是否有效
     * 
     * @param baseUrl 原始URL(不含签名参数)
     * @param userId 用户ID
     * @param expiry 过期时间戳
     * @param signature 待验证的签名
     * @return 签名是否有效
     */
    public boolean verifySignature(String baseUrl, String userId, long expiry, String signature) {
        // 检查是否过期
        if (Instant.now().getEpochSecond() > expiry) {
            return false;
        }
        
        // 验证签名
        String payload = baseUrl + "|" + userId + "|" + expiry;
        String expected = generateSignature(payload);
        return expected.equals(signature);
    }
    
    /**
     * 生成HMAC-SHA256签名
     */
    private String generateSignature(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(signingKey);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate signature", e);
        }
    }
}
