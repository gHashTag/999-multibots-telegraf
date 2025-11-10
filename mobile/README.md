# Vibee Mobile App

Мобильное приложение Vibee на базе React Native и Expo.

## Установка

```bash
npm run mobile:install
```

## Запуск

### Expo Dev Server
```bash
npm run mobile
```

### Android
```bash
npm run mobile:android
```

### iOS
```bash
npm run mobile:ios
```

### Web
```bash
npm run mobile:web
```

## Структура проекта

```
mobile/
├── App.tsx           # Главный компонент приложения
├── app.json          # Конфигурация Expo
├── package.json      # Зависимости мобильного приложения
├── tsconfig.json     # TypeScript конфигурация
└── assets/           # Ресурсы (иконки, изображения)
```

## Особенности

- 🎨 Темная тема по умолчанию
- 📱 Поддержка iOS и Android
- 🌐 Web версия через Expo
- 🔗 Интеграция с https://three-head-dragon.shop
- ✨ Современный UI/UX дизайн

## Добавление иконок

Поместите следующие файлы в папку `assets/`:
- `icon.png` - иконка приложения (1024x1024)
- `splash.png` - экран загрузки (1242x2436)
- `adaptive-icon.png` - адаптивная иконка для Android (1024x1024)
- `favicon.png` - фавикон для веб версии (48x48)
