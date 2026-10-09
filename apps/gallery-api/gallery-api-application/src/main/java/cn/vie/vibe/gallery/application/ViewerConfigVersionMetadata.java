package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;

public record ViewerConfigVersionMetadata(String title, String note) {
    public static ViewerConfigVersionMetadata of(String title, String note) {
        return new ViewerConfigVersionMetadata(normalize(title, 60), normalize(note, 500));
    }

    static String normalize(String value, int limit) {
        if (value == null) return null;
        int start = 0;
        int end = value.length();
        while (start < end) {
            int codePoint = value.codePointAt(start);
            if (!isTrimWhitespace(codePoint)) break;
            start += Character.charCount(codePoint);
        }
        while (end > start) {
            int codePoint = value.codePointBefore(end);
            if (!isTrimWhitespace(codePoint)) break;
            end -= Character.charCount(codePoint);
        }
        String normalized = value.substring(start, end);
        if (normalized.isEmpty()) return null;
        if (normalized.codePointCount(0, normalized.length()) > limit) {
            throw new DomainException("CONFIG_VERSION_METADATA_INVALID", "Configuration version title or note is too long");
        }
        return normalized;
    }

    private static boolean isTrimWhitespace(int codePoint) {
        return codePoint >= 0x0009 && codePoint <= 0x000D
                || codePoint == 0x0020
                || codePoint == 0x00A0
                || codePoint == 0x1680
                || codePoint >= 0x2000 && codePoint <= 0x200A
                || codePoint == 0x2028
                || codePoint == 0x2029
                || codePoint == 0x202F
                || codePoint == 0x205F
                || codePoint == 0x3000
                || codePoint == 0xFEFF;
    }
}
