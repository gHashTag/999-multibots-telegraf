#!/bin/bash

# Все кнопки из NAVIGATION_BUTTONS (24 штуки)
BUTTONS=(
  "🤖 Цифровое тело"
  "🤖 Digital Body"
  "📸 Нейрофото"
  "📸 NeuroPhoto"
  "🔍 Промпт из фото"
  "🔍 Prompt from Photo"
  "🧠 Мозг аватара"
  "🧠 Avatar Brain"
  "💭 Чат с аватаром"
  "💭 Chat with avatar"
  "🤖 Выбор модели ИИ"
  "🤖 Choose AI Model"
  "🎤 Голос аватара"
  "🎤 Avatar Voice"
  "🎙️ Текст в голос"
  "🎙️ Text to Voice"
  "🎥 Фото в видео"
  "🎥 Photo to Video"
  "🎥 Видео из текста"
  "🎥 Text to Video"
  "🖼️ Текст в фото"
  "🖼️ Text to Photo"
  "🎨 ИИ Фотошоп"
  "🎨 AI Photoshop"
  "⬆️ Увеличить качество фото"
  "⬆️ Upscale Photo Quality"
  "🌀 Infinity Морфинг"
  "🌀 Infinity Morphing"
  "🎭 Замена лица"
  "🎭 Face Swap"
  "🦸‍♂️ ИИ Герои"
  "🦸‍♂️ AI Heroes"
  "🎤 Синхронизация губ"
  "🎤 Lip Sync"
  "🔍 Мониторинг конкурентов"
  "🔍 Competitor Monitoring"
  "🎬 ИИ Рилс"
  "🎬 AI Reels"
  "👥 Пригласить друга"
  "👥 Invite a friend"
  "💬 Техподдержка"
  "💬 Tech Support"
  "🌐 EN"
  "🌐 RU"
  "💫 Оформить подписку"
  "💫 Subscribe"
  "💎 Пополнить баланс"
  "💎 Top up balance"
  "💰 Баланс"
  "💰 Balance"
)

echo "========================================="
echo "🔍 ПРОВЕРКА ОБРАБОТЧИКОВ КНОПОК"
echo "========================================="
echo ""

MISSING=()
FOUND_COUNT=0

for BUTTON in "${BUTTONS[@]}"; do
  if grep -q "'$BUTTON'" src/hearsHandlers.ts; then
    echo "✅ $BUTTON"
    ((FOUND_COUNT++))
  else
    echo "❌ $BUTTON"
    MISSING+=("$BUTTON")
  fi
done

echo ""
echo "========================================="
echo "📊 ИТОГО:"
echo "========================================="
echo "Всего кнопок: ${#BUTTONS[@]}"
echo "Найдено обработчиков: $FOUND_COUNT"
echo "Отсутствует обработчиков: ${#MISSING[@]}"
echo ""

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "🚨 КНОПКИ БЕЗ ОБРАБОТЧИКОВ:"
  echo "========================================="
  for BUTTON in "${MISSING[@]}"; do
    echo "  - $BUTTON"
  done
else
  echo "✅ ВСЕ КНОПКИ ИМЕЮТ ОБРАБОТЧИКИ!"
fi
