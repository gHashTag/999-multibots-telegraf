# ⚠️ Regression Patterns - Анти-Паттерны и Ошибки

*История неудачных подходов, паттернов приводивших к ошибкам, и способов их избежать*

**Цель**: Не повторять ошибки дважды. Учиться на неудачах. Автоматически предотвращать регрессии.

**Sanskrit Wisdom**: "प्रमादः सर्वनाशाय" (Pramadah Sarvanashaya) - "Небрежность ведет к полному разрушению"

---

## [2025-01-11] Пропуск Проверки Типов в Docker Build

**Симптомы**:
- Production build успешен, но runtime errors
- TypeScript ошибки обнаружены только в production
- "Cannot read property 'text' of undefined" в логах production
- Users report broken functionality
- Deployment считается "успешным", но ничего не работает

**Root Cause**:
Dockerfile использовал `--skipLibCheck` и `|| true`, что маскировало реальные проблемы:
```dockerfile
# ❌ НЕПРАВИЛЬНО (старый Dockerfile)
RUN npm run build --skipLibCheck || true
# Игнорирует ВСЕ ошибки типов
# || true означает "даже если упало - считай успешным"
```

**Неудачный Подход**:
1. Использование `--skipLibCheck` для "ускорения" сборки
2. `|| true` для игнорирования ошибок
3. Надежда, что "в production как-нибудь заработает"
4. Отсутствие pre-deployment type checking

**Почему Не Работает**:
- TypeScript ошибки НЕ исчезают сами собой
- Runtime errors обнаруживаются пользователями, не тестами
- Debugging в production в 10x дороже, чем в build time
- Потеря доверия пользователей
- Невозможно предсказать поведение кода
- Rollback после обнаружения ошибки = downtime

**Правильное Решение**:
```dockerfile
# ✅ ПРАВИЛЬНО (Dockerfile.optimized)
# Стадия builder - полная проверка типов
FROM node:20-alpine AS builder

# Полная проверка типов БЕЗ ПРОПУСКОВ
RUN npm run typecheck || (echo "❌ Type check failed! Fix errors before deploy." && exit 1)

# Сборка (только после успешной проверки типов)
RUN npm run build

# Если typecheck упал - build остановится с exit code 1
# Deployment НЕ ПРОИЗОЙДЕТ
```

**Предотвращение**:
1. **НИКОГДА** не использовать `--skipLibCheck` в production builds
2. **НИКОГДА** не использовать `|| true` для игнорирования ошибок
3. **ВСЕГДА** блокировать build при ошибках типов (exit 1)
4. Добавить pre-commit hook с type check:
   ```bash
   #!/bin/bash
   npm run typecheck || exit 1
   ```
5. CI/CD pipeline ОБЯЗАН включать type check
6. Code reviewer проверяет наличие type check в Dockerfile

**Автоматическая Проверка**:
```bash
# В continuous-optimizer agent
check_dockerfile_type_safety() {
  if grep -q "skipLibCheck" Dockerfile*; then
    echo "❌ REGRESSION: skipLibCheck found in Dockerfile"
    exit 1
  fi

  if grep -q "|| true" Dockerfile*; then
    echo "❌ REGRESSION: || true found in Dockerfile"
    exit 1
  fi
}
```

**Git Commit (где была ошибка)**: `old_dockerfile_abc123...` (Branch: `main`)
**Git Commit (где исправлено)**: `5fe4a1f0abc123...` (Branch: `feat/docker-optimization`)

**Severity**: 🔴 CRITICAL
**Impact**: Production runtime errors, user-facing bugs
**Frequency**: Occurred multiple times before fix

**Теги**: #typescript #docker #build #type-safety #critical

---

## [2025-01-10] Сборка Docker на Production Сервере

**Симптомы**:
- Deployment занимает 15-20 минут
- Production сервер тормозит во время сборки
- Users жалуются на замедление во время deploy
- Случайные build failures из-за нехватки ресурсов (OOM killer)
- Нет кэширования между deployments

