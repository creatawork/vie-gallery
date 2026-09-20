package cn.vie.vibe.gallery.infrastructure.security;

import org.springframework.security.crypto.encrypt.BytesEncryptor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * 数据加密服务
 * 提供AES-256-GCM加密和数据脱敏功能
 */
@Service
public class EncryptionService {
    
    private final BytesEncryptor encryptor;
    
    public EncryptionService(BytesEncryptor sensitiveDataEncryptor) {
        this.encryptor = sensitiveDataEncryptor;
    }
    
    /**
     * 加密字符串
     * @param plaintext 明文
     * @return Base64编码的密文
     */
    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) {
            return plaintext;
        }
        try {
            byte[] encrypted = encryptor.encrypt(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            throw new RuntimeException("Encryption failed", e);
        }
    }
    
    /**
     * 解密字符串
     * @param ciphertext Base64编码的密文
     * @return 明文
     */
    public String decrypt(String ciphertext) {
        if (ciphertext == null || ciphertext.isEmpty()) {
            return ciphertext;
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(ciphertext);
            byte[] decrypted = encryptor.decrypt(decoded);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Decryption failed", e);
        }
    }
    
    /**
     * 邮箱脱敏处理
     * 示例: john.doe@example.com -> j***e@example.com
     */
    public String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return email;
        }
        String[] parts = email.split("@");
        String local = parts[0];
        if (local.length() <= 2) {
            return "*@" + parts[1];
        }
        return local.charAt(0) + "***" + local.charAt(local.length() - 1) + "@" + parts[1];
    }
    
    /**
     * 手机号脱敏处理
     * 示例: 13812345678 -> 138****5678
     */
    public String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) {
            return phone;
        }
        int length = phone.length();
        return phone.substring(0, 3) + "****" + phone.substring(length - 4);
    }
}
