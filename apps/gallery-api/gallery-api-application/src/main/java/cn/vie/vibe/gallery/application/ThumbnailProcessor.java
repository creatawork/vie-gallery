package cn.vie.vibe.gallery.application;
import java.io.InputStream;
public interface ThumbnailProcessor {
    ThumbnailResult create(String contentType, InputStream source);
    record ThumbnailResult(byte[] content, String contentType, int width, int height) {}
}
