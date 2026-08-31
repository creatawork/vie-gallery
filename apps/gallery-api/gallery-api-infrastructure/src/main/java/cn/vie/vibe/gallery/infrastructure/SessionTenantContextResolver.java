package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.CurrentPrincipal;
import cn.vie.vibe.gallery.application.TenantContextResolver;
import cn.vie.vibe.gallery.application.TenantContextHolder;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.springframework.context.annotation.Profile;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
@Profile("!dev-memory")
public class SessionTenantContextResolver implements TenantContextResolver {
    private final AuthFacade auth;

    public SessionTenantContextResolver(AuthFacade auth) {
        this.auth = auth;
    }

    @Override
    public TenantContext requireContext() {
        try {
            return TenantContextHolder.current();
        } catch (IllegalStateException ignored) {
            // Resolve lazily for application calls that are not running through the servlet filter.
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken
                || !(authentication.getPrincipal() instanceof CurrentPrincipal principal)) {
            throw new IllegalStateException("Authentication is required");
        }
        return auth.resolveTenantContext(principal.userId());
    }
}
