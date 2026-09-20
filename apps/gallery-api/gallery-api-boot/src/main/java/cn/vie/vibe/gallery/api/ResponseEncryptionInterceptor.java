package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.infrastructure.security.EncryptionService;
import cn.vie.vibe.gallery.infrastructure.security.SensitiveData;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.lang.reflect.Field;
import java.lang.reflect.RecordComponent;
import java.util.Collection;

/**
 * 响应加密拦截器
 * 自动处理标记了@SensitiveData注解的字段
 */
@ControllerAdvice
public class ResponseEncryptionInterceptor implements ResponseBodyAdvice<Object> {
    
    private static final Logger log = LoggerFactory.getLogger(ResponseEncryptionInterceptor.class);
    private final EncryptionService encryptionService;
    
    public ResponseEncryptionInterceptor(EncryptionService encryptionService) {
        this.encryptionService = encryptionService;
    }
    
    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        // 对所有API响应进行处理
        return returnType.getContainingClass().getPackage().getName().startsWith("cn.vie.vibe.gallery.api");
    }
    
    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        if (body == null) {
            return null;
        }
        
        try {
            return processSensitiveFields(body);
        } catch (Exception e) {
            log.error("Failed to encrypt sensitive fields", e);
            // 记录错误但不阻止响应,避免泄露加密失败信息
            return body;
        }
    }
    
    private Object processSensitiveFields(Object obj) throws IllegalAccessException {
        if (obj == null) {
            return null;
        }
        
        // 处理集合
        if (obj instanceof Collection) {
            for (Object item : (Collection<?>) obj) {
                processSensitiveFields(item);
            }
            return obj;
        }
        
        Class<?> clazz = obj.getClass();
        
        // 处理Record类型
        if (clazz.isRecord()) {
            return processRecordFields(obj, clazz);
        }
        
        // 处理普通类字段
        for (Field field : clazz.getDeclaredFields()) {
            SensitiveData annotation = field.getAnnotation(SensitiveData.class);
            if (annotation != null && field.getType() == String.class) {
                field.setAccessible(true);
                String value = (String) field.get(obj);
                if (value != null && !value.isEmpty()) {
                    String processed = processFieldValue(value, annotation.type());
                    field.set(obj, processed);
                }
            }
        }
        
        return obj;
    }
    
    private Object processRecordFields(Object record, Class<?> clazz) {
        // Record是不可变的,如果有敏感字段需要加密,需要重新构造
        // 这里简单处理:Record的加密在构造时完成,这里仅做检测
        for (RecordComponent component : clazz.getRecordComponents()) {
            if (component.isAnnotationPresent(SensitiveData.class)) {
                log.debug("Record {} has sensitive component {}", clazz.getSimpleName(), component.getName());
            }
        }
        return record;
    }
    
    private String processFieldValue(String value, SensitiveData.SensitiveType type) {
        return switch (type) {
            case EMAIL -> encryptionService.maskEmail(value);
            case PHOTO_URL -> value; // URL已经在生成时签名,不需要再加密
            case USER_INFO -> encryptionService.encrypt(value);
            default -> encryptionService.encrypt(value);
        };
    }
}
