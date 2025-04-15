#!/bin/bash

# Colors for emotional output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Base paths
SCRIPTS_ROOT="/Users/playra/999-multibots-telegraf/scripts"
CORE_SCRIPTS="${SCRIPTS_ROOT}/core"
AI_SCRIPTS="${SCRIPTS_ROOT}/ai"
AUTOMATION_SCRIPTS="${SCRIPTS_ROOT}/automation"

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

check_directory() {
    local dir=$1
    local name=$2

    emotional_echo "working" "Checking directory: $name ($dir)"

    if [ ! -d "$dir" ]; then
        emotional_echo "error" "Directory $name does not exist!"
        return 1
    fi

    if [ ! -r "$dir" ]; then
        emotional_echo "error" "Directory $name is not readable!"
        return 1
    fi

    emotional_echo "success" "Directory $name is OK"
    return 0
}

check_required_scripts() {
    local dir=$1
    local name=$2
    local errors=0

    emotional_echo "working" "Checking required scripts in $name..."

    for script in "$dir"/*.sh; do
        if [ -f "$script" ]; then
            if [ ! -x "$script" ]; then
                emotional_echo "error" "Script $(basename "$script") is not executable!"
                errors=$((errors + 1))
            fi
        fi
    done

    if [ $errors -eq 0 ]; then
        emotional_echo "success" "All scripts in $name are executable"
        return 0
    else
        emotional_echo "sad" "Found $errors non-executable scripts in $name"
        return 1
    fi
}

main() {
    local errors=0

    emotional_echo "excited" "Starting path checks! 🚀"

    # Check main directories
    check_directory "$SCRIPTS_ROOT" "Scripts Root" || errors=$((errors + 1))
    check_directory "$CORE_SCRIPTS" "Core Scripts" || errors=$((errors + 1))
    check_directory "$AI_SCRIPTS" "AI Scripts" || errors=$((errors + 1))
    check_directory "$AUTOMATION_SCRIPTS" "Automation Scripts" || errors=$((errors + 1))

    # Check scripts in each directory
    check_required_scripts "$CORE_SCRIPTS" "Core Scripts" || errors=$((errors + 1))
    check_required_scripts "$AI_SCRIPTS" "AI Scripts" || errors=$((errors + 1))
    check_required_scripts "$AUTOMATION_SCRIPTS" "Automation Scripts" || errors=$((errors + 1))

    if [ $errors -eq 0 ]; then
        emotional_echo "happy" "All path checks passed successfully! 🎉"
        return 0
    else
        emotional_echo "sad" "Found $errors issues during path checks 😢"
        return 1
    fi
}

main "$@" 