**Root Cause**:
deploy.js копировал код на сервер и запускал `docker build` на production machine:
```javascript
// ❌ НЕПРАВИЛЬНО (старый deploy.js)
await ssh.exec('cd /root/project && docker build -t app .');
// Сборка на слабом production сервере
// Конкурирует за ресурсы с running приложением
```

**Неудачный Подход**:
1. Сборка Docker образа на production сервере
2. Нет использования BuildKit (no layer caching)
3. Каждый deploy = полная пересборка (including npm install)
4. Сборка конкурирует за CPU/RAM с running application
5. При падении сборки - production может упасть вместе с ней

**Почему Не Работает**:
- **Production сервер НЕ предназначен для CI/CD**:
  - Ограниченные ресурсы (обычно < 4GB RAM)
  - Приоритет - стабильность running app, не сборка
  - Сборка может вызвать OOM и crash production

- **Нет кэширования**:
  - Каждая сборка = полный `npm install` (200+ пакетов)
  - Каждая сборка = полная TypeScript compilation
  - 15-20 минут на каждый deploy

- **Риски**:
  - Crash production во время сборки
  - Downtime если сборка повиснет
  - Невозможно откатиться быстро

**Правильное Решение**:
Локальная сборка + transfer готового образа:
```bash
# ✅ ПРАВИЛЬНО (deploy-local-build.sh)

# 1. Build locally (fast, BuildKit cached, powerful machine)
export DOCKER_BUILDKIT=1
docker build -f Dockerfile.optimized -t 999-multibots:latest .
# Локальная машина: 16GB RAM, 8 CPU cores, SSD
# BuildKit кэширует layers между сборками

# 2. Save as compressed tar
docker save 999-multibots:latest | gzip > 999-multibots.tar.gz
# ~150MB compressed (was 800MB uncompressed)

# 3. Transfer to server (30 seconds)
scp -C 999-multibots.tar.gz root@188.137.250.69:/tmp/

# 4. Load on server (fast, no build!)
ssh root@188.137.250.69 "docker load < /tmp/999-multibots.tar.gz"
# Только loading, не сборка - 1 minute

# 5. Start new container
ssh root@188.137.250.69 "docker run ..."
```

**Предотвращение**:
1. **НИКОГДА** не собирать Docker на production сервере
2. **ВСЕГДА** использовать локальную сборку + transfer
3. **ОБЯЗАТЕЛЬНО** использовать BuildKit для кэширования
4. Automation через `deploy-local-build.sh`
5. CI/CD build на dedicated build server, не на production

**Автоматическая Проверка**:
```bash
# В continuous-optimizer agent
check_deploy_script() {
  if grep -q "docker build" deploy.js; then
    echo "❌ REGRESSION: docker build in deploy script"
    echo "Deploy scripts should transfer pre-built images, not build on server"
    exit 1
  fi
}
```

**Git Commit (где была ошибка)**: `deploy_js_old_abc789...` (Branch: `main`)
**Git Commit (где исправлено)**: `5fe4a1f0abc...` (Branch: `feat/devops-optimization`)

**Severity**: 🔴 CRITICAL
**Impact**: Slow deployments, production instability, potential crashes
**Frequency**: Every deployment (100%)

**Теги**: #deployment #docker #performance #devops #production

---

## [2024-XX-XX] answerCbQuery() Вызывается Не Первой Строкой

**Симптомы**:
- "400: Bad Request: query is too old" errors в логах
- Inline кнопки показывают loading spinner бесконечно
- Пользователи жалуются на "зависшие" кнопки
- Кнопки перестают реагировать после первого нажатия

**Root Cause**:
```typescript
// ❌ НЕПРАВИЛЬНО
myScene.action('generate_button', async (ctx) => {
  // Какая-то async логика
  await someSlowOperation();  // 5+ секунд
  await ctx.reply('Processing...');

  // TOO LATE! Telegram timeout ~5 seconds
  await ctx.answerCbQuery();
});
```

