package cn.vie.vibe.gallery.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.dao.DataAccessException;

import java.io.IOException;
import java.util.UUID;

@Component
@Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {
    public static final String REQUEST_ID_ATTRIBUTE = RequestIdFilter.class.getName() + ".requestId";
    private static final String HEADER = "X-Request-Id";
    private final ApiErrorWriter errors;

    public RequestIdFilter(ApiErrorWriter errors) {
        this.errors = errors;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String candidate = request.getHeader(HEADER);
        String requestId = candidate != null && candidate.matches("[A-Za-z0-9._-]{1,64}")
                ? candidate : UUID.randomUUID().toString();
        request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);
        response.setHeader(HEADER, requestId);
        try (MDC.MDCCloseable ignored = MDC.putCloseable("requestId", requestId)) {
            try {
                filterChain.doFilter(request, response);
            } catch (DataAccessException exception) {
                errors.write(request, response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                        "DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable");
            }
        }
    }
}
