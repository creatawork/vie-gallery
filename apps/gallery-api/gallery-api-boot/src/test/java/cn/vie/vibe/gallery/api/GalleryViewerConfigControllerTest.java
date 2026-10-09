package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryViewerConfigFacade;
import cn.vie.vibe.gallery.application.ViewerConfigVersionPage;
import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GalleryViewerConfigControllerTest {
    private final UUID galleryId = UUID.randomUUID();
    private final UUID currentId = UUID.randomUUID();
    private GalleryViewerConfigFacade facade;
    private GalleryViewerConfigController controller;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        facade = mock(GalleryViewerConfigFacade.class);
        controller = new GalleryViewerConfigController(facade);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void publishWithoutBodyRemainsCompatibleAndVersionNumbersAreStrings() {
        ViewerConfigVersion version = version(currentId, 9007199254740993L, "spring", "note");
        when(facade.publishConfig(galleryId, null, null, null)).thenReturn(version);

        var response = controller.publishConfig(galleryId.toString(), null).getBody();

        assertEquals("9007199254740993", response.versionNumber());
        assertEquals("spring", response.title());
        assertEquals("note", response.note());
        assertTrue(response.isCurrent());
    }

    @Test
    void publishHttpRouteAcceptsOptionalNameAndNote() throws Exception {
        when(facade.publishConfig(galleryId, 1, "春季", "说明")).thenReturn(version(currentId, 2, "春季", "说明"));

        mockMvc.perform(post("/api/galleries/{galleryId}/viewer-config/publish", galleryId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"schemaVersion\":1,\"title\":\"春季\",\"note\":\"说明\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.versionNumber").value("2"))
                .andExpect(jsonPath("$.title").value("春季"))
                .andExpect(jsonPath("$.note").value("说明"))
                .andExpect(jsonPath("$.isCurrent").value(true));
    }

    @Test
    void listMarksCurrentByPublishedPointerWithoutOverwritingItsTitle() {
        UUID oldId = UUID.randomUUID();
        when(facade.listVersions(galleryId, 0, 20)).thenReturn(new ViewerConfigVersionPage(
                List.of(version(currentId, 2, "current name", null), version(oldId, 1, null, "old")), 0, 20, 2));
        when(facade.getConfig(galleryId)).thenReturn(Optional.of(new GalleryViewerConfig(
                UUID.randomUUID(), galleryId, "{}", true, "default", Instant.EPOCH, Instant.EPOCH,
                1, null, Instant.EPOCH, currentId)));

        var page = controller.listVersions(galleryId.toString(), 0, 20);

        assertEquals("current name", page.items().get(0).title());
        assertTrue(page.items().get(0).isCurrent());
        assertFalse(page.items().get(1).isCurrent());
        assertEquals("1", page.items().get(1).versionNumber());
    }

    @Test
    void detailMetadataRestoreAndDeleteRoutesDelegateToFacade() {
        UUID versionId = UUID.randomUUID();
        ViewerConfigVersion version = version(versionId, 3, "old", null);
        GalleryViewerConfig draft = new GalleryViewerConfig(UUID.randomUUID(), galleryId, "{}", true,
                "default", Instant.EPOCH, Instant.EPOCH);
        when(facade.getVersion(galleryId, versionId)).thenReturn(version);
        when(facade.getConfig(galleryId)).thenReturn(Optional.empty());
        when(facade.updateVersionMetadata(galleryId, versionId, "new", "note")).thenReturn(version(versionId, 3, "new", "note"));
        when(facade.restoreVersion(galleryId, versionId)).thenReturn(draft);

        assertEquals("old", controller.getVersion(galleryId.toString(), versionId.toString()).getBody().title());
        assertEquals("new", controller.updateVersionMetadata(galleryId.toString(), versionId.toString(),
                new GalleryViewerConfigController.VersionMetadataRequest("new", "note")).getBody().title());
        assertEquals(galleryId.toString(), controller.restoreVersion(galleryId.toString(), versionId.toString()).getBody().galleryId());
        assertEquals(204, controller.deleteVersion(galleryId.toString(), versionId.toString()).getStatusCode().value());
        verify(facade).getVersion(galleryId, versionId);
        verify(facade).restoreVersion(galleryId, versionId);
        verify(facade).deleteVersion(galleryId, versionId);
    }

    @Test
    void historyHttpRoutesExposeDetailPatchRestoreAndDelete() throws Exception {
        UUID versionId = UUID.randomUUID();
        ViewerConfigVersion version = version(versionId, 3, "old", null);
        ViewerConfigVersion edited = version(versionId, 3, "new", "note");
        GalleryViewerConfig draft = new GalleryViewerConfig(UUID.randomUUID(), galleryId, "{}", true,
                "default", Instant.EPOCH, Instant.EPOCH);
        when(facade.getVersion(galleryId, versionId)).thenReturn(version);
        when(facade.updateVersionMetadata(galleryId, versionId, "new", "note")).thenReturn(edited);
        when(facade.restoreVersion(galleryId, versionId)).thenReturn(draft);
        when(facade.getConfig(galleryId)).thenReturn(Optional.empty());
        String path = "/api/galleries/" + galleryId + "/viewer-config/versions/" + versionId;

        mockMvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.versionNumber").value("3"))
                .andExpect(jsonPath("$.isCurrent").value(false));
        mockMvc.perform(patch(path).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"new\",\"note\":\"note\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("new"));
        mockMvc.perform(post(path + "/restore"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.galleryId").value(galleryId.toString()));
        mockMvc.perform(delete(path)).andExpect(status().isNoContent());
    }

    private ViewerConfigVersion version(UUID id, long number, String title, String note) {
        return new ViewerConfigVersion(id, UUID.randomUUID(), galleryId, number, "{}", "default", 1,
                Instant.EPOCH, null, title, note, null, null, null, null);
    }
}
