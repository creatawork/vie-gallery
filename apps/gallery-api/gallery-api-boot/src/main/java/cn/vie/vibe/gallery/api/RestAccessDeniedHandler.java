package cn.vie.vibe.gallery.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class RestAccessDeniedHandler implements AccessDeniedHandler {
    private final ApiErrorWriter errors;

    public RestAccessDeniedHandler(ApiErrorWriter errors) {
        this.errors = errors;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException exception) throws IOException {
        boolean csrf = exception instanceof CsrfException;
        errors.write(request, response, csrf ? HttpServletResponse.SC_FORBIDDEN : HttpServletResponse.SC_FORBIDDEN,
                csrf ? "CSRF_INVALID" : "ACCESS_DENIED",
                csrf ? "CSRF token is invalid" : "Access is denied");
    }
}
