package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.TenantRepository;
import cn.vie.vibe.gallery.domain.Tenant;
import cn.vie.vibe.gallery.domain.TenantStatus;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.TenantMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.localDateTime;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.uuid;

@Repository
public class MyBatisTenantRepository implements TenantRepository {
    private final TenantMapper mapper;

    public MyBatisTenantRepository(TenantMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Tenant save(Tenant tenant) {
        Instant now = Instant.now();
        mapper.insert(tenant.id().toString(), tenant.name(), tenant.slug(), tenant.status().name(), localDateTime(now), localDateTime(now));
        return tenant;
    }

    @Override
    public Optional<Tenant> findActiveById(UUID id) {
        return Optional.ofNullable(mapper.findActiveById(id.toString())).map(row -> new Tenant(uuid(row, "id"),
                (String) row.get("name"), (String) row.get("slug"), TenantStatus.valueOf((String) row.get("status"))));
    }
}
