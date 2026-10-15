package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.GalleryViewerConfigMapper;
import cn.vie.vibe.gallery.infrastructure.persistence.MyBatisGalleryViewerConfigRepository;
import cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MyBatisGalleryViewerConfigRepositoryTest {
    @Test
    void savesBindPublicationTimeInsteadOfReplacingItWithTheColumnDefault() {
        GalleryViewerConfigMapper mapper = mock(GalleryViewerConfigMapper.class);
        MyBatisGalleryViewerConfigRepository repository = new MyBatisGalleryViewerConfigRepository(mapper);
        Instant publishedAt = Instant.parse("2026-10-15T09:04:48.123456Z");
        GalleryViewerConfig published = GalleryViewerConfig.create(UUID.randomUUID(), "{}", "starry-night")
                .withPublishedVersion(UUID.randomUUID(), publishedAt);
        repository.save(published);
        repository.save(published.withDraft("{\"camera\":{\"autoRotate\":true}}", "starry-night", null));

        ArgumentCaptor<LocalDateTime> publicationTimes = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(mapper, times(2)).upsert(anyString(), anyString(), anyString(), eq(true), eq("starry-night"),
                any(), any(), eq(1), isNull(), publicationTimes.capture(), eq(published.publishedVersionId().toString()));
        for (LocalDateTime time : publicationTimes.getAllValues()) {
            assertEquals(MyBatisValueMapper.localDateTime(publishedAt), time);
        }

        Configuration configuration = new Configuration();
        configuration.addMapper(GalleryViewerConfigMapper.class);
        Map<String, Object> params = new HashMap<>();
        params.put("lastPublishedAt", MyBatisValueMapper.localDateTime(publishedAt));
        BoundSql sql = configuration.getMappedStatement(GalleryViewerConfigMapper.class.getName() + ".upsert")
                .getBoundSql(params);
        String insertColumns = sql.getSql().substring(0, sql.getSql().indexOf("VALUES"));
        assertTrue(insertColumns.contains("last_published_at"), "VALUES(last_published_at) must reference a bound insert column");
        assertTrue(sql.getParameterMappings().stream().anyMatch(mapping -> mapping.getProperty().equals("lastPublishedAt")));
    }
}
