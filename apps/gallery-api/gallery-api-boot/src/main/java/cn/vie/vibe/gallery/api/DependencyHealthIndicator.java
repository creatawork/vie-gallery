package cn.vie.vibe.gallery.api;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

@Component("dependencyHealth")
public class DependencyHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;

    public DependencyHealthIndicator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Health health() {
        if (dataSource != null) {
            try (Connection conn = dataSource.getConnection();
                 Statement stmt = conn.createStatement()) {
                stmt.execute("SELECT 1");
            } catch (Exception ex) {
                return Health.down().withDetail("database", "DOWN: " + ex.getMessage()).build();
            }
        }
        return Health.up().withDetail("database", "UP").build();
    }
}
