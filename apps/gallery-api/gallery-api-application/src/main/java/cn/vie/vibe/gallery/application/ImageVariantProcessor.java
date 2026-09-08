package cn.vie.vibe.gallery.application;

import java.io.InputStream;

public interface ImageVariantProcessor {
    VariantResult create(String sourceContentType, InputStream source, VariantSpec spec);

    record VariantSpec(String kind, int maxDimension, String outputContentType, double quality) {
        public static VariantSpec medium() {
            return new VariantSpec("MEDIUM", 640, "image/jpeg", 0.85);
        }

        public static VariantSpec high() {
            return new VariantSpec("HIGH", 1600, "image/jpeg", 0.85);
        }

        public static VariantSpec texture() {
            return new VariantSpec("TEXTURE", 2048, "image/webp", 0.80);
        }
    }

    record VariantResult(byte[] content, String contentType, int width, int height) {}
}
