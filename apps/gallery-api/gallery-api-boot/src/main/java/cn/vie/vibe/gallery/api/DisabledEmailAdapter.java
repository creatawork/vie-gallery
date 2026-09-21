package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.EmailPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 邮件功能关闭时的生产环境兜底适配器：SMTP 未启用时承担 EmailPort 装配，
 * 仅记录投递请求，不发送邮件。与 SmtpEmailAdapter 的安全约定一致，
 * 日志不记录 raw token。
 */
@Component
@Profile("prod")
@ConditionalOnProperty(name = "gallery.mail.enabled", havingValue = "false", matchIfMissing = true)
public class DisabledEmailAdapter implements EmailPort {
    private static final Logger log = LoggerFactory.getLogger(DisabledEmailAdapter.class);

    @Override
    public void sendPasswordReset(String toEmail, String resetToken, Duration validFor) {
        log.warn(
                "mail disabled: password reset requested for domain={} but no email was sent; "
                        + "set GALLERY_MAIL_ENABLED=true with real SMTP settings to enable delivery",
                emailDomain(toEmail)
        );
    }

    private static String emailDomain(String email) {
        if (email == null) return "unknown";
        int at = email.lastIndexOf('@');
        return at >= 0 ? email.substring(at + 1) : "unknown";
    }
}
