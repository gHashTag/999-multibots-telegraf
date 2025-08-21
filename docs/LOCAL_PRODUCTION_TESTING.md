# 🏭 Локальное тестирование Production сборки

## 🤔 Проблема

**Почему локально нельзя проверить то же самое, что и сборка на production?**

### Основные различия:

| Аспект | Локально | Production |
|--------|----------|------------|
| **Менеджер пакетов** | `bun` → `bun.lockb` | `npm` → `package-lock.json` |
| **ОС** | macOS | Linux Alpine |
| **Node версия** | система | Node 20 |
| **Сборка** | `bun run build` | `npx tsc --skipLibCheck` |
| **Тесты** | включены | **удаляются** перед сборкой |
| **Dockerfile** | `/Dockerfile` | `/deployment/docker/Dockerfile` |
| **Алиасы** | через `bun` | через `npx tsc-alias` |

---

## 🛠️ Решение

Мы создали **2 способа** локального воспроизведения production сборки:

### 📝 Способ 1: Нативный скрипт (быстрый)

Воспроизводит все шаги production сборки на вашей системе:

```bash
# Запуск через npm скрипт
npm run test:production

# Или напрямую
./scripts/test-production-build.sh
```

**Что делает:**
- ✅ Использует `npm` вместо `bun`
- ✅ Удаляет все тесты перед сборкой  
- ✅ Применяет `--skipLibCheck` флаг
- ✅ Обрабатывает алиасы через `tsc-alias`
- ✅ Проверяет результат сборки

### 🐳 Способ 2: Docker сборка (точный)

100% идентично production окружению:

```bash  
# Запуск через npm скрипт
npm run test:docker

# Или напрямую
./scripts/test-docker-build.sh
```

**Что делает:**
- ✅ Собирает Docker образ с production Dockerfile
- ✅ Использует Node 20 Alpine
- ✅ Устанавливает зависимости через npm
- ✅ Тестирует в изолированном контейнере
- ✅ Проверяет структуру файлов

---

## 🚀 Быстрый старт

```bash
# 1. Быстрая проверка (5-10 сек)
npm run test:production

# 2. Полная проверка Docker (30-60 сек) 
npm run test:docker

# 3. Обычная разработка (как раньше)
bun run dev
```

---

## 📋 Когда использовать что:

### 🔧 **Нативный скрипт** - используйте когда:
- ✅ Хотите быстро проверить сборку (5-10 сек)
- ✅ Отлаживаете TypeScript ошибки
- ✅ Проверяете алиасы путей
- ✅ Тестируете после изменений в коде

### 🐳 **Docker скрипт** - используйте когда:
- ✅ Готовите PR к слиянию  
- ✅ Хотите 100% уверенность в production совместимости
- ✅ Отлаживаете проблемы зависимостей
- ✅ Тестируете системные зависимости (ffmpeg, python)

---

## 🔍 Диагностика проблем

### Ошибка: "tsc-alias not found"
```bash
npm install -g tsc-alias
```

### Ошибка: "Docker not running"
```bash
# Запустите Docker Desktop
open -a Docker
```

### Ошибка: "Permission denied"
```bash
chmod +x scripts/test-production-build.sh
chmod +x scripts/test-docker-build.sh
```

---

## 💡 Рекомендации

### Для ежедневной разработки:
1. **Используйте `bun run dev`** для быстрой разработки
2. **Периодически запускайте `npm run test:production`**
3. **Перед PR запускайте `npm run test:docker`**

### Для CI/CD пайплайна:
```yaml
# Добавьте в GitHub Actions
- name: Test Production Build
  run: npm run test:production
  
- name: Test Docker Build  
  run: npm run test:docker
```

---

## 🎯 Итог

Теперь у вас есть **полный контроль** над production сборкой:

- 🎯 **Локально воспроизводимо** всё что происходит в production
- 🚀 **Быстрая диагностика** проблем сборки  
- 🔧 **Два уровня проверки** - нативный и Docker
- 📋 **Интеграция в workflow** через npm scripts

**Больше никаких сюрпризов на production!** 🎉