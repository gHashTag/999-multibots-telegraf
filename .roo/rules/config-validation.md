---
description: Правила, проверки, конфигурация. 
globs: 
alwaysApply: false
---
# 🔍 Правила проверки конфигурации

## 📁 Ключевые файлы конфигурации
- [.npmrc](mdc:.npmrc) - Настройки npm
- [package.json](mdc:package.json) - Основной конфиг проекта
- [package.prod.json](mdc:package.prod.json) - Продакшн конфиг
- [Dockerfile](mdc:Dockerfile) - Конфигурация Docker

## ✅ Обязательные настройки

### .npmrc должен содержать:
```ini
enable-pre-post-scripts=false
auto-install-peers=true
strict-peer-dependencies=false
ignore-workspace-root-check=true
```

### package.json должен иметь:
- Все необходимые dev-зависимости
- Корректные скрипты для разработки
- Правильные версии пакетов

### package.prod.json должен:
- Содержать только production зависимости
- Иметь минимальный набор скриптов
- Соответствовать основному package.json

### Dockerfile должен:
- Использовать multi-stage builds
- Правильно копировать конфиги
- Устанавливать ENV HUSKY=0 при сборке

## 🚫 Запрещено
- Менять enable-pre-post-scripts в .npmrc
- Удалять dev-зависимости из package.json
- Модифицировать Dockerfile без согласования

## ⚠️ Предупреждения
- Всегда проверять совместимость версий
- Следить за обновлениями безопасности
- Тестировать изменения конфигурации
