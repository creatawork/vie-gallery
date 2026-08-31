package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.MembershipRepository;
import cn.vie.vibe.gallery.domain.Membership;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.MembershipMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.localDateTime;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.uuid;

@Repository
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
        return membership;
    }

    @Override
    public Optional<Membership> findDefaultActiveByUserId(UUID userId) {
        return Optional.ofNullable(mapper.findDefaultActiveByUserId(userId.toString())).map(row -> new Membership(uuid(row, "id"),
                uuid(row, "userId"), uuid(row, "tenantId"), MembershipRole.valueOf((String) row.get("role"))));
    }
}
