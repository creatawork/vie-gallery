package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record User(UUID id, String email, String displayName, String passwordHash,
                   UserStatus status, Instant lastLoginAt, long authenticationVersion) {
    public User(UUID id, String email, String displayName, String passwordHash,
                UserStatus status, Instant lastLoginAt) {
        this(id, email, displayName, passwordHash, status, lastLoginAt, 1L);
    }
}
