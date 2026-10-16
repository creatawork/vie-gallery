package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.AuthFacade;
import cn.vie.vibe.gallery.application.AuthenticatedUser;
import cn.vie.vibe.gallery.application.CurrentPrincipal;
import cn.vie.vibe.gallery.domain.Capability;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/me")
public class MeController {
    private final AuthFacade auth;

    public MeController(AuthFacade auth) {
        this.auth = auth;
    }

    @GetMapping
    public AuthController.AuthResponse me(Authentication authentication, HttpServletRequest request) {
        CurrentPrincipal principal = (CurrentPrincipal) authentication.getPrincipal();
        String workspaceId = request.getHeader(TenantContextFilter.WORKSPACE_HEADER);
        AuthenticatedUser current = workspaceId == null ? auth.currentUserById(principal.userId())
                : auth.currentUser(principal.userId(), UUID.fromString(workspaceId));
        return AuthController.AuthResponse.from(current);
    }

    @GetMapping("/workspaces")
    public List<WorkspaceResponse> workspaces(Authentication authentication) {
        CurrentPrincipal principal = (CurrentPrincipal) authentication.getPrincipal();
        return auth.listWorkspaces(principal.userId()).stream().map(WorkspaceResponse::from).toList();
    }

    public record WorkspaceResponse(String id, String name, String slug, String role, List<Capability> capabilities) {
        static WorkspaceResponse from(AuthFacade.WorkspaceView workspace) {
            return new WorkspaceResponse(workspace.tenant().id().toString(), workspace.tenant().name(),
                    workspace.tenant().slug(), workspace.role().name(),
                    cn.vie.vibe.gallery.application.WorkspaceCapabilities.forRole(workspace.role()));
        }
    }
}
