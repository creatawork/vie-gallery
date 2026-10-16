package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.domain.*;
import cn.vie.vibe.gallery.infrastructure.InMemoryGalleryRepository;
import cn.vie.vibe.gallery.infrastructure.InMemoryMembershipRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class WorkspaceAccessTest {
    private final Map<UUID, User> users = new HashMap<>();
    private final Map<UUID, Tenant> tenants = new HashMap<>();
    private final InMemoryMembershipRepository memberships = new InMemoryMembershipRepository();
    private AuthFacade auth;
    private MembershipFacade members;
    private AuthenticatedUser owner;
    private AuthenticatedUser invitee;
    private AuthenticatedUser outsider;
    private Gallery sharedGallery;
    private Authentication authentication;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        UserRepository userRepository = mock(UserRepository.class);
        TenantRepository tenantRepository = mock(TenantRepository.class);
        when(userRepository.save(any())).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            users.put(user.id(), user);
            return user;
        });
        when(userRepository.findById(any())).thenAnswer(invocation -> Optional.ofNullable(users.get(invocation.getArgument(0))));
        when(userRepository.findByEmail(any())).thenAnswer(invocation -> users.values().stream()
                .filter(user -> user.email().equals(invocation.getArgument(0))).findFirst());
        when(tenantRepository.save(any())).thenAnswer(invocation -> {
            Tenant tenant = invocation.getArgument(0);
            tenants.put(tenant.id(), tenant);
            return tenant;
        });
        when(tenantRepository.findActiveById(any())).thenAnswer(invocation ->
                Optional.ofNullable(tenants.get(invocation.getArgument(0))).filter(tenant -> tenant.status() == TenantStatus.ACTIVE));
        auth = new AuthFacade(userRepository, tenantRepository, memberships, new PasswordHasher() {
            public String hash(String password) { return password; }
            public boolean matches(String password, String hash) { return password.equals(hash); }
        }, mock(PasswordResetTokenRepository.class), mock(TokenGenerator.class), mock(EmailPort.class));
        owner = auth.register("owner@example.com", "Owner", "abc123");
        invitee = auth.register("invitee@example.com", "Invitee", "abc123");
        outsider = auth.register("outsider@example.com", "Outsider", "abc123");
        TenantContextResolver context = TenantContextHolder::current;
        members = new MembershipFacade(memberships, userRepository, new WorkspaceAuthorizationPolicy(context));
        GalleryFacade galleries = new GalleryFacade(new InMemoryGalleryRepository(), context);
        asOwner();
        sharedGallery = galleries.create("Shared Gallery", "shared-gallery", GalleryVisibility.PRIVATE);
        TenantContextHolder.clear();
        authentication = new UsernamePasswordAuthenticationToken(new CurrentPrincipal(invitee.user().id()), null, List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication);
        ApiErrorFactory errors = new ApiErrorFactory();
        mvc = MockMvcBuilders.standaloneSetup(new MeController(auth), new MembershipController(members),
                        new GalleryController(galleries, null, null, null, context, null, null))
                .setControllerAdvice(new GlobalExceptionHandler(errors))
                .addFilters(new TenantContextFilter(auth, new ApiErrorWriter(new ObjectMapper(), errors))).build();
    }

    @AfterEach
    void cleanUp() {
        SecurityContextHolder.clearContext();
        TenantContextHolder.clear();
    }

    private void asOwner() {
        TenantContextHolder.set(new TenantContext(owner.user().id(), owner.tenant().id(), MembershipRole.OWNER));
    }

    private MembershipFacade.MemberView invite(MembershipRole role) {
        asOwner();
        MembershipFacade.MemberView member = members.add(invitee.user().email(), role);
        TenantContextHolder.clear();
        return member;
    }

    @ParameterizedTest
    @EnumSource(value = MembershipRole.class, names = {"EDITOR", "VIEWER"})
    void registeredInviteeCanDiscoverAndOpenSharedWorkspaceWithItsOwnRole(MembershipRole role) throws Exception {
        invite(role);
        assertEquals(invitee.tenant().id(), auth.login(invitee.user().email(), "abc123").tenant().id());
        mvc.perform(get("/api/me/workspaces").principal(authentication))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/me").principal(authentication).header("X-Workspace-Id", owner.tenant().id()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tenant.id").value(owner.tenant().id().toString()))
                .andExpect(jsonPath("$.role").value(role.name()))
                .andExpect(jsonPath("$.capabilities").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("MEMBER_MANAGE"))));
        mvc.perform(get("/api/galleries").principal(authentication).header("X-Workspace-Id", owner.tenant().id()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(sharedGallery.id().toString()));
        mvc.perform(get("/api/galleries").principal(authentication).header("X-Workspace-Id", invitee.tenant().id()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/workspace/members").principal(authentication).header("X-Workspace-Id", owner.tenant().id()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ROLE_REQUIRED"));
        mvc.perform(post("/api/galleries").principal(authentication).header("X-Workspace-Id", owner.tenant().id())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Forbidden\",\"slug\":\"forbidden\",\"visibility\":\"PRIVATE\"}"))
                .andExpect(status().isForbidden());
        // A separate tab without a workspace header still uses the personal workspace.
        mvc.perform(get("/api/me").principal(authentication))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tenant.id").value(invitee.tenant().id().toString()))
                .andExpect(jsonPath("$.role").value("OWNER"));
    }

    @Test
    void roleChangesAndRemovalApplyToTheNextRequest() throws Exception {
        MembershipFacade.MemberView member = invite(MembershipRole.EDITOR);
        asOwner();
        members.updateRole(member.id(), MembershipRole.VIEWER);
        TenantContextHolder.clear();
        mvc.perform(get("/api/me").principal(authentication).header("X-Workspace-Id", owner.tenant().id()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("VIEWER"))
                .andExpect(jsonPath("$.capabilities").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("PHOTO_WRITE"))));
        asOwner();
        members.remove(member.id());
        TenantContextHolder.clear();
        mvc.perform(get("/api/galleries").principal(authentication).header("X-Workspace-Id", owner.tenant().id()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("AUTH_TENANT_NOT_FOUND"));
        mvc.perform(get("/api/me/workspaces").principal(authentication))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void forgedWorkspaceAndMalformedIdsAreRejected() throws Exception {
        mvc.perform(get("/api/galleries").principal(authentication).header("X-Workspace-Id", outsider.tenant().id()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("AUTH_TENANT_NOT_FOUND"));
        mvc.perform(get("/api/me").principal(authentication).header("X-Workspace-Id", "invalid"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        assertThrows(IllegalStateException.class, TenantContextHolder::current);
    }

    @Test
    void inactiveWorkspacesAreExcludedAndCannotBeSelected() throws Exception {
        invite(MembershipRole.EDITOR);
        tenants.remove(owner.tenant().id());
        mvc.perform(get("/api/me/workspaces").principal(authentication))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/me").principal(authentication).header("X-Workspace-Id", owner.tenant().id()))
                .andExpect(status().isForbidden());
    }
}
