package cn.vie.vibe.gallery.application;

import javax.imageio.ImageIO;
import java.awt.*;
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

/**
 * 分享海报生成服务
 * 生成带封面、标题、二维码的精美海报图
 */

/**
 * 分享海报生成服务
 * 生成带封面、标题、二维码的精美海报图
 */
public class SharePosterService {

    private final HttpClient httpClient;
    private final ObjectStoragePort objectStorage;
    private final QRCodeGenerator qrCodeGenerator;

    public SharePosterService(ObjectStoragePort objectStorage, QRCodeGenerator qrCodeGenerator) {
        this.objectStorage = objectStorage;
        this.qrCodeGenerator = qrCodeGenerator;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * 生成分享海报
     *
     * @param gallery 相册信息
     * @param shareUrl 分享链接
     * @param template 海报模板风格
     * @return 海报图片的对象存储 URL
     */
    public String generatePoster(GalleryInfo gallery, String shareUrl, PosterTemplate template) {
        try {
            // 1. 下载封面图片
            BufferedImage coverImage = downloadCoverImage(gallery.coverUrl());

            // 2. 生成二维码
            BufferedImage qrCode = qrCodeGenerator.generate(shareUrl, 200, 200);

            // 3. 根据模板生成海报
            BufferedImage poster = switch (template) {
                case MINIMAL -> generateMinimalPoster(gallery, coverImage, qrCode);
                case ELEGANT -> generateElegantPoster(gallery, coverImage, qrCode);
                case VIBRANT -> generateVibrantPoster(gallery, coverImage, qrCode);
                case CLASSIC -> generateClassicPoster(gallery, coverImage, qrCode);
                case MODERN -> generateModernPoster(gallery, coverImage, qrCode);
            };

            // 4. 上传到对象存储
            byte[] posterBytes = imageToBytes(poster, "PNG");
            String posterKey = "posters/" + gallery.id() + "/" + System.currentTimeMillis() + "-" + template.name().toLowerCase() + ".png";
            
            ByteArrayInputStream inputStream = new ByteArrayInputStream(posterBytes);
            StoredObject storedObject = objectStorage.put(posterKey, inputStream, "image/png", posterBytes.length);
            
            // 生成可访问的 URL
            // OSS/MinIO 预签名 URL 上限 7 天；posterUrl 仅随接口响应即时展示，不落库
            return objectStorage.createReadUrl(posterKey, Duration.ofDays(7)).toString();

        } catch (IOException e) {
            throw new SharePosterGenerationException("Failed to download cover image: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SharePosterGenerationException("Poster generation was interrupted", e);
        } catch (Exception e) {
            throw new SharePosterGenerationException("Failed to generate share poster: " + e.getMessage(), e);
        }
    }

    /**
     * 极简风格海报 - 白色背景，简洁排版
     */
    private BufferedImage generateMinimalPoster(GalleryInfo gallery, BufferedImage cover, BufferedImage qrCode) {
        int width = 1080;
        int height = 1920;
        
        BufferedImage poster = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = poster.createGraphics();
        
        // 启用抗锯齿
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        
        // 白色背景
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width, height);
        
        // 封面图片 - 居中，留白
        int coverWidth = 900;
        int coverHeight = 600;
        int coverX = (width - coverWidth) / 2;
        int coverY = 200;
        g.drawImage(cover, coverX, coverY, coverWidth, coverHeight, null);
        
        // 标题 - 黑色，加粗
        g.setColor(new Color(20, 20, 20));
        g.setFont(new Font("SansSerif", Font.BOLD, 56));
        drawCenteredText(g, gallery.title(), width / 2, 950);
        
        // 描述 - 灰色，常规
        if (gallery.description() != null && !gallery.description().isEmpty()) {
            g.setColor(new Color(100, 100, 100));
            g.setFont(new Font("SansSerif", Font.PLAIN, 32));
            drawCenteredMultilineText(g, gallery.description(), width / 2, 1050, 800, 3);
        }
        
        // 二维码 - 底部居中
        int qrX = (width - 200) / 2;
        int qrY = 1500;
        g.drawImage(qrCode, qrX, qrY, null);
        
        // 提示文字
        g.setColor(new Color(150, 150, 150));
        g.setFont(new Font("SansSerif", Font.PLAIN, 24));
        drawCenteredText(g, "扫码查看相册", width / 2, 1750);
        
        g.dispose();
        return poster;
    }

    /**
     * 优雅风格海报 - 米色背景，金色点缀
     */
    private BufferedImage generateElegantPoster(GalleryInfo gallery, BufferedImage cover, BufferedImage qrCode) {
        int width = 1080;
        int height = 1920;
        
        BufferedImage poster = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = poster.createGraphics();
        
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        
        // 米色背景
        g.setColor(new Color(250, 247, 240));
        g.fillRect(0, 0, width, height);
        
        // 金色装饰边框
        g.setColor(new Color(212, 175, 55));
        g.setStroke(new BasicStroke(3));
        g.drawRect(80, 80, width - 160, height - 160);
        
        // 封面图片带金色边框
        int coverWidth = 800;
        int coverHeight = 533;
        int coverX = (width - coverWidth) / 2;
        int coverY = 250;
        
        // 金色边框
        g.setColor(new Color(212, 175, 55));
        g.fillRect(coverX - 10, coverY - 10, coverWidth + 20, coverHeight + 20);
        g.drawImage(cover, coverX, coverY, coverWidth, coverHeight, null);
        
        // 标题 - 深棕色，衬线字体
        g.setColor(new Color(70, 50, 30));
        g.setFont(new Font("Serif", Font.BOLD, 52));
        drawCenteredText(g, gallery.title(), width / 2, 920);
        
        // 描述
        if (gallery.description() != null && !gallery.description().isEmpty()) {
            g.setColor(new Color(100, 80, 60));
            g.setFont(new Font("Serif", Font.ITALIC, 28));
            drawCenteredMultilineText(g, gallery.description(), width / 2, 1020, 750, 3);
        }
        
        // 二维码
        int qrX = (width - 200) / 2;
        int qrY = 1480;
        g.drawImage(qrCode, qrX, qrY, null);
        
        // 提示文字
        g.setColor(new Color(120, 100, 80));
        g.setFont(new Font("Serif", Font.ITALIC, 22));
        drawCenteredText(g, "Scan to Explore", width / 2, 1730);
        
        g.dispose();
        return poster;
    }

    /**
     * 活力风格海报 - 渐变背景，大胆配色
     */
    private BufferedImage generateVibrantPoster(GalleryInfo gallery, BufferedImage cover, BufferedImage qrCode) {
        int width = 1080;
        int height = 1920;
        
        BufferedImage poster = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = poster.createGraphics();
        
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        
        // 渐变背景 - 从紫色到蓝色
        GradientPaint gradient = new GradientPaint(
                0, 0, new Color(138, 43, 226),
                0, height, new Color(25, 118, 210)
        );
        g.setPaint(gradient);
        g.fillRect(0, 0, width, height);
        
        // 封面图片 - 圆角
        int coverWidth = 850;
        int coverHeight = 567;
        int coverX = (width - coverWidth) / 2;
        int coverY = 280;
        
        g.setClip(new java.awt.geom.RoundRectangle2D.Float(coverX, coverY, coverWidth, coverHeight, 40, 40));
        g.drawImage(cover, coverX, coverY, coverWidth, coverHeight, null);
        g.setClip(null);
        
        // 标题 - 白色，粗体，带阴影
        g.setColor(Color.WHITE);
        g.setFont(new Font("SansSerif", Font.BOLD, 60));
        
        // 阴影效果
        g.setColor(new Color(0, 0, 0, 100));
        drawCenteredText(g, gallery.title(), width / 2 + 2, 982);
        g.setColor(Color.WHITE);
        drawCenteredText(g, gallery.title(), width / 2, 980);
        
        // 描述
        if (gallery.description() != null && !gallery.description().isEmpty()) {
            g.setColor(new Color(255, 255, 255, 230));
            g.setFont(new Font("SansSerif", Font.PLAIN, 32));
            drawCenteredMultilineText(g, gallery.description(), width / 2, 1080, 800, 3);
        }
        
        // 二维码 - 白色背景
        int qrBgSize = 240;
        int qrBgX = (width - qrBgSize) / 2;
        int qrBgY = 1450;
        g.setColor(Color.WHITE);
        g.fillRoundRect(qrBgX, qrBgY, qrBgSize, qrBgSize, 20, 20);
        
        int qrX = qrBgX + 20;
        int qrY = qrBgY + 20;
        g.drawImage(qrCode, qrX, qrY, null);
        
        // 提示文字
        g.setColor(Color.WHITE);
        g.setFont(new Font("SansSerif", Font.BOLD, 26));
        drawCenteredText(g, "扫码查看精彩瞬间", width / 2, 1760);
        
        g.dispose();
        return poster;
    }

    /**
     * 经典风格海报 - 深色背景，金色文字
     */
    private BufferedImage generateClassicPoster(GalleryInfo gallery, BufferedImage cover, BufferedImage qrCode) {
        int width = 1080;
        int height = 1920;
        
        BufferedImage poster = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = poster.createGraphics();
        
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        
        // 深色背景
        g.setColor(new Color(20, 24, 28));
        g.fillRect(0, 0, width, height);
        
        // 封面图片
        int coverWidth = 820;
        int coverHeight = 547;
        int coverX = (width - coverWidth) / 2;
        int coverY = 300;
        g.drawImage(cover, coverX, coverY, coverWidth, coverHeight, null);
        
        // 标题 - 金色
        g.setColor(new Color(255, 215, 0));
        g.setFont(new Font("Serif", Font.BOLD, 54));
        drawCenteredText(g, gallery.title(), width / 2, 970);
        
        // 描述 - 浅灰色
        if (gallery.description() != null && !gallery.description().isEmpty()) {
            g.setColor(new Color(200, 200, 200));
            g.setFont(new Font("Serif", Font.PLAIN, 30));
            drawCenteredMultilineText(g, gallery.description(), width / 2, 1070, 780, 3);
        }
        
        // 二维码
        int qrX = (width - 200) / 2;
        int qrY = 1500;
        g.drawImage(qrCode, qrX, qrY, null);
        
        // 提示文字
        g.setColor(new Color(180, 180, 180));
        g.setFont(new Font("Serif", Font.PLAIN, 24));
        drawCenteredText(g, "Scan QR Code", width / 2, 1750);
        
        g.dispose();
        return poster;
    }

    /**
     * 现代风格海报 - 几何图形，扁平化设计
     */
    private BufferedImage generateModernPoster(GalleryInfo gallery, BufferedImage cover, BufferedImage qrCode) {
        int width = 1080;
        int height = 1920;
        
        BufferedImage poster = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = poster.createGraphics();
        
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        
        // 浅灰背景
        g.setColor(new Color(245, 245, 247));
        g.fillRect(0, 0, width, height);
        
        // 装饰性几何图形
        g.setColor(new Color(16, 185, 129));
        g.fillRect(0, 0, width, 180);
        
        // 品牌标识区域
        g.setColor(Color.WHITE);
        g.setFont(new Font("SansSerif", Font.BOLD, 40));
        drawCenteredText(g, "VIE GALLERY", width / 2, 110);
        
        // 封面图片 - 无边框
        int coverWidth = 900;
        int coverHeight = 600;
        int coverX = (width - coverWidth) / 2;
        int coverY = 250;
        g.drawImage(cover, coverX, coverY, coverWidth, coverHeight, null);
        
        // 标题 - 深灰色，粗体
        g.setColor(new Color(30, 30, 30));
        g.setFont(new Font("SansSerif", Font.BOLD, 58));
        drawCenteredText(g, gallery.title(), width / 2, 950);
        
        // 描述
        if (gallery.description() != null && !gallery.description().isEmpty()) {
            g.setColor(new Color(90, 90, 90));
            g.setFont(new Font("SansSerif", Font.PLAIN, 30));
            drawCenteredMultilineText(g, gallery.description(), width / 2, 1050, 820, 3);
        }
        
        // 二维码背景
        g.setColor(Color.WHITE);
        g.fillRect((width - 280) / 2, 1430, 280, 280);
        
        int qrX = (width - 200) / 2;
        int qrY = 1470;
        g.drawImage(qrCode, qrX, qrY, null);
        
        // 提示文字
        g.setColor(new Color(16, 185, 129));
        g.setFont(new Font("SansSerif", Font.BOLD, 28));
        drawCenteredText(g, "扫码进入相册", width / 2, 1760);
        
        g.dispose();
        return poster;
    }

    // Helper methods

    private BufferedImage downloadCoverImage(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
                
        HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        
        if (response.statusCode() != 200) {
            throw new IOException("Failed to download cover image: HTTP " + response.statusCode());
        }
        
        return ImageIO.read(response.body());
    }

    private void drawCenteredText(Graphics2D g, String text, int centerX, int y) {
        FontMetrics metrics = g.getFontMetrics();
        int x = centerX - metrics.stringWidth(text) / 2;
        g.drawString(text, x, y);
    }

    private void drawCenteredMultilineText(Graphics2D g, String text, int centerX, int startY, int maxWidth, int maxLines) {
        FontMetrics metrics = g.getFontMetrics();
        String[] words = text.split(" ");
        StringBuilder currentLine = new StringBuilder();
        int lineCount = 0;
        int y = startY;
        
        for (String word : words) {
            String testLine = currentLine.length() == 0 ? word : currentLine + " " + word;
            if (metrics.stringWidth(testLine) > maxWidth) {
                if (currentLine.length() > 0) {
                    drawCenteredText(g, currentLine.toString(), centerX, y);
                    y += metrics.getHeight() + 10;
                    lineCount++;
                    if (lineCount >= maxLines) break;
                    currentLine = new StringBuilder(word);
                } else {
                    drawCenteredText(g, word, centerX, y);
                    y += metrics.getHeight() + 10;
                    lineCount++;
                    if (lineCount >= maxLines) break;
                }
            } else {
                currentLine.append(currentLine.length() == 0 ? word : " " + word);
            }
        }
        
        if (currentLine.length() > 0 && lineCount < maxLines) {
            drawCenteredText(g, currentLine.toString(), centerX, y);
        }
    }

    private byte[] imageToBytes(BufferedImage image, String format) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, format, baos);
        return baos.toByteArray();
    }

    // Data records

    public record GalleryInfo(
            String id,
            String title,
            String description,
            String coverUrl,
            int photoCount
    ) {}

    public enum PosterTemplate {
        MINIMAL,    // 极简风格
        ELEGANT,    // 优雅风格
        VIBRANT,    // 活力风格
        CLASSIC,    // 经典风格
        MODERN      // 现代风格
    }

    public static class SharePosterGenerationException extends RuntimeException {
        public SharePosterGenerationException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
