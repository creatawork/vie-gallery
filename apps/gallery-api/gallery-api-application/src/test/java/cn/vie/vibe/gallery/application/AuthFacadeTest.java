package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.Tenant;
import cn.vie.vibe.gallery.domain.TenantStatus;
import cn.vie.vibe.gallery.domain.User;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AuthFacadeTest {
    @Test
    void registrationNormalizesEmailAndCreatesIdentityGraph() {
        Fixture fixture = new Fixture();
        AuthenticatedUser result = fixture.auth.register("  USER@Example.COM ", "Vie", "long-enough-password");

        assertEquals("user@example.com", result.user().email());
        assertEquals(MembershipRole.OWNER, result.role());
        assertEquals(1, fixture.users.saved.size());
        assertEquals(1, fixture.tenants.saved.size());
        assertEquals(1, fixture.memberships.saved.size());
    }

    @Test
    void unknownEmailUsesInvalidCredentialsContract() {
        Fixture fixture = new Fixture();
        RuntimeException exception = assertThrows(RuntimeException.class,
                () -> fixture.auth.login("missing@example.com", "wrong-password"));
        assertEquals("Invalid credentials", exception.getMessage());
    }

    private static final class Fixture {
        final Users users = new Users();
        final Tenants tenants = new Tenants();
        final Memberships memberships = new Memberships();
        final AuthFacade auth = new AuthFacade(users, tenants, memberships, new PasswordHasher() {
            public String hash(String rawPassword) { return "hash:" + rawPassword; }
            public boolean matches(String rawPassword, String hash) { return hash.equals("hash:" + rawPassword); }
        });
    }

    private static final class Users implements UserRepository {
        final List<User> saved = new ArrayList<>();
        public Optional<User> findByEmail(String email) { return saved.stream().filter(u -> u.email().equals(email)).findFirst(); }
        public Optional<User> findById(UUID id) { return saved.stream().filter(u -> u.id().equals(id)).findFirst(); }
        public User save(User user) { saved.add(user); return user; }
        public void updateLastLoginAt(UUID id, Instant time) { }
    }

    private static final class Tenants implements TenantRepository {
        final List<Tenant> saved = new ArrayList<>();
        public Tenant save(Tenant tenant) { saved.add(tenant); return tenant; }
        public Optional<Tenant> findActiveById(UUID id) { return saved.stream().filter(t -> t.id().equals(id) && t.status() == TenantStatus.ACTIVE).findFirst(); }
    }

    private static final class Memberships implements MembershipRepository {
        final List<Membership> saved = new ArrayList<>();
        public Membership save(Membership membership) { saved.add(membership); return membership; }
        public Optional<Membership> findDefaultActiveByUserId(UUID id) { return saved.stream().filter(m -> m.userId().equals(id)).findFirst(); }
    }
}
