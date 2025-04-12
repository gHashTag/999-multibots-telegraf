#!/bin/bash

echo "Запуск сервера с использованием tmux..."

# Проверяем, есть ли уже сессия
if tmux has-session -t neuro_blogger 2>/dev/null; then
  echo "Сессия уже существует, присоединяемся к ней"
  tmux attach -t neuro_blogger
else
  echo "Создаем новую сессию"
  tmux new-session -d -s neuro_blogger

  # Переходим в директорию проекта и запускаем сервер
  tmux send-keys -t neuro_blogger "cd /opt/app/999-multibots-telegraf" Enter
  tmux send-keys -t neuro_blogger "docker-compose down" Enter
  tmux send-keys -t neuro_blogger "docker-compose up --build -d" Enter
  
  # Показываем логи в том же окне
  tmux send-keys -t neuro_blogger "docker-compose logs -f" Enter
  
  # Присоединяемся к сессии
  tmux attach -t neuro_blogger
fi 