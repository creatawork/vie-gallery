package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.application.SharePosterService.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/** Photo-led layouts with bounded text areas and an undistorted, adjustable cover crop. */
public final class SharePosterRenderer {
    private static final int WIDTH = 1080;
    private static final Color PAPER = new Color(248, 249, 246);
    private static final Color INK = new Color(31, 52, 59);
    private static final String SANS = fontFamily("Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Zen Hei", "SansSerif");
    private static final String SERIF = fontFamily("Noto Serif CJK SC", "Source Han Serif SC", "SimSun", SANS);

    public BufferedImage render(GalleryInfo gallery, BufferedImage cover, BufferedImage qr,
                                PosterTemplate template, PosterFormat format, int focalPoint) {
        int h = format.height;
        BufferedImage image = new BufferedImage(WIDTH, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            Color foreground = INK;
            Color muted = new Color(99, 114, 118);
            Color background = PAPER;
            boolean serif = template == PosterTemplate.CLASSIC || template == PosterTemplate.ELEGANT;
            if (template == PosterTemplate.CLASSIC) {
                background = INK; foreground = PAPER; muted = new Color(181, 203, 202);
            } else if (template == PosterTemplate.VIBRANT) {
                background = new Color(43, 72, 201); foreground = new Color(247, 244, 160); muted = Color.WHITE;
            }
            g.setColor(background); g.fillRect(0, 0, WIDTH, h);

            if (template == PosterTemplate.ELEGANT) {
                drawCover(g, cover, 0, 0, WIDTH, h, focalPoint);
                g.setPaint(new GradientPaint(0, 0, new Color(0, 0, 0, 65), 0, 240, new Color(0, 0, 0, 0)));
                g.fillRect(0, 0, WIDTH, 240);
                g.setPaint(new GradientPaint(0, h - 850, new Color(12, 26, 30, 0),
                        0, h - 210, new Color(12, 26, 30, 235)));
                g.fillRect(0, Math.max(0, h - 850), WIDTH, 850);
                foreground = Color.WHITE; muted = new Color(224, 234, 231);
                header(g, gallery, foreground, 72, 86, WIDTH - 144);
                textBlock(g, gallery, 72, h - 560, 900, 80, serif, foreground, muted, 2, 2);
            } else if (template == PosterTemplate.MODERN) {
                drawCover(g, cover, 0, 0, 650, h - 250, focalPoint);
                g.setColor(new Color(218, 231, 226)); g.fillRect(650, 0, 430, h - 250);
                label(g, "阳光明媚", 700, 96, 28, INK);
                textBlock(g, gallery, 700, Math.max(240, (h - 250) / 3), 326, 58, false, INK, muted, 4, 3);
                label(g, gallery.photoCount() + " 幅作品", 700, h - 314, 26, muted);
            } else {
                header(g, gallery, foreground, 72, 86, WIDTH - 144);
                int x = template == PosterTemplate.VIBRANT ? 180 : 72;
                int top = 152;
                int bottom = h - 540;
                drawCover(g, cover, x, top, WIDTH - x - 72, bottom - top, focalPoint);
                if (template == PosterTemplate.VIBRANT) {
                    g.setColor(foreground); g.fillRect(72, top, 12, bottom - top);
                    label(g, "光", 106, top + 43, 35, foreground);
                    label(g, "影", 106, top + 91, 35, foreground);
                    label(g, "集", 106, top + 139, 35, foreground);
                }
                textBlock(g, gallery, 72, bottom + 104, 936, 74, serif, foreground, muted, 2, 2);
            }
            footer(g, qr, h, foreground, muted);
            return image;
        } finally {
            g.dispose();
        }
    }

    private void header(Graphics2D g, GalleryInfo gallery, Color color, int x, int y, int width) {
        label(g, "阳光明媚", x, y, 30, color);
        String count = gallery.photoCount() + " 幅作品 / 线上展览";
        g.setFont(new Font(SANS, Font.PLAIN, 24));
        g.drawString(count, x + width - g.getFontMetrics().stringWidth(count), y);
    }

