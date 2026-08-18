#!/bin/bash
#
# Generate Sprite Sheet Thumbnails + WebVTT
#
# Research (2025):
# - Single sprite image = -90% HTTP requests
# - WebVTT format for seek bar previews
#
# Usage: ./generate-sprites.sh [input_dir]
#
# @see https://www.fastpix.io/blog/create-video-previews-with-sprite-sheets-for-streaming

set -e

INPUT_DIR="${1:-public/backgrounds/business}"

# Sprite settings
THUMB_WIDTH=160
THUMB_HEIGHT=90
COLUMNS=10
INTERVAL=2  # seconds between thumbnails

echo "🖼️  Sprite Sheet Generator"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Input: $INPUT_DIR"
echo "Thumbnail size: ${THUMB_WIDTH}x${THUMB_HEIGHT}"
echo "Interval: ${INTERVAL}s"
echo ""

# Check ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ ffmpeg not found. Please install ffmpeg."
    exit 1
fi

# Process each video
for video in "$INPUT_DIR"/*.mp4; do
    filename=$(basename "$video" .mp4)

    # Skip optimized/av1 variants
    [[ "$filename" == *"_opt"* ]] && continue
    [[ "$filename" == *".av1"* ]] && continue

    # Skip if sprite already exists
    sprite_file="$INPUT_DIR/${filename}_sprite.jpg"
    vtt_file="$INPUT_DIR/${filename}_sprite.vtt"

    if [ -f "$sprite_file" ] && [ -f "$vtt_file" ]; then
        echo "⏭️  Skipping $filename (sprite exists)"
        continue
    fi

    echo "📼 Processing: $filename"

    # Get video duration
    duration=$(ffprobe -v error -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 "$video" 2>/dev/null)
    duration_int=${duration%.*}

    # Calculate number of thumbnails
    num_thumbs=$((duration_int / INTERVAL))
    [ $num_thumbs -lt 1 ] && num_thumbs=1
    [ $num_thumbs -gt 100 ] && num_thumbs=100  # Cap at 100 thumbs

    # Calculate rows needed
    rows=$(( (num_thumbs + COLUMNS - 1) / COLUMNS ))

    echo "   ├─ Duration: ${duration_int}s"
    echo "   ├─ Thumbnails: $num_thumbs (${COLUMNS}x${rows})"

    # ══════════════════════════════════════════════
    # 1. Generate sprite sheet
    # ══════════════════════════════════════════════
    echo "   ├─ Generating sprite..."

    ffmpeg -i "$video" \
        -vf "fps=1/${INTERVAL},scale=${THUMB_WIDTH}:${THUMB_HEIGHT},tile=${COLUMNS}x${rows}" \
        -frames:v 1 \
        -q:v 5 \
        -y "$sprite_file" 2>/dev/null

    if [ -f "$sprite_file" ]; then
        sprite_size=$(stat -f%z "$sprite_file" 2>/dev/null || stat -c%s "$sprite_file" 2>/dev/null)
        sprite_kb=$((sprite_size / 1024))
        echo "   │  ✅ ${filename}_sprite.jpg (${sprite_kb} KB)"
    else
        echo "   │  ❌ Sprite generation failed"
        continue
    fi

    # ══════════════════════════════════════════════
    # 2. Generate WebVTT file
    # ══════════════════════════════════════════════
    echo "   └─ Generating WebVTT..."

    # WebVTT header
    echo "WEBVTT" > "$vtt_file"
    echo "" >> "$vtt_file"

    # Generate cues
    thumb_index=0
    for ((t=0; t<duration_int && thumb_index<num_thumbs; t+=INTERVAL)); do
        # Calculate grid position
        col=$((thumb_index % COLUMNS))
        row=$((thumb_index / COLUMNS))
        x=$((col * THUMB_WIDTH))
        y=$((row * THUMB_HEIGHT))

        # Calculate time codes
        start_h=$((t / 3600))
        start_m=$(((t % 3600) / 60))
        start_s=$((t % 60))

        end_t=$((t + INTERVAL))
        [ $end_t -gt $duration_int ] && end_t=$duration_int
        end_h=$((end_t / 3600))
        end_m=$(((end_t % 3600) / 60))
        end_s=$((end_t % 60))

        # Write cue
        printf "%02d:%02d:%02d.000 --> %02d:%02d:%02d.000\n" \
            $start_h $start_m $start_s \
            $end_h $end_m $end_s \
            >> "$vtt_file"
        echo "${filename}_sprite.jpg#xywh=${x},${y},${THUMB_WIDTH},${THUMB_HEIGHT}" >> "$vtt_file"
        echo "" >> "$vtt_file"

        ((thumb_index++))
    done

    echo "      ✅ ${filename}_sprite.vtt ($thumb_index cues)"
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Sprite generation complete!"
echo ""
echo "💡 Usage in player:"
echo "   <track kind=\"metadata\" src=\"${filename}_sprite.vtt\" />"
