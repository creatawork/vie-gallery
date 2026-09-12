package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.EmailPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 生产环境 SMTP 邮件适配器。仅发送重置链接，日志不记录 raw token。
 */
@Component
@Profile("prod")
public class SmtpEmailAdapter implements EmailPort {
    private static final Logger log = LoggerFactory.getLogger(SmtpEmailAdapter.class);

    private final JavaMailSender mailSender;
    private final String fromAddress;
    private final String adminPublicBaseUrl;

    public SmtpEmailAdapter(
            JavaMailSender mailSender,
            @Value("${gallery.mail.from}") String fromAddress,
            @Value("${gallery.admin-public-base-url}") String adminPublicBaseUrl
    ) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
        this.adminPublicBaseUrl = trimTrailingSlash(adminPublicBaseUrl);
    }

    @Override
    public void sendPasswordReset(String toEmail, String resetToken, Duration validFor) {
        String resetUrl = adminPublicBaseUrl + "/reset-password?token=" + resetToken;
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(toEmail);
        message.setSubject("VIE Gallery 密码重置");
        message.setText("""
                您好，

                我们收到了重置您 VIE Gallery 账户密码的请求。
                请在 %d 分钟内打开以下链接完成重置：

                %s

                如果这不是您本人的操作，请忽略本邮件。
                """.formatted(Math.max(1, validFor.toMinutes()), resetUrl));
        mailSender.send(message);
        log.info("password_reset_email_sent toDomain={}", emailDomain(toEmail));
    }

    private static String trimTrailingSlash(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("gallery.admin-public-base-url must be configured in production");
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private static String emailDomain(String email) {
        if (email == null) return "unknown";
        int at = email.lastIndexOf('@');
        return at >= 0 ? email.substring(at + 1) : "unknown";
    }
}
