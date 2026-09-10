package cn.vie.vibe.gallery.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;

@Component
public class ProductionConfigValidator {

    private final Environment environment;

    @Value("${spring.datasource.password:}")
    private String dbPassword;

    @Value("${gallery.storage.access-key:}")
    private String storageAccessKey;

    @Value("${gallery.storage.secret-key:}")
    private String storageSecretKey;

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
    }
}
