package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.Tenant;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.TenantStatus;
import cn.vie.vibe.gallery.domain.User;
import cn.vie.vibe.gallery.domain.UserStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
public class AuthFacade {
    private static final String DUMMY_PASSWORD_HASH =
            "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    private final UserRepository users;
    private final TenantRepository tenants;
    private final MembershipRepository memberships;
    private final PasswordHasher passwords;

    public AuthFacade(UserRepository users, TenantRepository tenants,
                      MembershipRepository memberships, PasswordHasher passwords) {
        this.users = users;
        this.tenants = tenants;
        this.memberships = memberships;
        this.passwords = passwords;
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
