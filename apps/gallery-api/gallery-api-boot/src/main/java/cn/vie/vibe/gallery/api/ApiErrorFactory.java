package cn.vie.vibe.gallery.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class ApiErrorFactory {
    public ApiError create(HttpServletRequest request, String code, String message) {
        return create(request, code, message, Map.of());
    }

    public ApiError create(HttpServletRequest request, String code, String message, Map<String, Object> details) {
        Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
        return new ApiError(code, message, requestId == null ? "unknown" : requestId.toString(), details);
    }
}
