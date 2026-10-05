package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Validates stored snapshots without applying defaults or changing historical semantics. */
public final class ViewerConfigValidator {
    // The parser counts containers; the traversal below also counts scalar leaves, matching TS.
    private final ObjectMapper mapper = new ObjectMapper(JsonFactory.builder()
        .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(9).build()).build())
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private record Rule(String kind, double min, double max, Set<String> values) {}
    private static final Set<String> BLOCKED = Set.of("__proto__", "constructor", "prototype");
    private static final Map<String, Rule> RULES = rules();
    private static Map<String, Rule> rules() {
        return Map.ofEntries(
            Map.entry("quality", new Rule("enum", 0, 0, Set.of("auto", "low", "mid", "high"))),
            Map.entry("presetName", new Rule("string", 0, 0, Set.of())),
            Map.entry("customized", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("visitorAllowDownload", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("layout", new Rule("object", 0, 0, Set.of())),
            Map.entry("layout.mode", new Rule("enum", 0, 0, Set.of("sphere", "carousel", "helix", "grid", "spiral", "random"))),
            Map.entry("layout.params", new Rule("object", 0, 0, Set.of())),
            Map.entry("layout.params.scale", new Rule("number", 0.5, 2, Set.of())),
            Map.entry("layout.params.spacing", new Rule("number", 0.5, 3, Set.of())),
            Map.entry("layout.params.radius", new Rule("number", 100, 1500, Set.of())),
            Map.entry("layout.params.columns", new Rule("integer", 1, 12, Set.of())),
            Map.entry("layout.params.height", new Rule("number", 100, 1500, Set.of())),
            Map.entry("layout.params.turns", new Rule("number", 0.5, 6, Set.of())),
            Map.entry("layout.transition", new Rule("object", 0, 0, Set.of())),
            Map.entry("layout.transition.duration", new Rule("number", 0.2, 3, Set.of())),
            Map.entry("layout.transition.style", new Rule("enum", 0, 0, Set.of("smooth", "burst", "none"))),
            Map.entry("particles", new Rule("object", 0, 0, Set.of())),
            Map.entry("particles.enabled", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("particles.types", new Rule("particles", 0, 0, Set.of())),
            Map.entry("particles.density", new Rule("number", 0, 2, Set.of())),
            Map.entry("particles.speed", new Rule("number", 0, 2, Set.of())),
            Map.entry("particles.size", new Rule("number", 0.5, 2, Set.of())),
            Map.entry("particles.color", new Rule("color", 0, 0, Set.of())),
            Map.entry("background", new Rule("object", 0, 0, Set.of())),
            Map.entry("background.mode", new Rule("enum", 0, 0, Set.of("solid", "gradient"))),
            Map.entry("background.color", new Rule("color", 0, 0, Set.of())),
            Map.entry("background.secondaryColor", new Rule("color", 0, 0, Set.of())),
            Map.entry("background.angle", new Rule("number", 0, 360, Set.of())),
            Map.entry("effects", new Rule("object", 0, 0, Set.of())),
            Map.entry("effects.bloom", new Rule("object", 0, 0, Set.of())),
            Map.entry("effects.bloom.enabled", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("effects.bloom.strength", new Rule("number", 0, 2, Set.of())),
            Map.entry("effects.bloom.radius", new Rule("number", 0, 1, Set.of())),
            Map.entry("effects.bloom.threshold", new Rule("number", 0, 1, Set.of())),
            Map.entry("effects.bloom.preset", new Rule("enum", 0, 0, Set.of("fresh", "warm", "deep", "minimal"))),
            Map.entry("effects.fog", new Rule("object", 0, 0, Set.of())),
            Map.entry("effects.fog.enabled", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("effects.fog.color", new Rule("color", 0, 0, Set.of())),
            Map.entry("effects.fog.density", new Rule("number", 0, 0.01, Set.of())),
            Map.entry("effects.fog.preset", new Rule("enum", 0, 0, Set.of("fresh", "warm", "deep", "minimal"))),
            Map.entry("effects.postGrade", new Rule("object", 0, 0, Set.of())),
            Map.entry("effects.postGrade.enabled", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("effects.postGrade.saturation", new Rule("number", 0, 2, Set.of())),
            Map.entry("effects.postGrade.brightness", new Rule("number", 0.5, 1.5, Set.of())),
            Map.entry("effects.postGrade.contrast", new Rule("number", 0.5, 1.5, Set.of())),
            Map.entry("effects.vignette", new Rule("object", 0, 0, Set.of())),
            Map.entry("effects.vignette.enabled", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("effects.vignette.strength", new Rule("number", 0, 1, Set.of())),
            Map.entry("effects.vignette.legacyCurve", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("effects.vignette.offset", new Rule("number", 0.5, 2, Set.of())),
            Map.entry("effects.photoFloat", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("effects.floatAmplitude", new Rule("number", 0, 2, Set.of())),
            Map.entry("effects.floatSpeed", new Rule("number", 0, 2, Set.of())),
            Map.entry("effects.photoEntrance", new Rule("enum", 0, 0, Set.of("fade", "rise", "none"))),
            Map.entry("effects.entranceDuration", new Rule("number", 0.2, 2, Set.of())),
            Map.entry("camera", new Rule("object", 0, 0, Set.of())),
            Map.entry("camera.autoRotate", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("camera.introFlight", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("camera.rotateSpeed", new Rule("number", 0, 2, Set.of())),
            Map.entry("camera.introDuration", new Rule("number", 0.5, 4, Set.of())),
            Map.entry("interaction", new Rule("object", 0, 0, Set.of())),
            Map.entry("interaction.clickRipple", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("interaction.cursorTrail", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("audio", new Rule("object", 0, 0, Set.of())),
            Map.entry("audio.bgm", new Rule("object", 0, 0, Set.of())),
            Map.entry("audio.bgm.enabled", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("audio.sfx", new Rule("object", 0, 0, Set.of())),
            Map.entry("audio.sfx.enabled", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("lighting", new Rule("object", 0, 0, Set.of())),
            Map.entry("lighting.timeOfDay", new Rule("enum", 0, 0, Set.of("auto", "sunrise", "noon", "sunset", "night"))),
            Map.entry("lighting.autoColorAdapt", new Rule("boolean", 0, 0, Set.of())),
            Map.entry("lighting.transitionDuration", new Rule("number", 0.1, 10, Set.of()))
        );
    }

    public String validate(String json, int schemaVersion) {
        if (schemaVersion != 1) throw invalid("Unsupported viewer configuration schema version");
        if (json == null || json.getBytes(StandardCharsets.UTF_8).length > 65536) throw invalid("Configuration exceeds size limit");
        try {
            JsonNode root = mapper.readTree(json);
            if (root == null || !root.isObject()) throw invalid("Configuration must be an object");
            clean(root, "", 0);
            return mapper.writeValueAsString(root);
        } catch (DomainException error) { throw error; }
        catch (Exception error) { throw invalid("Invalid configuration JSON or nesting depth"); }
    }

    private void clean(JsonNode node, String path, int depth) {
        if (depth > 8) throw invalid("Configuration nesting exceeds 8 levels");
        Rule rule = RULES.get(path);
        boolean legacyLayout = path.equals("layout") && node.isTextual();
        if (legacyLayout) rule = RULES.get("layout.mode");
        if (rule != null && !valid(node, rule)) throw invalid("Invalid configuration field: " + path);
        if (node.isObject()) {
            var names = new ArrayList<String>();
            node.fieldNames().forEachRemaining(names::add);
            for (String name : names) {
                if (BLOCKED.contains(name)) ((ObjectNode) node).remove(name);
                else clean(node.get(name), path.isEmpty() ? name : path + "." + name, depth + 1);
            }
        } else if (node.isArray()) {
            for (JsonNode item : node) clean(item, "", depth + 1);
        }
    }

    private static boolean valid(JsonNode node, Rule rule) {
        return switch (rule.kind()) {
            case "object" -> node.isObject();
            case "boolean" -> node.isBoolean();
            case "string" -> node.isTextual();
            case "color" -> node.isTextual() && node.asText().matches("(?i)#[0-9a-f]{6}");
            case "enum" -> node.isTextual() && rule.values().contains(node.asText());
            case "particles" -> {
                var seen = new HashSet<String>();
                boolean valid = node.isArray();
                for (JsonNode value : node) valid &= value.isTextual() && Set.of("stars", "hearts", "sakura", "snow", "fireflies", "meteors").contains(value.asText()) && seen.add(value.asText());
                yield valid;
            }
            default -> node.isNumber() && Double.isFinite(node.asDouble()) && node.asDouble() >= rule.min() && node.asDouble() <= rule.max()
                && (!rule.kind().equals("integer") || node.asDouble() == Math.rint(node.asDouble()));
        };
    }
    private static DomainException invalid(String message) { return new DomainException("BAD_VIEWER_CONFIG", message); }
}
