# 📱 Vibee Mobile App - Полная Настройка

Мобильное приложение Vibee создано на базе React Native и Expo. Оно интегрировано с основным проектом и работает параллельно с веб-сайтом и вебхуками.

## 🚀 Быстрый Старт

### Установка зависимостей

```bash
# Установить зависимости для мобильного приложения
npm run mobile:install
```

### Запуск всех сервисов

```bash
# Запустить Backend + Expo + Webhooks одновременно
npm run start:all
```

Этот скрипт запустит:
- ✅ Backend сервер (Express + Telegraf) на портах 2999, 3001
- ✅ Expo Dev Server на портах 19000, 19002, 19006
- ✅ Вебхуки (работают через backend)
- ✅ Веб-сайт доступен на https://three-head-dragon.shop

## 📋 Отдельные Команды

### Мобильное приложение

```bash
# Запустить только Expo Dev Server
npm run mobile

# Android эмулятор/устройство
npm run mobile:android

# iOS симулятор (только на macOS)
npm run mobile:ios

# Web версия
npm run mobile:web
```

### Backend сервисы

```bash
# Запустить только backend в режиме разработки
npm run dev

# Запустить production версию
npm start
```

## 🏗️ Структура Проекта

```
999-agents-telegraf/
├── mobile/                    # 📱 Expo мобильное приложение
│   ├── App.tsx               # Главный компонент
│   ├── app.json              # Конфигурация Expo
│   ├── package.json          # Зависимости mobile
│   ├── tsconfig.json         # TypeScript настройки
│   ├── assets/               # Иконки и изображения
│   └── README.md             # Документация mobile
│
├── src/                      # 🔧 Backend код
│   ├── index.ts              # Точка входа
│   ├── bot.ts                # Telegram bot
│   ├── api_server/           # Express API
│   └── ...
│
├── scripts/
│   └── start-all.sh          # 🚀 Запуск всех сервисов
│
└── package.json              # Основные зависимости
```

## 🌐 Endpoints и Порты

| Сервис | URL | Описание |
|--------|-----|----------|
| Backend API | `http://localhost:2999` | Express API сервер |
| Telegram Bot | `http://localhost:3001` | Webhooks endpoint |
| Expo DevTools | `http://localhost:19002` | Expo панель управления |
| Expo App | `exp://localhost:19000` | QR код для подключения |
| Production Site | `https://three-head-dragon.shop` | Основной сайт |

## 📱 Тестирование на Устройствах

### Android

1. Установите [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent) на устройство
2. Запустите `npm run start:all`
3. Отсканируйте QR код в терминале через Expo Go

### iOS

1. Установите [Expo Go](https://apps.apple.com/app/expo-go/id982107779) на устройство
2. Запустите `npm run start:all`
3. Отсканируйте QR код через приложение Camera

### Web

Просто откройте `http://localhost:19006` в браузере после запуска `npm run mobile:web`

## 🎨 Кастомизация

### Изменение темы

Отредактируйте цвета в `mobile/App.tsx`:

```typescript
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f0f23', // Темный фон
  },
  button: {
    backgroundColor: '#4c4cff', // Акцентный цвет
  },
  // ...
});
```

### Добавление экранов

1. Установите `expo-router`: `cd mobile && npm install expo-router`
2. Создайте папку `app/` в `mobile/`
3. Добавьте файлы экранов

### Интеграция с API

API URL уже настроен в `mobile/app.json`:

```json
{
  "extra": {
    "apiUrl": "https://three-head-dragon.shop"
  }
}
```

Используйте в коде:

```typescript
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl;
```

## 🔧 Проблемы и Решения

### Порт уже занят

```bash
# Очистить все порты
node scripts/kill-port.cjs 2999 3001 8288 19000 19002 19006
```

### Metro bundler не запускается

```bash
# Очистить кэш и перезапустить
cd mobile
npm start -- --clear
```

### Проблемы с зависимостями

```bash
# Переустановить все зависимости
cd mobile
rm -rf node_modules
npm install
cd ..
npm run mobile
```

## 🚀 Деплой

### Сборка APK (Android)

```bash
cd mobile
npx eas build --platform android
```

### Сборка IPA (iOS)

```bash
cd mobile
npx eas build --platform ios
```

### Публикация

```bash
cd mobile
npx eas submit --platform android
npx eas submit --platform ios
```

## 📝 Важные Заметки

1. **Вебхуки не ломаются** - они работают через основной backend на порту 3001
2. **Веб-сайт доступен** - https://three-head-dragon.shop работает параллельно
3. **Все сервисы независимы** - можно запускать отдельно или вместе
4. **Hot reload работает** - изменения в коде применяются автоматически

## 🆘 Поддержка

Если возникли проблемы:

1. Проверьте, что все порты свободны
2. Убедитесь, что установлены все зависимости
3. Проверьте логи в консоли
4. Перезапустите с `npm run start:all`

## 📚 Дополнительные Ресурсы

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
