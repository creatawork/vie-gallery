package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.ViewerConfigVersion;

import java.util.List;

public record ViewerConfigVersionPage(
        List<ViewerConfigVersion> items,
        int page,
        int pageSize,
        long total
) {
}
