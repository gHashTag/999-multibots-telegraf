#!/bin/bash
# Bun Docker Build Script (Verbose Mode)
# Shows ALL logs in real-time

echo "🚀 Starting Bun Docker build (verbose mode)..."
echo "Start time: $(date)"
START=$(date +%s)

# --progress=plain shows ALL logs without buffering
docker build --progress=plain -f Dockerfile.bun.fast -t 999-bun-test .

END=$(date +%s)
TOTAL=$((END - START))

echo ""
echo "✅ Build completed!"
echo "End time: $(date)"
echo "⏱️  Total time: ${TOTAL} seconds ($(($TOTAL / 60)) minutes $(($TOTAL % 60)) seconds)"
