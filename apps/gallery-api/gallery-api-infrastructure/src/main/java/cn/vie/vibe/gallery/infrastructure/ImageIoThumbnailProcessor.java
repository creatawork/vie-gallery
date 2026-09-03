package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.ThumbnailProcessor;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Component;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;

@Component
public class ImageIoThumbnailProcessor implements ThumbnailProcessor {
    public ThumbnailResult create(String type, InputStream source) {
        try {
            BufferedImage input = ImageIO.read(source);
            if (input == null) throw new IllegalArgumentException("image decode failed");
            int max = Math.max(input.getWidth(), input.getHeight());
            double scale = Math.min(1d, 1600d / max);
            int width = Math.max(1, (int) Math.round(input.getWidth() * scale));
            int height = Math.max(1, (int) Math.round(input.getHeight() * scale));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            Thumbnails.of(input).size(width, height).outputFormat("jpg").outputQuality(0.85).toOutputStream(out);
            return new ThumbnailResult(out.toByteArray(), "image/jpeg", width, height);
        } catch (IOException e) {
            throw new IllegalArgumentException("image decode failed", e);
        }
    }
}
