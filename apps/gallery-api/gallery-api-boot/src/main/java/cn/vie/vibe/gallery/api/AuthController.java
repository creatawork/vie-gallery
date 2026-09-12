package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.AuthenticatedUser;
import cn.vie.vibe.gallery.application.CurrentPrincipal;
import cn.vie.vibe.gallery.domain.Capability;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.dao.DataAccessException;
import cn.vie.vibe.gallery.domain.DomainException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthFacade auth;
    private final SecurityContextRepository securityContextRepository;
    private final RedisRateLimiter rateLimiter;

    public AuthController(AuthFacade auth, SecurityContextRepository securityContextRepository,
                          RedisRateLimiter rateLimiter) {
        this.auth = auth;
        this.securityContextRepository = securityContextRepository;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request,
                                                 HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        AuthenticatedUser result = auth.register(request.email(), request.displayName(), request.password());
        authenticate(result, httpRequest, httpResponse);
        return ResponseEntity.status(HttpStatus.CREATED).body(AuthResponse.from(result));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request,
                              HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        String identity = request.email().trim().toLowerCase(Locale.ROOT);
        rateLimiter.assertLoginAllowed(identity);
        AuthenticatedUser result;
        try {
            result = auth.login(request.email(), request.password());
        } catch (DomainException exception) {
            if ("AUTH_INVALID_CREDENTIALS".equals(exception.code())) {
                rateLimiter.recordLoginFailure(identity);
            }
            throw exception;
        }
        rateLimiter.resetLogin(identity);
        authenticate(result, httpRequest, httpResponse);
        return AuthResponse.from(result);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        HttpSession session = request.getSession(false);
        try {
            if (session != null) {
                session.invalidate();
            }
        } catch (DataAccessException exception) {
            clearCookie(response, "VIE_SESSION", true);
            clearCookie(response, "XSRF-TOKEN", false);
            throw new DomainException("DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable");
        }
        SecurityContextHolder.clearContext();
        clearCookie(response, "VIE_SESSION", true);
        clearCookie(response, "XSRF-TOKEN", false);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/forgot-password")
    public Map<String, String> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        auth.requestPasswordReset(request.email());
        return Map.of("message", "如果邮箱存在，您将收到密码重置邮件");
    }

    @PostMapping("/reset-password")
    public Map<String, Boolean> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        auth.resetPassword(request.token(), request.newPassword());
        return Map.of("success", true);
    }

    private void authenticate(AuthenticatedUser result, HttpServletRequest request, HttpServletResponse response) {
        if (request.getSession(false) != null) {
            request.changeSessionId();
        } else {
            request.getSession(true);
        }
        Authentication authentication = new UsernamePasswordAuthenticationToken(
                new CurrentPrincipal(result.user().id(), result.user().authenticationVersion()), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + result.role().name())));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }

    private static void clearCookie(HttpServletResponse response, String name, boolean httpOnly) {
        Cookie cookie = new Cookie(name, "");
        cookie.setPath("/");
        cookie.setMaxAge(0);
        cookie.setHttpOnly(httpOnly);
        response.addCookie(cookie);
    }

    public record RegisterRequest(@NotBlank @Email @Size(max = 320) String email,
                                  @NotBlank @Size(min = 12, max = 128) String password,
                                  @NotBlank @Size(max = 120) String displayName) {
    }

    public record LoginRequest(@NotBlank @Email @Size(max = 320) String email,
                               @NotBlank @Size(min = 12, max = 128) String password) {
    }

    public record ForgotPasswordRequest(@NotBlank @Email @Size(max = 320) String email) {
    }

    public record ResetPasswordRequest(@NotBlank @Size(min = 43, max = 128) String token,
                                       @NotBlank @Size(min = 12, max = 128) String newPassword) {
    }

    public record AuthResponse(UserResponse user, TenantResponse tenant, String role, List<Capability> capabilities) {
        static AuthResponse from(AuthenticatedUser authenticated) {
            return new AuthResponse(UserResponse.from(authenticated), TenantResponse.from(authenticated),
                    authenticated.role().name(), cn.vie.vibe.gallery.application.WorkspaceCapabilities.forRole(authenticated.role()));
        }
    }

    public record UserResponse(String id, String email, String displayName) {
        static UserResponse from(AuthenticatedUser authenticated) {
            return new UserResponse(authenticated.user().id().toString(), authenticated.user().email(),
                    authenticated.user().displayName());
        }
    }

    public record TenantResponse(String id, String name, String slug) {
        static TenantResponse from(AuthenticatedUser authenticated) {
            return new TenantResponse(authenticated.tenant().id().toString(), authenticated.tenant().name(),
                    authenticated.tenant().slug());
        }
    }
}
