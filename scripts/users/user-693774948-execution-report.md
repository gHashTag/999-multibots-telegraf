# 🎬 Отчет: Предоставление подписки NEUROVIDEO пользователю 693774948

## 📋 Краткая информация

- **Telegram ID**: 693774948
- **Задача**: Добавить подписку "Мировидео" (NEUROVIDEO) и предоставить полный доступ
- **Тип подписки**: NEUROVIDEO
- **Длительность**: 30 дней
- **Production сервер**: 212.86.115.30 (Zomro)
- **Проект**: /root/bot-farm
- **Дата создания отчета**: 2025-10-28

---

## 🚀 Способы выполнения

### ✅ Вариант 1: Автоматический скрипт (Рекомендуется)

```bash
# Сделать скрипт исполняемым
chmod +x /Users/playra/999-agents-telegraf/scripts/execute-grant-neurovideo-693774948.sh

# Выполнить автоматический деплой
/Users/playra/999-agents-telegraf/scripts/execute-grant-neurovideo-693774948.sh
```

**Что делает скрипт:**
1. ✅ Копирует management скрипт на production сервер
2. ✅ Проверяет текущий статус пользователя 693774948
3. ✅ Добавляет подписку NEUROVIDEO в payments_v2
4. ✅ Верифицирует успешность операции
5. ✅ Генерирует финальный отчет

---

### 🔧 Вариант 2: Ручное выполнение SSH команд

#### Шаг 1: Копирование скрипта на сервер

```bash
scp -i ~/.ssh/zomro \
    /Users/playra/999-agents-telegraf/scripts/manage-user-693774948.js \
    root@212.86.115.30:/root/bot-farm/scripts/
```

#### Шаг 2: Выполнение на production сервере

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
export $(cat .env | grep -v '^#' | xargs)
node scripts/manage-user-693774948.js
EOF
```

---

### ⚡ Вариант 3: Прямые SQL команды (Для опытных пользователей)

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
export $(cat .env | grep -v '^#' | xargs)

node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function grantAccess() {
  const result = await supabase.from('payments_v2').insert({
    telegram_id: '693774948',
    amount: 0,
    stars: 0,
    currency: 'RUB',
    status: 'COMPLETED',
    type: 'MONEY_INCOME',
    subscription_type: 'NEUROVIDEO',
    payment_method: 'Manual',
    bot_name: 'neuro_blogger_bot',
    inv_id: 'manual-neurovideo-' + Date.now(),
    description: 'Manual NEUROVIDEO grant by admin - Мировидео',
    payment_date: new Date().toISOString(),
    is_system_payment: true,
    category: 'BONUS'
  }).select();

  if (result.error) {
    console.error('❌ Error:', result.error.message);
    process.exit(1);
  }

  console.log('✅ NEUROVIDEO subscription granted successfully!');
  console.log('Details:', result.data[0]);
}

grantAccess().then(() => process.exit(0)).catch(err => {
  console.error('💥 Critical error:', err);
  process.exit(1);
});
"
EOF
```

---

## 🔍 Проверка статуса пользователя

### Быстрая проверка статуса

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
export $(cat .env | grep -v '^#' | xargs)

