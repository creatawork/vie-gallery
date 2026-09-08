package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.PasswordResetToken;
import cn.vie.vibe.gallery.domain.Tenant;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.TenantStatus;
import cn.vie.vibe.gallery.domain.User;
import cn.vie.vibe.gallery.domain.UserStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
public class AuthFacade {
    private static final String DUMMY_PASSWORD_HASH =
            "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    private static final Duration RESET_TOKEN_TTL = Duration.ofMinutes(15);

    private final UserRepository users;
    private final TenantRepository tenants;
    private final MembershipRepository memberships;
    private final PasswordHasher passwords;
    private final PasswordResetTokenRepository resetTokens;
    private final TokenGenerator tokenGenerator;
    private final EmailPort emailPort;

    public AuthFacade(UserRepository users, TenantRepository tenants,
                      MembershipRepository memberships, PasswordHasher passwords,
                      PasswordResetTokenRepository resetTokens, TokenGenerator tokenGenerator,
                      EmailPort emailPort) {
        this.users = users;
        this.tenants = tenants;
        this.memberships = memberships;
        this.passwords = passwords;
        this.resetTokens = resetTokens;
        this.tokenGenerator = tokenGenerator;
        this.emailPort = emailPort;
    }

    @Transactional
    public AuthenticatedUser register(String email, String displayName, String rawPassword) {
        String normalizedEmail = normalizeEmail(email);
        if (users.findByEmail(normalizedEmail).isPresent()) {
            throw new DomainException("AUTH_EMAIL_UNAVAILABLE", "Email is not available");
        }

        User user = new User(UUID.randomUUID(), normalizedEmail, displayName.trim(),
                passwords.hash(rawPassword), UserStatus.ACTIVE, null);
        Tenant tenant = new Tenant(UUID.randomUUID(), displayName.trim() + " Gallery",
                createTenantSlug(displayName), TenantStatus.ACTIVE);
        Membership membership = new Membership(UUID.randomUUID(), user.id(), tenant.id(), MembershipRole.OWNER);

        try {
            users.save(user);
            tenants.save(tenant);
            memberships.save(membership);
        } catch (DataIntegrityViolationException exception) {
            throw new DomainException("AUTH_EMAIL_UNAVAILABLE", "Email is not available");
        }
        return new AuthenticatedUser(user, tenant, membership.role());
    }

    public AuthenticatedUser login(String email, String rawPassword) {
        User user = users.findByEmail(normalizeEmail(email)).orElse(null);
        boolean passwordMatches = user != null
                ? passwords.matches(rawPassword, user.passwordHash())
                : passwords.matches(rawPassword, DUMMY_PASSWORD_HASH);
        if (user == null || user.status() != UserStatus.ACTIVE || !passwordMatches) {
            throw invalidCredentials();
        }
        users.updateLastLoginAt(user.id(), Instant.now());
        Membership membership = resolveMembership(user.id());
        Tenant tenant = resolveTenant(membership);
        return new AuthenticatedUser(user, tenant, membership.role());
    }

    public AuthenticatedUser currentUser(UUID userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new DomainException("AUTH_REQUIRED", "Authentication is required"));
        if (user.status() != UserStatus.ACTIVE) {
            throw new DomainException("AUTH_USER_DISABLED", "User is disabled");
        }
        Membership membership = resolveMembership(user.id());
        return new AuthenticatedUser(user, resolveTenant(membership), membership.role());
    }

    public AuthenticatedUser currentUserById(UUID userId) {
        return currentUser(userId);
    }

    public TenantContext resolveTenantContext(UUID userId) {
        AuthenticatedUser authenticated = currentUser(userId);
        return new TenantContext(authenticated.user().id(), authenticated.tenant().id(), authenticated.role());
    }

    public java.util.List<cn.vie.vibe.gallery.domain.Capability> capabilities(MembershipRole role) {
        return WorkspaceCapabilities.forRole(role);
    }

    @Transactional
    public void requestPasswordReset(String email) {
        String normalizedEmail = normalizeEmail(email);
        User user = users.findByEmail(normalizedEmail).orElse(null);
        if (user == null || user.status() != UserStatus.ACTIVE) {
            return;
        }
        
        resetTokens.deleteByUserId(user.id());
        
        String rawToken = tokenGenerator.generateToken();
        String tokenHash = tokenGenerator.hashToken(rawToken);
        Instant now = Instant.now();
        PasswordResetToken token = new PasswordResetToken(
                UUID.randomUUID(),
                user.id(),
                tokenHash,
                now.plus(RESET_TOKEN_TTL),
                null,
                now
        );
        resetTokens.save(token);
        
        emailPort.sendPasswordReset(user.email(), rawToken, RESET_TOKEN_TTL);
    }

    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        String tokenHash = tokenGenerator.hashToken(rawToken);
        PasswordResetToken token = resetTokens.findByTokenHash(tokenHash)
                .orElseThrow(() -> new DomainException("INVALID_RESET_TOKEN", "Reset token is invalid"));
        
        Instant now = Instant.now();
        if (!token.isValid(now)) {
            throw new DomainException("INVALID_RESET_TOKEN", "Reset token is expired or already used");
        }
        
        User user = users.findById(token.userId())
                .orElseThrow(() -> new DomainException("USER_NOT_FOUND", "User not found"));
        
        resetTokens.markAsUsed(token.id(), now);
        
        String newPasswordHash = passwords.hash(newPassword);
        User updated = new User(user.id(), user.email(), user.displayName(),
                newPasswordHash, user.status(), user.lastLoginAt());
        users.save(updated);
    }

    private Membership resolveMembership(UUID userId) {
        return memberships.findDefaultActiveByUserId(userId)
                .orElseThrow(() -> new DomainException("AUTH_TENANT_NOT_FOUND", "No active tenant membership"));
    }

    private Tenant resolveTenant(Membership membership) {
        return tenants.findActiveById(membership.tenantId())
                .orElseThrow(() -> new DomainException("AUTH_TENANT_NOT_FOUND", "No active tenant"));
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static String createTenantSlug(String displayName) {
        String base = displayName.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
        if (base.isBlank()) {
            base = "gallery";
        }
        return base + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private static DomainException invalidCredentials() {
        return new DomainException("AUTH_INVALID_CREDENTIALS", "Invalid credentials");
    }
}
