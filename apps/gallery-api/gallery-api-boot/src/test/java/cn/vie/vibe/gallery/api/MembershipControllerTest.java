package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.MembershipFacade;
import cn.vie.vibe.gallery.domain.MembershipRole;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class MembershipControllerTest {
    @Test void mapsMemberListResponse() {
        MembershipFacade facade = mock(MembershipFacade.class);
        UUID id = UUID.randomUUID();
        when(facade.list()).thenReturn(List.of(new MembershipFacade.MemberView(id, UUID.randomUUID(), "a@example.com", "A", MembershipRole.EDITOR, Instant.now())));
        MembershipController controller = new MembershipController(facade);
        assertEquals(1, controller.list().size());
        assertEquals("a@example.com", controller.list().get(0).email());
    }

    @Test void forwardsRoleUpdate() {
        MembershipFacade facade = mock(MembershipFacade.class);
        UUID id = UUID.randomUUID();
        when(facade.updateRole(id, MembershipRole.VIEWER)).thenReturn(
                new MembershipFacade.MemberView(id, UUID.randomUUID(), "a@example.com", "A", MembershipRole.VIEWER, Instant.now()));
        MembershipController controller = new MembershipController(facade);
        controller.update(id, new MembershipController.UpdateMemberRequest(MembershipRole.VIEWER));
        verify(facade).updateRole(id, MembershipRole.VIEWER);
    }
}
