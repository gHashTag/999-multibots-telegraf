# 📦 DEPLOYMENT RULES - ПРАВИЛА ДЕПЛОЯ

## 🚨 КРИТИЧЕСКИ ВАЖНО!

### ВЕТКИ И СЕРВЕРЫ:

1. **main** → `three-head-dev.shop`
   - SSL сертификаты: `/etc/letsencrypt/live/three-head-dev.shop/fullchain.pem`
   - SSL ключ: `/etc/letsencrypt/live/three-head-dev.shop/privkey.pem`
   - Деплой через: `deploy.yml`

2. **production** → `212.86.115.30` (IP адрес)
   - Прямой SSH доступ
   - Деплой через: `production-deploy.yml`

### ❌ НИКОГДА НЕ ПУТАТЬ!

- НЕ заливать main в 212.86.115.30
- НЕ заливать production в three-head-dev.shop
- main = домен three-head-dev.shop
- production = IP 212.86.115.30

### 🔧 Workflow файлы:

- `.github/workflows/deploy.yml` - деплоит **main** в **three-head-dev.shop**
- `.github/workflows/production-deploy.yml` - деплоит **production** в **212.86.115.30**

### 📝 КОМАНДЫ:

```bash
# Деплой в main (three-head-dev.shop)
git push origin functional-architecture:main

# Деплой в production (212.86.115.30)
git push origin functional-architecture:production
```

### ⚠️ ПРОВЕРКИ ПЕРЕД ДЕПЛОЕМ:

1. Убедиться, что правильная ветка
2. Проверить server_host в deploy.yml или production-deploy.yml
3. Убедиться в SSL сертификатах для three-head-dev.shop
