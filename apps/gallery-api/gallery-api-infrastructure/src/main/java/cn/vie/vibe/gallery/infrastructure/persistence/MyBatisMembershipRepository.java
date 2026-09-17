package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.MembershipRepository;
import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.MembershipMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.instant;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.localDateTime;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.uuid;

@Repository
@Profile("!dev-memory")
public class MyBatisMembershipRepository implements MembershipRepository {
    private final MembershipMapper mapper;

    public MyBatisMembershipRepository(MembershipMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Membership save(Membership membership) {
        Instant now = Instant.now();
        mapper.insert(membership.id().toString(), membership.userId().toString(), membership.tenantId().toString(),
                membership.role().name(), localDateTime(now), localDateTime(now));
        return membership.createdAt() == null ? new Membership(membership.id(), membership.userId(), membership.tenantId(), membership.role(), now) : membership;
    }

    @Override
    public Optional<Membership> findDefaultActiveByUserId(UUID userId) {
        return toMembership(mapper.findDefaultActiveByUserId(userId.toString()));
    }

    @Override
    public List<Membership> listActiveByTenantId(UUID tenantId) {
        return mapper.listActiveByTenantId(tenantId.toString()).stream()
                .map(MyBatisMembershipRepository::toMembershipValue)
                .toList();
    }

    @Override
    public Optional<Membership> findActiveByUserIdAndTenantId(UUID userId, UUID tenantId) {
        return toMembership(mapper.findActiveByUserIdAndTenantId(userId.toString(), tenantId.toString()));
    }

    @Override
    public Optional<Membership> findActiveByIdAndTenantId(UUID membershipId, UUID tenantId) {
        return toMembership(mapper.findActiveByIdAndTenantId(membershipId.toString(), tenantId.toString()));
    }

    @Override
    public boolean updateRole(UUID tenantId, UUID membershipId, MembershipRole role) {
        return mapper.updateRole(tenantId.toString(), membershipId.toString(), role.name(), localDateTime(Instant.now())) > 0;
    }

    @Override
    public boolean softDelete(UUID tenantId, UUID membershipId) {
        return mapper.softDelete(tenantId.toString(), membershipId.toString(), localDateTime(Instant.now())) > 0;
    }

    @Override
    public void lockTenant(UUID tenantId) {
        mapper.lockTenant(tenantId.toString());
    }

    @Override
    public int countActiveOwners(UUID tenantId) {
        return mapper.countActiveOwners(tenantId.toString());
    }

    private static Optional<Membership> toMembership(Map<String, Object> row) {
        return Optional.ofNullable(row).map(MyBatisMembershipRepository::toMembershipValue);
    }

    private static Membership toMembershipValue(Map<String, Object> row) {
        return new Membership(uuid(row, "id"), uuid(row, "userId"), uuid(row, "tenantId"),
                MembershipRole.valueOf((String) row.get("role")), instant(row, "createdAt"));
    }
}
