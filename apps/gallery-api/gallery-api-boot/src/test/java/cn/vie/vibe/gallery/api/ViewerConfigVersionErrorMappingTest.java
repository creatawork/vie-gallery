package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.domain.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ViewerConfigVersionErrorMappingTest {
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler(new ApiErrorFactory());
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    @Test
    void currentVersionDeletionIsConflictAndInvalidMetadataIsBadRequest() {
        var current = handler.domain(new DomainException("CONFIG_VERSION_CURRENT", "current"), request);
        var invalid = handler.domain(new DomainException("CONFIG_VERSION_METADATA_INVALID", "invalid"), request);

        assertEquals(HttpStatus.CONFLICT, current.getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, invalid.getStatusCode());
    }
}
