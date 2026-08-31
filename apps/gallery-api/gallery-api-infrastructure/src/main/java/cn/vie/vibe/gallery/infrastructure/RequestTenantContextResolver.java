package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.TenantContextResolver;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.MembershipRole;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@Profile("dev-memory")
public class RequestTenantContextResolver implements TenantContextResolver {
    private static final UUID DEV_TENANT = UUID.fromString("00000000-0000-0000-0000-000000000001");
    @Override public TenantContext requireContext() {
        return new TenantContext(DEV_TENANT, DEV_TENANT, MembershipRole.OWNER);
    }
}
