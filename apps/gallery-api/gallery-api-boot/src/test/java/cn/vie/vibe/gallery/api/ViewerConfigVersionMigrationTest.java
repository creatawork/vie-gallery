package cn.vie.vibe.gallery.api;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.MySQLContainer;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ViewerConfigVersionMigrationTest {
    @Test
    void backfillsStableNumbersWithoutChangingPublishedSnapshots() throws Exception {
        Assumptions.assumeTrue(DockerClientFactory.instance().isDockerAvailable(), "Docker is unavailable");

        try (MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.4.0")
                .withDatabaseName("vie_gallery_migration_test")
                .withUsername("test")
                .withPassword("test")) {
            mysql.start();
            Flyway.configure().dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .target("16").load().migrate();

            UUID tenantId = UUID.randomUUID();
            UUID userId = UUID.randomUUID();
            UUID populatedGalleryId = UUID.randomUUID();
            UUID otherGalleryId = UUID.randomUUID();
            UUID emptyGalleryId = UUID.randomUUID();
            UUID firstId = UUID.fromString("00000000-0000-0000-0000-000000000001");
            UUID secondId = UUID.fromString("00000000-0000-0000-0000-000000000002");
            UUID thirdId = UUID.fromString("00000000-0000-0000-0000-000000000003");
            UUID otherId = UUID.randomUUID();
            String jsonBefore = "{\"version\":1}";

            try (Connection connection = DriverManager.getConnection(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())) {
                insertIdentityAndGalleries(connection, tenantId, userId,
                        List.of(populatedGalleryId, otherGalleryId, emptyGalleryId));
                insertConfig(connection, populatedGalleryId, firstId, jsonBefore);
                insertConfig(connection, otherGalleryId, UUID.randomUUID(), "{}");
                insertConfig(connection, emptyGalleryId, UUID.randomUUID(), "{}");

                try (PreparedStatement insert = connection.prepareStatement(
                        "INSERT INTO gallery_viewer_config_version " +
                                "(id, tenant_id, gallery_id, config_json, schema_version, created_at) " +
                                "VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 1, '2026-01-01 00:00:00.000000')")) {
                    for (UUID id : List.of(firstId, secondId, thirdId)) {
                        insert.setString(1, id.toString());
                        insert.setString(2, tenantId.toString());
                        insert.setString(3, populatedGalleryId.toString());
                        insert.setString(4, id.equals(firstId) ? jsonBefore : "{\"id\":\"" + id + "\"}");
                        insert.executeUpdate();
                    }
                    insert.setString(1, otherId.toString());
                    insert.setString(2, tenantId.toString());
                    insert.setString(3, otherGalleryId.toString());
                    insert.setString(4, "{\"other\":true}");
                    insert.executeUpdate();
                }

                try (PreparedStatement publish = connection.prepareStatement(
                        "UPDATE gallery_viewer_config SET published_version_id = UUID_TO_BIN(?) WHERE gallery_id = UUID_TO_BIN(?)")) {
                    publish.setString(1, secondId.toString());
                    publish.setString(2, populatedGalleryId.toString());
                    assertEquals(1, publish.executeUpdate());
                }

                UUID publishedBefore = readPublishedId(connection, populatedGalleryId);
                String jsonBeforeUpgrade = readConfigJson(connection, populatedGalleryId);
                Flyway.configure().dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                        .load().migrate();

                assertEquals(List.of(1L, 2L, 3L), readNumbers(connection, populatedGalleryId));
                assertEquals(3L, readCounter(connection, populatedGalleryId));
                assertEquals(1L, readNumbers(connection, otherGalleryId).get(0));
                assertEquals(0L, readCounter(connection, emptyGalleryId));
                assertEquals(publishedBefore, readPublishedId(connection, populatedGalleryId));
                assertEquals(jsonBeforeUpgrade, readConfigJson(connection, populatedGalleryId));
                assertTrue(allMetadataIsNull(connection));

                assertThrows(java.sql.SQLException.class, () -> execute(connection,
                        "INSERT INTO gallery_viewer_config_version (id, tenant_id, gallery_id, config_json, schema_version, created_at, version_number) " +
                                "VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN('" + tenantId + "'), UUID_TO_BIN('" + populatedGalleryId + "'), '{}', 1, NOW(6), 1)"));
                assertThrows(java.sql.SQLException.class, () -> execute(connection,
                        "UPDATE gallery_viewer_config_version SET version_number = 0 WHERE gallery_id = UUID_TO_BIN('" + populatedGalleryId + "')"));

                try (PreparedStatement addAudit = connection.prepareStatement(
                        "UPDATE gallery_viewer_config_version SET metadata_updated_by_user_id = UUID_TO_BIN(?) WHERE id = UUID_TO_BIN(?)")) {
                    addAudit.setString(1, userId.toString());
                    addAudit.setString(2, firstId.toString());
                    addAudit.executeUpdate();
                }
                execute(connection, "DELETE FROM users WHERE id = UUID_TO_BIN('" + userId + "')");
                try (PreparedStatement audit = connection.prepareStatement(
                        "SELECT metadata_updated_by_user_id FROM gallery_viewer_config_version WHERE id = UUID_TO_BIN(?)")) {
                    audit.setString(1, firstId.toString());
                    try (ResultSet result = audit.executeQuery()) {
                        assertTrue(result.next());
                        assertNull(result.getObject(1));
                    }
                }
            }
        }
    }

    private static void insertIdentityAndGalleries(Connection connection, UUID tenantId, UUID userId, List<UUID> galleries) throws Exception {
        try (PreparedStatement user = connection.prepareStatement(
                "INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at) " +
                        "VALUES (UUID_TO_BIN(?), ?, 'test', 'x', NOW(6), NOW(6))")) {
            user.setString(1, userId.toString());
            user.setString(2, userId + "@example.test");
            user.executeUpdate();
        }
        try (PreparedStatement tenant = connection.prepareStatement(
                "INSERT INTO tenant (id, name, slug, created_at, updated_at) VALUES (UUID_TO_BIN(?), 'test', ?, NOW(6), NOW(6))")) {
            tenant.setString(1, tenantId.toString());
            tenant.setString(2, "tenant-" + tenantId.toString().substring(0, 8));
            tenant.executeUpdate();
        }
        try (PreparedStatement gallery = connection.prepareStatement(
                "INSERT INTO gallery (id, tenant_id, slug, name, created_at, updated_at) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'test', NOW(6), NOW(6))")) {
            int index = 0;
            for (UUID galleryId : galleries) {
                gallery.setString(1, galleryId.toString());
                gallery.setString(2, tenantId.toString());
                gallery.setString(3, "gallery-" + index++);
                gallery.executeUpdate();
            }
        }
    }

    private static void insertConfig(Connection connection, UUID galleryId, UUID id, String json) throws Exception {
        try (PreparedStatement config = connection.prepareStatement(
                "INSERT INTO gallery_viewer_config (id, gallery_id, config_json, created_at, updated_at) " +
                        "VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, NOW(6), NOW(6))")) {
            config.setString(1, id.toString());
            config.setString(2, galleryId.toString());
            config.setString(3, json);
            config.executeUpdate();
        }
    }

    private static List<Long> readNumbers(Connection connection, UUID galleryId) throws Exception {
        try (PreparedStatement query = connection.prepareStatement(
                "SELECT version_number FROM gallery_viewer_config_version WHERE gallery_id = UUID_TO_BIN(?) ORDER BY created_at, id")) {
            query.setString(1, galleryId.toString());
            try (ResultSet result = query.executeQuery()) {
                java.util.ArrayList<Long> numbers = new java.util.ArrayList<>();
                while (result.next()) numbers.add(result.getLong(1));
                return numbers;
            }
        }
    }

    private static long readCounter(Connection connection, UUID galleryId) throws Exception {
        try (PreparedStatement query = connection.prepareStatement(
                "SELECT viewer_config_version_counter FROM gallery WHERE id = UUID_TO_BIN(?)")) {
            query.setString(1, galleryId.toString());
            try (ResultSet result = query.executeQuery()) {
                assertTrue(result.next());
                return result.getLong(1);
            }
        }
    }

    private static UUID readPublishedId(Connection connection, UUID galleryId) throws Exception {
        try (PreparedStatement query = connection.prepareStatement(
                "SELECT BIN_TO_UUID(published_version_id) FROM gallery_viewer_config WHERE gallery_id = UUID_TO_BIN(?)")) {
            query.setString(1, galleryId.toString());
            try (ResultSet result = query.executeQuery()) {
                assertTrue(result.next());
                return UUID.fromString(result.getString(1));
            }
        }
    }

    private static String readConfigJson(Connection connection, UUID galleryId) throws Exception {
        try (PreparedStatement query = connection.prepareStatement(
                "SELECT config_json FROM gallery_viewer_config_version WHERE gallery_id = UUID_TO_BIN(?) ORDER BY created_at, id LIMIT 1")) {
            query.setString(1, galleryId.toString());
            try (ResultSet result = query.executeQuery()) {
                assertTrue(result.next());
                return result.getString(1);
            }
        }
    }

    private static boolean allMetadataIsNull(Connection connection) throws Exception {
        try (Statement query = connection.createStatement();
             ResultSet result = query.executeQuery(
                     "SELECT COUNT(*) FROM gallery_viewer_config_version WHERE title IS NOT NULL OR note IS NOT NULL")) {
            assertTrue(result.next());
            return result.getLong(1) == 0;
        }
    }

    private static void execute(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate(sql);
        }
    }
}
