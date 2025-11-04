# 🚨 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: nginx.conf

**Дата:** 2025-11-04  
**Статус:** ✅ ИСПРАВЛЕНО  
**Критичность:** 🔴 ВЫСОКАЯ

---

## ⚠️ НАЙДЕННАЯ ОШИБКА

В `nginx/nginx.conf` использовались DNS имена контейнеров `http://999-multibots:3000`, но с `--network host` DNS имена НЕ РАБОТАЮТ!

### До исправления:
```nginx
location = /api/telegram/ai-reels-callback {
    proxy_pass http://999-multibots:3000/api/telegram/ai-reels-callback;  ❌ НЕ РАБОТАЕТ!
}
```

### После исправления:
```nginx
location = /api/telegram/ai-reels-callback {
    proxy_pass http://127.0.0.1:3000/api/telegram/ai-reels-callback;  ✅ РАБОТАЕТ!
}
```

---

## 🔧 ИСПРАВЛЕНО 4 ЛОКАЦИИ:

1. **HTTP callback** (line 10-19) - `/api/telegram/ai-reels-callback`
2. **HTTPS callback** (line 38-47) - `/api/telegram/ai-reels-callback`
3. **All API** (line 49-58) - `/api/`
4. **Main app** (line 60-72) - `/`
5. **Health** (line 74-81) - `/health`

Все изменены на `http://127.0.0.1:3000`

---

## 📚 ПРАВИЛО ДЛЯ БУДУЩЕГО

### ❌ НЕПРАВИЛЬНО (с --network host):
```nginx
proxy_pass http://999-multibots:3000  # DNS не работает!
proxy_pass http://bot-proxy:3000      # DNS не работает!
```

### ✅ ПРАВИЛЬНО (с --network host):
```nginx
proxy_pass http://127.0.0.1:3000      # Локальный доступ работает!
proxy_pass http://localhost:3000      # Тоже работает!
```

---

## ✅ ПРОВЕРКА

После исправления:
```bash
# Проверка nginx конфигурации
nginx -t

# Перезапуск nginx
docker restart bot-proxy

# Тест
curl http://localhost/api/telegram/ai-reels-callback
```

---

## 📝 ПРИЧИНА ОШИБКИ

Docker `--network host` удаляет изоляцию сети, контейнеры используют localhost хост системы, а не внутреннюю DNS систему Docker.

**Результат:** Контейнеры видят друг друга только через `127.0.0.1` или `localhost`.

---

**Автор:** Claude Code  
**Исправлено:** 2025-11-04 04:53 UTC
