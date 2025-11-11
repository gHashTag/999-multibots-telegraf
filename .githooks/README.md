# 🔒 Git Hooks - Защита от опасных изменений

## Что это?

Git hooks - это скрипты, которые автоматически запускаются при определенных git событиях (commit, push и т.д.).

Наш `pre-commit` хук проверяет `docker-compose.yml` **ПЕРЕД** каждым коммитом и блокирует опасные изменения.

## 🛡️ Что проверяется?

### ❌ БЛОКИРУЕТСЯ:
- Порты nginx `8443:443` или `8080:80` (нестандартные)
- Отсутствие портов `443:443` или `80:80`
- Синтаксические ошибки в docker-compose.yml

### ✅ РАЗРЕШАЕТСЯ:
- Порты nginx `443:443` и `80:80` (стандартные)
- Любые другие изменения в docker-compose.yml

## 📦 Установка

### Автоматическая (рекомендуется)

```bash
git config core.hooksPath .githooks
```

Эта команда настроит git использовать наши custom hooks из директории `.githooks/`.

### Проверка установки

```bash
git config core.hooksPath
# Должно вывести: .githooks
```

### Тест

Попробуй изменить порты на нестандартные и закоммитить:

```yaml
# В docker-compose.yml
ports:
  - '8443:443'  # ПЛОХО!
  - '8080:80'   # ПЛОХО!
```

```bash
git add docker-compose.yml
git commit -m "Test bad ports"
```

Ты должен увидеть:
```
❌ ОШИБКА: Обнаружены нестандартные порты в docker-compose.yml!
```

И коммит будет заблокирован! 🛡️

## 🔧 Деактивация (НЕ РЕКОМЕНДУЕТСЯ!)

Если очень нужно обойти проверку (на свой страх и риск):

```bash
git commit --no-verify -m "Bypass hooks"
```

⚠️ **НО! Это опасно! GitHub Actions всё равно заблокирует PR!**

## 🤖 CI/CD - Двойная защита

Даже если обойдёшь локальный pre-commit hook, есть вторая линия защиты:

**GitHub Actions** автоматически проверяет каждый PR и Push в `main`/`production`.

См. `.github/workflows/validate-docker-compose.yml`

## 📖 Дополнительно

- **Troubleshooting:** См. `WEBHOOK_TROUBLESHOOTING.md`
- **Production validation:** `./scripts/validate-production.sh`

## 🆘 Помощь

Если hook не работает или блокирует правильные изменения:

1. Проверь что hook исполняемый:
   ```bash
   ls -la .githooks/pre-commit
   # Должно быть: -rwxr-xr-x
   ```

2. Если нет - сделай исполняемым:
   ```bash
   chmod +x .githooks/pre-commit
   ```

3. Проверь установлен ли hooksPath:
   ```bash
   git config core.hooksPath
   ```

4. Если не установлен - установи:
   ```bash
   git config core.hooksPath .githooks
   ```

## 🎯 Зачем это всё?

**Боль до:**
- Кто-то вручную меняет порты на 8443:443
- Деплой проходит успешно
- Webhooks перестают работать
- WAN 2.5, Veo 3, Sora - всё ломается
- Часы дебаггинга 😭

**Радость после:**
- Git hook блокирует опасные изменения ✅
- GitHub Actions - вторая линия защиты ✅
- Production validation скрипт проверяет сервер ✅
- Webhooks **ВСЕГДА** работают! 🎉
