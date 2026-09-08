package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.EmailPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 默认邮件适配器，打印日志。
 */
@Component
public class LoggingEmailAdapter implements EmailPort {
    private static final Logger log = LoggerFactory.getLogger(LoggingEmailAdapter.class);

    @Override
    public void sendPasswordReset(String toEmail, String resetToken, Duration validFor) {
        log.info("=== DEV MODE: Password Reset Email ===");
        log.info("To: {}", toEmail);
        log.info("Reset Token: {}", resetToken);
        log.info("Valid For: {} minutes", validFor.toMinutes());
        log.info("Reset URL: http://localhost:5173/reset-password?token={}", resetToken);
        log.info("=====================================");
    }
}
