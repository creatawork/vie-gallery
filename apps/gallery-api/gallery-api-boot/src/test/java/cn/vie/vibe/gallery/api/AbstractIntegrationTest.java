package cn.vie.vibe.gallery.api;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.MySQLContainer;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractIntegrationTest {

    static MySQLContainer<?> MYSQL;
    static GenericContainer<?> REDIS;
    static boolean dockerAvailable = false;

    static {
        try {
            if (DockerClientFactory.instance().isDockerAvailable()) {
                dockerAvailable = true;
                MYSQL = new MySQLContainer<>("mysql:8.4.0")
                        .withDatabaseName("vie_gallery_test")
                        .withUsername("test")
                        .withPassword("test");
                MYSQL.start();

                REDIS = new GenericContainer<>("redis:7.2-alpine")
                        .withExposedPorts(6379);
                REDIS.start();
            }
        } catch (Throwable ignored) {
            dockerAvailable = false;
        }
    }

    @BeforeAll
    static void checkDocker() {
        boolean ready = dockerAvailable && MYSQL != null && MYSQL.isRunning();
        if (!ready && isCi()) {
            throw new IllegalStateException(
                    "Docker is required for integration tests in CI. Start Docker or fix the Testcontainers environment.");
        }
        Assumptions.assumeTrue(ready,
                "Docker is not available; skipping Testcontainers integration test locally.");
    }

    private static boolean isCi() {
        String ci = System.getenv("CI");
        String githubActions = System.getenv("GITHUB_ACTIONS");
        return "true".equalsIgnoreCase(ci) || "true".equalsIgnoreCase(githubActions);
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        if (dockerAvailable && MYSQL != null && MYSQL.isRunning()) {
            registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
            registry.add("spring.datasource.username", MYSQL::getUsername);
            registry.add("spring.datasource.password", MYSQL::getPassword);
            registry.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
            registry.add("spring.flyway.enabled", () -> "true");
        }
        if (dockerAvailable && REDIS != null && REDIS.isRunning()) {
            registry.add("spring.data.redis.url", () -> "redis://" + REDIS.getHost() + ":" + REDIS.getFirstMappedPort());
            registry.add("spring.session.store-type", () -> "redis");
        } else {
            registry.add("spring.session.store-type", () -> "none");
        }
    }
}
