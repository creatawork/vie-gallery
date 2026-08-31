package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.User;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository {
    Optional<User> findByEmail(String email);
    Optional<User> findById(UUID id);
    User save(User user);
    void updateLastLoginAt(UUID id, Instant lastLoginAt);
}
