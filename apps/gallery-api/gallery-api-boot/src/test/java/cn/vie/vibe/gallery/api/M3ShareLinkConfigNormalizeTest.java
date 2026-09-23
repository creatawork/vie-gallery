package cn.vie.vibe.gallery.api;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class M3ShareLinkConfigNormalizeTest {

    @Test
    void keepsOriginConfiguredBaseUrl() {
        assertEquals("https://gallery.vie-vibe.cn",
                M3ShareLinkConfig.normalizePublicBaseUrl("https://gallery.vie-vibe.cn"));
        assertEquals("http://localhost:5174",
                M3ShareLinkConfig.normalizePublicBaseUrl("http://localhost:5174"));
    }

    @Test
    void stripsLegacyGPathSuffix() {
        assertEquals("https://gallery.vie-vibe.cn",
                M3ShareLinkConfig.normalizePublicBaseUrl("https://gallery.vie-vibe.cn/g"));
        assertEquals("https://gallery.vie-vibe.cn",
                M3ShareLinkConfig.normalizePublicBaseUrl("https://gallery.vie-vibe.cn/g/"));
    }

    @Test
    void stripsTrailingSlash() {
        assertEquals("https://gallery.vie-vibe.cn",
                M3ShareLinkConfig.normalizePublicBaseUrl("https://gallery.vie-vibe.cn/"));
        assertEquals("https://gallery.vie-vibe.cn",
                M3ShareLinkConfig.normalizePublicBaseUrl("https://gallery.vie-vibe.cn//"));
    }

    @Test
    void handlesNullAndBlank() {
        assertEquals("", M3ShareLinkConfig.normalizePublicBaseUrl(null));
        assertEquals("", M3ShareLinkConfig.normalizePublicBaseUrl("  "));
    }
}
