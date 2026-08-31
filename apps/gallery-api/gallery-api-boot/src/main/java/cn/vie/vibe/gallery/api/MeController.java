package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.AuthenticatedUser;
import cn.vie.vibe.gallery.application.CurrentPrincipal;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
public class MeController {
    private final AuthFacade auth;

    public MeController(AuthFacade auth) {
        this.auth = auth;
    }

    @GetMapping
    public AuthController.AuthResponse me(Authentication authentication) {
        CurrentPrincipal principal = (CurrentPrincipal) authentication.getPrincipal();
        AuthenticatedUser current = auth.currentUserById(principal.userId());
        return AuthController.AuthResponse.from(current);
    }
}