**Неудачный Подход**:
1. answerCbQuery() вызывается ПОСЛЕ async операций
2. Telegram timeout (~5 секунд) истекает
3. Callback query считается устаревшим (query is too old)
4. Loading spinner зависает навсегда
5. Пользователь не получает feedback

**Почему Не Работает**:
- **Telegram требует НЕМЕДЛЕННЫЙ ответ** на callback query
- Timeout ~5 секунд (cannot be extended)
- Если долгая операция (5+ секунд) - query timeout
- Нельзя вызвать answerCbQuery() дважды для одного callback
- После timeout - кнопка "мертва", нужен новый message

**Правильное Решение**:
```typescript
// ✅ ПРАВИЛЬНО
myScene.action('generate_button', async (ctx) => {
  // ПЕРВАЯ СТРОКА - ответить Telegram немедленно
  await ctx.answerCbQuery();

  // Теперь можно делать долгие операции
  await ctx.reply('⏳ Starting generation...');
  await someSlowOperation();  // 10 минут? No problem!
  await ctx.reply('✅ Done!');
});
```

**Для ОЧЕНЬ долгих операций** (>1 минута):
```typescript
// ✅ ПРАВИЛЬНО (с progress updates)
myScene.action('train_model', async (ctx) => {
  await ctx.answerCbQuery();  // Первая строка!

  const statusMsg = await ctx.reply('⏳ Training started (0%)...');

  // Запускаем Inngest job (background)
  await inngest.send({
    name: 'model/train',
    data: { userId: ctx.from.id, messageId: statusMsg.message_id }
  });

  // Job обновляет progress через bot API
  // User видит progress updates каждые 30 секунд
});
```

**Предотвращение**:
1. **ВСЕГДА** answerCbQuery() первой строкой в action handler
2. Добавить ESLint rule для автоматической проверки
3. Template в telegram-scene-builder агенте
4. Code reviewer ОБЯЗАН проверять это правило
5. Pre-commit hook может проверять паттерн

**Автоматическая Проверка**:
```typescript
// ESLint rule (custom)
'telegram/answer-callback-query-first': {
  check: (node) => {
    if (node.callee.property.name === 'action') {
      const firstStatement = node.arguments[1].body.body[0];
      if (!isAnswerCbQuery(firstStatement)) {
        return {
          error: 'answerCbQuery() must be first line in action handler',
          fix: 'Add await ctx.answerCbQuery() as first line'
        };
      }
    }
  }
}
```

**Git Commit (где была ошибка)**: Multiple scenes (various commits)
**Git Commit (где исправлено)**: Various fixes in different scenes

**Severity**: 🟡 HIGH
**Impact**: Poor UX, users think bot is broken
**Frequency**: Common mistake in new scenes

**Теги**: #telegram #callback-query #scene-pattern #timing #ux

---

## [2024-XX-XX] Session Не Инициализирована в Wizard Step 1

**Симптомы**:
- "Cannot set property of undefined" errors
- "Cannot read property 'wizardData' of undefined"
- Wizard crashes на Step 2 при попытке доступа к session data
- Пользователи не могут завершить wizard flow

**Root Cause**:
```typescript
// ❌ НЕПРАВИЛЬНО
const myWizard = new Scenes.WizardScene(
  'myWizard',

  // Step 1: НЕ инициализирует session
  async (ctx) => {
    await ctx.reply('Enter your name:');
    return ctx.wizard.next();
  },

  // Step 2: Пытается использовать wizardData
  async (ctx) => {
    // ❌ CRASH! wizardData undefined
    ctx.session.wizardData.name = ctx.message.text;
  }
);
```

**Неудачный Подход**:
1. session.wizardData не инициализирован в Step 1
2. Попытка доступа к undefined в Step 2
3. Надежда, что session "как-то существует"
4. Нет type safety (TypeScript не ловит ошибку)

**Почему Не Работает**:
- **session.wizardData НЕ создается автоматически**
- Telegraf не знает, какая структура вам нужна
- Без инициализации = undefined
- Попытка записи в undefined = runtime error
- Users видят error message или silent failure

