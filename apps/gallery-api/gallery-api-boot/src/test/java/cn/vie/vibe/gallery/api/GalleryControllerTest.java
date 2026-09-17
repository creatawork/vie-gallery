package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.domain.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

class GalleryControllerTest {
    private GalleryFacade facade;
    private PhotoRepository photos;
    private StorageObjectRepository objects;
    private ObjectStoragePort storage;
    private TenantContextResolver tenantContext;
    private CreatorPreviewTokens previewTokens;
    private PhotoProcessingTaskRepository tasks;
    private GalleryViewerConfigRepository configs;
    private GalleryController controller;

    private final UUID tenantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        facade = Mockito.mock(GalleryFacade.class);
        photos = Mockito.mock(PhotoRepository.class);
        objects = Mockito.mock(StorageObjectRepository.class);
        storage = Mockito.mock(ObjectStoragePort.class);
        tenantContext = () -> new TenantContext(userId, tenantId, MembershipRole.OWNER);
        TokenGenerator tokenGen = Mockito.mock(TokenGenerator.class);
        when(tokenGen.generateToken()).thenReturn("test-token");
        previewTokens = new CreatorPreviewTokens(tokenGen);
        tasks = Mockito.mock(PhotoProcessingTaskRepository.class);
        configs = Mockito.mock(GalleryViewerConfigRepository.class);

        controller = new GalleryController(facade, photos, objects, storage, tenantContext, previewTokens, tasks, configs);
    }

    @Test
    void listReturnsSummaryFieldsWithTaskCountsAndUnpublishedConfig() {
        UUID galleryId = UUID.randomUUID();
        Instant now = Instant.now();
        Gallery gallery = new Gallery(galleryId, tenantId, "demo", "Demo Gallery", GalleryVisibility.PUBLIC,
                null, null, false, now, GalleryStatus.DRAFT, null, now);

        when(facade.list()).thenReturn(List.of(gallery));
        when(photos.countPublicReadyByGalleryId(tenantId, galleryId)).thenReturn(5);
        when(photos.countFailedByGalleryId(tenantId, galleryId)).thenReturn(1);
        when(tasks.summaryByGallery(tenantId, galleryId)).thenReturn(new TaskSummary(1, 2, 5, 1, 0, 0));

        GalleryViewerConfig draftConfig = new GalleryViewerConfig(
                UUID.randomUUID(), galleryId, "{}", true, "default", now, now.plusSeconds(10),
                1, userId, now, UUID.randomUUID()
        );
        when(configs.findByGalleryId(galleryId)).thenReturn(Optional.of(draftConfig));

        List<GalleryController.GalleryResponse> responses = controller.list();
        assertEquals(1, responses.size());
        GalleryController.GalleryResponse resp = responses.get(0);

        assertEquals("demo", resp.slug());
        assertEquals("Demo Gallery", resp.name());
        assertEquals(5, resp.photoCount());
        assertEquals(1, resp.failedPhotoCount());
        assertEquals(3, resp.processingCount()); // 1 queued + 2 processing
        assertTrue(resp.hasUnpublishedConfig());
    }

    @Test
    void getReturnsAccurateGalleryResponse() {
        UUID galleryId = UUID.randomUUID();
        Instant now = Instant.now();
        Gallery gallery = new Gallery(galleryId, tenantId, "vacation", "Vacation", GalleryVisibility.PRIVATE,
                null, null, false, now, GalleryStatus.PUBLISHED, now, now);

        when(facade.get(galleryId)).thenReturn(gallery);
        when(photos.countPublicReadyByGalleryId(tenantId, galleryId)).thenReturn(12);
        when(photos.countFailedByGalleryId(tenantId, galleryId)).thenReturn(0);
        when(tasks.summaryByGallery(tenantId, galleryId)).thenReturn(new TaskSummary(0, 0, 12, 0, 0, 0));
        when(configs.findByGalleryId(galleryId)).thenReturn(Optional.empty());

        GalleryController.GalleryResponse resp = controller.get(galleryId);
        assertEquals(galleryId.toString(), resp.id());
        assertEquals(12, resp.photoCount());
        assertEquals(0, resp.failedPhotoCount());
        assertEquals(0, resp.processingCount());
        assertFalse(resp.hasUnpublishedConfig());
    }

    @Test
    void getPublishReadinessReturnsBlockersWhenEmpty() {
        UUID galleryId = UUID.randomUUID();
        Instant now = Instant.now();
        Gallery gallery = new Gallery(galleryId, tenantId, "empty", "Empty Gallery", GalleryVisibility.PUBLIC,
                null, null, false, now, GalleryStatus.DRAFT, null, now);

        when(facade.get(galleryId)).thenReturn(gallery);
        when(photos.countPublicReadyByGalleryId(tenantId, galleryId)).thenReturn(0);
        when(configs.findByGalleryId(galleryId)).thenReturn(Optional.empty());

        GalleryController.PublishReadinessResponse readiness = controller.getPublishReadiness(galleryId);
        assertFalse(readiness.galleryPublishable());
        assertEquals(0, readiness.readyPhotoCount());
        assertEquals(1, readiness.blockers().size());
        assertEquals("NO_READY_PHOTOS", readiness.blockers().get(0).code());
    }

    @Test
    void getPublishReadinessReturnsPublishableWithConfigDraftChanges() {
        UUID galleryId = UUID.randomUUID();
        Instant now = Instant.now();
        Gallery gallery = new Gallery(galleryId, tenantId, "ready-gallery", "Ready Gallery", GalleryVisibility.PUBLIC,
                null, null, false, now, GalleryStatus.DRAFT, null, now);

        when(facade.get(galleryId)).thenReturn(gallery);
        when(photos.countPublicReadyByGalleryId(tenantId, galleryId)).thenReturn(3);

        GalleryViewerConfig config = new GalleryViewerConfig(
                UUID.randomUUID(), galleryId, "{\"theme\":\"light\"}", true, "preset-1", now, now.plusSeconds(30),
                1, userId, now, UUID.randomUUID()
        );
        when(configs.findByGalleryId(galleryId)).thenReturn(Optional.of(config));

        GalleryController.PublishReadinessResponse readiness = controller.getPublishReadiness(galleryId);
        assertTrue(readiness.galleryPublishable());
        assertEquals(3, readiness.readyPhotoCount());
        assertTrue(readiness.configDraftChanged());
        assertNull(readiness.draftConfigVersionId());
        assertNotNull(readiness.publishedConfigVersionId());
        assertTrue(readiness.blockers().isEmpty());
    }
}
