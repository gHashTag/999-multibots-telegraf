# 🔑 Экстракция Inngest Keys - 3 Паттерна

## 🎯 ПАТТЕРН 1: Browser DevTools + Скрипт

### Шаги:
1. **Откройте** https://app.inngest.com/env/production/manage/keys в браузере
2. **Нажмите F12** → Console
3. **Выполните этот скрипт** в консоли:

```javascript
// Скрипт для поиска ключей в Inngest Dashboard
(function() {
  console.log('🔍 Поиск Inngest Keys...\n');

  // 1. Ищем в localStorage
  const localKeys = {
    eventKey: localStorage.getItem('event_key') || localStorage.getItem('INNGEST_EVENT_KEY'),
    signingKey: localStorage.getItem('signing_key') || localStorage.getItem('INNGEST_SIGNING_KEY')
  };

  // 2. Ищем в sessionStorage
  const sessionKeys = {
    eventKey: sessionStorage.getItem('event_key'),
    signingKey: sessionStorage.getItem('signing_key')
  };

  // 3. Ищем в cookies
  const cookies = document.cookie;
  const cookieKeys = {
    eventKey: cookies.match(/event_key=([^;]+)/)?.[1],
    signingKey: cookies.match(/signing_key=([^;]+)/)?.[1]
  };

  // 4. Ищем в глобальных переменных
  const globalKeys = {
    eventKey: window.event_key || window.INNGEST_EVENT_KEY,
    signingKey: window.signing_key || window.INNGEST_SIGNING_KEY
  };

  // 5. Ищем в DOM (иногда ключи в data-атрибутах)
  const domKeys = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    domKeys[el.getAttribute('data-key')] = el.getAttribute('data-value');
  });

  // Объединяем все источники
  const allKeys = [localKeys, sessionKeys, cookieKeys, globalKeys, domKeys];

  let foundEventKey = null;
  let foundSigningKey = null;

  // Ищем первый доступный ключ
  for (const source of allKeys) {
    if (!foundEventKey && source.eventKey) foundEventKey = source.eventKey;
    if (!foundSigningKey && source.signingKey) foundSigningKey = source.signingKey;
  }

  // Выводим результаты
  if (foundEventKey || foundSigningKey) {
    console.log('✅ НАЙДЕНЫ КЛЮЧИ!\n');
    if (foundEventKey) {
      console.log('INNGEST_EVENT_KEY=' + foundEventKey);
      console.log(`Скопируйте: INNGEST_EVENT_KEY=${foundEventKey}\n`);
    }
    if (foundSigningKey) {
      console.log('INNGEST_SIGNING_KEY=' + foundSigningKey);
      console.log(`Скопируйте: INNGEST_SIGNING_KEY=${foundSigningKey}\n`);
    }

    // Копируем в буфер обмена
    const textToCopy = `INNGEST_EVENT_KEY=${foundEventKey}\nINNGEST_SIGNING_KEY=${foundSigningKey}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      console.log('📋 Ключи скопированы в буфер обмена!');
    }).catch(() => {
      console.log('⚠️  Не удалось скопировать в буфер обмена');
    });
  } else {
    console.log('❌ Ключи не найдены автоматически\n');
    console.log('Попробуйте ПАТТЕРН 2 или 3');
  }

  console.log('\n--- Все источники ---');
  console.log('localStorage:', localKeys);
  console.log('sessionStorage:', sessionKeys);
  console.log('cookies:', cookieKeys);
  console.log('global vars:', globalKeys);
  console.log('DOM:', domKeys);
})();
```

4. **Результат** появится в консоли - скопируйте найденные ключи

---

## 🎯 ПАТТЕРН 2: Network Tab в DevTools

### Шаги:
1. Откройте https://app.inngest.com/env/production/manage/keys
2. Нажмите **F12** → вкладка **Network**
3. **Перезагрузите страницу** (F5)
4. Ищите запросы к API:
   - `/api/keys`
   - `/manage/keys`
   - `environment/...`
5. Кликните на API запрос → **Response**
6. Найдите в JSON:
```json
{
  "event_key": "inngest_xxxxx",
  "signing_key": "sign_xxxxx"
}
```

---

## 🎯 ПАТТЕРН 3: Извлечение через cURL с Cookie

### Если у вас есть Cookie:

```bash
# 1. Получите cookie из браузера (F12 → Application → Cookies)
export INNGEST_COOKIE="your_cookie_here"

# 2. Выполните запрос
curl -H "Cookie: $INNGEST_COOKIE" \
  https://app.inngest.com/api/environments/production/keys \
  | jq .

# 3. Или прямое извлечение
curl -s -H "Cookie: $INNGEST_COOKIE" \
  https://app.inngest.com/api/environments/production/keys \
  | grep -E '"(event_key|signing_key)"' \
  | sed 's/.*: *"\([^"]*\)".*/\1/'
```

---

## 🚀 Быстрое решение

### Если ничего не помогает:

1. **Вручную скопируйте ключи** с https://app.inngest.com/env/production/manage/keys
2. **Добавьте в Infisical** (production среда)
3. **Перезапустите** контейнер

```bash
# После добавления ключей
ssh prod999 'docker restart 999-multibots'

# Проверьте
node scripts/check-inngest-status.js
```

---

## 💡 Подсказки

- **Event Key** обычно начинается с `inngest_`
- **Signing Key** обычно начинается с `sign_`
- Оба ключа видны в Dashboard в открытом виде
- Ключи могут быть в секции "Environment Variables" или "API Keys"

---

**🎯 После извлечения ключей → следуйте инструкции в INNGEST_KEYS_SETUP.md**