**Правильное Решение**:
```typescript
// ✅ ПРАВИЛЬНО
const myWizard = new Scenes.WizardScene<MyContext>(
  'myWizard',

  // Step 1: ОБЯЗАТЕЛЬНО инициализировать session
  async (ctx) => {
    // Инициализация ПЕРВОЙ СТРОКОЙ
    ctx.session.wizardData = {
      step: 1,
      name: '',
      email: '',
      // ВСЕ поля, которые будут использоваться
    };

    await ctx.reply('Enter your name:');
    return ctx.wizard.next();
  },

  // Step 2: Теперь безопасно использовать
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('Send text');
      return;
    }

    // ✅ Безопасно - wizardData инициализирован
    ctx.session.wizardData.name = ctx.message.text;
    ctx.session.wizardData.step = 2;

    await ctx.reply('Enter your email:');
    return ctx.wizard.next();
  }
);
```

**С Type Safety**:
```typescript
// types/MyContext.ts
interface WizardData {
  step: number;
  name: string;
  email: string;
  // Все поля явно типизированы
}

interface MyContext extends Context {
  session: {
    wizardData?: WizardData;  // Optional на уровне типов
    // При инициализации станет required
  };
}
```

**Предотвращение**:
1. **ВСЕГДА** инициализировать session.wizardData в Step 1
2. **ВСЕ** поля должны быть объявлены при инициализации
3. TypeScript interface для wizardData (type safety)
4. Template в telegram-scene-builder агенте
5. Code reviewer проверяет инициализацию

**Автоматическая Проверка**:
```typescript
// В code-reviewer agent
check_wizard_initialization(wizardFile: string) {
  const step1 = extractWizardStep(wizardFile, 1);

  if (!step1.includes('ctx.session.wizardData = {')) {
    return {
      error: 'Wizard Step 1 must initialize ctx.session.wizardData',
      fix: 'Add ctx.session.wizardData = { step: 1, ...fields } in Step 1'
    };
  }
}
```

**Git Commit (где была ошибка)**: Various wizard scenes
**Git Commit (где исправлено)**: Individual scene fixes

**Severity**: 🟡 HIGH
**Impact**: Wizard crashes, users cannot complete flow
**Frequency**: Common mistake in new wizards

**Теги**: #telegram #wizard #session #initialization #runtime-error

---

## Template Entry (Copy for New Regressions)

```markdown
## [YYYY-MM-DD] Title of Problem

**Симптомы**:
- How the error manifested
- What users experienced
- Error messages in logs

**Root Cause**:
```language
// ❌ НЕПРАВИЛЬНО
code_that_caused_problem();
```

**Неудачный Подход**:
1. What was done wrong
2. Why it seemed like a good idea
3. What was overlooked

**Почему Не Работает**:
- Technical reason 1
- Technical reason 2
- Impact on system/users

**Правильное Решение**:
```language
// ✅ ПРАВИЛЬНО
correct_approach();
```

**Предотвращение**:
1. How to avoid in future
2. Automated checks
3. Review process improvements

**Автоматическая Проверка**:
```bash
# In continuous-optimizer or code-reviewer
check_pattern() {
  # Automation to detect this pattern
}
```

**Git Commit (где была ошибка)**: `error_commit_hash` (Branch: `branch-name`)
**Git Commit (где исправлено)**: `fix_commit_hash` (Branch: `fix-branch`)

**Severity**: 🔴 CRITICAL / 🟡 HIGH / 🟢 MEDIUM / ⚪ LOW
**Impact**: Description of impact
**Frequency**: How often occurred

**Теги**: #tag1 #tag2 #tag3
```

---

**Maintained By**: memory-manager agent
**Last Updated**: 2025-01-11
**Total Patterns**: 4
**Philosophy**: "Learn from mistakes once, prevent them forever"
**Sanskrit Wisdom**: "विद्या विनयेन शोभते" (Vidya Vinayena Shobhate) - "Knowledge shines with humility"
