package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.GalleryRepository;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.GalleryMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.instant;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.localDateTime;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.uuid;

@Repository
@Profile("!dev-memory")
public class MyBatisGalleryRepository implements GalleryRepository {
    private final GalleryMapper mapper;

    public MyBatisGalleryRepository(GalleryMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public List<Gallery> findAll(UUID tenantId) {
        return mapper.findAll(tenantId.toString()).stream().map(MyBatisGalleryRepository::toDomain).toList();
    }

    @Override
    public Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug) {
        return Optional.ofNullable(mapper.findByTenantAndSlug(tenantId.toString(), slug))
                .map(MyBatisGalleryRepository::toDomain);
    }

    @Override
    public Optional<Gallery> findBySlug(String slug) {
        return Optional.ofNullable(mapper.findBySlug(slug)).map(MyBatisGalleryRepository::toDomain);
    }

    @Override
    public Optional<Gallery> findById(UUID galleryId) {
        return Optional.ofNullable(mapper.findById(galleryId.toString()))
                .map(MyBatisGalleryRepository::toDomain);
    }

    @Override
    public Optional<Gallery> findById(UUID tenantId, UUID galleryId) {
        return Optional.ofNullable(mapper.findByTenantAndId(tenantId.toString(), galleryId.toString()))
                .map(MyBatisGalleryRepository::toDomain);
    }

    @Override
    public Gallery save(Gallery gallery) {
        Instant now = Instant.now();
        mapper.insert(
                gallery.id().toString(),
                gallery.tenantId().toString(),
                gallery.slug(),
                gallery.name(),
                gallery.visibility().name(),
                gallery.passwordHash(),
                gallery.coverPhotoId() != null ? gallery.coverPhotoId().toString() : null,
                localDateTime(now),
                localDateTime(now)
        );
        return gallery;
    }

    @Override
    public void update(Gallery gallery) {
        mapper.update(
                gallery.id().toString(),
                gallery.name(),
                gallery.visibility().name(),
                gallery.passwordHash(),
                gallery.coverPhotoId() != null ? gallery.coverPhotoId().toString() : null,
                localDateTime(Instant.now())
        );
    }

    @Override
    public void updateCoverPhoto(UUID tenantId, UUID galleryId, UUID coverPhotoId) {
        if (coverPhotoId != null) {
            mapper.updateCover(tenantId.toString(), galleryId.toString(), coverPhotoId.toString(), localDateTime(Instant.now()));
        } else {
            mapper.clearCover(tenantId.toString(), galleryId.toString(), localDateTime(Instant.now()));
        }
    }

    private static Gallery toDomain(java.util.Map<String, Object> row) {
        return new Gallery(
                uuid(row, "id"),
                uuid(row, "tenantId"),
                (String) row.get("slug"),
                (String) row.get("name"),
                GalleryVisibility.valueOf((String) row.get("visibility")),
                (String) row.get("passwordHash"),
                uuid(row, "coverPhotoId"),
                Boolean.TRUE.equals(row.get("deleted")),
                instant(row, "createdAt")
        );
    }
}
