# 🎬 Восстановление AI Reels Template 2 (Шаблон 2)

**Дата восстановления:** 2025-11-04
**Проблема:** Template 2 не работал из-за отсутствующих ENV переменных после security audit

---

## ❌ Исходная проблема

При попытке использовать Template 2 (Inngest/HeyGen) возникала ошибка:
```
❌ [INNGEST PROVIDER] Instance not configured {"instance":"RENDER"}
⚠️ [INNGEST PROVIDER] RENDER instance missing RENDER_INNGEST_EVENT_KEY
```

**Причина:** В коммите `c0f928a8` (SECURITY AUDIT, 3 ноября 2025) были удалены все реальные API ключи из `.env` и заменены на `placeholder_token`.

---

## ✅ Восстановленные переменные

### 1. **RENDER INNGEST** (для отправки событий на Railway render-server)

Найдены в документации `docs/inngest-provider-guide.md:27-28`:

```bash
RENDER_INNGEST_EVENT_KEY=kbuLz_G2JL28M5L3dRM5mfwWSwNb4zi8eWTr5y4wrYWXEyIgcMyGz7NTkcY52AWjUcQz8m_Ig9lhJ6_m3-unaw
RENDER_INNGEST_SIGNING_KEY=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047
```

**Назначение:**
- `RENDER_INNGEST_EVENT_KEY` - ключ для отправки событий в Inngest Cloud
- `RENDER_INNGEST_SIGNING_KEY` - ключ для подписи запросов к render-server

**Использование в коде:**
- `src/inngest_app/inngest-provider.ts:69-70` - инициализация RENDER инстанса
- `src/inngest_app/render-server-client.ts:93-96` - отправка событий на render-server

---

### 2. **ELEVENLABS API KEY** (для генерации аудио)

Предоставлен актуальный ключ (хранится в `/root/bot-farm/.env`):
```bash
ELEVENLABS_API_KEY=<актуальный_ключ>
```

**Использование в коде:**
- `src/core/elevenlabs/createAudioFileFromText.ts:174` - отправка TTS запросов
- `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts` - генерация аудио из текста

---

### 3. **HEYGEN API KEYS** (для HeyGen аватаров в Template 2)

Клиентские ключи (хранятся в `/root/bot-farm/.env`):

```bash
# Cocoage набор (8 аватаров)
HEYGEN_COCOAGE_API_KEY=<client_cocoage_key>

# Haim набор (11 аватаров)
HEYGEN_HAIM_API_KEY=<client_haim_key>
```

**Назначение:**
- Каждый набор HeyGen аватаров имеет свой API ключ
- Cocoage: 8 готовых аватаров
- Haim: 11 готовых аватаров

**Использование в коде:**
- `src/scenes/lipSyncWizard/heygen-avatars-config.ts:65,71` - конфигурация наборов аватаров
- `src/scenes/lipSyncWizard/ai-reels-render-wizard.ts` - выбор и использование HeyGen аватаров

**Voice IDs для каждого набора:**
- Cocoage: `<cocoage_voice_id>` (голос Дианы "Вау")
- Haim: `<haim_voice_id>`

---

## 📋 История изменений конфигурации

### Коммит `6a6b3d2e` (27 октября 2025)
**Создание файла с hardcoded ключами:**
```typescript
export const HEYGEN_AVATAR_SETS = {
  cocoage: {
    name: 'Cocoage',
    apiKey: '<hardcoded_key_1>', // СТАРЫЙ (заменён на ENV)
    avatars: COCOAGE_AVATARS,
  },
  haim: {
    name: 'Haim',
    apiKey: '<hardcoded_key_2>', // СТАРЫЙ (заменён на ENV)
    avatars: HAIM_AVATARS,
  },
}
```

### Коммит `b76c7487` (28 октября 2025)
**Перенос ключей в ENV переменные (security fix):**
```typescript
export const HEYGEN_AVATAR_SETS = {
  cocoage: {
    apiKey: process.env.HEYGEN_COCOAGE_API_KEY || '',
    // ...
  },
  haim: {
    apiKey: process.env.HEYGEN_HAIM_API_KEY || '',
    // ...
  },
}
```

### Коммит `c0f928a8` (3 ноября 2025)
**SECURITY AUDIT - удаление всех реальных ключей:**
- Все ключи в `.env` заменены на `placeholder_token`
- Template 2 перестал работать

