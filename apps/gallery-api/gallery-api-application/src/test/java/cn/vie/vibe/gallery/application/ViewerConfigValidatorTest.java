package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import java.nio.file.Files;
import static org.junit.jupiter.api.Assertions.*;

class ViewerConfigValidatorTest {
    @Test void sharedFixtures() throws Exception {
        Path root = Path.of("").toAbsolutePath();
        while (!Files.exists(root.resolve("packages/gallery-contracts/fixtures/viewer-config-cases.json"))) {
            root = root.getParent();
            assertNotNull(root, "Repository fixture must exist");
        }
        var cases = new ObjectMapper().readTree(root.resolve("packages/gallery-contracts/fixtures/viewer-config-cases.json").toFile());
        var validator = new ViewerConfigValidator();
        for (var item : cases) {
            // Backend accepts historical string layouts, but never repairs invalid values.
            if (item.get("legacyValid").asBoolean()) {
                assertDoesNotThrow(() -> validator.validate(item.get("json").asText(), item.get("schemaVersion").asInt()), item.get("name").asText());
            } else {
                var error = assertThrows(DomainException.class, () -> validator.validate(item.get("json").asText(), item.get("schemaVersion").asInt()), item.get("name").asText());
                assertEquals("BAD_VIEWER_CONFIG", error.code());
            }
        }
    }
    @Test void rejectsOversizedUtf8BeforeParsing() {
        assertEquals("BAD_VIEWER_CONFIG", assertThrows(DomainException.class,
            () -> new ViewerConfigValidator().validate("{\"note\":\"" + "照".repeat(23000) + "\"}", 1)).code());
    }
    @Test void depthAndDangerousKeys() throws Exception {
        var validator = new ViewerConfigValidator();
        assertDoesNotThrow(() -> validator.validate("{\"a\":".repeat(8) + "0" + "}".repeat(8), 1));
        assertThrows(DomainException.class, () -> validator.validate("{\"a\":".repeat(9) + "0" + "}".repeat(9), 1));
        var safe = new ObjectMapper().readTree(validator.validate("{\"extension\":{\"constructor\":1,\"label\":\"kept\"},\"__proto__\":{}}", 1));
        assertFalse(safe.has("__proto__"));
        assertFalse(safe.get("extension").has("constructor"));
        assertEquals("kept", safe.get("extension").get("label").asText());
    }
    @Test void backgroundModesAndProjection() {
        var validator = new ViewerConfigValidator();
        String builtin = "{\"background\":{\"mode\":\"image\",\"color\":\"#000000\",\"image\":{\"url\":\"/g/backgrounds/minimal.webp\",\"projection\":\"equirectangular\"}}}";
        assertDoesNotThrow(() -> validator.validate(builtin, 1));
        String custom = "{\"background\":{\"mode\":\"image\",\"color\":\"#000000\",\"image\":{\"url\":\"https://cdn.example.com/room.webp\"}}}";
        assertDoesNotThrow(() -> validator.validate(custom, 1));
        assertThrows(DomainException.class, () -> validator.validate("{\"background\":{\"mode\":\"image\",\"color\":\"#000000\",\"image\":{\"url\":\"/g/backgrounds/minimal.webp\",\"projection\":\"sphere\"}}}", 1));
        assertDoesNotThrow(() -> validator.validate("{\"background\":{\"mode\":\"none\",\"color\":\"#000000\"}}", 1));
        // Historical drafts stored background.type; the validator passes it through untouched.
        assertDoesNotThrow(() -> validator.validate("{\"background\":{\"type\":\"image\",\"color\":\"#000000\"}}", 1));
    }
    @Test void invalidGroupsAndNumericBoundaries() {
        var validator = new ViewerConfigValidator();
        assertThrows(DomainException.class, () -> validator.validate("{} {}", 1));
        for (String json : new String[]{"{\"effects\":null}", "{\"particles\":[]}", "{\"layout\":{\"params\":{\"columns\":1.5}}}", "{\"camera\":{\"rotateSpeed\":3}}"}) {
            assertThrows(DomainException.class, () -> validator.validate(json, 1));
        }
    }
}
