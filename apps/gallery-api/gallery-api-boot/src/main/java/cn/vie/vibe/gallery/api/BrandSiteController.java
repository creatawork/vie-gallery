package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.domain.BrandSite;
import cn.vie.vibe.gallery.domain.BrandSiteConfigVersion;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.StorageObjectStatus;
import cn.vie.vibe.gallery.infrastructure.security.SignedUrlService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 品牌站管理端点（工作台）。结构化校验在入口完成，facade 内 configJson 保持不透明。
 */
@RestController
@RequestMapping("/api/brand-site")
public class BrandSiteController {
    private static final Set<String> KNOWN_TEMPLATES = Set.of("plain", "white-box", "darkroom", "field-notes", "lumen");
    private static final Set<String> KNOWN_VARIANTS = Set.of("feature", "mosaic", "index");
    private static final long MAX_LOGO_BYTES = 256 * 1024;
    private static final Set<String> LOGO_CONTENT_TYPES = Set.of(
            "image/png", "image/jpeg", "image/webp", "image/svg+xml");

    private final BrandSiteFacade facade;
    private final ObjectMapper objectMapper;
    private final TenantContextResolver tenantContext;
    private final ObjectStoragePort objectStorage;
    private final StorageObjectRepository storageObjects;
    private final SignedUrlService signedUrlService;

    public BrandSiteController(
            BrandSiteFacade facade,
            ObjectMapper objectMapper,
            TenantContextResolver tenantContext,
            ObjectStoragePort objectStorage,
            StorageObjectRepository storageObjects,
            SignedUrlService signedUrlService
    ) {
        this.facade = facade;
        this.objectMapper = objectMapper;
        this.tenantContext = tenantContext;
        this.objectStorage = objectStorage;
        this.storageObjects = storageObjects;
        this.signedUrlService = signedUrlService;
    }

    @GetMapping
    public BrandSiteAdminResponse getConfig() {
        return toResponse(facade.getOrCreateForTenant());
    }

    @PutMapping("/config")
    public BrandSiteAdminResponse saveConfig(@Valid @RequestBody SaveConfigRequest request) {
        validateConfigJson(request.configJson());
        facade.saveDraft(request.configJson(), request.schemaVersion());
        return toResponse(facade.getOrCreateForTenant());
    }

    @PatchMapping("/settings")
    public BrandSiteAdminResponse updateSettings(@RequestBody UpdateSettingsRequest request) {
        facade.updateSettings(request.subdomain(), request.enabled(), request.status());
        return toResponse(facade.getOrCreateForTenant());
    }

    @PostMapping("/publish")
    public VersionResponse publish(@RequestBody(required = false) PublishRequest request) {
        Integer schemaVersion = request == null ? null : request.schemaVersion();
        return toVersionResponse(facade.publish(schemaVersion));
    }

    @GetMapping("/versions")
    public VersionPageResponse listVersions(
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize
    ) {
        return toVersionPage(facade.listVersions(page, pageSize));
    }

    @PostMapping("/rollback")
    public VersionResponse rollback(@Valid @RequestBody RollbackRequest request) {
        return toVersionResponse(facade.rollback(UUID.fromString(request.versionId())));
    }

