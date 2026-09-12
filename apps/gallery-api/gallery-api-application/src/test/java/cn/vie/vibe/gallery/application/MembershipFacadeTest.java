package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.*;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class MembershipFacadeTest {
    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private final Users users = new Users();
    private final Memberships memberships = new Memberships();
    private final TenantContextResolver context = () -> new TenantContext(OWNER, TENANT, MembershipRole.OWNER);
    private final MembershipFacade facade = new MembershipFacade(memberships, users, new WorkspaceAuthorizationPolicy(context));

    @Test void addsRegisteredActiveUserAndNormalizesEmail() {
        User user = user("Editor@Example.com", UserStatus.ACTIVE);
        users.users.add(user);
        MembershipFacade.MemberView result = facade.add(" EDITOR@example.COM ", MembershipRole.EDITOR);
        assertEquals(MembershipRole.EDITOR, result.role());
        assertEquals(user.id(), result.userId());
    }

    @Test void rejectsDisabledUserWithoutAdding() {
        users.users.add(user("disabled@example.com", UserStatus.DISABLED));
        DomainException ex = assertThrows(DomainException.class, () -> facade.add("disabled@example.com", MembershipRole.VIEWER));
        assertEquals("MEMBERSHIP_NOT_FOUND", ex.code());
    }

    @Test void protectsLastOwnerFromRemovalAndDowngrade() {
        User owner = user("owner@example.com", UserStatus.ACTIVE);
        users.users.add(owner);
        Membership membership = new Membership(UUID.randomUUID(), owner.id(), TENANT, MembershipRole.OWNER, Instant.now());
        memberships.save(membership);
        assertEquals("LAST_OWNER", assertThrows(DomainException.class, () -> facade.updateRole(membership.id(), MembershipRole.VIEWER)).code());
        assertEquals("LAST_OWNER", assertThrows(DomainException.class, () -> facade.remove(membership.id())).code());
    }

    private static User user(String email, UserStatus status) { return new User(UUID.randomUUID(), email.toLowerCase(), "User", "hash", status, null); }
    private static final class Users implements UserRepository {
        final List<User> users = new ArrayList<>();
        public Optional<User> findByEmail(String email) { return users.stream().filter(u -> u.email().equals(email)).findFirst(); }
        public Optional<User> findById(UUID id) { return users.stream().filter(u -> u.id().equals(id)).findFirst(); }
        public User save(User user) { users.add(user); return user; }
        public void updateLastLoginAt(UUID id, Instant time) { }
        public void updateCredentials(UUID id, String passwordHash, long authenticationVersion) { }
    }
    private static final class Memberships implements MembershipRepository {
        final Map<UUID, Membership> values = new LinkedHashMap<>();
        public Membership save(Membership m) { values.put(m.id(), m); return m; }
        public Optional<Membership> findDefaultActiveByUserId(UUID id) { return values.values().stream().filter(m -> m.userId().equals(id)).findFirst(); }
        public List<Membership> listActiveByTenantId(UUID tenant) { return values.values().stream().filter(m -> m.tenantId().equals(tenant)).toList(); }
        public Optional<Membership> findActiveByUserIdAndTenantId(UUID user, UUID tenant) { return values.values().stream().filter(m -> m.userId().equals(user) && m.tenantId().equals(tenant)).findFirst(); }
        public Optional<Membership> findActiveByIdAndTenantId(UUID id, UUID tenant) { return Optional.ofNullable(values.get(id)).filter(m -> m.tenantId().equals(tenant)); }
        public boolean updateRole(UUID tenant, UUID id, MembershipRole role) { Membership m=values.get(id); if(m==null)return false; values.put(id,new Membership(id,m.userId(),tenant,role,m.createdAt())); return true; }
        public boolean softDelete(UUID tenant, UUID id) { return values.remove(id)!=null; }
        public int countActiveOwners(UUID tenant) { return (int) values.values().stream().filter(m -> m.tenantId().equals(tenant) && m.role()==MembershipRole.OWNER).count(); }
    }
}
