#!/bin/bash

# Colors for emotional output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Emotional echo function
emotional_echo() {
  local message=$1
  local emotion=$2
  local emoji=""
  
  case $emotion in
    "happy") emoji="😊";;
    "sad") emoji="😢";;
    "excited") emoji="🎉";;
    "worried") emoji="😰";;
    "love") emoji="💖";;
    "rainbow") emoji="🌈";;
    *) emoji="ℹ️";;
  esac
  
  echo -e "${CYAN}${emoji} ${message}${NC}"
}

# Check if file exists
check_file() {
  local file=$1
  if [ ! -f "$file" ]; then
    emotional_echo "Oh no! File $file not found!" "sad"
    exit 1
  fi
  emotional_echo "Yay! Found file $file" "happy"
}

# Create backup
create_backup() {
  local file=$1
  local backup="${file}.backup"
  cp "$file" "$backup"
  emotional_echo "Created backup with love 💝" "love"
}

# Save history
save_history() {
  local file=$1
  local history_dir=".history"
  local date_stamp=$(date +%Y-%m-%d_%H-%M-%S)
  local history_file="${history_dir}/${file##*/}_${date_stamp}"
  
  mkdir -p "$history_dir"
  cp "$file" "$history_file"
  emotional_echo "History saved with joy! 🎈" "excited"
}

# Analyze changes
analyze_changes() {
  local file=$1
  local backup="${file}.backup"
  
  local added=$(diff "$backup" "$file" | grep "^>" | wc -l)
  local removed=$(diff "$backup" "$file" | grep "^<" | wc -l)
  
  emotional_echo "Change Analysis 📊" "rainbow"
  echo -e "${GREEN}Added: $added lines${NC}"
  echo -e "${RED}Removed: $removed lines${NC}"
  
  if [ $removed -gt 0 ]; then
    emotional_echo "Warning: Content was removed! Please check carefully!" "worried"
  fi
}

# Get file stats
get_file_stats() {
  local file=$1
  local size=$(wc -c < "$file")
  local lines=$(wc -l < "$file")
  local checksum=$(md5sum "$file" | cut -d' ' -f1)
  
  emotional_echo "File Statistics 📈" "excited"
  echo -e "${BLUE}Size: $size bytes${NC}"
  echo -e "${BLUE}Lines: $lines${NC}"
  echo -e "${BLUE}Checksum: $checksum${NC}"
}

# Main function
main() {
  local file=$1
  
  emotional_echo "Welcome to Emotional History Saver! 🌈" "rainbow"
  emotional_echo "Let's save some history with love! 💖" "love"
  
  check_file "$file"
  create_backup "$file"
  save_history "$file"
  analyze_changes "$file"
  get_file_stats "$file"
  
  emotional_echo "History saved successfully! Have a wonderful day! 🌟" "excited"
}

# Check if argument is provided
if [ $# -eq 0 ]; then
  emotional_echo "Please provide a file name! 🙏" "sad"
  exit 1
fi

main "$1" 