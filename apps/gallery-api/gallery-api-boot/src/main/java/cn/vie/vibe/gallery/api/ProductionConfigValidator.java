package cn.vie.vibe.gallery.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;

@Component
public class ProductionConfigValidator {

    private static final Logger log = LoggerFactory.getLogger(ProductionConfigValidator.class);

    private final Environment environment;

    @Value("${spring.datasource.password:}")
    private String dbPassword;

    @Value("${gallery.storage.access-key:}")
    private String storageAccessKey;

    @Value("${gallery.storage.secret-key:}")
    private String storageSecretKey;

    @Value("${spring.mail.host:}")
    private String mailHost;

    @Value("${gallery.mail.from:}")
    private String mailFrom;

    @Value("${gallery.admin-public-base-url:}")
    private String adminPublicBaseUrl;

    @Value("${gallery.public.base-url:}")
    private String galleryPublicBaseUrl;

    private static final Set<String> WEAK_OR_DEFAULT_PASSWORDS = Set.of(
            "", "vie_local", "vie_local_secret", "root_local", "password", "123456", "admin", "root"
    );

    public ProductionConfigValidator(Environment environment) {
        this.environment = environment;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void validateOnStartup() {
        boolean isProd = Arrays.asList(environment.getActiveProfiles()).contains("prod");
        if (!isProd) {
            return;
        }

        if (dbPassword == null || WEAK_OR_DEFAULT_PASSWORDS.contains(dbPassword.trim())) {
            throw new IllegalStateException("Production configuration error: weak or default database password detected.");
        }

        if (storageSecretKey == null || WEAK_OR_DEFAULT_PASSWORDS.contains(storageSecretKey.trim())) {
            throw new IllegalStateException("Production configuration error: weak or default storage secret detected.");
        }

        if (mailHost == null || mailHost.isBlank()) {
            throw new IllegalStateException("Production configuration error: MAIL_HOST / spring.mail.host is required for password reset.");
        }
        if (mailFrom == null || mailFrom.isBlank() || !mailFrom.contains("@")) {
            throw new IllegalStateException("Production configuration error: MAIL_FROM / gallery.mail.from must be a valid from address.");
        }
        if (adminPublicBaseUrl == null || adminPublicBaseUrl.isBlank()
                || !(adminPublicBaseUrl.startsWith("https://") || adminPublicBaseUrl.startsWith("http://"))) {
            throw new IllegalStateException("Production configuration error: ADMIN_PUBLIC_BASE_URL must be an absolute http(s) URL.");
        }
        if (galleryPublicBaseUrl == null || galleryPublicBaseUrl.isBlank()
                || !(galleryPublicBaseUrl.startsWith("https://") || galleryPublicBaseUrl.startsWith("http://"))) {
            throw new IllegalStateException("Production configuration error: GALLERY_PUBLIC_BASE_URL must be an absolute http(s) URL.");
        }
        // 站点根地址应不带路径后缀（/g 与 /s 由后端拼接）。已知 /g 后缀会被
        // M3ShareLinkConfig 自动剥离，其余后缀仅警告——不能因为 URL 样式问题终止服务
        String afterScheme = galleryPublicBaseUrl.substring(galleryPublicBaseUrl.indexOf("://") + 3);
        if (afterScheme.indexOf('/') >= 0 && !afterScheme.endsWith("/g")) {
            log.warn("GALLERY_PUBLIC_BASE_URL contains a path suffix ({}); share links are built as {}/g/{{slug}} — verify this is intended.", galleryPublicBaseUrl, galleryPublicBaseUrl);
        }
    }
}
