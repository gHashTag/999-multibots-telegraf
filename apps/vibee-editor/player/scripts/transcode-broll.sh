#!/bin/bash
# transcode-broll.sh - Generate multi-quality B-roll variants
#
# Creates 360p, 720p, and 1080p versions of B-roll videos for adaptive quality
# Based on scientific ABR research for optimal bitrate ladder
#
# Quality Levels:
# - 360p: 500 Kbps - Mobile/low bandwidth
# - 720p: 1500 Kbps - Standard quality
# - 1080p: 4000 Kbps - High quality (from original)
#
# Usage: ./scripts/transcode-broll.sh [input_dir] [output_dir]
# Default: ./scripts/transcode-broll.sh public/backgrounds/business public/backgrounds/business

set -e

INPUT_DIR="${1:-public/backgrounds/business}"
OUTPUT_DIR="${2:-$INPUT_DIR}"

echo "🎬 B-Roll Transcoding Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Input:  $INPUT_DIR"
echo "Output: $OUTPUT_DIR"
echo ""

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg is not installed. Please install it first:"
    echo "   macOS: brew install ffmpeg"
    echo "   Ubuntu: sudo apt install ffmpeg"
    exit 1
fi

# Create output directory if needed
mkdir -p "$OUTPUT_DIR"

# Counter for processed files
processed=0
skipped=0

# Process each MP4 file
for video in "$INPUT_DIR"/*.mp4; do
    # Skip if no files found
    [ -e "$video" ] || continue

    filename=$(basename "$video" .mp4)

    # Skip files that are already quality variants
    if [[ "$filename" == *"_360p"* ]] || [[ "$filename" == *"_720p"* ]] || [[ "$filename" == *"_1080p"* ]]; then
        echo "⏭️  Skipping quality variant: $filename"
        ((skipped++))
        continue
    fi

    echo ""
    echo "📼 Processing: $filename.mp4"

    # 360p - 500 Kbps (mobile/low bandwidth)
    output_360p="${OUTPUT_DIR}/${filename}_360p.mp4"
    if [ ! -f "$output_360p" ]; then
        echo "   ├─ Encoding 360p (500 Kbps)..."
        ffmpeg -i "$video" \
            -vf "scale=-2:360" \
            -c:v libx264 \
            -preset fast \
            -b:v 500k \
            -maxrate 600k \
            -bufsize 1000k \
            -profile:v main \
            -level 3.1 \
            -movflags +faststart \
            -an \
            -y \
            "$output_360p" 2>/dev/null
        echo "   │  ✅ Created: ${filename}_360p.mp4"
    else
        echo "   │  ⏭️  360p exists, skipping"
    fi

    # 720p - 1500 Kbps (standard quality)
    output_720p="${OUTPUT_DIR}/${filename}_720p.mp4"
    if [ ! -f "$output_720p" ]; then
        echo "   ├─ Encoding 720p (1500 Kbps)..."
        ffmpeg -i "$video" \
            -vf "scale=-2:720" \
            -c:v libx264 \
            -preset fast \
            -b:v 1500k \
            -maxrate 1800k \
            -bufsize 3000k \
            -profile:v main \
            -level 4.0 \
            -movflags +faststart \
            -an \
            -y \
            "$output_720p" 2>/dev/null
        echo "   │  ✅ Created: ${filename}_720p.mp4"
    else
        echo "   │  ⏭️  720p exists, skipping"
    fi

    # 1080p - 4000 Kbps (high quality - re-encode original)
    output_1080p="${OUTPUT_DIR}/${filename}_1080p.mp4"
    if [ ! -f "$output_1080p" ]; then
        echo "   └─ Encoding 1080p (4000 Kbps)..."
        ffmpeg -i "$video" \
            -vf "scale=-2:1080" \
            -c:v libx264 \
            -preset fast \
            -b:v 4000k \
            -maxrate 4800k \
            -bufsize 8000k \
            -profile:v high \
            -level 4.2 \
            -movflags +faststart \
            -an \
            -y \
            "$output_1080p" 2>/dev/null
        echo "      ✅ Created: ${filename}_1080p.mp4"
    else
        echo "   └─ ⏭️  1080p exists, skipping"
    fi

    ((processed++))
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Transcoding complete!"
echo "   Processed: $processed videos"
echo "   Skipped:   $skipped variants"
echo ""
echo "📁 Output files in: $OUTPUT_DIR"
echo ""
echo "💡 Tip: Run 'ls -la $OUTPUT_DIR' to see all generated files"
