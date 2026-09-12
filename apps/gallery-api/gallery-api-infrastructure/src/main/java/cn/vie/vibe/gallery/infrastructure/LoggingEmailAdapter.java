package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.EmailPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 非生产环境邮件适配器：将重置链接打印到日志，便于本地联调。
 * 生产环境必须使用 SmtpEmailAdapter，禁止把 raw token 写入可观测日志。
 */
@Component
@Profile("!prod")
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
