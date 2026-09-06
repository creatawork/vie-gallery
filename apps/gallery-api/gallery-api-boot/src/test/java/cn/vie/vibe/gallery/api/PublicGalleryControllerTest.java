package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryViewerConfigFacade;
import cn.vie.vibe.gallery.application.PublicAccessFacade;
import cn.vie.vibe.gallery.application.PublicGalleryView;
import cn.vie.vibe.gallery.application.PublicPhotoPage;
import cn.vie.vibe.gallery.application.PublicPhotoView;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.PublicAccessState;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PublicGalleryControllerTest {
    private static final UUID GALLERY_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final String SLUG = "public-space";

    @Test
    void unlockStoresRealGalleryIdAndExpiryInSession() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        when(access.unlockGallery(SLUG, "token", "password")).thenReturn(GALLERY_ID);
        PublicGalleryController controller = new PublicGalleryController(access, config);
        MockHttpSession session = new MockHttpSession();

        PublicGalleryController.UnlockResponse response = controller.unlock(
                SLUG, "token", new PublicGalleryController.UnlockRequest("password"), session);

        assertEquals(true, response.unlocked());
        assertEquals(GALLERY_ID.toString(), session.getAttribute("public_gallery_id"));
        assertEquals(response.expiresAt().toString(), session.getAttribute("public_expires_at"));
        assertEquals(1800, session.getMaxInactiveInterval());
    }

    @Test
    void expiredOrMalformedSessionIsNotPassedAsAuthorizedGallery() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        PublicPhotoPage page = new PublicPhotoPage(List.of(), 0, 10, 0);
        when(access.listPublicPhotos(eq(SLUG), any(), eq(null), eq(0), eq(10))).thenReturn(page);
        PublicGalleryController controller = new PublicGalleryController(access, config);

        MockHttpSession session = new MockHttpSession();
        session.setAttribute("public_gallery_id", "not-a-uuid");
        session.setAttribute("public_expires_at", Instant.now().plusSeconds(60).toString());
        controller.getPhotos(SLUG, null, 0, 10, session);
        assertNull(session.getAttribute("public_gallery_id"));
        assertNull(session.getAttribute("public_expires_at"));

        MockHttpSession expired = new MockHttpSession();
        expired.setAttribute("public_gallery_id", GALLERY_ID.toString());
        expired.setAttribute("public_expires_at", Instant.now().minusSeconds(1).toString());
        controller.getPhotos(SLUG, null, 0, 10, expired);
        assertNull(expired.getAttribute("public_gallery_id"));
        assertNull(expired.getAttribute("public_expires_at"));
    }

    @Test
    void photoResponseUsesFacadePageMetadataInsteadOfCurrentPageSize() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        PublicPhotoPage page = new PublicPhotoPage(
                List.of(new PublicPhotoView("photo", "https://cdn/photo", 1200, 800, 1)),
                2,
                1,
                7
        );
        when(access.listPublicPhotos(SLUG, null, null, 2, 1)).thenReturn(page);
        PublicGalleryController controller = new PublicGalleryController(access, config);

        PublicGalleryController.PhotoListResponse result = controller.getPhotos(
                SLUG, null, 2, 1, new MockHttpSession());

        assertEquals(1, result.items().size());
        assertEquals(2, result.page());
        assertEquals(1, result.pageSize());
        assertEquals(7, result.total());
    }

    @Test
    void galleryResponseKeepsPublicViewContract() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        when(access.resolvePublicGallery(eq(SLUG), eq(null), any())).thenReturn(new PublicGalleryView(
                SLUG, "Public Space", GalleryVisibility.PUBLIC, PublicAccessState.READY,
                new PublicGalleryView.CoverView("https://cdn/cover", 1200, 800), 7));
        PublicGalleryController controller = new PublicGalleryController(access, config);

        PublicGalleryController.PublicGalleryResponse result = controller.getGallery(SLUG, null, new MockHttpSession());

        assertEquals(SLUG, result.slug());
        assertEquals("Public Space", result.title());
        assertEquals(7, result.photoCount());
        assertEquals("https://cdn/cover", result.cover().url());
    }
}