node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkStatus() {
  // Проверка в users
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', '693774948')
    .single();

  console.log('👤 User Data:', {
    telegram_id: user?.telegram_id,
    first_name: user?.first_name,
    username: user?.username,
    created_at: user?.created_at
  });

  // Баланс
  const { data: balance } = await supabase.rpc('get_user_balance', {
    user_telegram_id: '693774948'
  });
  console.log('💰 Balance:', balance, 'stars');

  // Подписки
  const { data: subs } = await supabase
    .from('payments_v2')
    .select('subscription_type, payment_date, status')
    .eq('telegram_id', '693774948')
    .eq('status', 'COMPLETED')
    .order('payment_date', { ascending: false })
    .limit(3);

  console.log('📋 Subscriptions:');
  subs?.forEach((sub, i) => {
    const date = new Date(sub.payment_date);
    const exp = new Date(date);
    exp.setDate(date.getDate() + 30);
    const active = sub.subscription_type === 'NEUROTESTER' || new Date() < exp;
    console.log(\`  \${i+1}. \${sub.subscription_type} - \${active ? '✅ ACTIVE' : '❌ EXPIRED'}\`);
    console.log(\`     Date: \${sub.payment_date}\`);
  });
}

checkStatus().then(() => process.exit(0));
"
EOF
```

---

## 📊 Ожидаемый результат

После успешного выполнения:

### ✅ В таблице `payments_v2` появится запись:

```javascript
{
  telegram_id: "693774948",
  subscription_type: "NEUROVIDEO",
  status: "COMPLETED",
  type: "MONEY_INCOME",
  category: "BONUS",
  payment_method: "Manual",
  bot_name: "neuro_blogger_bot",
  description: "Manual NEUROVIDEO grant by admin - Мировидео",
  payment_date: "2025-10-28T...",
  is_system_payment: true,
  inv_id: "manual-neurovideo-{timestamp}"
}
```

### ✅ Пользователь получит доступ к:

- 🎬 Генерация видео с AI аватарами
- 🎭 Hedra avatars (загрузка своего фото)
- 🎬 HeyGen avatars (профессиональные готовые аватары)
- 🎵 Lipsync и озвучка
- 📹 AI Reels Template 2 (с выбором Hedra/HeyGen)
- ⚡ Приоритетная обработка запросов

### ⏰ Длительность подписки:

- **Начало**: Момент выполнения скрипта
- **Окончание**: +30 дней
- **Автопродление**: НЕТ (пользователь должен приобрести новую подписку)

---

## 🛠️ Troubleshooting

### Проблема 1: "User not found in database"

**Причина**: Пользователь ещё не запускал бота

**Решение**:
```bash
# Пользователь должен выполнить в боте:
/start
```

Затем повторить предоставление подписки.

---

### Проблема 2: "SUPABASE_URL or SUPABASE_SERVICE_KEY not found"

**Причина**: Отсутствуют переменные окружения на production сервере

**Решение**:
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30
cd /root/bot-farm

# Проверить .env файл
cat .env | grep SUPABASE

# Должны быть:
# SUPABASE_URL=https://...
# SUPABASE_SERVICE_KEY=eyJ...
```

---

### Проблема 3: "Subscription not active after grant"

**Причина**: Возможна проблема с логикой проверки подписок

**Решение**:
```bash
# Проверить что запись создалась в payments_v2
ssh -i ~/.ssh/zomro root@212.86.115.30 << 'EOF'
cd /root/bot-farm
export $(cat .env | grep -v '^#' | xargs)

node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

supabase.from('payments_v2')
  .select('*')
  .eq('telegram_id', '693774948')
  .eq('subscription_type', 'NEUROVIDEO')
  .order('payment_date', { ascending: false })
  .limit(1)
  .then(({ data, error }) => {
    if (error) console.error('Error:', error);
    else console.log('Latest NEUROVIDEO subscription:', data[0]);
    process.exit(0);
  });
"
EOF
```

---

## 📝 Документация системы подписок

### Типы подписок:

1. **NEUROTESTER** - Бессрочная подписка для тестировщиков
2. **NEUROVIDEO** - Видео генерация (30 дней) ← **НАША ЦЕЛЬ**
3. **NEUROPHOTO** - Фото обработка (30 дней)
4. **NEUROBLOGGER** - Контент создание (30 дней)

### Как работает логика проверки подписок:

**Файл**: `src/core/supabase/getUserDetailsSubscription.ts`

**Алгоритм**:
1. Поиск записей в `payments_v2` с `status: COMPLETED`
2. Фильтр по `subscription_type` (NEUROTESTER, NEUROVIDEO, NEUROPHOTO)
3. Сортировка по `payment_date` (последняя первая)
4. Проверка срока действия:
   - **NEUROTESTER**: всегда активна
   - **NEUROVIDEO/NEUROPHOTO**: активна если `payment_date + 30 дней > NOW()`

---

## 🔐 Security Notes

### ВАЖНО: Используемые credentials

**Production сервер**:
- SSH ключ: `~/.ssh/zomro`
- Пользователь: `root`
- Хост: `212.86.115.30`

**Supabase**:
- URL: Загружается из `.env` на сервере
- Service Key: Загружается из `.env` на сервере
- **НИКОГДА НЕ КОММИТИТЬ .env В GIT!**

---

## 📂 Файлы скрипта

**Созданные файлы**:
1. `/Users/playra/999-agents-telegraf/scripts/manage-user-693774948.js` - основной Node.js скрипт
2. `/Users/playra/999-agents-telegraf/scripts/execute-grant-neurovideo-693774948.sh` - bash обертка
3. `/Users/playra/999-agents-telegraf/scripts/user-693774948-execution-report.md` - этот отчет

**Расположение на production**:
- `/root/bot-farm/scripts/manage-user-693774948.js` (после выполнения execute скрипта)

---

## ✅ Финальный чеклист

Перед выполнением убедитесь:

- [ ] SSH ключ `~/.ssh/zomro` существует и доступен
- [ ] Production сервер 212.86.115.30 доступен
- [ ] Проект находится в `/root/bot-farm` (НЕ `/root/999-agents-telegraf`)
- [ ] Файл `.env` существует на production сервере
- [ ] Пользователь 693774948 хотя бы раз запускал бота (/start)

После выполнения:

- [ ] Проверить что подписка создалась в `payments_v2`
- [ ] Верифицировать статус подписки (активна, срок 30 дней)
- [ ] Проверить что пользователь имеет доступ к NEUROVIDEO функциям в боте
- [ ] Сохранить отчет с результатами выполнения

---

## 🎯 Готовая команда для выполнения

```bash
# Полный цикл: копирование + выполнение + верификация
chmod +x /Users/playra/999-agents-telegraf/scripts/execute-grant-neurovideo-693774948.sh && \
/Users/playra/999-agents-telegraf/scripts/execute-grant-neurovideo-693774948.sh
```

---

**Отчет создан автоматически агентом управления пользователями**
**Дата**: 2025-10-28
**Версия**: 1.0
