package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.Set;

/** Centralized authorization rules for authenticated workspace operations. */
@Component
public class WorkspaceAuthorizationPolicy {
    public static final String FORBIDDEN_CODE = "MEMBER_FORBIDDEN";
    public static final String ROLE_REQUIRED_CODE = "ROLE_REQUIRED";

    private final TenantContextResolver tenantContext;

    public WorkspaceAuthorizationPolicy(TenantContextResolver tenantContext) {
        this.tenantContext = tenantContext;
    }

    public TenantContext requireRole(MembershipRole... allowedRoles) {
        TenantContext context = tenantContext.requireContext();
        Set<MembershipRole> allowed = EnumSet.noneOf(MembershipRole.class);
        for (MembershipRole role : allowedRoles) {
            if (role != null) {
                allowed.add(role);
            }
        }
        if (context.role() == null || !allowed.contains(context.role())) {
            throw new DomainException(ROLE_REQUIRED_CODE, "A required workspace role is missing");
        }
        return context;
    }

    public TenantContext requireOwner() {
        return requireRole(MembershipRole.OWNER);
    }

    public TenantContext requireEditor() {
        return requireRole(MembershipRole.OWNER, MembershipRole.EDITOR);
    }

    public TenantContext requireViewer() {
        return requireRole(MembershipRole.OWNER, MembershipRole.EDITOR, MembershipRole.VIEWER);
    }

    public TenantContext requireOwnerOrEditor() {
        return requireEditor();
    }
}
