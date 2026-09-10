package cn.vie.vibe.gallery.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class GalleryLifecycleIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void testCompleteGalleryLifecycle() {
        String email = "creator-" + System.currentTimeMillis() + "@example.com";
        String password = "Password123456";

        // 1. Register
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> registerEntity = new HttpEntity<>(Map.of(
                "email", email,
                "displayName", "Creator Test",
                "password", password
        ), headers);

        ResponseEntity<Map> registerResp = restTemplate.postForEntity("/api/auth/register", registerEntity, Map.class);
        assertEquals(HttpStatus.CREATED, registerResp.getStatusCode());

        // Extract session cookie
        List<String> cookies = registerResp.getHeaders().get(HttpHeaders.SET_COOKIE);
        assertNotNull(cookies);
        String sessionCookie = cookies.stream()
                .filter(c -> c.startsWith("VIE_SESSION=") || c.startsWith("SESSION=") || c.startsWith("JSESSIONID="))
                .findFirst().orElse("");

        HttpHeaders authHeaders = new HttpHeaders();
        authHeaders.setContentType(MediaType.APPLICATION_JSON);
        if (!sessionCookie.isEmpty()) {
            authHeaders.add(HttpHeaders.COOKIE, sessionCookie);
        }

        // 2. Create Gallery
        String slug = "travel-" + System.currentTimeMillis();
        HttpEntity<Map<String, String>> createEntity = new HttpEntity<>(Map.of(
                "name", "My Travel Gallery",
                "slug", slug,
                "visibility", "PUBLIC"
        ), authHeaders);

        ResponseEntity<GalleryController.GalleryResponse> createResp = restTemplate.exchange(
                "/api/galleries", HttpMethod.POST, createEntity, GalleryController.GalleryResponse.class);
        assertEquals(HttpStatus.CREATED, createResp.getStatusCode());
        assertNotNull(createResp.getBody());
        String galleryId = createResp.getBody().id();
        assertEquals(slug, createResp.getBody().slug());

        // 3. Check Publish Readiness (Should block because 0 ready photos)
        ResponseEntity<GalleryController.PublishReadinessResponse> readinessResp = restTemplate.exchange(
                "/api/galleries/" + galleryId + "/publish-readiness",
                HttpMethod.GET,
                new HttpEntity<>(authHeaders),
                GalleryController.PublishReadinessResponse.class
        );
        assertEquals(HttpStatus.OK, readinessResp.getStatusCode());
        assertNotNull(readinessResp.getBody());
        assertFalse(readinessResp.getBody().galleryPublishable());
        assertTrue(readinessResp.getBody().blockers().stream().anyMatch(b -> "NO_READY_PHOTOS".equals(b.code())));

        // 4. Issue Creator Preview Token
        ResponseEntity<GalleryController.PreviewTokenResponse> tokenResp = restTemplate.exchange(
                "/api/galleries/" + galleryId + "/preview-token",
                HttpMethod.POST,
                new HttpEntity<>(authHeaders),
                GalleryController.PreviewTokenResponse.class
        );
        assertEquals(HttpStatus.OK, tokenResp.getStatusCode());
        assertNotNull(tokenResp.getBody());
        String previewToken = tokenResp.getBody().token();
        assertNotNull(previewToken);

        // 5. Public access without token on DRAFT gallery -> 404
        ResponseEntity<String> publicWithoutToken = restTemplate.getForEntity("/api/public/g/" + slug, String.class);
        assertEquals(HttpStatus.NOT_FOUND, publicWithoutToken.getStatusCode());

        // 6. Public access with preview token on DRAFT gallery -> 200
        ResponseEntity<String> publicWithToken = restTemplate.getForEntity("/api/public/g/" + slug + "?preview=" + previewToken, String.class);
        assertEquals(HttpStatus.OK, publicWithToken.getStatusCode());
    }

    @Test
    void publishReadinessBlocksWithoutReadyPhotos() {
        String email = "blocked-" + System.currentTimeMillis() + "@example.com";
        String password = "Password123456";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> registerResp = restTemplate.postForEntity("/api/auth/register",
                new HttpEntity<>(Map.of("email", email, "displayName", "Blocked Test", "password", password), headers),
                Map.class);
        assertEquals(HttpStatus.CREATED, registerResp.getStatusCode());

        List<String> cookies = registerResp.getHeaders().get(HttpHeaders.SET_COOKIE);
        HttpHeaders authHeaders = new HttpHeaders();
        authHeaders.setContentType(MediaType.APPLICATION_JSON);
        if (cookies != null) {
            cookies.stream()
                    .filter(c -> c.startsWith("VIE_SESSION=") || c.startsWith("SESSION=") || c.startsWith("JSESSIONID="))
                    .findFirst()
                    .ifPresent(cookie -> authHeaders.add(HttpHeaders.COOKIE, cookie));
        }

        String slug = "blocked-" + System.currentTimeMillis();
        ResponseEntity<GalleryController.GalleryResponse> createResp = restTemplate.exchange(
                "/api/galleries",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("name", "Blocked Gallery", "slug", slug, "visibility", "PUBLIC"), authHeaders),
                GalleryController.GalleryResponse.class);
        assertEquals(HttpStatus.CREATED, createResp.getStatusCode());
        String galleryId = createResp.getBody().id();

        ResponseEntity<GalleryController.PublishReadinessResponse> readinessResp = restTemplate.exchange(
                "/api/galleries/" + galleryId + "/publish-readiness",
                HttpMethod.GET,
                new HttpEntity<>(authHeaders),
                GalleryController.PublishReadinessResponse.class);
        assertEquals(HttpStatus.OK, readinessResp.getStatusCode());
        assertNotNull(readinessResp.getBody());
        assertFalse(readinessResp.getBody().galleryPublishable());
        assertNull(readinessResp.getBody().draftConfigVersionId());
    }
}
