package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Membership;

import java.util.Optional;
import java.util.UUID;

public interface MembershipRepository {
    Membership save(Membership membership);
    Optional<Membership> findDefaultActiveByUserId(UUID userId);
}
