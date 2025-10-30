#!/bin/bash

# Скрипт автоматической очистки старых временных файлов
# Удаляет файлы старше 2-3 дней для освобождения места на диске

LOG_FILE="/var/log/cleanup-files.log"
CLEANUP_DIRS=(
    "/etc/nginx/html/files"
    "/root/999-agents-vibecoder/temp"
    "/root/999-agents-vibecoder/tmp"
    "/tmp/morphing_*"
    "/tmp/video_*"
    "/tmp/image_*"
)

# Функция логирования
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log_message "========================================="
log_message "Начало очистки старых файлов"

# Показать использование диска до очистки
DISK_BEFORE=$(df -h / | awk 'NR==2 {print $5}')
log_message "Использование диска до очистки: $DISK_BEFORE"

# Счетчики для статистики
TOTAL_FILES_DELETED=0
TOTAL_SPACE_FREED=0

# Очистка файлов старше 3 дней
for DIR in "${CLEANUP_DIRS[@]}"; do
    if [ -d "$DIR" ] || [[ "$DIR" == *"*"* ]]; then
        log_message "Проверка директории: $DIR"
        
        # Подсчет файлов для удаления
        if [[ "$DIR" == *"*"* ]]; then
            # Для паттернов с wildcards
            FILES_COUNT=$(find $DIR -type f -mtime +2 2>/dev/null | wc -l)
        else
            FILES_COUNT=$(find "$DIR" -type f -mtime +2 2>/dev/null | wc -l)
        fi
        
        if [ "$FILES_COUNT" -gt 0 ]; then
            # Подсчет размера файлов для удаления
            if [[ "$DIR" == *"*"* ]]; then
                SPACE_TO_FREE=$(find $DIR -type f -mtime +2 -exec du -cb {} + 2>/dev/null | grep total$ | awk '{sum += $1} END {print sum}')
            else
                SPACE_TO_FREE=$(find "$DIR" -type f -mtime +2 -exec du -cb {} + 2>/dev/null | grep total$ | awk '{sum += $1} END {print sum}')
            fi
            
            SPACE_TO_FREE=${SPACE_TO_FREE:-0}
            SPACE_TO_FREE_MB=$((SPACE_TO_FREE / 1024 / 1024))
            
            log_message "  Найдено $FILES_COUNT файлов для удаления (~${SPACE_TO_FREE_MB} MB)"
            
            # Удаление файлов старше 3 дней
            if [[ "$DIR" == *"*"* ]]; then
                find $DIR -type f -mtime +2 -delete 2>/dev/null
            else
                find "$DIR" -type f -mtime +2 -delete 2>/dev/null
            fi
            
            TOTAL_FILES_DELETED=$((TOTAL_FILES_DELETED + FILES_COUNT))
            TOTAL_SPACE_FREED=$((TOTAL_SPACE_FREED + SPACE_TO_FREE))
            
            log_message "  Удалено $FILES_COUNT файлов"
        else
            log_message "  Нет файлов для удаления"
        fi
    fi
done

# Очистка пустых директорий
for DIR in "${CLEANUP_DIRS[@]}"; do
    if [ -d "$DIR" ]; then
        find "$DIR" -type d -empty -delete 2>/dev/null
    fi
done

# Очистка Docker системы (неиспользуемые образы, контейнеры, сети)
log_message "Очистка Docker..."
DOCKER_SPACE_BEFORE=$(docker system df | grep "Images" | awk '{print $4}')
docker system prune -f --volumes 2>/dev/null >> "$LOG_FILE"
docker image prune -a -f --filter "until=72h" 2>/dev/null >> "$LOG_FILE"
DOCKER_SPACE_AFTER=$(docker system df | grep "Images" | awk '{print $4}')
log_message "Docker очищен (было: $DOCKER_SPACE_BEFORE, стало: $DOCKER_SPACE_AFTER)"

# Очистка логов Docker контейнеров
log_message "Очистка логов Docker контейнеров..."
for container in $(docker ps -q); do
    CONTAINER_NAME=$(docker inspect --format='{{.Name}}' $container | sed 's/\///')
    LOG_SIZE=$(docker inspect --format='{{.LogPath}}' $container | xargs du -sh 2>/dev/null | awk '{print $1}')
    if [ -n "$LOG_SIZE" ]; then
        docker exec $container sh -c "echo '' > $(docker inspect --format='{{.LogPath}}' $container)" 2>/dev/null
        log_message "  Очищены логи контейнера $CONTAINER_NAME (размер был: $LOG_SIZE)"
    fi
done

# Ротация системных логов
log_message "Ротация системных логов..."
find /var/log -type f -name "*.log" -size +100M -exec truncate -s 0 {} \; 2>/dev/null
journalctl --vacuum-time=2d 2>/dev/null >> "$LOG_FILE"

# Показать использование диска после очистки
DISK_AFTER=$(df -h / | awk 'NR==2 {print $5}')
TOTAL_SPACE_FREED_MB=$((TOTAL_SPACE_FREED / 1024 / 1024))

log_message "========================================="
log_message "Очистка завершена"
log_message "Удалено файлов: $TOTAL_FILES_DELETED"
log_message "Освобождено места: ~${TOTAL_SPACE_FREED_MB} MB"
log_message "Использование диска после очистки: $DISK_AFTER"
log_message "========================================="

# Отправка уведомления если диск все еще заполнен более чем на 90%
DISK_USAGE_PERCENT=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE_PERCENT" -gt 90 ]; then
    log_message "ВНИМАНИЕ: Диск все еще заполнен на ${DISK_USAGE_PERCENT}%!"
    # Здесь можно добавить отправку уведомления админам
fi

exit 0