package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.PasswordResetToken;
import cn.vie.vibe.gallery.domain.Tenant;
import cn.vie.vibe.gallery.domain.TenantStatus;
import cn.vie.vibe.gallery.domain.User;
import org.junit.jupiter.api.Test;

import java.time.Duration;
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

    @Test
    void forgotPasswordSilentlyIgnoresUnknownOrDisabledEmail() {
        Fixture fixture = new Fixture();
        fixture.auth.requestPasswordReset("nonexistent@example.com");
        assertEquals(0, fixture.resetTokens.saved.size());
        assertEquals(null, fixture.emailPort.lastEmail);
    }

    @Test
    void forgotPasswordGeneratesTokenAndSendsEmailForActiveUser() {
        Fixture fixture = new Fixture();
        fixture.auth.register("active@example.com", "Active", "password123");

        fixture.auth.requestPasswordReset("ACTIVE@EXAMPLE.COM");

        assertEquals(1, fixture.resetTokens.saved.size());
        assertEquals("active@example.com", fixture.emailPort.lastEmail);
        assertEquals("fixed-token-43-characters-aaaaaaaaaaaaaa", fixture.emailPort.lastToken);
    }

    @Test
    void resetPasswordSucceedsAndAllowsLoginWithNewPassword() {
        Fixture fixture = new Fixture();
        fixture.auth.register("reset-me@example.com", "Reset", "old-password");
        fixture.auth.requestPasswordReset("reset-me@example.com");
        String rawToken = fixture.emailPort.lastToken;

        fixture.auth.resetPassword(rawToken, "brand-new-password");

        User afterReset = fixture.users.findByEmail("reset-me@example.com").orElseThrow();
        assertEquals(2L, afterReset.authenticationVersion());

        // Old password rejected
        assertThrows(RuntimeException.class, () -> fixture.auth.login("reset-me@example.com", "old-password"));
        // New password works
        AuthenticatedUser user = fixture.auth.login("reset-me@example.com", "brand-new-password");
        assertEquals("reset-me@example.com", user.user().email());
        assertEquals(2L, user.user().authenticationVersion());

        // Token cannot be reused (one-time use)
        DomainException reuseException = assertThrows(DomainException.class,
                () -> fixture.auth.resetPassword(rawToken, "another-password"));
        assertEquals("INVALID_RESET_TOKEN", reuseException.code());
    }

    @Test
    void resetPasswordFailsWithInvalidToken() {
        Fixture fixture = new Fixture();
        DomainException exception = assertThrows(DomainException.class,
                () -> fixture.auth.resetPassword("invalid-token", "some-password"));
        assertEquals("INVALID_RESET_TOKEN", exception.code());
    }

    private static final class Fixture {
        final Users users = new Users();
        final Tenants tenants = new Tenants();
        final Memberships memberships = new Memberships();
        final ResetTokens resetTokens = new ResetTokens();
        final FixedTokenGenerator tokenGenerator = new FixedTokenGenerator();
        final RecordingEmailPort emailPort = new RecordingEmailPort();
        final AuthFacade auth = new AuthFacade(users, tenants, memberships, new PasswordHasher() {
            public String hash(String rawPassword) { return "hash:" + rawPassword; }
            public boolean matches(String rawPassword, String hash) { return hash.equals("hash:" + rawPassword); }
        }, resetTokens, tokenGenerator, emailPort);
    }

    private static final class FixedTokenGenerator implements TokenGenerator {
        public String generateToken() { return "fixed-token-43-characters-aaaaaaaaaaaaaa"; }
        public String hashToken(String rawToken) { return "hash:" + rawToken; }
        public boolean verifyToken(String rawToken, String tokenHash) { return tokenHash.equals("hash:" + rawToken); }
    }

    private static final class RecordingEmailPort implements EmailPort {
        String lastEmail;
        String lastToken;
        public void sendPasswordReset(String toEmail, String resetToken, Duration validFor) {
            lastEmail = toEmail;
            lastToken = resetToken;
        }
    }

    private static final class ResetTokens implements PasswordResetTokenRepository {
        final List<PasswordResetToken> saved = new ArrayList<>();
        public PasswordResetToken save(PasswordResetToken token) { saved.add(token); return token; }
        public Optional<PasswordResetToken> findByTokenHash(String tokenHash) {
            return saved.stream().filter(t -> t.tokenHash().equals(tokenHash)).findFirst();
        }
        public void markAsUsed(UUID tokenId, Instant usedAt) {
            for (int i = 0; i < saved.size(); i++) {
                PasswordResetToken old = saved.get(i);
                if (old.id().equals(tokenId)) {
                    saved.set(i, new PasswordResetToken(old.id(), old.userId(), old.tokenHash(),
                            old.expiresAt(), usedAt, old.createdAt()));
                    break;
                }
            }
        }
        public void deleteByUserId(UUID userId) { saved.removeIf(t -> t.userId().equals(userId)); }
    }

    private static final class Users implements UserRepository {
        final List<User> saved = new ArrayList<>();
        public Optional<User> findByEmail(String email) { return saved.stream().filter(u -> u.email().equals(email)).findFirst(); }
        public Optional<User> findById(UUID id) { return saved.stream().filter(u -> u.id().equals(id)).findFirst(); }
        public User save(User user) {
            saved.removeIf(u -> u.id().equals(user.id()));
            saved.add(user);
            return user;
        }
        public void updateLastLoginAt(UUID id, Instant time) { }
        public void updateCredentials(UUID id, String passwordHash, long authenticationVersion) {
            for (int i = 0; i < saved.size(); i++) {
                User old = saved.get(i);
                if (old.id().equals(id)) {
                    saved.set(i, new User(old.id(), old.email(), old.displayName(), passwordHash,
                            old.status(), old.lastLoginAt(), authenticationVersion));
                    return;
                }
            }
        }
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
        public java.util.List<Membership> listActiveByTenantId(UUID tenantId) { return saved.stream().filter(m -> m.tenantId().equals(tenantId)).toList(); }
        public Optional<Membership> findActiveByUserIdAndTenantId(UUID userId, UUID tenantId) { return saved.stream().filter(m -> m.userId().equals(userId) && m.tenantId().equals(tenantId)).findFirst(); }
        public Optional<Membership> findActiveByIdAndTenantId(UUID membershipId, UUID tenantId) { return saved.stream().filter(m -> m.id().equals(membershipId) && m.tenantId().equals(tenantId)).findFirst(); }
        public boolean updateRole(UUID tenantId, UUID membershipId, cn.vie.vibe.gallery.domain.MembershipRole role) { return false; }
        public boolean softDelete(UUID tenantId, UUID membershipId) { return false; }
        public int countActiveOwners(UUID tenantId) { return (int) saved.stream().filter(m -> m.tenantId().equals(tenantId) && m.role() == cn.vie.vibe.gallery.domain.MembershipRole.OWNER).count(); }
    }
}
