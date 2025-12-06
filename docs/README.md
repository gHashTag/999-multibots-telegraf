# 📚 Документация проекта 999-multibots-telegraf

Платформа Telegram-ботов с AI-генерацией контента (видео, изображения, музыка, LipSync).

## 🏗️ Структура документации

```
docs/
├── README.md                 # Этот файл
├── README-RU.md              # Описание проекта на русском
├── ROADMAP.md                # Дорожная карта развития
├── CRITICAL-RULE-NEVER-DELETE.md  # Критические правила
│
├── architecture/             # Архитектура системы
│   ├── PROJECT_ARCHITECTURE.md       # Общая архитектура
│   ├── AGENTS_FUNCTIONAL_ARCHITECTURE.md  # AI агенты
│   └── FUNCTIONAL_MEDIA_GENERATION_ROADMAP.md  # AI генерация
│
├── features/                 # Документация по функциям
│   ├── TELEGRAM_BOT_GUIDE.md         # Гайд по боту
│   ├── TELEGRAM_BOT_SETUP.md         # Настройка бота
│   ├── INNGEST_IMPORTANT_RULES.md    # Правила Inngest
│   ├── INNGEST_PRODUCTION_SECRETS.md # Секреты Inngest
│   ├── INFISICAL_ENV_MANAGEMENT.md   # Управление .env
│   ├── INFISICAL_FAL_SETUP.md        # Настройка FAL
│   └── LOGGING.md                    # Система логирования
│
└── guides/                   # Руководства
    ├── DEPLOYMENT_GUIDE.md   # Развертывание
    ├── INSTALL_SIMPLE.md     # Быстрая установка
    ├── QUICK_REFERENCE.md    # Справочник команд
    ├── CONTRIBUTING.md       # Участие в разработке
    └── SECURITY.md           # Безопасность
```

## 🚀 Быстрый старт

### Для разработчиков
1. [INSTALL_SIMPLE.md](./guides/INSTALL_SIMPLE.md) - Быстрая установка
2. [PROJECT_ARCHITECTURE.md](./architecture/PROJECT_ARCHITECTURE.md) - Архитектура
3. [CONTRIBUTING.md](./guides/CONTRIBUTING.md) - Участие в разработке

### Для деплоя
1. [DEPLOYMENT_GUIDE.md](./guides/DEPLOYMENT_GUIDE.md) - Полное руководство
2. [INFISICAL_ENV_MANAGEMENT.md](./features/INFISICAL_ENV_MANAGEMENT.md) - Секреты
3. [QUICK_REFERENCE.md](./guides/QUICK_REFERENCE.md) - Справочник команд

### Telegram бот
1. [TELEGRAM_BOT_SETUP.md](./features/TELEGRAM_BOT_SETUP.md) - Настройка
2. [TELEGRAM_BOT_GUIDE.md](./features/TELEGRAM_BOT_GUIDE.md) - Использование

## 📖 Ключевые документы

| Документ | Описание |
|----------|----------|
| [DEPLOYMENT_GUIDE.md](./guides/DEPLOYMENT_GUIDE.md) | Развертывание на сервере |
| [INNGEST_IMPORTANT_RULES.md](./features/INNGEST_IMPORTANT_RULES.md) | Фоновые задачи (1-2 часа) |
| [SECURITY.md](./guides/SECURITY.md) | Безопасность и секреты |
| [ROADMAP.md](./ROADMAP.md) | План развития проекта |

## 🔗 Связанные ресурсы

- **Главный CLAUDE.md**: `/CLAUDE.md` - инструкции для Claude Code
- **Правила проекта**: `/CLAUDECODE_RULES.md` - критические правила
- **Skills**: `/.claude/skills/` - специализированные навыки
- **Agents**: `/.claude/agents/` - vibe-* агенты

## 📊 Статистика

- **Документов**: 20 файлов (было 368)
- **Структура**: 3 категории (architecture, features, guides)
- **Последнее обновление**: 2025-12-06
- **Версия**: 2.0 (после реорганизации)
