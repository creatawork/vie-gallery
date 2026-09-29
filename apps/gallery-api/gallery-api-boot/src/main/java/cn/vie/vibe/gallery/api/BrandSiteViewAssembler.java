package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryRepository;
import cn.vie.vibe.gallery.application.ObjectStoragePort;
import cn.vie.vibe.gallery.application.PhotoAssetVariantRepository;
import cn.vie.vibe.gallery.application.PhotoRepository;
import cn.vie.vibe.gallery.application.StorageObjectRepository;
import cn.vie.vibe.gallery.domain.BrandSite;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.StorageObjectStatus;
import cn.vie.vibe.gallery.domain.VariantKind;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 组装公开品牌站响应：把配置里的 photoId/galleryId 引用解析为可展示的
 * 图片 URL 与 3D 展厅 slug（BrandSiteResolvedAssets 契约），配置原文不改动。
 */
@Component
public class BrandSiteViewAssembler {
    private final GalleryRepository galleryRepository;
    private final PhotoRepository photoRepository;
    private final StorageObjectRepository storageObjectRepository;
    private final PhotoAssetVariantRepository assetVariants;
    private final ObjectStoragePort objectStorage;
    private final ObjectMapper objectMapper;

    public BrandSiteViewAssembler(
            GalleryRepository galleryRepository,
            PhotoRepository photoRepository,
            StorageObjectRepository storageObjectRepository,
            PhotoAssetVariantRepository assetVariants,
            ObjectStoragePort objectStorage,
            ObjectMapper objectMapper
    ) {
        this.galleryRepository = galleryRepository;
        this.photoRepository = photoRepository;
        this.storageObjectRepository = storageObjectRepository;
        this.assetVariants = assetVariants;
        this.objectStorage = objectStorage;
        this.objectMapper = objectMapper;
    }

    public JsonNode assemblePublicSite(BrandSite site) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("siteId", site.id().toString());
        root.put("subdomain", site.subdomain());
        root.put("status", site.status());
        root.put("enabled", site.enabled());
        root.put("lastPublishedAt", site.lastPublishedAt() == null ? null : site.lastPublishedAt().toString());
        root.put("publishedVersionId", site.publishedVersionId() == null ? null : site.publishedVersionId().toString());
        JsonNode config = parseConfig(site.configJson());
        root.set("config", config);
        root.set("resolved", resolveAssets(site.tenantId(), config));
        return root;
    }

    public JsonNode resolveAssets(UUID tenantId, JsonNode config) {
        Map<String, String> photos = new LinkedHashMap<>();
        ObjectNode resolved = objectMapper.createObjectNode();

        JsonNode content = config.get("content");
        if (content == null || !content.isObject()) {
            resolved.putNull("logoUrl");
            resolved.set("photos", objectMapper.createObjectNode());
            resolved.set("projects", objectMapper.createArrayNode());
            return resolved;
        }

        // Logo：brand.logoStorageObjectId 指向 storage_object（Logo 不走照片处理管线）
        String logoObjectId = textOrNull(content.path("brand").path("logoStorageObjectId"));
        if (logoObjectId != null) {
            UUID logoId = tryParseUuid(logoObjectId);
            if (logoId != null) {
                String url = storageObjectRepository.findById(tenantId, logoId)
                        .filter(obj -> obj.status() == StorageObjectStatus.READY)
                        .map(obj -> objectStorage.createReadUrl(obj.objectKey(), ObjectStoragePort.DEFAULT_READ_URL_TTL).toString())
                        .orElse(null);
                if (url != null) {
                    photos.put(logoObjectId, url);
                    resolved.put("logoUrl", url);
                }
            }
        }
        if (!resolved.has("logoUrl")) {
            resolved.putNull("logoUrl");
        }

        // hero 封面 + 形象照 + 项目封面统一进 photos 映射
        collectPhoto(tenantId, photos, textOrNull(content.path("hero").path("coverPhotoId")));
        collectPhoto(tenantId, photos, textOrNull(content.path("about").path("portraitPhotoId")));

        ArrayNode projects = resolved.putArray("projects");
        for (JsonNode projectNode : content.path("projects")) {
            if (!projectNode.isObject() || projectNode.path("archived").asBoolean(false)) continue;
            String galleryIdText = textOrNull(projectNode.path("galleryId"));
            if (galleryIdText == null) continue;
            UUID galleryId = tryParseUuid(galleryIdText);
            if (galleryId == null) continue; // demo 数据等非相册引用直接跳过

            ObjectNode project = objectMapper.createObjectNode();
            project.put("galleryId", galleryIdText);
            galleryRepository.findById(galleryId)
                    .filter(g -> g.tenantId().equals(tenantId))
                    .filter(g -> !g.deleted())
                    .ifPresent(gallery -> project.put("slug", gallery.slug()));
            String coverPhotoId = textOrNull(projectNode.path("coverPhotoId"));
            if (coverPhotoId != null) {
                String url = resolvePhotoUrl(tenantId, tryParseUuid(coverPhotoId));
                if (url != null) {
                    photos.put(coverPhotoId, url);
                    project.put("coverUrl", url);
                }
            }
            projects.add(project);
        }

        ObjectNode photosNode = resolved.putObject("photos");
        photos.forEach(photosNode::put);
        return resolved;
    }

    private void collectPhoto(UUID tenantId, Map<String, String> photos, String photoId) {
        if (photoId == null || photos.containsKey(photoId)) return;
        String url = resolvePhotoUrl(tenantId, tryParseUuid(photoId));
        if (url != null) photos.put(photoId, url);
    }

    private String resolvePhotoUrl(UUID tenantId, UUID photoId) {
        if (photoId == null) return null;
        return photoRepository.findById(tenantId, photoId)
                .filter(photo -> photo.status() == PhotoStatus.READY)
                .flatMap(photo -> storageObjectRepository.findById(tenantId, photo.storageObjectId())
                        .filter(obj -> obj.status() == StorageObjectStatus.READY)
                        .map(obj -> assetVariants.findReadyByPhotoAndKind(tenantId, photo.id(), VariantKind.MEDIUM)
                                .map(variant -> objectStorage.createReadUrl(
                                        variant.objectKey(), ObjectStoragePort.DEFAULT_READ_URL_TTL).toString())
                                .orElseGet(() -> objectStorage.createReadUrl(
                                        obj.objectKey(), ObjectStoragePort.DEFAULT_READ_URL_TTL).toString())))
                .orElse(null);
    }

    private JsonNode parseConfig(String configJson) {
        try {
            return objectMapper.readTree(configJson);
        } catch (Exception e) {
            throw new IllegalStateException("Invalid brand site config JSON", e);
        }
    }

    private static String textOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        String value = node.asText();
        return value == null || value.isBlank() ? null : value;
    }

    private static UUID tryParseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
