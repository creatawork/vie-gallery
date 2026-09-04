package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.ShareLinkRepository;
import cn.vie.vibe.gallery.domain.ShareLink;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.ShareLinkMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.*;

/**
 * ShareLink MyBatis Repository 实现
 */
@Repository
public class MyBatisShareLinkRepository implements ShareLinkRepository {
    private final ShareLinkMapper mapper;

    public MyBatisShareLinkRepository(ShareLinkMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void save(ShareLink shareLink) {
        mapper.insert(
                shareLink.getId().toString(),
                shareLink.getGalleryId().toString(),
                shareLink.getTokenHash(),
                localDateTime(shareLink.getExpiresAt()),
                localDateTime(shareLink.getRevokedAt()),
                localDateTime(shareLink.getLastAccessedAt()),
                localDateTime(shareLink.getCreatedAt()),
                localDateTime(shareLink.getUpdatedAt())
        );
    }

    @Override
    public Optional<ShareLink> findById(UUID id) {
        return Optional.ofNullable(mapper.findById(id.toString()))
                .map(MyBatisShareLinkRepository::toDomain);
    }

    @Override
    public Optional<ShareLink> findByTokenHash(String tokenHash) {
        return Optional.ofNullable(mapper.findByTokenHash(tokenHash))
                .map(MyBatisShareLinkRepository::toDomain);
    }

    @Override
    public List<ShareLink> findByGalleryId(UUID galleryId) {
        return mapper.findByGalleryId(galleryId.toString()).stream()
                .map(MyBatisShareLinkRepository::toDomain)
                .toList();
    }

    @Override
    public List<ShareLink> findByGalleryIdAndTenantId(UUID galleryId, UUID tenantId) {
        return mapper.findByGalleryIdAndTenantId(galleryId.toString(), tenantId.toString()).stream()
                .map(MyBatisShareLinkRepository::toDomain)
                .toList();
    }

    @Override
    public void update(ShareLink shareLink) {
        // 更新撤销时间
        if (shareLink.getRevokedAt() != null) {
            mapper.updateRevokedAt(
                    shareLink.getId().toString(),
                    localDateTime(shareLink.getRevokedAt()),
                    localDateTime(shareLink.getUpdatedAt())
            );
        }

        // 更新最后访问时间
        if (shareLink.getLastAccessedAt() != null) {
            mapper.updateLastAccessedAt(
                    shareLink.getId().toString(),
                    localDateTime(shareLink.getLastAccessedAt()),
                    localDateTime(shareLink.getUpdatedAt())
            );
        }
    }

    @Override
    public void delete(UUID id) {
        Instant now = Instant.now();
        mapper.softDelete(
                id.toString(),
                localDateTime(now),
                localDateTime(now)
        );
    }

    private static ShareLink toDomain(Map<String, Object> row) {
        return new ShareLink(
                uuid(row, "id"),
                uuid(row, "galleryId"),
                (String) row.get("tokenHash"),
                instant(row, "expiresAt"),
                instant(row, "revokedAt"),
                instant(row, "lastAccessedAt"),
                instant(row, "createdAt"),
                instant(row, "updatedAt")
        );
    }
}
