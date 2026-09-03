package cn.vie.vibe.gallery.application;
import java.io.InputStream;
import java.net.URI;
public interface ObjectStoragePort {
    StoredObject put(String key, InputStream content, String contentType, long size);
    InputStream get(String key);
    void delete(String key);
    URI createReadUrl(String key);
}
