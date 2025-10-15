#!/bin/bash

# 🤖 Bot Financial Reports Generator
# Wrapper script for easy execution of financial report generation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Bot Financial Reports Generator"
echo "=================================="

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd "$PROJECT_DIR"
    npm install
fi

# Ensure reports directory exists
REPORTS_DIR="$PROJECT_DIR/reports"
mkdir -p "$REPORTS_DIR"

# Run the financial report generator
echo "📊 Generating financial reports..."
cd "$PROJECT_DIR"

if [ $# -eq 0 ]; then
    echo "📝 Usage:"
    echo "  $0 <bot-name>                    # Generate report for specific bot"
    echo "  $0 --all                         # Generate reports for all bots"
    echo "  $0 <bot-name> --upload           # Generate and upload report"
    echo "  $0 <bot-name> --period=60        # Generate report for last 60 days"
    echo ""
    echo "📋 Available options:"
    echo "  --upload     Upload report to accessible location"
    echo "  --period=N   Set period in days (default: 30)"
    echo "  --all        Process all bots"
    echo ""
    echo "💡 Examples:"
    echo "  $0 neuro_blogger_bot"
    echo "  $0 neuro_blogger_bot --upload --period=90"
    echo "  $0 --all"
    exit 1
fi

# Execute the Node.js script with all arguments
node "$SCRIPT_DIR/bot-financial-report.js" "$@"

echo ""
echo "📁 Reports saved in: $REPORTS_DIR"
echo "✅ Report generation completed!"