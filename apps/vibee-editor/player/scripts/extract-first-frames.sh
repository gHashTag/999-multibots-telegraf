#!/bin/bash
# extract-first-frames.sh - Extract first frame as JPEG for instant visual feedback
#
# Based on TTFF research: <400ms critical threshold, 87% abandon at 2s delay
# JPEG first frames provide instant visual feedback while video loads
#
# Usage: ./scripts/extract-first-frames.sh [input_dir]
# Default: ./scripts/extract-first-frames.sh public/backgrounds/business

set -e

INPUT_DIR="${1:-public/backgrounds/business}"

echo "🖼️  First-Frame Extraction Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Input: $INPUT_DIR"
echo ""

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg is not installed. Please install it first:"
    echo "   macOS: brew install ffmpeg"
    echo "   Ubuntu: sudo apt install ffmpeg"
    exit 1
fi

# Counter for processed files
processed=0
skipped=0

# Process each MP4 file
for video in "$INPUT_DIR"/*.mp4; do
    # Skip if no files found
    [ -e "$video" ] || continue

    filename=$(basename "$video" .mp4)

    # Skip quality variants
    if [[ "$filename" == *"_360p"* ]] || [[ "$filename" == *"_720p"* ]] || [[ "$filename" == *"_1080p"* ]]; then
        echo "⏭️  Skipping variant: $filename"
        ((skipped++))
        continue
    fi

    output_jpg="${INPUT_DIR}/${filename}_first.jpg"

    if [ ! -f "$output_jpg" ]; then
        echo "📸 Extracting: $filename.mp4 → ${filename}_first.jpg"
        ffmpeg -i "$video" \
            -vframes 1 \
            -q:v 2 \
            -vf "scale=1080:-2" \
            -y \
            "$output_jpg" 2>/dev/null
        echo "   ✅ Created: ${filename}_first.jpg"
        ((processed++))
    else
        echo "⏭️  Already exists: ${filename}_first.jpg"
        ((skipped++))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Extraction complete!"
echo "   Processed: $processed frames"
echo "   Skipped:   $skipped files"