    /** 品牌 Logo 上传（D11：名称/Logo/主色；≤256KB，§6.1）。返回 storageObjectId 供 content.brand 引用。 */
    @PostMapping("/logo")
    public LogoResponse uploadLogo(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) throw new DomainException("VALIDATION_FAILED", "请选择 Logo 文件");
        if (file.getSize() > MAX_LOGO_BYTES) throw new DomainException("LOGO_TOO_LARGE", "Logo 不能超过 256KB");
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!LOGO_CONTENT_TYPES.contains(contentType)) {
            throw new DomainException("LOGO_BAD_TYPE", "Logo 仅支持 PNG / JPG / WebP / SVG");
        }
        var context = tenantContext.requireContext();
        byte[] bytes = file.getBytes();

        UUID objectId = UUID.randomUUID();
        String objectKey = "tenant/" + context.tenantId() + "/brand/logo/" + objectId;
        StoredObject stored = objectStorage.put(objectKey, new java.io.ByteArrayInputStream(bytes), contentType, bytes.length);
        storageObjects.save(new StorageObject(
                objectId, context.tenantId(), stored.bucket(), stored.objectKey(), null,
                contentType, bytes.length, null, null, null, StorageObjectStatus.READY, Instant.now()));

        String logoUrl = signedUrlService.signPhotoUrl(
                objectStorage.createReadUrl(objectKey, ObjectStoragePort.DEFAULT_READ_URL_TTL).toString(),
                context.tenantId().toString());
        return new LogoResponse(objectId.toString(), logoUrl);
    }

    /* ---------------------------- 校验 ---------------------------- */

    private void validateConfigJson(String configJson) {
        JsonNode root;
        try {
            root = objectMapper.readTree(configJson);
        } catch (Exception e) {
            throw new DomainException("BAD_BRAND_SITE_CONFIG", "站点配置不是合法的 JSON");
        }
        String templateId = root.path("templateId").asText("");
        if (!KNOWN_TEMPLATES.contains(templateId)) {
            throw new DomainException("BAD_BRAND_SITE_TEMPLATE", "未知的站点模板：" + templateId);
        }
        String variant = root.path("projectCardVariant").asText("");
        if (!KNOWN_VARIANTS.contains(variant)) {
            throw new DomainException("BAD_BRAND_SITE_VARIANT", "未知的项目卡变体：" + variant);
        }
        JsonNode content = root.path("content");
        if (!content.isObject() || content.path("brand").path("name").asText("").isBlank()) {
            throw new DomainException("BAD_BRAND_SITE_CONFIG", "站点内容缺少品牌名");
        }
    }

    /* ---------------------------- 响应 ---------------------------- */

    private BrandSiteAdminResponse toResponse(BrandSite site) {
        JsonNode config;
        try {
            config = objectMapper.readTree(site.configJson());
        } catch (Exception e) {
            config = objectMapper.createObjectNode();
        }
        return new BrandSiteAdminResponse(
                site.id().toString(),
                site.subdomain(),
                site.status(),
                site.enabled(),
                config,
                site.createdAt(),
                site.updatedAt(),
                site.lastPublishedAt(),
                site.publishedVersionId() == null ? null : site.publishedVersionId().toString(),
                site.hasUnpublishedChanges()
        );
    }

    private VersionPageResponse toVersionPage(BrandSiteVersionPage page) {
        return new VersionPageResponse(
                page.items().stream().map(this::toVersionResponse).toList(),
                page.page(), page.pageSize(), page.total());
    }

    private VersionResponse toVersionResponse(BrandSiteConfigVersion version) {
        return new VersionResponse(
                version.id().toString(),
                version.configJson(),
                version.templateId(),
                version.schemaVersion(),
                version.createdAt(),
                version.createdByUserId() == null ? null : version.createdByUserId().toString());
    }

    public record SaveConfigRequest(@NotBlank String configJson, Integer schemaVersion) {}
    public record PublishRequest(Integer schemaVersion) {}
    public record RollbackRequest(@NotBlank String versionId) {}
    public record UpdateSettingsRequest(String subdomain, Boolean enabled, String status) {}
    public record LogoResponse(String logoStorageObjectId, String logoUrl) {}

    public record BrandSiteAdminResponse(
            String siteId,
            String subdomain,
            String status,
            boolean enabled,
            JsonNode config,
            Instant createdAt,
            Instant updatedAt,
            Instant lastPublishedAt,
            String publishedVersionId,
            boolean hasUnpublishedChanges
    ) {}

    public record VersionResponse(
            String id, String configJson, String templateId, int schemaVersion,
            Instant createdAt, String createdByUserId
    ) {}

    public record VersionPageResponse(List<VersionResponse> items, int page, int pageSize, long total) {}
}