    private void footer(Graphics2D g, BufferedImage qr, int h, Color color, Color muted) {
        g.setColor(new Color(color.getRed(), color.getGreen(), color.getBlue(), 65));
        g.setStroke(new BasicStroke(1)); g.drawLine(72, h - 240, 1008, h - 240);
        label(g, "把这一刻，分享给你。", 72, h - 145, 34, color);
        label(g, "长按识别二维码，走进我的展厅", 72, h - 92, 25, muted);
        g.setColor(Color.WHITE); g.fillRect(812, h - 218, 196, 196);
        if (qr != null) {
            g.drawImage(qr, 820, h - 210, null);
        } else {
            g.setColor(new Color(232, 237, 235)); g.fillRect(832, h - 198, 156, 156);
            label(g, "访问二维码", 846, h - 128, 22, INK);
            label(g, "下载后生效", 846, h - 94, 22, INK);
        }
    }

    private void textBlock(Graphics2D g, GalleryInfo gallery, int x, int y, int width, int size,
                           boolean serif, Color color, Color muted, int titleLines, int bodyLines) {
        g.setColor(color);
        int titleSize = size;
        String title = gallery.title() == null || gallery.title().isBlank() ? "我的光影展览" : gallery.title();
        while (titleSize > size - 18) {
            g.setFont(new Font(serif ? SERIF : SANS, Font.BOLD, titleSize));
            if (wrap(g.getFontMetrics(), title, width, 100).size() <= titleLines) break;
            titleSize -= 2;
        }
        g.setFont(new Font(serif ? SERIF : SANS, Font.BOLD, titleSize));
        List<String> lines = wrap(g.getFontMetrics(), title, width, titleLines);
        int lineHeight = titleSize + 16;
        for (String line : lines) { g.drawString(line, x, y); y += lineHeight; }
        if (gallery.description() != null && !gallery.description().isBlank()) {
            g.setFont(new Font(SANS, Font.PLAIN, 29)); g.setColor(muted);
            y += 52 - lineHeight;
            for (String line : wrap(g.getFontMetrics(), gallery.description(), width, bodyLines)) {
                g.drawString(line, x, y); y += 42;
            }
        }
    }

    static void drawCover(Graphics2D g, BufferedImage cover, int x, int y, int w, int h, int focalPoint) {
        double scale = Math.max((double) w / cover.getWidth(), (double) h / cover.getHeight());
        int sourceWidth = Math.min(cover.getWidth(), (int) Math.round(w / scale));
        int sourceHeight = Math.min(cover.getHeight(), (int) Math.round(h / scale));
        double focus = Math.max(0, Math.min(100, focalPoint)) / 100.0;
        int sourceX = (int) Math.round((cover.getWidth() - sourceWidth) * focus);
        int sourceY = (int) Math.round((cover.getHeight() - sourceHeight) * focus);
        g.drawImage(cover, x, y, x + w, y + h, sourceX, sourceY,
                sourceX + sourceWidth, sourceY + sourceHeight, null);
    }

    /** Wrap unspaced Chinese at Unicode code points and clamp the last visible line. */
    static List<String> wrap(FontMetrics metrics, String text, int width, int maxLines) {
        List<String> lines = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        int[] points = text.replace("\r", "").codePoints().toArray();
        for (int i = 0; i < points.length; i++) {
            String character = new String(Character.toChars(points[i]));
            if (points[i] == '\n' || (line.length() > 0 && metrics.stringWidth(line + character) > width)) {
                if (lines.size() == maxLines - 1) {
                    while (line.length() > 0 && metrics.stringWidth(line + "…") > width) {
                        line.delete(line.offsetByCodePoints(line.length(), -1), line.length());
                    }
                    lines.add(line.toString().stripTrailing() + "…"); return lines;
                }
                lines.add(line.toString().stripTrailing()); line.setLength(0);
                if (points[i] == '\n') continue;
            }
            line.append(character);
        }
        if (line.length() > 0) lines.add(line.toString().stripTrailing());
        return lines;
    }

    private static void label(Graphics2D g, String text, int x, int y, int size, Color color) {
        g.setColor(color); g.setFont(new Font(SANS, Font.PLAIN, size)); g.drawString(text, x, y);
    }

    private static String fontFamily(String... candidates) {
        var installed = Arrays.asList(GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames(Locale.ROOT));
        for (String candidate : candidates) if (installed.contains(candidate)) return candidate;
        return Font.SANS_SERIF;
    }
}
