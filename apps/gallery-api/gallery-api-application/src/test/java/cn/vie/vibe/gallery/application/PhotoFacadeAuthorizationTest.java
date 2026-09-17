package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PhotoFacadeAuthorizationTest {
    @Test
    void viewerCannotUploadUpdateOrDeletePhotos() {
        PhotoFacade facade = facadeFor(MembershipRole.VIEWER);

        assertForbidden(() -> facade.upload(UUID.randomUUID(), null));
        assertForbidden(() -> facade.update(UUID.randomUUID(), null, null, null));
        assertForbidden(() -> facade.delete(UUID.randomUUID()));
    }

    private static PhotoFacade facadeFor(MembershipRole role) {
        TenantContextResolver context = () -> new TenantContext(UUID.randomUUID(), UUID.randomUUID(), role);
        return new PhotoFacade(null, null, null, null, null, null, context,
                10_000, 10_000, 10_000, 10);
    }

    private static void assertForbidden(Runnable action) {
        DomainException exception = assertThrows(DomainException.class, action::run);
        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, exception.code());
    }
}
