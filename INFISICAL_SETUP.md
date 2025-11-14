# 🔐 Infisical Cloud-First Setup

## ✅ Концепция

**ВСЕ секреты** хранятся **ТОЛЬКО в облаке Infisical**.
Локальный `.env` файл **НЕ используется** (кроме 3 credentials для подключения к Infisical).

---

## 🚀 Быстрый старт

### 1️⃣ Создайте Machine Identity в Infisical

1. Откройте ваш проект на https://app.infisical.com
2. Перейдите в **Settings → Machine Identities**
3. Нажмите **Create Machine Identity**
4. Выберите **Universal Auth**
5. Настройте permissions для нужного environment (development/production)
6. Скопируйте **Client ID** и **Client Secret**

### 2️⃣ Получите Project ID

1. В Infisical откройте ваш проект
2. Скопируйте **Project ID** из URL или Settings

### 3️⃣ Создайте минимальный .env файл

Создайте файл `.env` с **ТОЛЬКО** этими 3 переменными:

```bash
# Infisical credentials (ЕДИНСТВЕННЫЕ переменные в .env)
INFISICAL_CLIENT_ID=your-client-id-here
INFISICAL_CLIENT_SECRET=your-client-secret-here
INFISICAL_PROJECT_ID=your-project-id-here

# Опционально (по умолчанию development/production автоопределение)
# INFISICAL_ENVIRONMENT=development
# INFISICAL_SITE_URL=https://app.infisical.com
```

**❌ ВСЕ ОСТАЛЬНЫЕ СЕКРЕТЫ (токены ботов, API ключи) НЕ ДОЛЖНЫ быть в .env!**

### 4️⃣ Загрузите секреты в Infisical

Перейдите в Infisical и добавьте все необходимые секреты:

```
BOT_TOKEN_1=7123456789:AAH...
BOT_TOKEN_2=7234567890:AAH...
REPLICATE_API_TOKEN=r8_...
FAL_KEY=...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 5️⃣ Запустите приложение

```bash
npm run dev
```

При старте приложение:
1. ✅ Подключится к Infisical
2. ✅ Загрузит **ВСЕ** секреты в память
3. ✅ Запустится с секретами из облака

---

## 📖 Использование в коде

### Инициализация (при старте приложения)

```typescript
import { initInfisical } from '@/core/infisical'

// ПЕРЕД запуском бота!
await initInfisical()
```

### Получение секретов

```typescript
import { getSecret, getSecrets } from '@/core/infisical'

// Получить один секрет
const botToken = getSecret('BOT_TOKEN_1')

// Получить несколько секретов
const { REPLICATE_API_TOKEN, FAL_KEY } = getSecrets([
  'REPLICATE_API_TOKEN',
  'FAL_KEY'
])

// С fallback для опциональных секретов
const debugMode = getSecretOrDefault('DEBUG_MODE', 'false')
```

---

## 🔄 Обновление секретов

Если секреты были обновлены в Infisical:

```typescript
import { reloadSecrets } from '@/core/infisical'

// Перезагрузить все секреты из облака
await reloadSecrets()
```

---

## 📊 Проверка статуса

```typescript
import { getSecretsStats, isInfisicalReady } from '@/core/infisical'

// Проверить готовность
if (isInfisicalReady()) {
  console.log('✅ Infisical ready!')
}

// Получить статистику
const stats = getSecretsStats()
console.log(`Loaded ${stats.totalSecrets} secrets from ${stats.environment}`)
```

---

## 🔒 Безопасность

### ✅ Что ХРАНИТСЯ локально:
- ТОЛЬКО credentials для подключения к Infisical (3 переменные)

### ❌ Что НЕ ХРАНИТСЯ локально:
- Токены ботов
- API ключи
- Пароли от базы данных
- Любые другие секреты

### 🎯 Преимущества:

1. **Централизация**: Все секреты в одном месте (Infisical)
2. **Безопасность**: Секреты не попадают в git
3. **Гибкость**: Можно обновить секреты без редеплоя
4. **Аудит**: Infisical логирует все изменения секретов
5. **Команды**: Разные секреты для dev/staging/production

---

## 🚀 Production Deployment

### Render Server / Vercel / Render:

Добавьте environment variables:
```
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...
INFISICAL_PROJECT_ID=...
INFISICAL_ENVIRONMENT=production
```

### Docker:

```dockerfile
# Только 3 credentials в environment
ENV INFISICAL_CLIENT_ID=...
ENV INFISICAL_CLIENT_SECRET=...
ENV INFISICAL_PROJECT_ID=...
ENV INFISICAL_ENVIRONMENT=production
```

### GitHub Actions:

```yaml
env:
  INFISICAL_CLIENT_ID: ${{ secrets.INFISICAL_CLIENT_ID }}
  INFISICAL_CLIENT_SECRET: ${{ secrets.INFISICAL_CLIENT_SECRET }}
  INFISICAL_PROJECT_ID: ${{ secrets.INFISICAL_PROJECT_ID }}
  INFISICAL_ENVIRONMENT: production
```

---

## ⚠️ Troubleshooting

### Ошибка: "Infisical credentials missing"

Проверьте что в `.env` есть все 3 переменные:
```bash
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...
INFISICAL_PROJECT_ID=...
```

### Ошибка: "Secret 'BOT_TOKEN_1' not found"

1. Откройте Infisical
2. Проверьте что секрет добавлен в правильный environment
3. Проверьте что Machine Identity имеет доступ к секретам

### Ошибка: "Authentication failed"

1. Проверьте что Client ID и Client Secret правильные
2. Проверьте что Machine Identity не заблокирована
3. Проверьте сетевое подключение к app.infisical.com

---

## 📚 Документация

- [Infisical SDK](https://infisical.com/docs/sdks/node)
- [Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth)
- [Machine Identities](https://infisical.com/docs/documentation/platform/identities/machine-identities)

---

## 🎉 Готово!

Теперь все ваши секреты безопасно хранятся в облаке Infisical!
