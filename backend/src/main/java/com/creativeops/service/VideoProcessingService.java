package com.creativeops.service;

import com.creativeops.model.ProcessRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Processes videos using FFmpeg (must be installed and on the system PATH).
 *
 * Pipeline built via a single -vf filter chain:
 *   crop → scale → rotate/transpose → flip → eq (colour)
 *
 * Audio can optionally be stripped. Trim is applied with -ss / -t flags.
 */
@Service
public class VideoProcessingService {

    private static final Logger log = LoggerFactory.getLogger(VideoProcessingService.class);

    @Value("${format.adapter.temp-dir:}")
    private String configuredTempDir;

    // ── Public entry point ────────────────────────────────────────────────────

    public byte[] process(MultipartFile file, ProcessRequest req) throws IOException, InterruptedException {
        verifyFfmpegAvailable();

        Path tmpDir  = resolveTempDir();
        String uid   = UUID.randomUUID().toString();
        Path inFile  = tmpDir.resolve(uid + "-input"  + extensionOf(file));
        Path outFile = tmpDir.resolve(uid + "-output.mp4");

        file.transferTo(inFile.toFile());

        try {
            int[] dims = probeDimensions(inFile);
            List<String> cmd = buildCommand(inFile, outFile, dims, req);

            log.info("FFmpeg command: {}", String.join(" ", cmd));

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);   // merge stderr into stdout for logging
            Process proc = pb.start();

            String output = new String(proc.getInputStream().readAllBytes());
            int    exit   = proc.waitFor();

            if (exit != 0) {
                throw new IOException("FFmpeg exited with code " + exit + ":\n" + output);
            }

            return Files.readAllBytes(outFile);
        } finally {
            silentDelete(inFile);
            silentDelete(outFile);
        }
    }

    // ── FFmpeg command builder ────────────────────────────────────────────────

    private List<String> buildCommand(Path in, Path out, int[] srcDims, ProcessRequest req) {
        List<String> cmd = new ArrayList<>();
        cmd.add("ffmpeg");
        cmd.add("-y");  // overwrite without asking

        // Trim start (seek before input for fast seeking)
        if (req.getTrimStart() > 0) {
            cmd.add("-ss");
            cmd.add(String.valueOf(req.getTrimStart()));
        }

        cmd.add("-i");
        cmd.add(in.toString());

        // Trim duration
        if (req.getTrimEnd() > 0 && req.getTrimEnd() > req.getTrimStart()) {
            cmd.add("-t");
            cmd.add(String.format("%.3f", req.getTrimEnd() - req.getTrimStart()));
        }

        // Build video filter chain
        String vf = buildVideoFilterChain(srcDims[0], srcDims[1], req);
        if (!vf.isBlank()) {
            cmd.add("-vf");
            cmd.add(vf);
        }

        // Audio
        if (req.isMuteAudio()) {
            cmd.add("-an");
        } else {
            cmd.add("-c:a");
            cmd.add("aac");
            cmd.add("-b:a");
            cmd.add("128k");
        }

        // Video codec
        cmd.add("-c:v");
        cmd.add("libx264");
        cmd.add("-preset");
        cmd.add("fast");
        cmd.add("-crf");
        cmd.add("23");
        cmd.add("-pix_fmt");
        cmd.add("yuv420p");   // broad compatibility (iOS, browser)
        cmd.add("-movflags");
        cmd.add("+faststart");

        cmd.add(out.toString());
        return cmd;
    }

    private String buildVideoFilterChain(int srcW, int srcH, ProcessRequest req) {
        List<String> filters = new ArrayList<>();

        // 1. Crop to target aspect ratio
        int drawW = req.effectiveDrawWidth();
        int drawH = req.effectiveDrawHeight();
        addCropFilter(filters, srcW, srcH, drawW, drawH, req.getCropOffsetX(), req.getCropOffsetY());

        // 2. Scale to exact target dimensions
        filters.add(String.format("scale=%d:%d", drawW, drawH));

        // 3. Rotation via transpose
        switch (req.getRotation()) {
            case 90  -> filters.add("transpose=1");          // 90° CW
            case 180 -> filters.add("transpose=2,transpose=2"); // 180°
            case 270 -> filters.add("transpose=2");          // 90° CCW
            default  -> { /* no-op */ }
        }

        // 4. Flip
        if (req.isFlipHorizontal()) filters.add("hflip");
        if (req.isFlipVertical())   filters.add("vflip");

        // 5. Colour adjustments via eq filter
        buildEqFilter(filters, req.getBrightness(), req.getContrast(), req.getSaturation());

        return String.join(",", filters);
    }

    /**
     * Adds an FFmpeg crop filter expression that replicates the frontend center-crop
     * with optional offset.
     */
    private void addCropFilter(List<String> filters, int srcW, int srcH,
                                int drawW, int drawH,
                                float cropOffsetX, float cropOffsetY) {
        double destRatio = (double) drawW / drawH;
        double srcRatio  = (double) srcW  / srcH;

        int cropW, cropH, cropX, cropY;

        if (srcRatio > destRatio) {
            cropH = srcH;
            cropW = (int) Math.round(cropH * destRatio);
            int maxX  = srcW - cropW;
            int baseX = maxX / 2;
            int offX  = (int) Math.round(cropOffsetX * srcW);
            cropX = Math.max(0, Math.min(maxX, baseX + offX));
            cropY = 0;
        } else {
            cropW = srcW;
            cropH = (int) Math.round(cropW / destRatio);
            int maxY  = srcH - cropH;
            int baseY = maxY / 2;
            int offY  = (int) Math.round(cropOffsetY * srcH);
            cropX = 0;
            cropY = Math.max(0, Math.min(maxY, baseY + offY));
        }

        filters.add(String.format("crop=%d:%d:%d:%d", cropW, cropH, cropX, cropY));
    }

    /**
     * Adds an FFmpeg eq filter for brightness / contrast / saturation.
     *
     * Mapping from our -100..+100 range to FFmpeg eq ranges:
     *  brightness: -1.0 to 1.0  (0 = neutral)
     *  contrast:    0.0 to 2.0  (1 = neutral)
     *  saturation:  0.0 to 3.0  (1 = neutral) — we cap at 2.0
     */
    private void buildEqFilter(List<String> filters, float brightness, float contrast, float saturation) {
        if (brightness == 0 && contrast == 0 && saturation == 0) return;

        float bVal = brightness / 100f;               // -1 to 1
        float cVal = 1f + contrast   / 100f;          // 0 to 2
        float sVal = 1f + saturation / 100f;          // 0 to 2

        // Clamp
        bVal = Math.max(-1f, Math.min(1f, bVal));
        cVal = Math.max(0f,  Math.min(3f, cVal));
        sVal = Math.max(0f,  Math.min(3f, sVal));

        filters.add(String.format("eq=brightness=%.4f:contrast=%.4f:saturation=%.4f", bVal, cVal, sVal));
    }

    // ── FFprobe — get source dimensions ──────────────────────────────────────

    private int[] probeDimensions(Path videoFile) throws IOException, InterruptedException {
        List<String> cmd = List.of(
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_streams", "-select_streams", "v:0",
            videoFile.toString()
        );

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process proc   = pb.start();
        String  output = new String(proc.getInputStream().readAllBytes());
        proc.waitFor();

        int w = extractJsonInt(output, "width");
        int h = extractJsonInt(output, "height");

        if (w <= 0 || h <= 0) {
            log.warn("Could not detect video dimensions via ffprobe; defaulting to 1920×1080");
            return new int[]{1920, 1080};
        }
        return new int[]{w, h};
    }

    private int extractJsonInt(String json, String key) {
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*(\\d+)").matcher(json);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    private void verifyFfmpegAvailable() throws IOException {
        try {
            Process p = new ProcessBuilder("ffmpeg", "-version").start();
            p.waitFor();
        } catch (IOException | InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(
                "FFmpeg is not installed or not on the system PATH. " +
                "Please install FFmpeg (https://ffmpeg.org/download.html) and restart the server.", e);
        }
    }

    private Path resolveTempDir() throws IOException {
        if (configuredTempDir != null && !configuredTempDir.isBlank()) {
            Path dir = Paths.get(configuredTempDir);
            Files.createDirectories(dir);
            return dir;
        }
        return Files.createTempDirectory("creativeops-format-");
    }

    private String extensionOf(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name != null && name.contains(".")) {
            return name.substring(name.lastIndexOf('.'));
        }
        return ".mp4";
    }

    private void silentDelete(Path path) {
        try { Files.deleteIfExists(path); } catch (IOException ignored) { /* best-effort */ }
    }
}
