package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.TenantContext;

public interface TenantContextResolver {
    TenantContext requireContext();
}
