package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryViewerConfigFacade;
import cn.vie.vibe.gallery.application.PublicAccessFacade;
import cn.vie.vibe.gallery.application.PublicGalleryView;
import cn.vie.vibe.gallery.application.PublicPhotoPage;
import cn.vie.vibe.gallery.application.PublicPhotoView;
import cn.vie.vibe.gallery.application.PublicUnlockSession;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.PublicAccessException;
import cn.vie.vibe.gallery.domain.PublicAccessState;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PublicGalleryControllerTest {
    private static final UUID GALLERY_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final String SLUG = "public-space";

    @Test
    void unlockStoresRealGalleryIdAndExpiryInSession() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        when(access.unlockGallery(SLUG, "token", "password"))
                .thenReturn(new PublicUnlockSession(GALLERY_ID, "fp-hash"));
        PublicGalleryController controller = new PublicGalleryController(access, config, limiter);
        MockHttpSession session = new MockHttpSession();

        PublicGalleryController.UnlockResponse response = controller.unlock(
                SLUG, "token", new PublicGalleryController.UnlockRequest("password"),
                session, new MockHttpServletRequest());

        assertEquals(true, response.unlocked());
        assertEquals(GALLERY_ID.toString(), session.getAttribute("public_gallery_id"));
        assertEquals("fp-hash", session.getAttribute("public_password_fp"));
        assertEquals(response.expiresAt().toString(), session.getAttribute("public_expires_at"));
        assertEquals(1800, session.getMaxInactiveInterval());
        verify(limiter).resetUnlock(anyString());
    }

    @Test
    void wrongPasswordRecordsUnlockFailureAndKeepsLimiterBlocked() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        when(access.unlockGallery(eq(SLUG), any(), eq("wrong")))
                .thenThrow(new PublicAccessException(PublicAccessException.PASSWORD_INVALID, "The password is incorrect"));
        PublicGalleryController controller = new PublicGalleryController(access, config, limiter);

        PublicAccessException exception = assertThrows(PublicAccessException.class,
                () -> controller.unlock(SLUG, null, new PublicGalleryController.UnlockRequest("wrong"),
                        new MockHttpSession(), new MockHttpServletRequest()));

        assertEquals(PublicAccessException.PASSWORD_INVALID, exception.getCode());
        verify(limiter).recordUnlockFailure(anyString());
        verify(limiter, never()).resetUnlock(anyString());
    }

    @Test
    void blockedUnlockAttemptIsRejectedBeforeReachingFacade() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        doThrow(new DomainException("RATE_LIMITED", "尝试次数过多，请稍后再试"))
                .when(limiter).assertUnlockAllowed(anyString());
        PublicGalleryController controller = new PublicGalleryController(access, config, limiter);

        DomainException exception = assertThrows(DomainException.class,
                () -> controller.unlock(SLUG, null, new PublicGalleryController.UnlockRequest("password"),
                        new MockHttpSession(), new MockHttpServletRequest()));

        assertEquals("RATE_LIMITED", exception.code());
        verify(access, never()).unlockGallery(any(), any(), any());
    }

    @Test
    void expiredOrMalformedSessionIsNotPassedAsAuthorizedGallery() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        PublicPhotoPage page = new PublicPhotoPage(List.of(), 0, 10, 0);
        when(access.listPublicPhotos(eq(SLUG), any(), eq((PublicUnlockSession) null), eq(null), eq(0), eq(10))).thenReturn(page);
        PublicGalleryController controller = new PublicGalleryController(access, config, limiter);

        MockHttpSession session = new MockHttpSession();
        session.setAttribute("public_gallery_id", "not-a-uuid");
        session.setAttribute("public_expires_at", Instant.now().plusSeconds(60).toString());
        controller.getPhotos(SLUG, null, null, null, 0, 10, session);
        assertNull(session.getAttribute("public_gallery_id"));
        assertNull(session.getAttribute("public_expires_at"));

        MockHttpSession expired = new MockHttpSession();
        expired.setAttribute("public_gallery_id", GALLERY_ID.toString());
        expired.setAttribute("public_expires_at", Instant.now().minusSeconds(1).toString());
        controller.getPhotos(SLUG, null, null, null, 0, 10, expired);
        assertNull(expired.getAttribute("public_gallery_id"));
        assertNull(expired.getAttribute("public_expires_at"));
    }

    @Test
    void photoResponseUsesFacadePageMetadataInsteadOfCurrentPageSize() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        PublicPhotoPage page = new PublicPhotoPage(
                List.of(new PublicPhotoView("photo", "https://cdn/photo", 1200, 800, 1)),
                2,
                1,
                7
        );
        when(access.listPublicPhotos(eq(SLUG), eq(null), eq((PublicUnlockSession) null), eq(null), eq(2), eq(1))).thenReturn(page);
        PublicGalleryController controller = new PublicGalleryController(access, config, limiter);

        PublicGalleryController.PhotoListResponse result = controller.getPhotos(
                SLUG, null, null, null, 2, 1, new MockHttpSession());

        assertEquals(1, result.items().size());
        assertEquals(2, result.page());
        assertEquals(1, result.pageSize());
        assertEquals(7, result.total());
    }

    @Test
    void galleryResponseKeepsPublicViewContract() {
        PublicAccessFacade access = mock(PublicAccessFacade.class);
        GalleryViewerConfigFacade config = mock(GalleryViewerConfigFacade.class);
        RedisRateLimiter limiter = mock(RedisRateLimiter.class);
        when(access.resolvePublicGallery(eq(SLUG), eq(null), any(PublicUnlockSession.class), eq(null))).thenReturn(new PublicGalleryView(
                SLUG, "Public Space", GalleryVisibility.PUBLIC, PublicAccessState.READY,
                new PublicGalleryView.CoverView("https://cdn/cover", 1200, 800), 7));
        // also allow null unlock session
        when(access.resolvePublicGallery(eq(SLUG), eq(null), eq((PublicUnlockSession) null), eq(null))).thenReturn(new PublicGalleryView(
                SLUG, "Public Space", GalleryVisibility.PUBLIC, PublicAccessState.READY,
                new PublicGalleryView.CoverView("https://cdn/cover", 1200, 800), 7));
        PublicGalleryController controller = new PublicGalleryController(access, config, limiter);

        PublicGalleryController.PublicGalleryResponse result = controller.getGallery(SLUG, null, null, null, new MockHttpSession());

        assertEquals(SLUG, result.slug());
        assertEquals("Public Space", result.title());
        assertEquals(7, result.photoCount());
        assertEquals("https://cdn/cover", result.cover().url());
    }
}
