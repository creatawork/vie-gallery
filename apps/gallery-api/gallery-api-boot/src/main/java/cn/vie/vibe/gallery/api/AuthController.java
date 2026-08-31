package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.AuthenticatedUser;
import cn.vie.vibe.gallery.application.CurrentPrincipal;
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
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthFacade auth;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(AuthFacade auth, SecurityContextRepository securityContextRepository) {
        this.auth = auth;
        this.securityContextRepository = securityContextRepository;
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
        AuthenticatedUser result = auth.login(request.email(), request.password());
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

    private void authenticate(AuthenticatedUser result, HttpServletRequest request, HttpServletResponse response) {
        if (request.getSession(false) != null) {
            request.changeSessionId();
        } else {
            request.getSession(true);
        }
        Authentication authentication = new UsernamePasswordAuthenticationToken(
                new CurrentPrincipal(result.user().id()), null,
                List.of(new SimpleGrantedAuthority("ROLE_OWNER")));
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

    public record AuthResponse(UserResponse user, TenantResponse tenant, String role) {
        static AuthResponse from(AuthenticatedUser authenticated) {
            return new AuthResponse(UserResponse.from(authenticated), TenantResponse.from(authenticated),
                    authenticated.role().name());
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
