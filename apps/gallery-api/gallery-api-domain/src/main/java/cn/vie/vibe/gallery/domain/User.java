package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record User(UUID id, String email, String displayName, String passwordHash,
                   UserStatus status, Instant lastLoginAt) {
}
