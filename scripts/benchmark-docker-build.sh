#!/bin/bash
# 🔬 Benchmark Script - Тестирование времени сборки Docker образов

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Функции
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "${CYAN}========================================${NC}"; echo -e "${CYAN}$1${NC}"; echo -e "${CYAN}========================================${NC}"; }

# Результаты
RESULTS_FILE="docker-build-benchmark-$(date +%Y%m%d_%H%M%S).json"

# Функция замера времени сборки
benchmark_build() {
    local dockerfile=$1
    local tag=$2
    local build_type=$3  # "fresh" или "cached"

    log_header "🔬 Тестирование: $tag ($build_type)"

    # Очистка кэша для fresh build
    if [ "$build_type" = "fresh" ]; then
        log_info "Очистка Docker кэша..."
        docker builder prune -af > /dev/null 2>&1 || true
    fi

    # Засекаем время
    log_info "Начало сборки: $(date '+%H:%M:%S')"
    START_TIME=$(date +%s)

    # Сборка
    if docker build -f "$dockerfile" -t "$tag" . > "/tmp/build_${tag}_${build_type}.log" 2>&1; then
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))

        log_success "✅ Сборка завершена за: ${DURATION}s ($(date -u -r $DURATION +'%M:%S'))"

        # Получаем размер образа
        IMAGE_SIZE=$(docker images "$tag" --format "{{.Size}}")

        log_info "📦 Размер образа: $IMAGE_SIZE"

        # Возвращаем результат
        echo "$DURATION|$IMAGE_SIZE"
    else
        log_error "❌ Сборка не удалась"
        cat "/tmp/build_${tag}_${build_type}.log"
        echo "0|ERROR"
    fi
}

# Функция запуска полного теста
run_full_benchmark() {
    log_header "🚀 ПОЛНЫЙ BENCHMARK: Node.js vs Bun"

    echo "{"
    echo "  \"timestamp\": \"$(date -Iseconds)\","
    echo "  \"hostname\": \"$(hostname)\","
    echo "  \"docker_version\": \"$(docker version --format '{{.Server.Version}}')\","
    echo "  \"results\": {"

    # Test 1: Node.js (Dockerfile.optimized) - Fresh Build
    log_header "Test 1: Node.js Fresh Build"
    RESULT=$(benchmark_build "Dockerfile.optimized" "999-multibots:node-fresh" "fresh")
    NODE_FRESH_TIME=$(echo "$RESULT" | cut -d'|' -f1)
    NODE_FRESH_SIZE=$(echo "$RESULT" | cut -d'|' -f2)

    echo "    \"node_fresh\": {"
    echo "      \"time_seconds\": $NODE_FRESH_TIME,"
    echo "      \"time_formatted\": \"$(date -u -r $NODE_FRESH_TIME +'%M:%S')\","
    echo "      \"image_size\": \"$NODE_FRESH_SIZE\""
    echo "    },"

    sleep 5

    # Test 2: Node.js (Dockerfile.optimized) - Cached Build
    log_header "Test 2: Node.js Cached Build"
    RESULT=$(benchmark_build "Dockerfile.optimized" "999-multibots:node-cached" "cached")
    NODE_CACHED_TIME=$(echo "$RESULT" | cut -d'|' -f1)
    NODE_CACHED_SIZE=$(echo "$RESULT" | cut -d'|' -f2)

    echo "    \"node_cached\": {"
    echo "      \"time_seconds\": $NODE_CACHED_TIME,"
    echo "      \"time_formatted\": \"$(date -u -r $NODE_CACHED_TIME +'%M:%S')\","
    echo "      \"image_size\": \"$NODE_CACHED_SIZE\""
    echo "    },"

    sleep 5

    # Test 3: Bun (Dockerfile.bun) - Fresh Build
    log_header "Test 3: Bun Fresh Build"
    docker builder prune -af > /dev/null 2>&1 || true
    RESULT=$(benchmark_build "Dockerfile.bun" "999-multibots:bun-fresh" "fresh")
    BUN_FRESH_TIME=$(echo "$RESULT" | cut -d'|' -f1)
    BUN_FRESH_SIZE=$(echo "$RESULT" | cut -d'|' -f2)

    echo "    \"bun_fresh\": {"
    echo "      \"time_seconds\": $BUN_FRESH_TIME,"
    echo "      \"time_formatted\": \"$(date -u -r $BUN_FRESH_TIME +'%M:%S')\","
    echo "      \"image_size\": \"$BUN_FRESH_SIZE\""
    echo "    },"

    sleep 5

    # Test 4: Bun (Dockerfile.bun) - Cached Build
    log_header "Test 4: Bun Cached Build"
    RESULT=$(benchmark_build "Dockerfile.bun" "999-multibots:bun-cached" "cached")
    BUN_CACHED_TIME=$(echo "$RESULT" | cut -d'|' -f1)
    BUN_CACHED_SIZE=$(echo "$RESULT" | cut -d'|' -f2)

    echo "    \"bun_cached\": {"
    echo "      \"time_seconds\": $BUN_CACHED_TIME,"
    echo "      \"time_formatted\": \"$(date -u -r $BUN_CACHED_TIME +'%M:%S')\","
    echo "      \"image_size\": \"$BUN_CACHED_SIZE\""
    echo "    }"

    echo "  }"
    echo "}"
}

