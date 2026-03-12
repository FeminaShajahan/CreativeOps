package com.creativeops.service;

import com.creativeops.model.ProcessRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.image.AffineTransformOp;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Processes images entirely in-process using Java2D.
 * Pipeline: decode → crop → scale → rotate → flip → colour adjust → encode.
 */
@Service
public class ImageProcessingService {

    private static final float JPEG_QUALITY = 0.92f;

    // ── Public entry point ────────────────────────────────────────────────────

    public byte[] process(MultipartFile file, ProcessRequest req) throws IOException {
        BufferedImage src = ImageIO.read(file.getInputStream());
        if (src == null) {
            throw new IOException("Cannot decode image — unsupported or corrupt file: " + file.getOriginalFilename());
        }

        // Ensure we always work with a TYPE_INT_ARGB image for consistent colour ops
        src = ensureRGB(src);

        BufferedImage result = crop(src, req);
        result = scale(result, req.effectiveDrawWidth(), req.effectiveDrawHeight());

        if (req.getRotation() != 0) {
            result = rotate(result, req.getRotation());
        }
        if (req.isFlipHorizontal() || req.isFlipVertical()) {
            result = flip(result, req.isFlipHorizontal(), req.isFlipVertical());
        }
        if (req.getBrightness() != 0 || req.getContrast() != 0 || req.getSaturation() != 0) {
            result = adjustColours(result, req.getBrightness(), req.getContrast(), req.getSaturation());
        }

        return encode(result, req.getOutputFormat());
    }

    // ── Step 1: Crop ──────────────────────────────────────────────────────────

    private BufferedImage crop(BufferedImage img, ProcessRequest req) {
        int imgW = img.getWidth();
        int imgH = img.getHeight();

        int drawW = req.effectiveDrawWidth();
        int drawH = req.effectiveDrawHeight();

        double destRatio = (double) drawW / drawH;
        double srcRatio  = (double) imgW  / imgH;

        int sx, sy, sw, sh;
        if (srcRatio > destRatio) {
            // Source is wider — crop left/right
            sh = imgH;
            sw = (int) Math.round(sh * destRatio);
            int maxSx    = imgW - sw;
            int centerSx = maxSx / 2;
            int offset   = (int) Math.round(req.getCropOffsetX() * imgW);
            sx = Math.max(0, Math.min(maxSx, centerSx + offset));
            sy = 0;
        } else {
            // Source is taller — crop top/bottom
            sw = imgW;
            sh = (int) Math.round(sw / destRatio);
            int maxSy    = imgH - sh;
            int centerSy = maxSy / 2;
            int offset   = (int) Math.round(req.getCropOffsetY() * imgH);
            sx = 0;
            sy = Math.max(0, Math.min(maxSy, centerSy + offset));
        }

        return img.getSubimage(sx, sy, Math.min(sw, imgW - sx), Math.min(sh, imgH - sy));
    }

    // ── Step 2: Scale ─────────────────────────────────────────────────────────

