package cn.vie.vibe.gallery.application;
import java.io.InputStream;
public record PhotoUpload(String filename, String contentType, long size, InputStream content) {}
