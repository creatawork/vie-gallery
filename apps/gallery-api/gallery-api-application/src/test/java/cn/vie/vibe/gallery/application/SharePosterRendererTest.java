package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.application.SharePosterService.*;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.params.provider.Arguments;
import static org.junit.jupiter.api.Assertions.*;

class SharePosterRendererTest {
    private static final String URL = "https://gallery.example/g/slow-days?t=private-access-token";

    static Stream<Arguments> layouts() {
        return Stream.of(PosterTemplate.values()).flatMap(template -> Stream.of(PosterFormat.values())
                .map(format -> Arguments.of(template, format)));
    }

    @ParameterizedTest
    @MethodSource("layouts")
    void everyLayoutExportsTheRequestedSizeAndAScannableQr(PosterTemplate template, PosterFormat format) throws Exception {
        BufferedImage cover = new BufferedImage(1600, 1000, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = cover.createGraphics();
        g.setPaint(new GradientPaint(0, 0, new Color(158, 190, 185), 1600, 1000, new Color(42, 87, 79)));
        g.fillRect(0, 0, 1600, 1000); g.dispose();
        String fixture = System.getProperty("poster.cover");
        if (fixture != null) cover = ImageIO.read(Path.of(fixture).toFile());
        var info = new GalleryInfo("gallery", "山野来信", "让脚步慢一点，听风从山谷里经过。", "unused", 24);
        BufferedImage poster = new SharePosterRenderer().render(info, cover,
                new QRCodeGenerator().generate(URL, 180, 180), template, format, 50);
        assertEquals(1080, poster.getWidth()); assertEquals(format.height, poster.getHeight());
        var bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(poster)));
        assertEquals(URL, new MultiFormatReader().decode(bitmap, java.util.Map.of(DecodeHintType.TRY_HARDER, true)).getText());
        String output = System.getProperty("poster.samples");
        if (output != null) {
            Files.createDirectories(Path.of(output));
            ImageIO.write(poster, "PNG", Path.of(output, template + "-" + format + ".png").toFile());
        }
    }

    @Test
    void chineseNewlinesAndEmojiFitAndTruncateWithoutBreakingUnicode() {
        var image = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        var g = image.createGraphics();
        g.setFont(new Font("SansSerif", Font.PLAIN, 25));
        List<String> lines = SharePosterRenderer.wrap(g.getFontMetrics(), "没有空格的中文标题🌲🌲\n第二行继续很长的文字", 140, 2);
        assertEquals(2, lines.size()); assertTrue(lines.get(1).endsWith("…"));
        for (String line : lines) {
            assertTrue(g.getFontMetrics().stringWidth(line) <= 140);
            for (int point : line.codePoints().toArray()) assertFalse(point >= 0xD800 && point <= 0xDFFF);
        }
        assertEquals(List.of("第一行", "第二行"), SharePosterRenderer.wrap(g.getFontMetrics(), "第一行\n第二行", 300, 3));
        g.dispose();
    }

    @Test
    void coverFillsWithoutStretchingAndFocalPointSelectsTheCrop() {
        var cover = new BufferedImage(300, 100, BufferedImage.TYPE_INT_RGB);
        var g = cover.createGraphics();
        g.setColor(Color.RED); g.fillRect(0, 0, 100, 100);
        g.setColor(Color.GREEN); g.fillRect(100, 0, 100, 100);
        g.setColor(Color.BLUE); g.fillRect(200, 0, 100, 100); g.dispose();
        var target = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        var targetGraphics = target.createGraphics();
        for (int i = 0; i < 3; i++) {
            SharePosterRenderer.drawCover(targetGraphics, cover, 0, 0, 100, 100, i * 50);
            assertEquals(new int[]{Color.RED.getRGB(), Color.GREEN.getRGB(), Color.BLUE.getRGB()}[i], target.getRGB(50, 50));
            assertEquals(target.getRGB(50, 50), target.getRGB(0, 0));
        }
        targetGraphics.dispose();
    }
}
