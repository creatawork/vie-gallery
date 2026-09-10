package cn.vie.vibe.gallery.api;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProductionConfigValidatorTest {

    @Test
    void rejectsWeakDatabasePasswordInProdProfile() {
        Environment env = mock(Environment.class);
        when(env.getActiveProfiles()).thenReturn(new String[]{"prod"});

        ProductionConfigValidator validator = new ProductionConfigValidator(env);
        ReflectionTestUtils.setField(validator, "dbPassword", "vie_local");
        ReflectionTestUtils.setField(validator, "storageAccessKey", "ak");
        ReflectionTestUtils.setField(validator, "storageSecretKey", "strong-secret-12345678");

        assertThrows(IllegalStateException.class, validator::validateOnStartup);
    }

    @Test
    void allowsStrongCredentialsInProdProfile() {
        Environment env = mock(Environment.class);
        when(env.getActiveProfiles()).thenReturn(new String[]{"prod"});

        ProductionConfigValidator validator = new ProductionConfigValidator(env);
        ReflectionTestUtils.setField(validator, "dbPassword", "P@ssw0rdStrong987654321");
        ReflectionTestUtils.setField(validator, "storageAccessKey", "prod-minio-key");
        ReflectionTestUtils.setField(validator, "storageSecretKey", "prod-minio-secret-long-token");

        assertDoesNotThrow(validator::validateOnStartup);
    }

    @Test
    void allowsDefaultCredentialsInDevProfile() {
        Environment env = mock(Environment.class);
        when(env.getActiveProfiles()).thenReturn(new String[]{"dev"});

        ProductionConfigValidator validator = new ProductionConfigValidator(env);
        ReflectionTestUtils.setField(validator, "dbPassword", "vie_local");
        ReflectionTestUtils.setField(validator, "storageAccessKey", "vie_local");
        ReflectionTestUtils.setField(validator, "storageSecretKey", "vie_local_secret");

        assertDoesNotThrow(validator::validateOnStartup);
    }
}