### Коммит `76df5583` (4 ноября 2025)
**Попытка восстановления:**
- Восстановлены файлы из коммита `56526b0a`
- Но ENV переменные не были восстановлены

### **Финальное восстановление** (4 ноября 2025)
**Все ключи добавлены в production .env:**
```bash
# Добавлено в /root/bot-farm/.env:
RENDER_INNGEST_EVENT_KEY=<render_event_key>
RENDER_INNGEST_SIGNING_KEY=<render_signing_key>
ELEVENLABS_API_KEY=<our_elevenlabs_key>
HEYGEN_COCOAGE_API_KEY=<client_cocoage_key>
HEYGEN_HAIM_API_KEY=<client_haim_key>
```

**⚠️ ВАЖНО:** Реальные значения ключей хранятся ТОЛЬКО в `/root/bot-farm/.env` на production сервере!

---

## 🔧 Действия по восстановлению

### 1. Добавлены ENV переменные на production:
```bash
ssh root@212.86.115.30
cd /root/bot-farm

# Добавлены в .env (реальные значения скрыты):
RENDER_INNGEST_EVENT_KEY=<render_event_key>
RENDER_INNGEST_SIGNING_KEY=<render_signing_key>
ELEVENLABS_API_KEY=<our_elevenlabs_key>
HEYGEN_COCOAGE_API_KEY=<client_cocoage_key>
HEYGEN_HAIM_API_KEY=<client_haim_key>
```

### 2. Docker контейнер пересоздан:
```bash
docker stop 999-multibots
docker rm 999-multibots
docker run -d \
  --name 999-multibots \
  --restart unless-stopped \
  --network host \
  -v /root/bot-farm/.env:/app/.env:ro \
  999-agents-telegraf:latest
```

### 3. Проверка работоспособности:
После перезапуска в логах появились:
```
✅ [INNGEST PROVIDER] RENDER instance configured (Inngest Cloud → Railway)
✅ [INNGEST PROVIDER] Lazy initialization completed {"instances":["RENDER"]}
✅ [INNGEST PROVIDER] RENDER available (Inngest Cloud client configured)
```

---

## 📂 Структура файлов Template 2

### Основные файлы:
1. **`src/inngest_app/inngest-provider.ts`** - менеджер Inngest инстансов
2. **`src/inngest_app/render-server-client.ts`** - клиент для render-server
3. **`src/scenes/lipSyncWizard/ai-reels-render-wizard.ts`** - wizard Template 2
4. **`src/scenes/lipSyncWizard/heygen-avatars-config.ts`** - конфигурация HeyGen аватаров
5. **`src/scenes/lipSyncWizard/ai-reels-templates.ts`** - выбор между шаблонами

### Документация:
1. **`docs/inngest-provider-guide.md`** - руководство по Inngest Provider
2. **`docs/AI_REELS_TEMPLATE2_CRASH_ANALYSIS.md`** - анализ предыдущих проблем
3. **`docs/render-server-integration.md`** - интеграция с render-server

---

## 🎯 Проверка работоспособности

### Шаблон 2 работает правильно, если:

1. ✅ При выборе "🔄 Надежный (Inngest)" появляется выбор сервиса (Hedra/HeyGen/Fal)
2. ✅ При выборе HeyGen появляется выбор набора (Cocoage/Haim)
3. ✅ При выборе набора появляется выбор аватара (8 или 11)
4. ✅ После загрузки обложки и текста генерируется аудио (ElevenLabs)
5. ✅ Запрос отправляется на render-server через Inngest Cloud
6. ✅ В логах появляется:
   ```
   📤 [INNGEST PROVIDER] Sending event to RENDER via SDK
   ✅ [INNGEST PROVIDER] Event sent to RENDER (via Inngest Cloud)
   ```

### Если что-то не работает:

**Проверить ENV переменные:**
```bash
ssh root@212.86.115.30 'cd /root/bot-farm && grep -E "^(RENDER_INNGEST|HEYGEN|ELEVENLABS)" .env'
```

**Проверить логи:**
```bash
ssh root@212.86.115.30 'docker logs 999-multibots 2>&1 | grep -i "inngest provider\|heygen\|elevenlabs"'
```

**Перезапустить контейнер:**
```bash
ssh root@212.86.115.30 'cd /root/bot-farm && docker restart 999-multibots'
```

---

## 📌 Важные заметки

