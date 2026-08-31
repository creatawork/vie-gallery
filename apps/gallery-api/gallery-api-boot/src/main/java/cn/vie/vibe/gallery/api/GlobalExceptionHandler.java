package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.domain.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final ApiErrorFactory errors;

    public GlobalExceptionHandler(ApiErrorFactory errors) {
        this.errors = errors;
    }

    @ExceptionHandler(DomainException.class)
    ResponseEntity<ApiError> domain(DomainException exception, HttpServletRequest request) {
        HttpStatus status = switch (exception.code()) {
            case "AUTH_REQUIRED", "AUTH_INVALID_CREDENTIALS" -> HttpStatus.UNAUTHORIZED;
            case "AUTH_USER_DISABLED", "AUTH_TENANT_NOT_FOUND" -> HttpStatus.FORBIDDEN;
            case "RESOURCE_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "VALIDATION_FAILED" -> HttpStatus.BAD_REQUEST;
            case "DEPENDENCY_UNAVAILABLE" -> HttpStatus.SERVICE_UNAVAILABLE;
            case "AUTH_EMAIL_UNAVAILABLE", "GALLERY_SLUG_CONFLICT" -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_REQUEST;
        };
        return ResponseEntity.status(status).body(errors.create(request, exception.code(), exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        Map<String, Object> details = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error -> details.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return ResponseEntity.badRequest().body(errors.create(request, "VALIDATION_FAILED", "Request validation failed", details));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> malformedJson(HttpServletRequest request) {
        return ResponseEntity.badRequest().body(errors.create(request, "MALFORMED_JSON", "Malformed JSON"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> integrity(HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(errors.create(request, "RESOURCE_CONFLICT", "Resource conflicts with existing data"));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<ApiError> dependency(HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(errors.create(request, "DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> notFound(HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errors.create(request, "ROUTE_NOT_FOUND", "Route not found"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception exception, HttpServletRequest request) {
        log.error("Unhandled API exception, requestId={}", request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE), exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errors.create(request, "INTERNAL_ERROR", "An internal error occurred"));
    }
}
