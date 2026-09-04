package cn.vie.vibe.gallery.infrastructure.persistence;
import cn.vie.vibe.gallery.application.GalleryLookup;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.M2GalleryMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import java.util.Optional;
import java.util.UUID;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.instant;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.uuid;
@Component @Profile("!dev-memory")
public class MyBatisGalleryLookup implements GalleryLookup {
 private final M2GalleryMapper mapper;
 public MyBatisGalleryLookup(M2GalleryMapper mapper){this.mapper=mapper;}
 public Optional<Gallery> findById(UUID tenantId, UUID galleryId){
  return Optional.ofNullable(mapper.findById(tenantId.toString(),galleryId.toString())).map(r -> new Gallery(uuid(r,"id"),uuid(r,"tenantId"),(String)r.get("slug"),(String)r.get("name"),GalleryVisibility.valueOf((String)r.get("visibility")),(String)r.get("passwordHash"),uuid(r,"coverPhotoId"),false,instant(r,"createdAt")));
 }
}
