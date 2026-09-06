package cn.vie.vibe.gallery.application;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;

public interface ObjectStoragePort {
    Duration DEFAULT_READ_URL_TTL = Duration.ofMinutes(15);

    StoredObject put(String key, InputStream content, String contentType, long size);

    InputStream get(String key);

    void delete(String key);

    /**
     * Creates a temporary URL for reading an object.
     *
     * New callers should always provide a TTL.
     */
    default URI createReadUrl(String key, Duration ttl) {
        return createReadUrl(key);
    }

    /**
     * Legacy compatibility hook for test/dev adapters. Production adapters
     * should override the TTL-aware method instead.
     */
    default URI createReadUrl(String key) {
        throw new UnsupportedOperationException("This storage adapter requires a TTL for read URLs");
    }
}
