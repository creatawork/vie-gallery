package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.BrandSiteConfigVersion;

import java.util.List;

public record BrandSiteVersionPage(List<BrandSiteConfigVersion> items, int page, int pageSize, long total) {}
