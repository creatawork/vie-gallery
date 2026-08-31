package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.TenantContext;

public final class TenantContextHolder {
    private static final ThreadLocal<TenantContext> CURRENT = new ThreadLocal<>();

    private TenantContextHolder() {
    }

    public static void set(TenantContext context) {
        CURRENT.set(context);
    }

    public static TenantContext current() {
        TenantContext context = CURRENT.get();
        if (context == null) {
            throw new IllegalStateException("Tenant context is not available");
        }
        return context;
    }

    public static void clear() {
        CURRENT.remove();
    }
}
