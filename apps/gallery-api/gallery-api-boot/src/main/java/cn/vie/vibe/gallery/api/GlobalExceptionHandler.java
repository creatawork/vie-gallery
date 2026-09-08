package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.PublicAccessException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
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

    @ExceptionHandler(PublicAccessException.class)
    ResponseEntity<ApiError> publicAccess(PublicAccessException exception, HttpServletRequest request) {
        HttpStatus status = switch (exception.getCode()) {
            case PublicAccessException.GALLERY_NOT_FOUND,
                 PublicAccessException.SHARE_LINK_INVALID,
                 PublicAccessException.SHARE_LINK_EXPIRED,
                 PublicAccessException.SHARE_LINK_REVOKED -> HttpStatus.NOT_FOUND;
            case PublicAccessException.PASSWORD_REQUIRED,
                 PublicAccessException.SHARE_LINK_REQUIRED,
                 PublicAccessException.PUBLIC_SESSION_EXPIRED -> HttpStatus.UNAUTHORIZED;
            case PublicAccessException.PASSWORD_INVALID -> HttpStatus.FORBIDDEN;
            case PublicAccessException.RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
            default -> HttpStatus.BAD_REQUEST;
        };
        return ResponseEntity.status(status).body(errors.create(request, exception.getCode(), exception.getMessage()));
    }

    @ExceptionHandler(DomainException.class)
    ResponseEntity<ApiError> domain(DomainException exception, HttpServletRequest request) {
        HttpStatus status = switch (exception.code()) {
            case "AUTH_REQUIRED", "AUTH_INVALID_CREDENTIALS" -> HttpStatus.UNAUTHORIZED;
            case "AUTH_USER_DISABLED", "AUTH_TENANT_NOT_FOUND", "MEMBER_FORBIDDEN", "ROLE_REQUIRED" -> HttpStatus.FORBIDDEN;
            case "RESOURCE_NOT_FOUND", "GALLERY_NOT_FOUND", "PHOTO_NOT_FOUND", "TASK_NOT_FOUND", "MEMBERSHIP_NOT_FOUND", "CONFIG_NOT_FOUND", "CONFIG_VERSION_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "VALIDATION_FAILED", "FILE_INVALID", "FILE_TYPE_UNSUPPORTED", "IMAGE_DECODE_FAILED", "IMAGE_DIMENSIONS_INVALID", "INVALID_PAGE", "INVALID_PAGE_SIZE", "INVALID_PARAMETER", "BAD_SCHEMA_VERSION", "CONFIG_VERSIONING_UNAVAILABLE" -> HttpStatus.BAD_REQUEST;
            case "DEPENDENCY_UNAVAILABLE", "STORAGE_UNAVAILABLE" -> HttpStatus.SERVICE_UNAVAILABLE;
            case "AUTH_EMAIL_UNAVAILABLE", "GALLERY_SLUG_CONFLICT", "GALLERY_ALREADY_ARCHIVED", "GALLERY_NOT_READY", "GALLERY_STATE_CONFLICT", "MEMBERSHIP_CONFLICT", "LAST_OWNER", "QUOTA_EXCEEDED", "TASK_STATE_CONFLICT", "TASK_RETRY_EXHAUSTED", "CONFIG_VERSION_PUBLISH_FAILED" -> HttpStatus.CONFLICT;
            case "FILE_TOO_LARGE" -> HttpStatus.PAYLOAD_TOO_LARGE;
            case "RATE_LIMITED" -> HttpStatus.TOO_MANY_REQUESTS;
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

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiError> invalidParameter(MethodArgumentTypeMismatchException exception, HttpServletRequest request) {
        String parameter = exception.getName();
        String code = switch (parameter) {
            case "page" -> "INVALID_PAGE";
            case "pageSize" -> "INVALID_PAGE_SIZE";
            default -> "INVALID_PARAMETER";
        };
        return ResponseEntity.badRequest().body(errors.create(request, code, "Request parameter is invalid"));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> uploadTooLarge(HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(errors.create(request, "FILE_TOO_LARGE", "文件体积超过限制，请选择较小的照片"));
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
