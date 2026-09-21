package cn.vie.vibe.gallery.application;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import java.awt.image.BufferedImage;
import java.util.HashMap;
import java.util.Map;

/**
 * 二维码生成器
 * 使用 ZXing 库生成 QR Code
 */
public class QRCodeGenerator {

    private final QRCodeWriter qrCodeWriter;

    public QRCodeGenerator() {
        this.qrCodeWriter = new QRCodeWriter();
    }

    /**
     * 生成二维码图片
     *
     * @param content 二维码内容（通常是 URL）
     * @param width 图片宽度（像素）
     * @param height 图片高度（像素）
     * @return 二维码 BufferedImage
     */
    public BufferedImage generate(String content, int width, int height) {
        try {
            Map<EncodeHintType, Object> hints = new HashMap<>();
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H); // 高容错率
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            hints.put(EncodeHintType.MARGIN, 1); // 白边宽度

            BitMatrix bitMatrix = qrCodeWriter.encode(content, BarcodeFormat.QR_CODE, width, height, hints);
            return MatrixToImageWriter.toBufferedImage(bitMatrix);

        } catch (WriterException e) {
            throw new QRCodeGenerationException("Failed to generate QR code for content: " + content, e);
        }
    }

    /**
     * 生成带 Logo 的二维码（可选功能）
     */
    public BufferedImage generateWithLogo(String content, int width, int height, BufferedImage logo) {
        BufferedImage qrCode = generate(content, width, height);
        
        if (logo == null) {
            return qrCode;
        }

        // 在二维码中心叠加 Logo
        int logoSize = Math.min(width, height) / 5; // Logo 占 20%
        int logoX = (width - logoSize) / 2;
        int logoY = (height - logoSize) / 2;

        java.awt.Graphics2D g = qrCode.createGraphics();
        g.drawImage(logo, logoX, logoY, logoSize, logoSize, null);
        g.dispose();

        return qrCode;
    }

    public static class QRCodeGenerationException extends RuntimeException {
        public QRCodeGenerationException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
