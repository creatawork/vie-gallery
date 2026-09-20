package cn.vie.vibe.gallery.infrastructure.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.encrypt.AesBytesEncryptor;
import org.springframework.security.crypto.encrypt.BytesEncryptor;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

/**
 * 数据加密配置
 * 提供加密器和密钥管理
 */
@Configuration
public class EncryptionConfig {
    
    @Value("${gallery.security.encryption.secret:#{null}}")
    private String encryptionSecret;
    
    @Value("${gallery.security.encryption.salt:#{null}}")
    private String encryptionSalt;
    
    @Value("${gallery.security.jwt.secret:#{null}}")
    private String jwtSecret;
    
    /**
     * AES-256-GCM 加密器,用于敏感数据加密
     */
    @Bean
    public BytesEncryptor sensitiveDataEncryptor() {
        validateEncryptionConfig();
        
        return new AesBytesEncryptor(
            encryptionSecret,
            encryptionSalt,
            org.springframework.security.crypto.keygen.KeyGenerators.secureRandom(16)
        );
    }
    
    /**
     * JWT/签名密钥,用于URL签名
     */
    @Bean
    public SecretKey jwtSigningKey() {
        if (jwtSecret == null || jwtSecret.isEmpty()) {
            throw new IllegalStateException(
                "JWT secret must be configured via GALLERY_SECURITY_JWT_SECRET environment variable"
            );
        }
        
        try {
            byte[] keyBytes = Base64.getDecoder().decode(jwtSecret);
            if (keyBytes.length < 32) {
                throw new IllegalStateException("JWT secret must be at least 32 bytes (256 bits)");
            }
            return new SecretKeySpec(keyBytes, "HmacSHA256");
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("JWT secret must be valid base64-encoded string", e);
        }
    }
    
    private void validateEncryptionConfig() {
        if (encryptionSecret == null || encryptionSecret.isEmpty()) {
            throw new IllegalStateException(
                "Encryption secret must be configured via GALLERY_SECURITY_ENCRYPTION_SECRET environment variable"
            );
        }
        if (encryptionSalt == null || encryptionSalt.isEmpty()) {
            throw new IllegalStateException(
                "Encryption salt must be configured via GALLERY_SECURITY_ENCRYPTION_SALT environment variable"
            );
        }
        if (encryptionSecret.length() < 32) {
            throw new IllegalStateException("Encryption secret must be at least 32 characters");
        }
    }
}
