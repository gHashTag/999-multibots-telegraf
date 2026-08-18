#!/bin/bash
# optimize-videos.sh - Re-encode videos for optimal web delivery
#
# Problem: Current videos at 5.5 Mbps are 3-5x larger than needed
# Solution: Re-encode at CRF 28 (~1.5 Mbps) + VP9/WebM variants
#
# Expected Results:
# - bg00.mp4: 6.8 MB → ~1.5 MB (-78%)
# - Total: 45 MB → ~10 MB
# - Load time: 5.4s → 1.2s on 10 Mbps
#
# Research Basis:
# - Meta AV1 2025: 30% smaller than H.264
# - CRF 28: Sweet spot for quality/size (Netflix uses CRF 23-28)
#
# Usage: ./scripts/optimize-videos.sh [input_dir]

set -e

INPUT_DIR="${1:-public/backgrounds/business}"
QUALITY_H264=28    # CRF for H.264 (lower = better quality, larger file)
QUALITY_VP9=32     # CRF for VP9 (VP9 uses different scale)
QUALITY_AV1=35     # CRF for AV1 (AV1 uses different scale, 35 ≈ good quality)
PRESET="slow"      # slower = better compression

echo "🎬 Video Optimization Script (V3)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Input: $INPUT_DIR"
echo "H.264 CRF: $QUALITY_H264"
echo "VP9 CRF: $QUALITY_VP9"
echo ""

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg not installed"
    exit 1
fi

# Check for VP9 support
VP9_SUPPORTED=$(ffmpeg -encoders 2>/dev/null | grep -q libvpx-vp9 && echo "yes" || echo "no")
echo "VP9 encoder: $VP9_SUPPORTED"

# Check for AV1 support (SVT-AV1 is fastest, libaom-av1 is reference)
AV1_SUPPORTED=$(ffmpeg -encoders 2>/dev/null | grep -q libsvtav1 && echo "svt" || \
               (ffmpeg -encoders 2>/dev/null | grep -q libaom-av1 && echo "aom" || echo "no"))
echo "AV1 encoder: $AV1_SUPPORTED"
echo ""

processed=0
h264_saved=0
vp9_saved=0

