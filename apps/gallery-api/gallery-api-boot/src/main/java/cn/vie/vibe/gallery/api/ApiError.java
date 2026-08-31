package cn.vie.vibe.gallery.api;

import java.util.Map;

public record ApiError(String code, String message, String requestId, Map<String, Object> details) {
    public ApiError {
        details = details == null ? Map.of() : Map.copyOf(details);
    }
}
