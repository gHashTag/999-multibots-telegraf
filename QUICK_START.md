# 🚀 Vibee - Быстрый Старт

## Установка

```bash
# 1. Установить зависимости для основного проекта
npm install

# 2. Установить зависимости для мобильного приложения
npm run mobile:install
```

## Запуск

### Вариант 1: Запустить ВСЁ сразу (рекомендуется)

```bash
npm run start:all
```

Это запустит:
- ✅ Backend API сервер (Express)
- ✅ Telegram Bot с вебхуками
- ✅ Expo мобильное приложение
- ✅ Все работает параллельно без конфликтов

### Вариант 2: Запустить отдельно

```bash
# Только Backend (Telegram Bot + API)
npm run dev

# Только мобильное приложение
npm run mobile
```

## Доступные сервисы после запуска

| Сервис | URL |
|--------|-----|
| 🌐 Веб-сайт | https://three-head-dragon.shop |
| 🤖 Backend API | http://localhost:2999 |
| 📱 Expo DevTools | http://localhost:19002 |
| 📲 Mobile App | Сканируй QR код в консоли |

## Команды для мобильного приложения

```bash
npm run mobile          # Запустить Expo Dev Server
npm run mobile:android  # Запустить на Android
npm run mobile:ios      # Запустить на iOS (только macOS)
npm run mobile:web      # Запустить web версию
```

## Остановка

Просто нажмите `Ctrl+C` в терминале - все сервисы остановятся автоматически.

## Подробная документация

- [Мобильное приложение](./VIBEE_MOBILE_SETUP.md)
- [Деплой](./README-DEPLOY.md)
- [Основная документация](./README.md)
