package com.creativeops.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Payload sent by the frontend for every export request.
 * Supports both image and video media types.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ProcessRequest {

    // ── Target ─────────────────────────────────────────────────────────────────

    /** "image" or "video" */
    private String type;

    /** Target width in pixels (e.g. 1080) */
    private int targetWidth;

    /** Target height in pixels (e.g. 1920) */
    private int targetHeight;

    /** Output format: "jpg", "png", "webp", "mp4" */
    private String outputFormat;

    // ── Color adjustments (-100 to +100, 0 = neutral) ─────────────────────────

    private float brightness;
    private float contrast;
    private float saturation;

    // ── Geometric transforms ──────────────────────────────────────────────────

    /** Clockwise rotation: 0, 90, 180, or 270 */
    private int rotation;

    private boolean flipHorizontal;
    private boolean flipVertical;

    /**
     * Fractional horizontal crop shift (-0.5 to 0.5).
     * 0 = centred crop; positive = shift crop window right (reveal right side).
     */
    private float cropOffsetX;

    /**
     * Fractional vertical crop shift (-0.5 to 0.5).
     * 0 = centred crop; positive = shift crop window down (reveal bottom side).
     */
    private float cropOffsetY;

    // ── Video-only ────────────────────────────────────────────────────────────

    /** Trim start in seconds (0 = no trim) */
    private float trimStart;

    /** Trim end in seconds (0 = full length) */
    private float trimEnd;

    /** Strip audio track from output */
    private boolean muteAudio;

    // ── Getters / setters ─────────────────────────────────────────────────────

    public String getType()                 { return type; }
    public void   setType(String v)         { this.type = v; }

    public int    getTargetWidth()          { return targetWidth; }
    public void   setTargetWidth(int v)     { this.targetWidth = v; }

    public int    getTargetHeight()         { return targetHeight; }
    public void   setTargetHeight(int v)    { this.targetHeight = v; }

    public String getOutputFormat()         { return outputFormat; }
    public void   setOutputFormat(String v) { this.outputFormat = v; }

    public float  getBrightness()           { return brightness; }
    public void   setBrightness(float v)    { this.brightness = v; }

    public float  getContrast()             { return contrast; }
    public void   setContrast(float v)      { this.contrast = v; }

    public float  getSaturation()           { return saturation; }
    public void   setSaturation(float v)    { this.saturation = v; }

    public int    getRotation()             { return rotation; }
    public void   setRotation(int v)        { this.rotation = v; }

    public boolean isFlipHorizontal()       { return flipHorizontal; }
    public void    setFlipHorizontal(boolean v) { this.flipHorizontal = v; }

    public boolean isFlipVertical()         { return flipVertical; }
    public void    setFlipVertical(boolean v)   { this.flipVertical = v; }

    public float  getCropOffsetX()          { return cropOffsetX; }
    public void   setCropOffsetX(float v)   { this.cropOffsetX = v; }

    public float  getCropOffsetY()          { return cropOffsetY; }
    public void   setCropOffsetY(float v)   { this.cropOffsetY = v; }

    public float  getTrimStart()            { return trimStart; }
    public void   setTrimStart(float v)     { this.trimStart = v; }

    public float  getTrimEnd()              { return trimEnd; }
    public void   setTrimEnd(float v)       { this.trimEnd = v; }

    public boolean isMuteAudio()            { return muteAudio; }
    public void    setMuteAudio(boolean v)  { this.muteAudio = v; }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public boolean isImage() { return "image".equalsIgnoreCase(type); }
    public boolean isVideo() { return "video".equalsIgnoreCase(type); }

    /**
     * When rotation is 90° or 270° the effective crop aspect is the transpose
     * of the target dimensions.
     */
    public boolean isRotated90() {
        return rotation == 90 || rotation == 270;
    }

    public int effectiveDrawWidth()  { return isRotated90() ? targetHeight : targetWidth; }
    public int effectiveDrawHeight() { return isRotated90() ? targetWidth  : targetHeight; }
}
