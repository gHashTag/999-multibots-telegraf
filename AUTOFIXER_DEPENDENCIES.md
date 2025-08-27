# Зависимости для GitHub Auto-Fixer

## Недостающие зависимости

Для работы GitHub Auto-Fixer необходимо установить следующие пакеты:

```bash
# Основные зависимости
bun add @octokit/rest express-rate-limit

# Зависимости для разработки (если нужно)
bun add -d @types/express-rate-limit
```

## Альтернативная установка через npm

```bash
npm install @octokit/rest express-rate-limit
npm install -D @types/express-rate-limit
```

## Описание зависимостей

### Production Dependencies

- **@octokit/rest** - GitHub API client для работы с PR, файлами и коммитами
- **express-rate-limit** - Rate limiting middleware для защиты webhook endpoints

### Development Dependencies  

- **@types/express-rate-limit** - TypeScript типы для express-rate-limit

## Проверка установки

После установки зависимостей проверьте работу:

```bash
# Проверить что модули установлены
bun run typecheck

# Запустить тесты автофиксера  
bun test __tests__/autofixer/

# Запустить сервер в dev режиме
bun run dev
```

## Текущие зависимости Bot проекта

Проект уже использует:
- ✅ `express` - для API сервера
- ✅ `telegraf` - для Telegram Bot
- ✅ `typescript` - для типизации
- ✅ `jest` - для тестирования

Автофиксер интегрируется с существующей инфраструктурой без конфликтов.