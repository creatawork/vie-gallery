package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record PasswordResetToken(
        UUID id,
        UUID userId,
        String tokenHash,
        Instant expiresAt,
        Instant usedAt,
        Instant createdAt
) {
    public boolean isExpired(Instant now) {
        return now.isAfter(expiresAt);
    }

    public boolean isUsed() {
        return usedAt != null;
    }

    public boolean isValid(Instant now) {
        return !isExpired(now) && !isUsed();
    }
}
