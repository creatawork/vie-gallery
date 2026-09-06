package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MembershipRepository {
    Membership save(Membership membership);
    Optional<Membership> findDefaultActiveByUserId(UUID userId);
    default List<Membership> listActiveByTenantId(UUID tenantId) { return List.of(); }
    default Optional<Membership> findActiveByUserIdAndTenantId(UUID userId, UUID tenantId) { return Optional.empty(); }
    default Optional<Membership> findActiveByIdAndTenantId(UUID membershipId, UUID tenantId) { return Optional.empty(); }
    default boolean updateRole(UUID tenantId, UUID membershipId, MembershipRole role) { return false; }
    default boolean softDelete(UUID tenantId, UUID membershipId) { return false; }
    default void lockTenant(UUID tenantId) { }
    default int countActiveOwners(UUID tenantId) { return 0; }
}
