package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.ShareLink;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 分享链接仓储端口
 */
public interface ShareLinkRepository {
    /**
     * 保存分享链接
     */
    void save(ShareLink shareLink);

    /**
     * 根据 ID 查找分享链接
     */
    Optional<ShareLink> findById(UUID id);

    /**
     * 根据 token hash 查找分享链接
     */
    Optional<ShareLink> findByTokenHash(String tokenHash);

    /**
     * 查找相册的所有分享链接（包括已撤销和过期）
     */
    List<ShareLink> findByGalleryId(UUID galleryId);

    /**
     * 查找租户相册的所有分享链接
     */
    List<ShareLink> findByGalleryIdAndTenantId(UUID galleryId, UUID tenantId);

    /**
     * 更新分享链接
     */
    void update(ShareLink shareLink);

    /**
     * 删除分享链接（软删除）
     */
    void delete(UUID id);
}
