package cn.vie.vibe.gallery.application;

public record StoredObject(
        String bucket,
        String objectKey,
        String thumbnailKey,
        long byteSize,
        Integer width,
        Integer height,
        String sha256
) {}
