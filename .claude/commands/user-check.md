---
name: user-check
description: Check Telegram user balance, payments, and status via Supabase API
---

# User Check — Supabase Direct Query

Check user by Telegram ID via Supabase REST API (no SSH needed).

## Usage
```
/user-check 144022504
```

## Steps

### 1. Get Supabase credentials
```bash
SUPABASE_URL=$(grep "^SUPABASE_URL=" /tmp/railway_secrets.txt | head -1 | sed "s/^SUPABASE_URL='//;s/'$//")
SUPABASE_KEY=$(grep "^SUPABASE_SERVICE_KEY=" /tmp/railway_secrets.txt | head -1 | sed "s/^SUPABASE_SERVICE_KEY='//;s/'$//")
```

### 2. Find user in database
```bash
curl -s "${SUPABASE_URL}/rest/v1/users?telegram_id=eq.$ARGUMENTS&select=*" \
  -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
```

### 3. Get payment history
```bash
curl -s "${SUPABASE_URL}/rest/v1/payments_v2?telegram_id=eq.$ARGUMENTS&select=type,amount,stars,currency,payment_method,service_type,status,created_at&order=created_at.desc&limit=20" \
  -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
```

### 4. Calculate balance
```bash
# Balance = SUM(MONEY_INCOME stars) - SUM(MONEY_OUTCOME stars)
# Query both types and calculate
```

### 5. Check bot ownership
```bash
curl -s "${SUPABASE_URL}/rest/v1/avatars?telegram_id=eq.$ARGUMENTS&select=*" \
  -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
```

## Report Format
```
🔍 User: $ARGUMENTS

👤 Profile: @username, language, registered date
💰 Balance: X⭐ = Y₽ = $Z
📊 Payments: N income, M outcome
🤖 Bot owner: yes/no (which bots)

Recent transactions:
  [date] INCOME  +100⭐ via Robokassa (1000₽)
  [date] OUTCOME  -8⭐ neuro_photo
```

## Common Issues
- Balance = 0 → User needs to top up
- No user found → Not registered, send /start
- Negative balance → Race condition bug, investigate
