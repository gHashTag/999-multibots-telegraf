#!/bin/bash

# Очистка от вспомогательных файлов перед коммитом
echo "🧹 Автоматическая очистка перед изменениями"

# Переход в корень репозитория
cd "$(git rev-parse --show-toplevel)"

# Функция для безопасного удаления файлов
safe_remove() {
    local file="$1"
    if [ -f "$file" ]; then
        echo "  🗑️  Удаляю: $file"
        rm "$file"
    fi
}

# Функция для безопасного удаления директорий
safe_remove_dir() {
    local dir="$1"
    if [ -d "$dir" ]; then
        echo "  📂 Удаляю директорию: $dir"
        rm -rf "$dir"
    fi
}

# Массив временных файлов для удаления
TEMP_FILES=(
    "deep-balance-audit.js"
    "demo-self-healing-standalone.js" 
    "demo-self-healing-system.js"
    "security-edge-cases-audit.js"
    "calculate-correct-prices.js"
    "test-corrected-prices.js"
    "test-keyboard-compatibility.js"
    "test-models-simple.js"
    "test-real-kie-prices.js"
    "test-replicate-text.js"
    "recalculate-exact-price.js"
    "dev-debug.log"
    "tasks.json"
    ".vault_password"
)

# Удаление временных файлов
for file in "${TEMP_FILES[@]}"; do
    safe_remove "$file"
done

# Удаление временных скриптов анализа по маскам
find . -maxdepth 3 \( \
    -name "*_anomaly_correction_report.json" -o \
    -name "*_refund_anomalies_report.json" -o \
    -name "backup_before_corrections_*.json" -o \
    -name "ludmila_*.json" -o \
    -name "model_training_*.json" \
\) -delete 2>/dev/null

# Удаление временных тестовых файлов
find . -maxdepth 3 \( \
    -name "test_*.ts" -o \
    -name "check_*.ts" \
\) -not -path "./src/__tests__/*" -not -path "./__tests__/*" -delete 2>/dev/null

# Массив директорий для удаления
TEMP_DIRS=(
    "tmp"
    "temp"
    "uploads"
    "src/uploads"
    "tmp_tests"
    "logs"
    "dist"
    "build"
    "coverage"
    "html-report"
    "tasks"
    ".idea"
    ".vscode"
    "ready_morphing_videos"
    "scripts/testing"
    "scripts/analytics"
)

# Удаление временных директорий
for dir in "${TEMP_DIRS[@]}"; do
    safe_remove_dir "$dir"
done

# Удаление медиа файлов из assets
ASSET_DIRS=(
    "assets/bible_vibecoder"
    "assets/bible_vibecoder_upscaled"
    "assets/clip_templates_storyboard"
    "assets/lipsync_storyboard"
    "assets/music_video_frames"
    "assets/temp_reels_images"
)

for dir in "${ASSET_DIRS[@]}"; do
    safe_remove_dir "$dir"
done

# Удаление медиа файлов в assets по расширениям
if [ -d "assets" ]; then
    find assets -type f \( \
        -name "*.mp4" -o \
        -name "*.mp3" -o \
        -name "*.mov" -o \
        -name "*.avi" -o \
        -name "*.mkv" -o \
        -name "*.wav" -o \
        -name "*.aac" \
    \) -delete 2>/dev/null
fi

# Удаление директорий temp_*
find . -maxdepth 2 -name "temp_*" -type d -exec rm -rf {} + 2>/dev/null

# Удаление логов (кроме node_modules)
find . -name "*.log" -not -path "./node_modules/*" -delete 2>/dev/null
find . -name "*.log.*" -delete 2>/dev/null

# Удаление env файлов (кроме примеров)
find . -maxdepth 2 -name ".env*" -not -name ".env.example" -not -name ".env.sample" -delete 2>/dev/null

# Проверяем, есть ли изменения после очистки
CHANGED_FILES=$(git status --porcelain | wc -l)

if [[ "$CHANGED_FILES" -gt 0 ]]; then
    echo "✨ Очищено файлов и директорий"
    echo "📝 Изменения будут добавлены автоматически"
else
    echo "✅ Репозиторий уже чист"
fi

echo "🎯 Очистка завершена!"