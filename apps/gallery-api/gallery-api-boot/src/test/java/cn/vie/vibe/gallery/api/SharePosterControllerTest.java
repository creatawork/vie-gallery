package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GenerateSharePosterCommand;
import cn.vie.vibe.gallery.application.ShareLinkFacade;
import cn.vie.vibe.gallery.domain.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SharePosterControllerTest {
    @Test
    void previewAndDownloadReturnPrivatePngResponsesAndForwardTheEditorsOptions() throws Exception {
        ShareLinkFacade facade = mock(ShareLinkFacade.class);
        byte[] png = new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47};
        when(facade.previewSharePoster(any())).thenReturn(png);
        when(facade.downloadSharePoster(any())).thenReturn(png);
        var mvc = MockMvcBuilders.standaloneSetup(new ShareLinkController(facade)).build();
        String body = """
                {"template":"MODERN","format":"SQUARE","title":"展览标题","description":"寄语","focalPoint":75}
                """;
        var command = new GenerateSharePosterCommand("gallery", "MODERN", "SQUARE", "展览标题", "寄语", 75);
        mvc.perform(post("/api/galleries/gallery/share-poster/preview").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().doesNotExist("Content-Disposition")).andExpect(content().bytes(png));
        mvc.perform(post("/api/galleries/gallery/share-poster/download").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(header().string("Content-Disposition", "attachment; filename=gallery-poster.png"))
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(content().bytes(png));
        verify(facade).previewSharePoster(command); verify(facade).downloadSharePoster(command);
    }

    @Test
    void optionalBodyKeepsDefaultsAndPosterValidationIsAnActionableBadRequest() {
        ShareLinkFacade facade = mock(ShareLinkFacade.class);
        when(facade.previewSharePoster(any())).thenReturn(new byte[]{1});
        new ShareLinkController(facade).previewSharePoster("gallery", null);
        verify(facade).previewSharePoster(new GenerateSharePosterCommand("gallery", null));
        var handler = new GlobalExceptionHandler(new ApiErrorFactory());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, handler.posterGeneration(new MockHttpServletRequest()).getStatusCode());
        for (String code : new String[]{"INVALID_POSTER_OPTIONS", "NO_COVER_PHOTO"}) {
            assertEquals(HttpStatus.BAD_REQUEST, handler.domain(new DomainException(code, "retry"), new MockHttpServletRequest()).getStatusCode());
        }
    }
}
