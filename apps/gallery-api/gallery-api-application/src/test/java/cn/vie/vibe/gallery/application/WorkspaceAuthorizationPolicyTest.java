package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WorkspaceAuthorizationPolicyTest {
    @Test
    void ownerIsAllowedForAllWorkspaceRoles() {
        TenantContext context = context(MembershipRole.OWNER);
        WorkspaceAuthorizationPolicy policy = new WorkspaceAuthorizationPolicy(() -> context);

        assertSame(context, policy.requireOwner());
        assertSame(context, policy.requireEditor());
        assertSame(context, policy.requireViewer());
    }

    @Test
    void editorCanEditAndViewButCannotOwn() {
        TenantContext context = context(MembershipRole.EDITOR);
        WorkspaceAuthorizationPolicy policy = new WorkspaceAuthorizationPolicy(() -> context);

        assertSame(context, policy.requireEditor());
        assertSame(context, policy.requireViewer());
        assertForbidden(() -> policy.requireOwner());
    }

    @Test
    void viewerCanOnlyView() {
        WorkspaceAuthorizationPolicy policy = new WorkspaceAuthorizationPolicy(() -> context(MembershipRole.VIEWER));

        assertSame(MembershipRole.VIEWER, policy.requireViewer().role());
        assertForbidden(() -> policy.requireEditor());
        assertForbidden(() -> policy.requireOwner());
    }

    private static TenantContext context(MembershipRole role) {
        return new TenantContext(UUID.randomUUID(), UUID.randomUUID(), role);
    }

    private static void assertForbidden(Runnable action) {
        DomainException exception = assertThrows(DomainException.class, action::run);
        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, exception.code());
    }
}
