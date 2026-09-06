package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.User;
import cn.vie.vibe.gallery.domain.UserStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class MembershipFacade {
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final WorkspaceAuthorizationPolicy authorization;

    public MembershipFacade(MembershipRepository memberships, UserRepository users,
                            WorkspaceAuthorizationPolicy authorization) {
        this.memberships = memberships;
        this.users = users;
        this.authorization = authorization;
    }

    public List<MemberView> list() {
        TenantContext context = authorization.requireOwner();
        return memberships.listActiveByTenantId(context.tenantId()).stream().map(this::toView).toList();
    }

    public List<MemberView> listForCurrentUser() {
        TenantContext context = authorization.requireViewer();
        return memberships.listActiveByTenantId(context.tenantId()).stream().map(this::toView).toList();
    }

    @Transactional
    public MemberView add(String email, MembershipRole role) {
        TenantContext context = authorization.requireOwner();
        String normalized = normalizeEmail(email);
        if (role == null || role == MembershipRole.OWNER) {
            throw new DomainException("VALIDATION_FAILED", "New members must be EDITOR or VIEWER");
        }
        User user = users.findByEmail(normalized)
                .filter(candidate -> candidate.status() == UserStatus.ACTIVE)
                .orElseThrow(() -> new DomainException("MEMBERSHIP_NOT_FOUND", "Member could not be added"));
        if (memberships.findActiveByUserIdAndTenantId(user.id(), context.tenantId()).isPresent()) {
            throw new DomainException("MEMBERSHIP_CONFLICT", "User is already a member of this workspace");
        }
        try {
            return toView(memberships.save(new Membership(UUID.randomUUID(), user.id(), context.tenantId(), role, Instant.now())));
        } catch (DataIntegrityViolationException exception) {
            throw new DomainException("MEMBERSHIP_CONFLICT", "User is already a member of this workspace");
        }
    }

    @Transactional
    public MemberView updateRole(UUID membershipId, MembershipRole role) {
        TenantContext context = authorization.requireOwner();
        if (role == null || role == MembershipRole.OWNER) {
            throw new DomainException("VALIDATION_FAILED", "Member role must be EDITOR or VIEWER");
        }
        memberships.lockTenant(context.tenantId());
        Membership current = findMember(membershipId, context.tenantId());
        if (current.role() == MembershipRole.OWNER && role != MembershipRole.OWNER
                && memberships.countActiveOwners(context.tenantId()) <= 1) {
            throw new DomainException("LAST_OWNER", "The last owner cannot be downgraded");
        }
        if (!memberships.updateRole(context.tenantId(), membershipId, role)) {
            throw new DomainException("MEMBERSHIP_NOT_FOUND", "Membership not found");
        }
        return toView(new Membership(current.id(), current.userId(), current.tenantId(), role, current.createdAt()));
    }

    @Transactional
    public void remove(UUID membershipId) {
        TenantContext context = authorization.requireOwner();
        memberships.lockTenant(context.tenantId());
        Membership current = findMember(membershipId, context.tenantId());
        if (current.role() == MembershipRole.OWNER && memberships.countActiveOwners(context.tenantId()) <= 1) {
            throw new DomainException("LAST_OWNER", "The last owner cannot be removed");
        }
        if (!memberships.softDelete(context.tenantId(), membershipId)) {
            throw new DomainException("MEMBERSHIP_NOT_FOUND", "Membership not found");
        }
    }

    private Membership findMember(UUID id, UUID tenantId) {
        return memberships.findActiveByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new DomainException("MEMBERSHIP_NOT_FOUND", "Membership not found"));
    }

    private MemberView toView(Membership membership) {
        User user = users.findById(membership.userId())
                .orElseThrow(() -> new DomainException("MEMBERSHIP_NOT_FOUND", "Membership not found"));
        return new MemberView(membership.id(), user.id(), user.email(), user.displayName(), membership.role(), membership.createdAt());
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT);
    }

    public record MemberView(UUID id, UUID userId, String email, String displayName,
                             MembershipRole role, Instant joinedAt) {}
}
