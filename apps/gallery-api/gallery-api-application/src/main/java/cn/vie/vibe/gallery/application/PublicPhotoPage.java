package cn.vie.vibe.gallery.application;

import java.util.List;

/**
 * 公开照片分页结果，分页元数据由应用层统一计算。
 */
public record PublicPhotoPage(
        List<PublicPhotoView> items,
        int page,
        int pageSize,
        int total
) {
    public PublicPhotoPage {
        items = List.copyOf(items);
    }
}