for video in "$INPUT_DIR"/bg*.mp4; do
    [ -e "$video" ] || continue

    filename=$(basename "$video" .mp4)

    # Skip already optimized files
    [[ "$filename" == *"_opt"* ]] && continue
    [[ "$filename" == *"_360p"* ]] && continue
    [[ "$filename" == *"_720p"* ]] && continue

    original_size=$(stat -f%z "$video" 2>/dev/null || stat -c%s "$video" 2>/dev/null)
    original_mb=$(echo "scale=2; $original_size / 1048576" | bc)

    echo "📼 Processing: $filename.mp4 (${original_mb} MB)"

    # ══════════════════════════════════════════════
    # 1. Optimized H.264 (CRF 28)
    # ══════════════════════════════════════════════
    output_h264="${INPUT_DIR}/${filename}_opt.mp4"
    if [ ! -f "$output_h264" ]; then
        echo "   ├─ H.264 CRF $QUALITY_H264..."
        ffmpeg -i "$video" \
            -c:v libx264 \
            -crf $QUALITY_H264 \
            -preset $PRESET \
            -profile:v high \
            -level 4.1 \
            -pix_fmt yuv420p \
            -movflags +faststart \
            -an \
            -y "$output_h264" 2>/dev/null

        new_size=$(stat -f%z "$output_h264" 2>/dev/null || stat -c%s "$output_h264" 2>/dev/null)
        new_mb=$(echo "scale=2; $new_size / 1048576" | bc)
        savings=$(echo "scale=0; (1 - $new_size / $original_size) * 100" | bc)
        h264_saved=$((h264_saved + original_size - new_size))

        echo "   │  ✅ ${filename}_opt.mp4 (${new_mb} MB, -${savings}%)"
    else
        echo "   │  ⏭️  H.264 optimized exists"
    fi

    # ══════════════════════════════════════════════
    # 2. VP9/WebM (30% smaller than H.264)
    # ══════════════════════════════════════════════
    if [ "$VP9_SUPPORTED" = "yes" ]; then
        output_vp9="${INPUT_DIR}/${filename}.webm"
        if [ ! -f "$output_vp9" ]; then
            echo "   ├─ VP9 CRF $QUALITY_VP9..."
            ffmpeg -i "$video" \
                -c:v libvpx-vp9 \
                -crf $QUALITY_VP9 \
                -b:v 0 \
                -cpu-used 2 \
                -row-mt 1 \
                -tile-columns 2 \
                -tile-rows 1 \
                -frame-parallel 1 \
                -an \
                -y "$output_vp9" 2>/dev/null

            vp9_size=$(stat -f%z "$output_vp9" 2>/dev/null || stat -c%s "$output_vp9" 2>/dev/null)
            vp9_mb=$(echo "scale=2; $vp9_size / 1048576" | bc)
            vp9_savings=$(echo "scale=0; (1 - $vp9_size / $original_size) * 100" | bc)
            vp9_saved=$((vp9_saved + original_size - vp9_size))

            echo "   │  ✅ ${filename}.webm (${vp9_mb} MB, -${vp9_savings}%)"
        else
            echo "   │  ⏭️  VP9 exists"
        fi
    fi

    # ══════════════════════════════════════════════
    # 3. AV1/MP4 (50% smaller than H.264!)
    # Research: Meta/YouTube use AV1 for 70-75% of videos
    # ══════════════════════════════════════════════
    if [ "$AV1_SUPPORTED" != "no" ]; then
        output_av1="${INPUT_DIR}/${filename}.av1.mp4"
        if [ ! -f "$output_av1" ]; then
            echo "   ├─ AV1 CRF $QUALITY_AV1..."

            if [ "$AV1_SUPPORTED" = "svt" ]; then
                # SVT-AV1 (faster, Intel/Netflix)
                ffmpeg -i "$video" \
                    -c:v libsvtav1 \
                    -crf $QUALITY_AV1 \
                    -preset 6 \
                    -svtav1-params tune=0 \
                    -pix_fmt yuv420p \
                    -movflags +faststart \
                    -an \
                    -y "$output_av1" 2>/dev/null
            else
                # libaom-av1 (slower, reference encoder)
                ffmpeg -i "$video" \
                    -c:v libaom-av1 \
                    -crf $QUALITY_AV1 \
                    -cpu-used 4 \
                    -row-mt 1 \
                    -tiles 2x2 \
                    -pix_fmt yuv420p \
                    -movflags +faststart \
                    -an \
                    -y "$output_av1" 2>/dev/null
            fi

            if [ -f "$output_av1" ]; then
                av1_size=$(stat -f%z "$output_av1" 2>/dev/null || stat -c%s "$output_av1" 2>/dev/null)
                av1_mb=$(echo "scale=2; $av1_size / 1048576" | bc)
                av1_savings=$(echo "scale=0; (1 - $av1_size / $original_size) * 100" | bc)
                echo "   │  ✅ ${filename}.av1.mp4 (${av1_mb} MB, -${av1_savings}%)"
            else
                echo "   │  ❌ AV1 encoding failed"
            fi
        else
            echo "   │  ⏭️  AV1 exists"
        fi
    fi

    # ══════════════════════════════════════════════
    # 4. First frame JPEG (for instant placeholder)
    # ══════════════════════════════════════════════
    output_jpg="${INPUT_DIR}/${filename}_first.jpg"
    if [ ! -f "$output_jpg" ]; then
        echo "   └─ First frame..."
        ffmpeg -i "$video" \
            -vframes 1 \
            -q:v 2 \
            -vf "scale=1080:-2" \
            -y "$output_jpg" 2>/dev/null
        echo "      ✅ ${filename}_first.jpg"
    else
        echo "   └─ ⏭️  First frame exists"
    fi

    ((processed++))
    echo ""
done

# Summary
h264_saved_mb=$(echo "scale=2; $h264_saved / 1048576" | bc)
vp9_saved_mb=$(echo "scale=2; $vp9_saved / 1048576" | bc)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Optimization complete!"
echo "   Videos processed: $processed"
echo "   H.264 savings: ${h264_saved_mb} MB"
echo "   VP9 savings: ${vp9_saved_mb} MB"
echo ""
echo "💡 To use optimized videos, update your code to use:"
echo "   - H.264: bg00_opt.mp4 instead of bg00.mp4"
echo "   - VP9:   bg00.webm for Chrome/Firefox"
