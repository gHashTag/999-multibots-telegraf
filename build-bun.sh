#!/bin/bash
# Bun Docker Build Script
# Usage: ./build-bun.sh

echo "🚀 Starting Bun Docker build..."
echo "Start time: $(date)"
START=$(date +%s)

docker build -f Dockerfile.bun.fast -t 999-bun-test .

END=$(date +%s)
TOTAL=$((END - START))

echo ""
echo "✅ Build completed!"
echo "End time: $(date)"
echo "⏱️  Total time: ${TOTAL} seconds ($(($TOTAL / 60)) minutes $(($TOTAL % 60)) seconds)"
