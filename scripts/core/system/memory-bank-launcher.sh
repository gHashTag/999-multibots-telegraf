#!/bin/bash

# Colors for emotional output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Base path to scripts
SCRIPTS_ROOT="/Users/playra/999-multibots-telegraf/scripts"

# Emotions with emojis
declare -A EMOTIONS=(
    ["happy"]="😊"
    ["sad"]="😢"
    ["worried"]="😟"
    ["excited"]="🎉"
    ["working"]="🔧"
    ["error"]="❌"
    ["success"]="✅"
)

emotional_echo() {
    local emotion=$1
    local message=$2
    local color

    case $emotion in
        "happy") color=$GREEN ;;
        "sad") color=$RED ;;
        "worried") color=$YELLOW ;;
        "excited") color=$BLUE ;;
        "working") color=$PURPLE ;;
        "error") color=$RED ;;
        "success") color=$GREEN ;;
        *) color=$NC ;;
    esac

    echo -e "${color}${EMOTIONS[$emotion]} $message${NC}"
}

launch_script() {
    local script_path=$1
    local script_name=$(basename "$script_path")

    if [ ! -f "$script_path" ]; then
        emotional_echo "error" "Script not found: $script_name"
        return 1
    fi

    if [ ! -x "$script_path" ]; then
        emotional_echo "error" "Script not executable: $script_name"
        chmod +x "$script_path"
        emotional_echo "working" "Made script executable: $script_name"
    fi

    emotional_echo "working" "Launching $script_name..."
    "$script_path"
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        emotional_echo "success" "$script_name completed successfully!"
    else
        emotional_echo "error" "$script_name failed with exit code $exit_code"
    fi

    return $exit_code
}

main() {
    emotional_echo "excited" "🌈 Memory Bank Launcher Starting..."

    # Launch rainbow-bridge.sh as the main control script
    launch_script "$SCRIPTS_ROOT/rainbow-bridge.sh"

    emotional_echo "happy" "Memory Bank Launcher completed! 🎉"
}

main "$@" 