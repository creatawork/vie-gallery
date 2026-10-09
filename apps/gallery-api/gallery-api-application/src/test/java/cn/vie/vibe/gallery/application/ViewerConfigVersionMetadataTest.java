package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ViewerConfigVersionMetadataTest {
    @Test
    void normalizesUnicodeWhitespaceAndCountsCodePoints() {
        var metadata = ViewerConfigVersionMetadata.of("\u00a0春季展览\u3000", "\ufeff备注\n第二行\ufeff");
        assertEquals("春季展览", metadata.title());
        assertEquals("备注\n第二行", metadata.note());

        assertEquals(60, ViewerConfigVersionMetadata.of("😀".repeat(60), "x".repeat(500)).title().codePointCount(0, 120));
        assertEquals(500, ViewerConfigVersionMetadata.of(null, "x".repeat(500)).note().codePointCount(0, 500));
        assertEquals(60, ViewerConfigVersionMetadata.of("😀".repeat(60), null).title().codePointCount(0, 120));
        assertThrows(DomainException.class, () -> ViewerConfigVersionMetadata.of("😀".repeat(61), null));
        assertThrows(DomainException.class, () -> ViewerConfigVersionMetadata.of(null, "x".repeat(501)));
    }

    @Test
    void emptyAndWhitespaceOnlyMetadataBecomeNull() {
        var metadata = ViewerConfigVersionMetadata.of(" \t\r\n\u00a0\ufeff", null);
        assertNull(metadata.title());
        assertNull(metadata.note());
    }
}
