package cn.vie.vibe.gallery.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class ApiErrorWriter {
    private final ObjectMapper objectMapper;
    private final ApiErrorFactory errors;

    public ApiErrorWriter(ObjectMapper objectMapper, ApiErrorFactory errors) {
        this.objectMapper = objectMapper;
        this.errors = errors;
    }

    public void write(HttpServletRequest request, HttpServletResponse response, int status,
                      String code, String message) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), errors.create(request, code, message));
    }
}
