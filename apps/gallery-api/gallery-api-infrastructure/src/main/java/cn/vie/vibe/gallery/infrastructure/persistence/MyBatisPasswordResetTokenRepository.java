package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.PasswordResetTokenRepository;
import cn.vie.vibe.gallery.domain.PasswordResetToken;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.PasswordResetTokenMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

@Repository
public class MyBatisPasswordResetTokenRepository implements PasswordResetTokenRepository {
    private final PasswordResetTokenMapper mapper;

    public MyBatisPasswordResetTokenRepository(PasswordResetTokenMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public PasswordResetToken save(PasswordResetToken token) {
        mapper.insert(
                token.id().toString(),
                token.userId().toString(),
                token.tokenHash(),
                toLocalDateTime(token.expiresAt()),
                token.usedAt() != null ? toLocalDateTime(token.usedAt()) : null,
                toLocalDateTime(token.createdAt())
        );
        return token;
    }

    @Override
    public Optional<PasswordResetToken> findByTokenHash(String tokenHash) {
        PasswordResetTokenMapper.PasswordResetTokenDto dto = mapper.findByTokenHash(tokenHash);
        if (dto == null) {
            return Optional.empty();
        }
        return Optional.of(new PasswordResetToken(
                UUID.fromString(dto.id),
                UUID.fromString(dto.userId),
                dto.tokenHash,
                toInstant(dto.expiresAt),
                dto.usedAt != null ? toInstant(dto.usedAt) : null,
                toInstant(dto.createdAt)
        ));
    }

    @Override
    public void markAsUsed(UUID tokenId, Instant usedAt) {
        mapper.markAsUsed(tokenId.toString(), toLocalDateTime(usedAt));
    }

    @Override
    public void deleteByUserId(UUID userId) {
        mapper.deleteByUserId(userId.toString());
    }

    private static LocalDateTime toLocalDateTime(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private static Instant toInstant(LocalDateTime localDateTime) {
        return localDateTime.toInstant(ZoneOffset.UTC);
    }
}
