package cn.vie.vibe.gallery.application;

import java.time.Duration;

/**
 * 邮件发送端口，用于发送系统邮件。
 * 开发环境使用 LoggingEmailAdapter 打印到日志，
 * 生产环境使用 SmtpEmailAdapter 发送真实邮件。
 */
public interface EmailPort {
    /**
     * 发送密码重置邮件
     *
     * @param toEmail 收件人邮箱
     * @param resetToken 重置 token（原始值，未哈希）
     * @param validFor token 有效期
     */
    void sendPasswordReset(String toEmail, String resetToken, Duration validFor);
}