    private BufferedImage scale(BufferedImage img, int targetW, int targetH) {
        BufferedImage out = new BufferedImage(targetW, targetH, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,  RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING,      RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,   RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(Color.BLACK);
        g.fillRect(0, 0, targetW, targetH);
        g.drawImage(img, 0, 0, targetW, targetH, null);
        g.dispose();
        return out;
    }

    // ── Step 3: Rotate ────────────────────────────────────────────────────────

    /**
     * Rotates image clockwise by the given degrees (0/90/180/270).
     * Output dimensions are swapped for 90° and 270°.
     */
    private BufferedImage rotate(BufferedImage img, int degrees) {
        boolean is90or270 = degrees == 90 || degrees == 270;
        int outW = is90or270 ? img.getHeight() : img.getWidth();
        int outH = is90or270 ? img.getWidth()  : img.getHeight();

        BufferedImage out = new BufferedImage(outW, outH, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.translate(outW / 2.0, outH / 2.0);
        g.rotate(Math.toRadians(degrees));
        g.drawImage(img, -img.getWidth() / 2, -img.getHeight() / 2, null);
        g.dispose();
        return out;
    }

    // ── Step 4: Flip ──────────────────────────────────────────────────────────

    private BufferedImage flip(BufferedImage img, boolean flipH, boolean flipV) {
        int w = img.getWidth();
        int h = img.getHeight();

        AffineTransform tx = new AffineTransform();
        if (flipH && flipV) {
            tx.translate(w, h);
            tx.scale(-1, -1);
        } else if (flipH) {
            tx.translate(w, 0);
            tx.scale(-1, 1);
        } else {
            tx.translate(0, h);
            tx.scale(1, -1);
        }

        AffineTransformOp op  = new AffineTransformOp(tx, AffineTransformOp.TYPE_BICUBIC);
        BufferedImage     out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        op.filter(img, out);
        return out;
    }

    // ── Step 5: Colour adjustments ────────────────────────────────────────────

    /**
     * Applies brightness, contrast, and saturation to every pixel.
     *
     * @param brightness -100 to +100 (0 = neutral)
     * @param contrast   -100 to +100 (0 = neutral)
     * @param saturation -100 to +100 (0 = neutral)
     */
    private BufferedImage adjustColours(BufferedImage img, float brightness, float contrast, float saturation) {
        int w = img.getWidth();
        int h = img.getHeight();

        // Pre-compute factors
        float bOffset  = brightness * 2.55f;                                    // maps ±100 → ±255
        float cFactor  = contrast == 0 ? 1f
                         : (259f * (contrast * 2.55f + 255f)) / (255f * (259f - contrast * 2.55f));
        float sFactor  = 1f + saturation / 100f;                                // maps ±100 → 0..2

        // Bulk pixel read for performance
        int[] pixels = new int[w * h];
        img.getRGB(0, 0, w, h, pixels, 0, w);

        for (int i = 0; i < pixels.length; i++) {
            int argb = pixels[i];
            float r = (argb >> 16) & 0xFF;
            float g = (argb >>  8) & 0xFF;
            float b =  argb        & 0xFF;

            // Brightness (additive shift)
            r += bOffset;
            g += bOffset;
            b += bOffset;

            // Contrast (scale around mid-grey 128)
            r = cFactor * (r - 128f) + 128f;
            g = cFactor * (g - 128f) + 128f;
            b = cFactor * (b - 128f) + 128f;

            // Clamp before saturation conversion
            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));

            // Saturation via HSB
            if (saturation != 0) {
                float[] hsb = Color.RGBtoHSB((int) r, (int) g, (int) b, null);
                hsb[1] = Math.max(0f, Math.min(1f, hsb[1] * sFactor));
                int adjusted = Color.HSBtoRGB(hsb[0], hsb[1], hsb[2]);
                r = (adjusted >> 16) & 0xFF;
                g = (adjusted >>  8) & 0xFF;
                b =  adjusted        & 0xFF;
            } else {
                r = Math.max(0, Math.min(255, r));
                g = Math.max(0, Math.min(255, g));
                b = Math.max(0, Math.min(255, b));
            }

            pixels[i] = (0xFF << 24) | ((int) r << 16) | ((int) g << 8) | (int) b;
        }

        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        out.setRGB(0, 0, w, h, pixels, 0, w);
        return out;
    }

    // ── Step 6: Encode ────────────────────────────────────────────────────────

    private byte[] encode(BufferedImage img, String format) throws IOException {
        boolean isJpeg = "jpg".equalsIgnoreCase(format) || "jpeg".equalsIgnoreCase(format);
        String  ioFmt  = isJpeg ? "jpeg" : "png";

        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        if (isJpeg) {
            // Use ImageWriter so we can set quality
            ImageWriter       writer = ImageIO.getImageWritersByFormatName("jpeg").next();
            ImageWriteParam   param  = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);

            // JPEG cannot encode alpha; convert to opaque RGB first
            BufferedImage opaque = toOpaque(img);
            try (ImageOutputStream ios = ImageIO.createImageOutputStream(baos)) {
                writer.setOutput(ios);
                writer.write(null, new IIOImage(opaque, null, null), param);
            } finally {
                writer.dispose();
            }
        } else {
            ImageIO.write(img, ioFmt, baos);
        }

        return baos.toByteArray();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Ensures the image uses TYPE_INT_RGB (no CMYK or indexed colour). */
    private BufferedImage ensureRGB(BufferedImage img) {
        if (img.getType() == BufferedImage.TYPE_INT_RGB
                || img.getType() == BufferedImage.TYPE_INT_ARGB) {
            return img;
        }
        BufferedImage out = new BufferedImage(img.getWidth(), img.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, img.getWidth(), img.getHeight());
        g.drawImage(img, 0, 0, null);
        g.dispose();
        return out;
    }

    /** Converts an image with potential alpha channel to opaque RGB for JPEG encoding. */
    private BufferedImage toOpaque(BufferedImage img) {
        if (img.getType() == BufferedImage.TYPE_INT_RGB) return img;
        BufferedImage out = new BufferedImage(img.getWidth(), img.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, img.getWidth(), img.getHeight());
        g.drawImage(img, 0, 0, null);
        g.dispose();
        return out;
    }
}
