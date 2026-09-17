package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.ImageVariantProcessor;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import com.luciad.imageio.webp.WebPWriteParam;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Iterator;

@Component
public class ImageIoVariantProcessor implements ImageVariantProcessor {
    @Override
    public VariantResult create(String sourceContentType, InputStream source, VariantSpec spec) {
        if (spec == null || spec.maxDimension() < 1 || spec.outputContentType() == null) {
            throw new IllegalArgumentException("Invalid image variant specification");
        }
        try {
            BufferedImage input = ImageIO.read(source);
            if (input == null) {
                throw new IllegalArgumentException("image decode failed");
            }
            BufferedImage resized = resize(input, spec.maxDimension());
            byte[] encoded = encode(resized, spec);
            return new VariantResult(encoded, spec.outputContentType(), resized.getWidth(), resized.getHeight());
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new IllegalArgumentException("image variant processing failed", exception);
        }
    }

    private static BufferedImage resize(BufferedImage input, int maxDimension) {
        int largest = Math.max(input.getWidth(), input.getHeight());
        double scale = Math.min(1d, (double) maxDimension / largest);
        int width = Math.max(1, (int) Math.round(input.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(input.getHeight() * scale));
        if (width == input.getWidth() && height == input.getHeight()) {
            return input;
        }

        int type = input.getColorModel().hasAlpha() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        BufferedImage resized = new BufferedImage(width, height, type);
        Graphics2D graphics = resized.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(input, 0, 0, width, height, null);
        graphics.dispose();
        return resized;
    }

    private static byte[] encode(BufferedImage image, VariantSpec spec) throws IOException {
        if ("image/jpeg".equalsIgnoreCase(spec.outputContentType())) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            Thumbnails.of(image)
                    .size(image.getWidth(), image.getHeight())
                    .outputFormat("jpg")
                    .outputQuality((float) spec.quality())
                    .toOutputStream(output);
            return output.toByteArray();
        }

        Iterator<ImageWriter> writers = ImageIO.getImageWritersByMIMEType(spec.outputContentType());
        if (!writers.hasNext()) {
            throw new IllegalArgumentException("No image writer for " + spec.outputContentType());
        }
        ImageWriter writer = writers.next();
        try (ByteArrayOutputStream output = new ByteArrayOutputStream();
             ImageOutputStream imageOutput = ImageIO.createImageOutputStream(output)) {
            writer.setOutput(imageOutput);
            ImageWriteParam params = writer.getDefaultWriteParam();
            if (params instanceof WebPWriteParam webpParams) {
                webpParams.setCompressionType("Lossy");
                webpParams.setCompressionQuality((float) spec.quality());
            } else if (params.canWriteCompressed()) {
                String[] compressionTypes = params.getCompressionTypes();
                if (compressionTypes != null && compressionTypes.length > 0) {
                    params.setCompressionType(compressionTypes[0]);
                }
                params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                params.setCompressionQuality((float) spec.quality());
            }
            writer.write(null, new IIOImage(image, null, null), params);
            imageOutput.flush();
            return output.toByteArray();
        } finally {
            writer.dispose();
        }
    }
}
