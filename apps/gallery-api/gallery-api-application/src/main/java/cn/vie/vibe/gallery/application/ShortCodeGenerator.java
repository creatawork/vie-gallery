package cn.vie.vibe.gallery.application;

import java.security.SecureRandom;

/**
 * 短码生成器
 * 
 * 生成 6-8 位 Base62 编码的短链接码
 */
public class ShortCodeGenerator {
    private static final String BASE62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private static final int BASE62_LENGTH = BASE62_CHARS.length();
    private static final int SHORT_CODE_LENGTH = 6;
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * 生成一个 6 位 Base62 短码
     * 
     * 碰撞概率：62^6 ≈ 568 亿，对于中小规模应用足够安全
     */
    public String generateShortCode() {
        StringBuilder sb = new StringBuilder(SHORT_CODE_LENGTH);
        for (int i = 0; i < SHORT_CODE_LENGTH; i++) {
            int index = RANDOM.nextInt(BASE62_LENGTH);
            sb.append(BASE62_CHARS.charAt(index));
        }
        return sb.toString();
    }

    /**
     * 验证短码格式是否合法
     * 
     * @param shortCode 短码
     * @return 是否合法（6-8位 Base62 字符）
     */
    public boolean isValidShortCode(String shortCode) {
        if (shortCode == null || shortCode.length() < 6 || shortCode.length() > 8) {
            return false;
        }
        for (char c : shortCode.toCharArray()) {
            if (BASE62_CHARS.indexOf(c) == -1) {
                return false;
            }
        }
        return true;
    }
}