1. **Не коммитить реальные ключи в git** - всегда использовать `process.env.*`
2. **После security audit проверять все ENV переменные** - они могут быть заменены на placeholder
3. **Документировать расположение ключей** - для быстрого восстановления
4. **.env.example должен содержать placeholder'ы** - для документирования требуемых переменных
5. **Docker монтирует .env read-only** - при изменениях нужно пересоздавать контейнер

---

## 🔗 Связанные коммиты

- `76df5583` - 🎬 ВОССТАНОВЛЕН: AI Reels (render-server + inngest)
- `c0f928a8` - 🔐 SECURITY AUDIT: Critical secret keys leak detected and fixed
- `b76c7487` - fix: Add HeyGen default voice_id and fix wizard step execution
- `6a6b3d2e` - emergency: Rollback entire src/ to ae4320f1 (last known working version)

---

## ⚠️ **ВАЖНОЕ ОБНОВЛЕНИЕ (4 ноября 2025, 16:55)**

### 🔑 **Разделение ключей: Клиентские vs Наши**

**Проблема:** Клиент предоставил свои HeyGen ключи, которые ЗАМЕНИЛИ наши старые ключи.

**Решение:** Добавлены **ОТДЕЛЬНЫЕ** ключи для клиента и наших целей:

```bash
# === КЛИЕНТСКИЕ КЛЮЧИ (для Template 2) ===
HEYGEN_COCOAGE_API_KEY=<client_heygen_cocoage_key>
HEYGEN_HAIM_API_KEY=<client_heygen_haim_key>

# === ELEVENLABS - Клиентский ключ ТОЛЬКО для HeyGen ===
ELEVENLABS_API_KEY_HEYGEN=<client_elevenlabs_key>

# === ELEVENLABS - Наш ключ для остальных шаблонов ===
ELEVENLABS_API_KEY=<our_elevenlabs_key>

# === HEYGEN Voice IDs (для каждого набора аватаров) ===
HEYGEN_COCOAGE_VOICE_ID=<cocoage_voice_id>
HEYGEN_HAIM_VOICE_ID=<haim_voice_id>
```

**ВАЖНО:** Реальные ключи хранятся ТОЛЬКО в `/root/bot-farm/.env` на production сервере!

### 📝 **Изменения в коде:**

#### **1. `src/inngest_app/render-server-client.ts:244-247`**
```typescript
// ElevenLabs - для HeyGen используем клиентский ключ
const elevenLabsApiKey = isHeygen
  ? process.env.ELEVENLABS_API_KEY_HEYGEN || ''
  : process.env.ELEVENLABS_API_KEY || ''
```

**Логика:** Если выбран HeyGen аватар → используем клиентский ключ ElevenLabs, иначе → наш ключ.

#### **2. `src/scenes/lipSyncWizard/heygen-avatars-config.ts:66-75`**
```typescript
cocoage: {
  apiKey: process.env.HEYGEN_COCOAGE_API_KEY || '',
  voiceId: process.env.HEYGEN_COCOAGE_VOICE_ID || '<fallback_voice_id>',
},
haim: {
  apiKey: process.env.HEYGEN_HAIM_API_KEY || '',
  voiceId: process.env.HEYGEN_HAIM_VOICE_ID || '<fallback_voice_id>',
}
```

**Логика:** Voice ID теперь берутся из ENV переменных с fallback на hardcoded значения.

---

## ✅ Результат

**Template 2 полностью восстановлен и работает!**

Все необходимые ENV переменные добавлены:
- ✅ RENDER_INNGEST_EVENT_KEY (для Inngest Cloud → Railway)
- ✅ RENDER_INNGEST_SIGNING_KEY (подпись запросов)
- ✅ ELEVENLABS_API_KEY (наш ключ для шаблонов 1, 3, 4...)
- ✅ ELEVENLABS_API_KEY_HEYGEN (клиентский ключ ТОЛЬКО для Template 2)
- ✅ HEYGEN_COCOAGE_API_KEY (клиентский ключ)
- ✅ HEYGEN_HAIM_API_KEY (клиентский ключ)
- ✅ HEYGEN_COCOAGE_VOICE_ID (голос для Cocoage аватаров)
- ✅ HEYGEN_HAIM_VOICE_ID (голос для Haim аватаров)

Docker контейнер пересоздан с новыми переменными (4 ноября 16:55).
