# 🏷️ Стабильные версии проекта

Этот файл содержит список всех стабильных версий для быстрого отката в случае проблем.

---

## v0.0.5 - AI Reels Template 2 ВОССТАНОВЛЕН (4 ноября 2025)

**Коммит:** `0ef16af1`
**Тег:** `v0.0.5`
**Docker Snapshot:** `v0.0.5-stable-20251104_193925.tar.gz`

### ✅ Что работает:

#### Template 2 (AI Reels - Inngest/HeyGen/Hedra/Fal):
1. ✅ Balance deduction (списание ПЕРЕД отправкой)
2. ✅ ElevenLabs API (без префикса `sk_`)
3. ✅ HeyGen API keys (Cocoage и Haim наборы)
4. ✅ Voice IDs для каждого набора аватаров
5. ✅ Inngest event отправка на render-server
6. ✅ **HTTP webhook callback (200 OK)**
7. ✅ **HTTPS webhook callback (200 OK)**
8. ✅ SSL Let's Encrypt certificates
9. ✅ Inline Step 6 execution (без wizard.next)

#### Архитектура:
- **Docker:** `--network host`
- **Nginx:** HTTP (80) + HTTPS (443)
- **SSL:** Let's Encrypt автообновление
- **Proxy:** `127.0.0.1:3000`
- **Callback URL:** `https://three-head-dragon.shop/api/telegram/ai-reels-callback`

#### ENV переменные (production `/root/bot-farm/.env`):
```bash
ELEVENLABS_API_KEY=737d2f8b185450984e1525893f0327f48736fe9e9d850d52cb63834337ca7dc4
HEYGEN_COCOAGE_API_KEY=sk_V2_hgu_kZgKPoImFA5_7wlQLLXqKLr2mag1hIM9caNiPtAYmjkj
HEYGEN_HAIM_API_KEY=sk_V2_hgu_kBLbUbWT3dT_i0NzHVIT9R8GNZR3xu8Ccw8RT6gIBNPJ
HEYGEN_COCOAGE_VOICE_ID=2b2e1f15157b454487f1250ffe586d7a
HEYGEN_HAIM_VOICE_ID=dc9cd149b0d741d6934a1d95e3f3ef00
```

**⚠️ ВАЖНО:** Реальные значения ключей хранятся ТОЛЬКО в `/root/bot-farm/.env` на production сервере!

### 🚨 Откат к этой версии:

#### Вариант 1: Git откат
```bash
git checkout v0.0.5
./deploy.sh deploy
```

#### Вариант 2: Docker snapshot
```bash
ssh root@212.86.115.30 'docker load < /root/snapshots/v0.0.5-stable-20251104_193925.tar.gz'
./deploy.sh deploy
```

### 📋 Проверка работоспособности:

```bash
# HTTP callback
curl http://three-head-dragon.shop/api/telegram/ai-reels-callback

# HTTPS callback
curl https://three-head-dragon.shop/api/telegram/ai-reels-callback
```

---

**Последнее обновление:** 4 ноября 2025, 19:40 MSK
**Сервер:** 212.86.115.30 (production)
**Статус:** ✅ STABLE
