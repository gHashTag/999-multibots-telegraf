---
name: user-check
description: Check and manage Telegram bot users - balance, subscription, access
---

# User Check Command - Telegram User Management

Automatically detects Telegram IDs (8-12 digits) and provides comprehensive user management.

## 🎯 What it does:

1. **User Existence Check** - Finds user in Supabase database
2. **Balance & Subscription** - Shows current balance, subscription status, trial
3. **Payment History** - Recent transactions and operations
4. **Access Problems** - Detects and provides solutions for common issues
5. **SSH Commands** - Provides ready-to-use commands for manual fixes

## 📋 Usage:

### Direct command:
```bash
/user-check 144022504
```

### Auto-detection (proactive):
When you mention a Telegram ID (8-12 digits) in your message, the agent activates automatically:
```
"Пользователь 144022504 не может сгенерировать видео"
→ Automatically triggers user check
```

### Multiple IDs:
```bash
/user-check 144022504 987654321
```

## 🔍 What the agent checks:

### 1. Database Status
- ✅ User exists in `users` table
- ✅ User ID, username, registration date
- ✅ Language preference
- ✅ Admin status

### 2. Balance & Subscription
- 💰 Current balance (rUv credits)
- 📅 Subscription: trial/premium/expired
- 🎁 Trial status and expiry
- 📊 Generation limits and usage

### 3. Recent Activity
- 🎨 Generated assets (videos, images, audio)
- 💳 Payment transactions
- 🔄 Balance operations
- ⚠️ Failed operations

### 4. Common Issues Detection
- ❌ Zero balance → Needs credits
- ❌ Subscription expired → Needs renewal
- ❌ Missing user → Not registered
- ❌ Access blocked → Admin intervention needed
- ❌ Generation limits exceeded → Reset or upgrade

## 🛠️ Auto-provided SSH Commands:

The agent provides ready-to-use commands for manual fixes:

### Grant free credits:
```bash
ssh prod999 "docker exec 999-multibots node -e \"
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data, error } = await supabase.rpc('update_user_balance', {
    p_telegram_id: '144022504',
    p_amount: 100,
    p_operation_type: 'admin_grant'
  });
  console.log(data ? 'Success' : error);
})();
\""
```

### Reset trial:
```bash
ssh prod999 "docker exec 999-multibots node -e \"
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { error } = await supabase
    .from('users')
    .update({
      trial_used: false,
      trial_expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString()
    })
    .eq('telegram_id', '144022504');
  console.log(error ? error : 'Trial reset');
})();
\""
```

### Check user in database:
```bash
ssh prod999 "docker exec 999-multibots node -e \"
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', '144022504')
    .single();
  console.log(JSON.stringify(data, null, 2));
})();
\""
```

## 📊 Example Output:

```
🔍 User Check: 144022504

✅ User Found
   ID: 550e8400-e29b-41d4-a716-446655440000
   Username: @john_doe
   Registered: 2025-10-15 14:30:00
   Language: ru

💰 Balance & Subscription
   Balance: 25.5 rUv
   Subscription: Trial (5 days left)
   Generation Limit: 10/20 used

📊 Recent Activity (last 7 days)
   ✅ 8 videos generated
   ✅ 2 images generated
   ✅ 1 payment: +50 rUv (2025-11-08)

🎯 Status: Active & Healthy
   No issues detected
```

## ⚠️ Common Issues & Solutions:

### Issue: "Zero balance"
**Detection:** `balance = 0`
**Solution:**
1. User needs to purchase credits
2. Admin can grant free credits (SSH command provided)
3. Check if trial is available

### Issue: "Subscription expired"
**Detection:** `trial_expires_at < NOW()`
**Solution:**
1. User needs to renew subscription
2. Admin can reset trial (SSH command provided)
3. Check payment history for issues

### Issue: "User not found"
**Detection:** `No rows returned from users table`
**Solution:**
1. User hasn't started bot yet → Send `/start` command
2. Database sync issue → Check Infisical secrets
3. Wrong Telegram ID → Verify ID is correct

### Issue: "Generation limits exceeded"
**Detection:** `usage_count >= limit`
**Solution:**
1. Wait for daily reset (00:00 UTC)
2. Upgrade subscription for higher limits
3. Admin can manually reset counters

## 🔗 Related:

- **Agent**: `telegram-user-manager` (`.claude/agents/telegram-user-manager.md`)
- **Database**: Supabase `users`, `assets`, `payments` tables
- **Skills**: `supabase-database`, `production-deployment`

## ⚙️ Configuration:

**Server**: root@188.137.250.69
**SSH Alias**: `prod999`
**Container**: `999-multibots`
**Database**: Supabase (via Infisical secrets)

## 🚀 Proactive Activation:

The `telegram-user-manager` agent automatically activates when it detects:
- 8-12 digit numbers in messages
- Keywords: "пользователь", "user", "юзер", "ID", "telegram"
- Problems mentioned: "не работает", "ошибка", "не может"

**Example:**
```
You: "Пользователь 144022504 пишет что не может сгенерировать видео"
Agent: *Automatically checks user 144022504*
Agent: "Checking user 144022504... Found! Balance: 0 rUv. User needs credits."
```

## 📱 Telegram Notifications:

If configured with `ADMIN_TELEGRAM_ID` and `NOTIFICATION_BOT_TOKEN`, the agent can send updates directly to admin via Telegram.

## 🛡️ Security:

- ✅ Only admins can execute SSH commands
- ✅ User data is not exposed in logs
- ✅ Balance operations are logged in `payments` table
- ✅ All database operations use Supabase RLS policies

---

**Last Updated**: 2025-11-11
**Version**: 1.0.0
**Status**: ✅ Active
