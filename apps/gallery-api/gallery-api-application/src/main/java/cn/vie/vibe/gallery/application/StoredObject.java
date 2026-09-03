package cn.vie.vibe.gallery.application;

public record StoredObject(String bucket, String objectKey, long byteSize, String sha256) {}
