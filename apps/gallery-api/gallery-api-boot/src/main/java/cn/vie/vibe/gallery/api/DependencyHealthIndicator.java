package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.ObjectStoragePort;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

/**
 * Aggregates MySQL / Redis / Object Storage readiness into a single health indicator.
 */
@Component("dependencyHealth")
public class DependencyHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;
    private final ObjectProvider<RedisConnectionFactory> redisConnectionFactory;
    private final ObjectProvider<ObjectStoragePort> objectStorage;

    public DependencyHealthIndicator(
            DataSource dataSource,
            ObjectProvider<RedisConnectionFactory> redisConnectionFactory,
            ObjectProvider<ObjectStoragePort> objectStorage
    ) {
        this.dataSource = dataSource;
        this.redisConnectionFactory = redisConnectionFactory;
        this.objectStorage = objectStorage;
    }

    @Override
    public Health health() {
        Health.Builder builder = Health.up();
        boolean down = false;

        if (dataSource != null) {
            try (Connection conn = dataSource.getConnection();
                 Statement stmt = conn.createStatement()) {
                stmt.execute("SELECT 1");
                builder.withDetail("database", "UP");
            } catch (Exception ex) {
                down = true;
                builder.withDetail("database", "DOWN: " + safeMessage(ex));
            }
        } else {
            builder.withDetail("database", "SKIPPED");
        }

        RedisConnectionFactory redis = redisConnectionFactory.getIfAvailable();
        if (redis != null) {
            try (var connection = redis.getConnection()) {
                String pong = connection.ping();
                builder.withDetail("redis", pong == null || pong.isBlank() ? "UP" : pong);
            } catch (Exception ex) {
                down = true;
                builder.withDetail("redis", "DOWN: " + safeMessage(ex));
            }
        } else {
            builder.withDetail("redis", "SKIPPED");
        }

        ObjectStoragePort storage = objectStorage.getIfAvailable();
        if (storage != null) {
            try {
                storage.ping();
                builder.withDetail("objectStorage", "UP");
            } catch (Exception ex) {
                down = true;
                builder.withDetail("objectStorage", "DOWN: " + safeMessage(ex));
            }
        } else {
            builder.withDetail("objectStorage", "SKIPPED");
        }

        return down ? builder.down().build() : builder.build();
    }

    private static String safeMessage(Exception ex) {
        String message = ex.getMessage();
        if (message == null || message.isBlank()) {
            return ex.getClass().getSimpleName();
        }
        return message.length() > 200 ? message.substring(0, 200) : message;
    }
}
