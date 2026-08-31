package cn.vie.vibe.gallery.infrastructure.persistence;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

public final class MyBatisValueMapper {
    private MyBatisValueMapper() {
    }

    public static UUID uuid(Map<String, Object> row, String key) {
        return UUID.fromString((String) row.get(key));
    }

    public static Instant instant(Map<String, Object> row, String key) {
        LocalDateTime value = (LocalDateTime) row.get(key);
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    public static LocalDateTime localDateTime(Instant value) {
        return value == null ? null : LocalDateTime.ofInstant(value, ZoneOffset.UTC);
    }
}
