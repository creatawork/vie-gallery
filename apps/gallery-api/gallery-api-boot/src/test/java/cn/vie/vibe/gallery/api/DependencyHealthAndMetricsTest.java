package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.ObjectStoragePort;
import cn.vie.vibe.gallery.application.PhotoProcessingTaskRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DependencyHealthAndMetricsTest {

    @Test
    void galleryMetricsRegistersQueueDepthGauge() {
        PhotoProcessingTaskRepository tasks = mock(PhotoProcessingTaskRepository.class);
        when(tasks.countActiveQueue()).thenReturn(42L);
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        new GalleryMetrics(registry, tasks);

        assertEquals(42.0, registry.get("gallery.task.queue.depth").gauge().value());
    }

    @Test
    @SuppressWarnings("unchecked")
    void dependencyHealthReportsDatabaseRedisAndObjectStorage() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.execute("SELECT 1")).thenReturn(true);

        RedisConnectionFactory redisFactory = mock(RedisConnectionFactory.class);
        RedisConnection redisConnection = mock(RedisConnection.class);
        when(redisFactory.getConnection()).thenReturn(redisConnection);
        when(redisConnection.ping()).thenReturn("PONG");

        ObjectStoragePort storage = mock(ObjectStoragePort.class);

        ObjectProvider<RedisConnectionFactory> redisProvider = mock(ObjectProvider.class);
        when(redisProvider.getIfAvailable()).thenReturn(redisFactory);
        ObjectProvider<ObjectStoragePort> storageProvider = mock(ObjectProvider.class);
        when(storageProvider.getIfAvailable()).thenReturn(storage);

        DependencyHealthIndicator indicator = new DependencyHealthIndicator(
                dataSource, redisProvider, storageProvider);

        var health = indicator.health();
        assertEquals("UP", health.getStatus().getCode());
        assertEquals("UP", health.getDetails().get("database"));
        assertEquals("PONG", health.getDetails().get("redis"));
        assertEquals("UP", health.getDetails().get("objectStorage"));
        verify(storage).ping();
    }

    @Test
    @SuppressWarnings("unchecked")
    void dependencyHealthGoesDownWhenRedisFails() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.execute("SELECT 1")).thenReturn(true);

        RedisConnectionFactory redisFactory = mock(RedisConnectionFactory.class);
        when(redisFactory.getConnection()).thenThrow(new RuntimeException("redis down"));

        ObjectProvider<RedisConnectionFactory> redisProvider = mock(ObjectProvider.class);
        when(redisProvider.getIfAvailable()).thenReturn(redisFactory);
        ObjectProvider<ObjectStoragePort> storageProvider = mock(ObjectProvider.class);
        when(storageProvider.getIfAvailable()).thenReturn(null);

        DependencyHealthIndicator indicator = new DependencyHealthIndicator(
                dataSource, redisProvider, storageProvider);

        var health = indicator.health();
        assertEquals("DOWN", health.getStatus().getCode());
        assertTrue(String.valueOf(health.getDetails().get("redis")).contains("DOWN"));
    }
}
