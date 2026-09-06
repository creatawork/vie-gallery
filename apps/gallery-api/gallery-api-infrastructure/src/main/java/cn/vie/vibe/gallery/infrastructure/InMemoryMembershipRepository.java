package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.MembershipRepository;
import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Profile("dev-memory")
@Component
public class InMemoryMembershipRepository implements MembershipRepository {
    private final ConcurrentHashMap<UUID, Membership> memberships = new ConcurrentHashMap<>();

    @Override public Membership save(Membership membership) { memberships.put(membership.id(), membership); return membership; }
    @Override public Optional<Membership> findDefaultActiveByUserId(UUID userId) {
        return memberships.values().stream().filter(m -> m.userId().equals(userId)).findFirst();
    }
    @Override public List<Membership> listActiveByTenantId(UUID tenantId) {
        return new ArrayList<>(memberships.values().stream().filter(m -> m.tenantId().equals(tenantId)).toList());
    }
    @Override public Optional<Membership> findActiveByUserIdAndTenantId(UUID userId, UUID tenantId) {
        return memberships.values().stream().filter(m -> m.userId().equals(userId) && m.tenantId().equals(tenantId)).findFirst();
    }
    @Override public Optional<Membership> findActiveByIdAndTenantId(UUID id, UUID tenantId) {
        return Optional.ofNullable(memberships.get(id)).filter(m -> m.tenantId().equals(tenantId));
    }
    @Override public synchronized boolean updateRole(UUID tenantId, UUID id, MembershipRole role) {
        Membership current = findActiveByIdAndTenantId(id, tenantId).orElse(null);
        if (current == null) return false;
        memberships.put(id, new Membership(id, current.userId(), tenantId, role, current.createdAt()));
        return true;
    }
    @Override public synchronized boolean softDelete(UUID tenantId, UUID id) {
        return findActiveByIdAndTenantId(id, tenantId).map(m -> memberships.remove(id, m)).orElse(false);
    }
    @Override public void lockTenant(UUID tenantId) { synchronized (memberships) { } }
    @Override public int countActiveOwners(UUID tenantId) {
        return (int) memberships.values().stream().filter(m -> m.tenantId().equals(tenantId) && m.role() == MembershipRole.OWNER).count();
    }
}
