package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.AuthenticatedUser;
import cn.vie.vibe.gallery.application.CurrentPrincipal;
import cn.vie.vibe.gallery.application.TenantContextHolder;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.dao.DataAccessException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class TenantContextFilter extends OncePerRequestFilter {
    private final AuthFacade auth;
    private final ApiErrorWriter errors;

    public TenantContextFilter(AuthFacade auth, ApiErrorWriter errors) {
        this.auth = auth;
        this.errors = errors;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        try {
            if (authentication != null && authentication.isAuthenticated()
                    && authentication.getPrincipal() instanceof CurrentPrincipal principal) {
                AuthenticatedUser authenticated = auth.currentUser(principal.userId());
                if (authenticated.user().authenticationVersion() != principal.authenticationVersion()) {
                    HttpSession session = request.getSession(false);
                    if (session != null) {
                        session.invalidate();
                    }
                    SecurityContextHolder.clearContext();
                    throw new DomainException("AUTH_REQUIRED", "Authentication is required");
                }
                TenantContextHolder.set(new TenantContext(
                        authenticated.user().id(), authenticated.tenant().id(), authenticated.role()));
            }
            filterChain.doFilter(request, response);
        } catch (DomainException exception) {
            int status = switch (exception.code()) {
                case "AUTH_USER_DISABLED", "AUTH_TENANT_NOT_FOUND" -> HttpServletResponse.SC_FORBIDDEN;
                default -> HttpServletResponse.SC_UNAUTHORIZED;
            };
            errors.write(request, response, status, exception.code(), exception.getMessage());
        } catch (DataAccessException exception) {
            errors.write(request, response, HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    "DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable");
        } finally {
            TenantContextHolder.clear();
        }
    }
}
