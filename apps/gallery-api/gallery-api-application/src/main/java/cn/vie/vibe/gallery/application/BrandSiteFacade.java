package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.BrandSite;
import cn.vie.vibe.gallery.domain.BrandSiteConfigVersion;
import cn.vie.vibe.gallery.domain.BrandSiteInquiry;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 品牌站领域服务：草稿/发布/回滚对齐 {@link GalleryViewerConfigFacade} 范式（T5）。
 * 站点配置内容（configJson）在本层保持不透明；结构化校验由 boot 层完成后传入。
 */
public class BrandSiteFacade {
    /** 泛子域名保留字黑名单（§7.3）：系统子域与常用基础设施名。 */
    private static final Set<String> RESERVED_SUBDOMAINS = Set.of(
            "www", "api", "admin", "app", "g", "s", "static", "assets", "cdn", "mail", "smtp", "ftp",
            "docs", "help", "blog", "status", "dashboard", "manage", "console", "root", "ns1", "ns2",
            "dev", "test", "staging", "proxy", "gateway", "auth", "login", "account", "billing", "pay");

    private static final Pattern SUBDOMAIN_PATTERN = Pattern.compile("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$");

    private final BrandSiteRepository siteRepository;
    private final BrandSiteConfigVersionRepository versionRepository;
    private final BrandSiteInquiryRepository inquiryRepository;
    private final WorkspaceAuthorizationPolicy authorization;

    public BrandSiteFacade(
            BrandSiteRepository siteRepository,
            BrandSiteConfigVersionRepository versionRepository,
            BrandSiteInquiryRepository inquiryRepository,
            WorkspaceAuthorizationPolicy authorization
    ) {
        this.siteRepository = siteRepository;
        this.versionRepository = versionRepository;
        this.inquiryRepository = inquiryRepository;
        this.authorization = authorization;
    }

    /** 获取（或首次开通）当前租户的品牌站。首版每账号一站（PRD 非目标 §2.2）。 */
    public BrandSite getOrCreateForTenant() {
        TenantContext context = authorization.requireViewer();
        return siteRepository.findByTenantId(context.tenantId())
                .orElseGet(() -> {
                    BrandSite site = BrandSite.create(context.tenantId(), BrandSiteDefaults.EMPTY_CONFIG_JSON);
                    siteRepository.save(site);
                    return site;
                });
    }

    /** 保存草稿：不产生版本、不影响公开端（对齐 saveConfig）。 */
    public BrandSite saveDraft(String configJson, Integer requestedSchemaVersion) {
        TenantContext context = authorization.requireEditor();
        requireSchema(requestedSchemaVersion);
        BrandSite site = getOrCreateForTenant();
        BrandSite updated = site.withConfig(configJson, context.userId());
        siteRepository.save(updated);
        return updated;
    }

    @Transactional
    public BrandSiteConfigVersion publish(Integer requestedSchemaVersion) {
        TenantContext context = authorization.requireEditor();
        requireSchema(requestedSchemaVersion);
        BrandSite site = siteRepository.findByTenantId(context.tenantId())
                .orElseThrow(() -> new DomainException("BRAND_SITE_NOT_FOUND", "Brand site not found"));
        Instant now = Instant.now();
        BrandSiteConfigVersion version = BrandSiteConfigVersion.create(
                context.tenantId(), site.id(), site.configJson(), null, site.schemaVersion(), context.userId());
        versionRepository.save(version);
        if (versionRepository.publish(context.tenantId(), site.id(), version.id(), now) == 0) {
            throw new DomainException("BRAND_SITE_PUBLISH_FAILED", "Unable to publish brand site");
        }
        siteRepository.save(site.withPublishedVersion(version.id(), now));
        return version;
    }

    public BrandSiteVersionPage listVersions(int page, int pageSize) {
        TenantContext context = authorization.requireViewer();
        BrandSite site = requireSite(context);
        if (page < 0) throw new DomainException("INVALID_PAGE", "Page must be non-negative");
        if (pageSize < 1 || pageSize > 100) throw new DomainException("INVALID_PAGE_SIZE", "Page size must be between 1 and 100");
        int offset = Math.multiplyExact(page, pageSize);
        return new BrandSiteVersionPage(
                versionRepository.findBySite(context.tenantId(), site.id(), offset, pageSize),
                page, pageSize, versionRepository.countBySite(context.tenantId(), site.id()));
    }

