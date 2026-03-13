package com.creativeops.controller;

import com.creativeops.model.ProcessRequest;
import com.creativeops.service.ImageProcessingService;
import com.creativeops.service.VideoProcessingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * REST controller for the Format Adapter backend.
 *
 * Endpoints:
 *   GET  /api/format/health   — liveness check
 *   POST /api/format/process  — process an image or video
 */
@RestController
@RequestMapping("/api/format")
@CrossOrigin(origins = "*")
public class FormatController {

    private static final Logger log = LoggerFactory.getLogger(FormatController.class);

    private final ImageProcessingService imageService;
    private final VideoProcessingService videoService;
    private final ObjectMapper           mapper;

    public FormatController(ImageProcessingService imageService,
                            VideoProcessingService videoService,
                            ObjectMapper mapper) {
        this.imageService = imageService;
        this.videoService = videoService;
        this.mapper       = mapper;
    }

    // ── Health check ──────────────────────────────────────────────────────────

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }

    // ── Process ───────────────────────────────────────────────────────────────

    /**
     * Accepts a multipart form with:
     *   - file    : the source media file
     *   - request : JSON string matching {@link ProcessRequest}
     */
    @PostMapping(value = "/process", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> process(
            @RequestPart("file")    MultipartFile file,
            @RequestPart("request") String        requestJson) {

        try {
            ProcessRequest req = mapper.readValue(requestJson, ProcessRequest.class);
            validateRequest(req);

            log.info("Processing {} — preset {}×{} — format {}",
                     req.getType(), req.getTargetWidth(), req.getTargetHeight(), req.getOutputFormat());

            byte[]      data        = dispatch(file, req);
            MediaType   contentType = resolveContentType(req.getOutputFormat());
            String      filename    = buildFilename(req);

            return ResponseEntity.ok()
                    .contentType(contentType)
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                    .body(data);

        } catch (IllegalArgumentException e) {
            log.warn("Bad request: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            log.error("Processing failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private byte[] dispatch(MultipartFile file, ProcessRequest req) throws Exception {
        if (req.isVideo()) {
            return videoService.process(file, req);
        }
        return imageService.process(file, req);
    }

    private void validateRequest(ProcessRequest req) {
        if (req.getTargetWidth()  <= 0) throw new IllegalArgumentException("targetWidth must be > 0");
        if (req.getTargetHeight() <= 0) throw new IllegalArgumentException("targetHeight must be > 0");
        if (req.getType() == null || req.getType().isBlank())
            throw new IllegalArgumentException("type must be 'image' or 'video'");
    }

    private MediaType resolveContentType(String fmt) {
        if (fmt == null) return MediaType.APPLICATION_OCTET_STREAM;
        return switch (fmt.toLowerCase()) {
            case "jpg", "jpeg" -> MediaType.IMAGE_JPEG;
            case "png"         -> MediaType.IMAGE_PNG;
            case "mp4"         -> MediaType.parseMediaType("video/mp4");
            default            -> MediaType.APPLICATION_OCTET_STREAM;
        };
    }

    private String buildFilename(ProcessRequest req) {
        String ext = switch ((req.getOutputFormat() == null ? "jpg" : req.getOutputFormat()).toLowerCase()) {
            case "jpeg"        -> "jpg";
            case "mp4"         -> "mp4";
            case "png"         -> "png";
            default            -> req.getOutputFormat().toLowerCase();
        };
        return String.format("adapted_%dx%d.%s", req.getTargetWidth(), req.getTargetHeight(), ext);
    }
}