# Функция вывода сравнения
print_comparison() {
    log_header "📊 СРАВНИТЕЛЬНАЯ ТАБЛИЦА"

    cat <<EOF

╔════════════════════════════╦══════════════╦══════════════╦═══════════╗
║ Сценарий                   ║ Время (s)    ║ Время (m:s)  ║ Размер    ║
╠════════════════════════════╬══════════════╬══════════════╬═══════════╣
║ Node.js Fresh Build        ║ $NODE_FRESH_TIME         ║ $(date -u -r $NODE_FRESH_TIME +'%M:%S')      ║ $NODE_FRESH_SIZE ║
║ Node.js Cached Build       ║ $NODE_CACHED_TIME         ║ $(date -u -r $NODE_CACHED_TIME +'%M:%S')      ║ $NODE_CACHED_SIZE ║
║ Bun Fresh Build            ║ $BUN_FRESH_TIME         ║ $(date -u -r $BUN_FRESH_TIME +'%M:%S')      ║ $BUN_FRESH_SIZE ║
║ Bun Cached Build           ║ $BUN_CACHED_TIME         ║ $(date -u -r $BUN_CACHED_TIME +'%M:%S')      ║ $BUN_CACHED_SIZE ║
╚════════════════════════════╩══════════════╩══════════════╩═══════════╝

EOF

    # Расчет улучшений
    if [ "$NODE_FRESH_TIME" -gt 0 ] && [ "$BUN_FRESH_TIME" -gt 0 ]; then
        FRESH_IMPROVEMENT=$(awk "BEGIN {printf \"%.1f\", ($NODE_FRESH_TIME - $BUN_FRESH_TIME) / $NODE_FRESH_TIME * 100}")
        CACHED_IMPROVEMENT=$(awk "BEGIN {printf \"%.1f\", ($NODE_CACHED_TIME - $BUN_CACHED_TIME) / $NODE_CACHED_TIME * 100}")

        log_header "🎯 ВЫВОДЫ"

        echo ""
        echo "Fresh Build:"
        if (( $(echo "$FRESH_IMPROVEMENT > 0" | bc -l) )); then
            log_success "✅ Bun быстрее на ${FRESH_IMPROVEMENT}%"
        else
            log_warning "⚠️  Node.js быстрее на ${FRESH_IMPROVEMENT#-}%"
        fi

        echo ""
        echo "Cached Build:"
        if (( $(echo "$CACHED_IMPROVEMENT > 0" | bc -l) )); then
            log_success "✅ Bun быстрее на ${CACHED_IMPROVEMENT}%"
        else
            log_warning "⚠️  Node.js быстрее на ${CACHED_IMPROVEMENT#-}%"
        fi

        echo ""
        log_header "📝 РЕКОМЕНДАЦИЯ"

        if (( $(echo "$FRESH_IMPROVEMENT > 20" | bc -l) )); then
            log_success "🚀 РЕКОМЕНДУЕТСЯ: Использовать Bun (значительное ускорение)"
            echo "   - Fresh builds: +${FRESH_IMPROVEMENT}% быстрее"
            echo "   - Cached builds: +${CACHED_IMPROVEMENT}% быстрее"
        elif (( $(echo "$FRESH_IMPROVEMENT > 10" | bc -l) )); then
            log_info "✅ МОЖНО ИСПОЛЬЗОВАТЬ: Bun дает умеренное ускорение"
            echo "   - Fresh builds: +${FRESH_IMPROVEMENT}% быстрее"
            echo "   - Cached builds: +${CACHED_IMPROVEMENT}% быстрее"
        else
            log_warning "⚠️  ОСТАВИТЬ Node.js: Разница минимальна или Bun медленнее"
        fi
    fi
}

# Основной запуск
main() {
    log_header "🔬 Docker Build Benchmark Tool"
    echo ""
    log_info "Запуск полного теста производительности..."
    log_warning "Это займет 10-15 минут"
    echo ""

    # Проверка Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker не установлен"
        exit 1
    fi

    # Включаем BuildKit
    export DOCKER_BUILDKIT=1

    # Запускаем benchmark
    run_full_benchmark | tee "$RESULTS_FILE"

    # Выводим сравнение
    echo ""
    print_comparison

    # Сохраняем результаты
    log_success "📁 Результаты сохранены в: $RESULTS_FILE"
}

# Запуск
main "$@"