    @Transactional
    public BrandSiteConfigVersion rollback(UUID versionId) {
        TenantContext context = authorization.requireEditor();
        BrandSite site = requireSite(context);
        BrandSiteConfigVersion source = versionRepository.findById(context.tenantId(), site.id(), versionId)
                .orElseThrow(() -> new DomainException("BRAND_SITE_VERSION_NOT_FOUND", "Brand site version not found"));
        Instant now = Instant.now();
        BrandSiteConfigVersion rollback = BrandSiteConfigVersion.create(
                context.tenantId(), site.id(), source.configJson(), source.templateId(),
                source.schemaVersion(), context.userId());
        versionRepository.save(rollback);
        if (versionRepository.publish(context.tenantId(), site.id(), rollback.id(), now) == 0) {
            throw new DomainException("BRAND_SITE_PUBLISH_FAILED", "Unable to publish rolled back brand site");
        }
        siteRepository.save(site.withConfig(source.configJson(), context.userId())
                .withPublishedVersion(rollback.id(), now));
        return rollback;
    }

    /** 更新站点设置：泛子域名、启停、状态（§9 模板层只感知状态机）。 */
    public BrandSite updateSettings(String subdomain, Boolean enabled, String status) {
        TenantContext context = authorization.requireEditor();
        BrandSite site = requireSite(context);
        BrandSite updated = site;
        if (subdomain != null) {
            String normalized = normalizeSubdomain(subdomain);
            if (!normalized.isEmpty()) {
                requireSubdomainAvailable(normalized, site.id());
            }
            updated = updated.withSubdomain(normalized.isEmpty() ? null : normalized);
        }
        if (enabled != null) {
            updated = updated.withEnabled(enabled);
        }
        if (status != null) {
            if (!status.equals(BrandSite.STATUS_TRIAL) && !status.equals(BrandSite.STATUS_ACTIVE)
                    && !status.equals(BrandSite.STATUS_EXPIRED)) {
                throw new DomainException("BAD_BRAND_SITE_STATUS", "Unsupported brand site status");
            }
            updated = updated.withStatus(status);
        }
        siteRepository.save(updated);
        return updated;
    }

    /** 公开读取（按子域名），只回已发布快照；未启用/EXPIRED 由调用方决定表现。 */
    public Optional<BrandSite> getPublicBySubdomain(String subdomain) {
        return siteRepository.findBySubdomain(normalizeSubdomain(subdomain))
                .flatMap(site -> {
                    if (!site.enabled()) return Optional.empty();
                    if (site.publishedVersionId() == null) return Optional.empty();
                    return versionRepository.findById(site.tenantId(), site.id(), site.publishedVersionId())
                            .map(version -> site.withConfig(version.configJson(), site.updatedByUserId()));
                });
    }

    /** 站内表单询盘落库（site_form_submit 的存储侧）。 */
    public void submitInquiry(String subdomain, String name, String message) {
        BrandSite site = siteRepository.findBySubdomain(normalizeSubdomain(subdomain))
                .filter(BrandSite::enabled)
                .filter(s -> !BrandSite.STATUS_EXPIRED.equals(s.status()))
                .orElseThrow(() -> new DomainException("BRAND_SITE_NOT_FOUND", "Brand site not found"));
        inquiryRepository.save(new BrandSiteInquiry(UUID.randomUUID(), site.id(), name, message, Instant.now()));
    }

    private BrandSite requireSite(TenantContext context) {
        return siteRepository.findByTenantId(context.tenantId())
                .orElseThrow(() -> new DomainException("BRAND_SITE_NOT_FOUND", "Brand site not found"));
    }

    private void requireSubdomainAvailable(String subdomain, UUID siteId) {
        if (RESERVED_SUBDOMAINS.contains(subdomain)) {
            throw new DomainException("SUBDOMAIN_RESERVED", "该子域名是保留字，请换一个");
        }
        siteRepository.findBySubdomain(subdomain)
                .filter(existing -> !existing.id().equals(siteId))
                .ifPresent(existing -> {
                    throw new DomainException("SUBDOMAIN_TAKEN", "该子域名已被使用，请换一个");
                });
    }

    public static String normalizeSubdomain(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase();
        if (value.isEmpty()) return "";
        if (!SUBDOMAIN_PATTERN.matcher(value).matches()) {
            throw new DomainException("BAD_SUBDOMAIN", "子域名仅支持小写字母、数字与连字符");
        }
        return value;
    }

    private int requireSchema(Integer requestedSchemaVersion) {
        int version = requestedSchemaVersion == null ? BrandSite.CURRENT_SCHEMA_VERSION : requestedSchemaVersion;
        if (version != BrandSite.CURRENT_SCHEMA_VERSION) {
            throw new DomainException("BAD_SCHEMA_VERSION", "Unsupported brand site schema version");
        }
        return version;
    }
}
