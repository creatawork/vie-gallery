package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.PasswordResetToken;

import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenRepository {
    PasswordResetToken save(PasswordResetToken token);
    Optional<PasswordResetToken> findByTokenHash(String tokenHash);
    void markAsUsed(UUID tokenId, java.time.Instant usedAt);
    void deleteByUserId(UUID userId);
}
