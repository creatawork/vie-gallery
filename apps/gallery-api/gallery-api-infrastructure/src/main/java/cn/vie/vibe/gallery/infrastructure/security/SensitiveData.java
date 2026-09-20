package cn.vie.vibe.gallery.infrastructure.security;

import java.lang.annotation.*;

/**
 * 标记需要加密的敏感字段
 * 用于API响应中的自动加密处理
 */
@Target({ElementType.FIELD, ElementType.METHOD, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface SensitiveData {
    
    /**
     * 加密类型
     */
    SensitiveType type() default SensitiveType.DEFAULT;
    
    enum SensitiveType {
        DEFAULT,    // 默认AES加密
        PHOTO_URL,  // 照片URL签名处理
        USER_INFO,  // 用户信息加密
        EMAIL       // 邮箱脱敏+加密
    }
}
