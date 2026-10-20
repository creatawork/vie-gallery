package cn.vie.vibe.gallery.application;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;

/** Renders the same composition for the editor preview and the downloaded PNG. */
public class SharePosterService {
    private final HttpClient httpClient;
    private final ObjectStoragePort objectStorage;
    private final SharePosterRenderer renderer;
    private final QRCodeGenerator qrCodeGenerator;

    public SharePosterService(ObjectStoragePort objectStorage, QRCodeGenerator qrCodeGenerator) {
        this.objectStorage = objectStorage;
        this.qrCodeGenerator = qrCodeGenerator;
        this.renderer = new SharePosterRenderer();
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public String generatePoster(GalleryInfo gallery, String shareUrl, PosterTemplate template) {
        return generatePoster(gallery, shareUrl, template, PosterFormat.PORTRAIT, 50);
    }

    public String generatePoster(GalleryInfo gallery, String shareUrl, PosterTemplate template,
                                 PosterFormat format, int focalPoint) {
        byte[] bytes = renderPosterPng(gallery, shareUrl, template, format, focalPoint, false);
        String key = "posters/" + gallery.id() + "/" + UUID.randomUUID() + ".png";
        objectStorage.put(key, new ByteArrayInputStream(bytes), "image/png", bytes.length);
        return objectStorage.createReadUrl(key, Duration.ofDays(7)).toString();
    }

    public byte[] renderPosterPng(GalleryInfo gallery, String shareUrl, PosterTemplate template,
                                  PosterFormat format, int focalPoint, boolean preview) {
        try {
            BufferedImage cover = downloadCoverImage(gallery.coverUrl());
            BufferedImage qrCode = shareUrl == null ? null : qrCodeGenerator.generate(shareUrl, 180, 180);
            BufferedImage poster = renderer.render(gallery, cover, qrCode, template, format, focalPoint);
            if (preview) {
                BufferedImage scaled = new BufferedImage(540, format.height / 2, BufferedImage.TYPE_INT_RGB);
                var g = scaled.createGraphics();
                g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,
                        java.awt.RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                g.drawImage(poster, 0, 0, scaled.getWidth(), scaled.getHeight(), null);
                g.dispose();
                poster = scaled;
            }
            return imageToBytes(poster);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SharePosterGenerationException("海报生成已中断，请重试。", e);
        } catch (IOException e) {
            throw new SharePosterGenerationException("封面读取失败，请稍后重试或更换展厅封面。", e);
        }
    }

    public byte[] generateQrCodePng(String content) {
        try {
            return imageToBytes(qrCodeGenerator.generate(content, 280, 280));
        } catch (IOException e) {
            throw new SharePosterGenerationException("二维码生成失败，请重试。", e);
        }
    }

    private BufferedImage downloadCoverImage(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url))
                .timeout(Duration.ofSeconds(15)).GET().build();
        HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        try (InputStream body = response.body()) {
            if (response.statusCode() != 200) throw new IOException("Cover HTTP " + response.statusCode());
            BufferedImage image = ImageIO.read(body);
            if (image == null) throw new IOException("Unsupported cover image");
            return image;
        }
    }

    private byte[] imageToBytes(BufferedImage image) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "PNG", output);
        return output.toByteArray();
    }

    public record GalleryInfo(String id, String title, String description, String coverUrl, int photoCount) {}
    public enum PosterTemplate { MINIMAL, ELEGANT, VIBRANT, CLASSIC, MODERN }
    public enum PosterFormat {
        PORTRAIT(1440), STORY(1920), SQUARE(1080);
        public final int height;
        PosterFormat(int height) { this.height = height; }
    }

    public static class SharePosterGenerationException extends RuntimeException {
        public SharePosterGenerationException(String message, Throwable cause) { super(message, cause); }
    }
}
