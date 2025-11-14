# 🎓 SKILLS DIRECTORY - ОБЯЗАТЕЛЬНОЕ ЧТЕНИЕ!

```
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝

███████╗██╗  ██╗██╗██╗     ██╗     ███████╗
██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝
███████╗█████╔╝ ██║██║     ██║     ███████╗
╚════██║██╔═██╗ ██║██║     ██║     ╚════██║
███████║██║  ██╗██║███████╗███████╗███████║
╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝
```

## ⚠️ КРИТИЧЕСКИ ВАЖНО: ЭТО ЕДИНСТВЕННОЕ ПРАВИЛЬНОЕ МЕСТО ДЛЯ SKILLS!

### 🎯 Главное правило (напиши на лбу!)

**ПРИ РЕШЕНИИ ПОВТОРНОЙ ПРОБЛЕМЫ → СОЗДАВАЙ SKILL В .claude/skills/**

Не в `.clinerules-global`, не в `CLAUDE.md`, не в `.claude-skills` (неправильно!)

**ТОЛЬКО `.claude/skills/`!**

---

## 📁 Правильная структура

```
.claude/
├── README.md          # ← ТЫ ЗДЕСЬ (напоминание!)
└── skills/
    ├── restore-env-from-infisical/
    │   ├── SKILL.md                    # ← UPPERCASE обязательно!
    │   ├── resources/                  # ← Optional: доки, примеры
    │   │   ├── examples.md
    │   │   └── checklist.txt
    │   └── scripts/                    # ← Optional: helper scripts
    │       └── helper.sh
    ├── telegram-scene-builder/
    │   └── SKILL.md
    └── your-next-skill/                # ← Создавай здесь!
        └── SKILL.md
```

---

## ✅ Когда создавать Skill

1. **Повторная проблема** (решил второй раз → создавай Skill!)
2. **Многошаговое решение** (5+ шагов)
3. **Специализированное знание** (требует контекста)
4. **Чёткие триггеры** (пустые ключи, ошибка X, etc.)

---

## ❌ Когда НЕ создавать Skill

1. Одноразовая задача
2. Простая команда (1-2 шага)
3. Общее правило (используй CLAUDE.md)
4. Нет чётких триггеров

---

## 📝 Обязательный формат SKILL.md

```markdown
---
name: "Your Skill Name"
description: "When and why to use this skill (triggers)"
---

# Your Skill Name

## When to Use This Skill
[Чёткие триггеры активации]

## Quick Diagnosis
[Быстрая проверка проблемы]

## Solution Steps
[Пошаговое решение]

## Common Issues
[Частые ошибки и фиксы]

## Related Resources
[Ссылки на доки, скрипты]
```

---

## 🚀 Быстрое создание нового Skill

```bash
# 1. Создай директорию
mkdir -p .claude/skills/problem-name

# 2. Создай SKILL.md с шаблоном
cat > .claude/skills/problem-name/SKILL.md <<'EOF'
---
name: "Problem Name"
description: "When this skill activates"
---

# Problem Name

## When to Use This Skill
- User mentions: "keyword 1"
- Problem detected: error X

## Solution Steps
1. Step 1
2. Step 2
3. Step 3
EOF

# 3. Открой в редакторе и заполни
code .claude/skills/problem-name/SKILL.md
```

---

## 🔄 Обновление существующих Skills

**Если нашёл новое решение для существующей проблемы:**

1. Открой соответствующий `SKILL.md`
2. Добавь новое решение в секцию "Solution Steps"
3. Обнови "Common Issues" если нужно
4. Закоммить обновление

**Пример:**
```bash
# Нашёл новый способ исправить проблему X
vim .claude/skills/restore-env-from-infisical/SKILL.md

# Добавил новую секцию:
## Alternative Solution (Faster)
[Новое быстрое решение]

# Закоммитил
git add .claude/skills/restore-env-from-infisical/SKILL.md
git commit -m "Update restore-env skill with faster solution"
```

---

## 🎓 Примеры хороших Skills

**1. restore-env-from-infisical/**
- Проблема: Пустые API ключи
- Триггеры: "api_key is empty", "пустые ключи"
- Решение: Восстановление из Infisical
- Когда: При каждом повреждении .env

**2. telegram-scene-builder/**
- Проблема: Нужно создать новый wizard
- Триггеры: "создай сцену", "новый wizard"
- Решение: Шаблон + best practices
- Когда: При добавлении новых функций

---

## 🛡️ Защита от ошибок

**Git hook (`pre-commit`) автоматически проверяет:**

1. ✅ Skills только в `.claude/skills/`
2. ✅ Файл называется `SKILL.md` (UPPERCASE!)
3. ✅ Есть YAML frontmatter
4. ✅ Поля `name:` и `description:` обязательны
5. ✅ Skills не попали в `.clinerules-global` или `CLAUDE.md`

**Если ошибка → коммит отклонён!**

---

## 📊 Метрики эффективности

**Цель**: 1 новый Skill при каждой повторной проблеме

**Текущие Skills**: 1 (restore-env-from-infisical)

**Target**: 10+ Skills к концу месяца

**Экономия времени**: 20-30 минут на каждое повторное использование Skill

---

## 💡 Мантра (повторяй каждый день!)

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ПОВТОРНАЯ ПРОБЛЕМА → СОЗДАЙ SKILL!             │
│                                                 │
│  .claude/skills/problem-name/SKILL.md           │
│                                                 │
│  С YAML FRONTMATTER И UPPERCASE!                │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 📚 Дополнительная документация

- **CLAUDE.md** → Раздел "SKILLS MANAGEMENT" (полная инструкция)
- **Pre-commit hook** → `.git/hooks/pre-commit` (автопроверка)
- **Skills примеры** → `.claude/skills/*/SKILL.md`

---

## ⚡ Быстрые ссылки

- [CLAUDE.md - Skills Management](../CLAUDE.md#-skills-management)
- [Первый Skill - restore-env](./skills/restore-env-from-infisical/SKILL.md)
- [Infisical Management Docs](../docs/INFISICAL_ENV_MANAGEMENT.md)

---

**Последнее обновление**: 2025-11-12
**Автор**: DevOps Team + Claude AI
**Статус**: Production-ready ✅
