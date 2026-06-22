# Financial Audit Query Reference

## Complete Audit Script

Run this via Bash with SUPABASE_URL and SUPABASE_KEY from `/tmp/railway_secrets.txt`:

```bash
SUPABASE_URL=$(grep "^SUPABASE_URL=" /tmp/railway_secrets.txt | head -1 | sed "s/^SUPABASE_URL='//;s/'$//")
SUPABASE_KEY=$(grep "^SUPABASE_SERVICE_KEY=" /tmp/railway_secrets.txt | head -1 | sed "s/^SUPABASE_SERVICE_KEY='//;s/'$//")
export SUPABASE_URL SUPABASE_KEY
```

## Pagination Function (Python)

```python
def api_all(table, params=""):
    all_data = []
    offset = 0
    while True:
        sep = "&" if params else ""
        url = f"{SU}/rest/v1/{table}?{params}{sep}limit=1000&offset={offset}"
        req = urllib.request.Request(url, headers={"apikey": SK, "Authorization": f"Bearer {SK}"})
        batch = json.loads(urllib.request.urlopen(req, timeout=60).read())
        all_data.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return all_data
```

## Key Queries

### Load all data
```python
avatars = api_all("avatars", "select=telegram_id,bot_name")
income = api_all("payments_v2", "select=telegram_id,bot_name,type,amount,stars,currency,payment_method,service_type,cost&type=eq.MONEY_INCOME")
outcome = api_all("payments_v2", "select=telegram_id,bot_name,type,amount,stars,currency,payment_method,service_type,cost&type=eq.MONEY_OUTCOME")
```

### Real payment methods (money goes to owner)
```python
REAL = {'Telegram', 'Robokassa', 'TON_NATIVE', 'X402', 'CryptoBot'}
```

### Income calculation
```python
# For RUB payments: use 'amount' field (real rubles)
# For XTR payments: use 'stars' field
# For USDC: use 'amount' field (real dollars)

if currency == 'RUB':
    income_rub += amount  # amount = rubles
elif currency in ('USDC', 'USDT_TON'):
    income_usd += amount  # amount = dollars
else:  # XTR, STARS
    income_stars += stars  # stars = Telegram Stars
```

### Currency conversion
```python
STAR_USD = 0.016    # 1 star = $0.016
USD_RUB = 91        # 1 USD = 91 RUB

# Stars to RUB: stars * STAR_USD * USD_RUB
# Stars to USD: stars * STAR_USD
# RUB to USD: rub / USD_RUB
```

### Cost calculation
```python
# MONEY_OUTCOME records: 'stars' field = cost in stars
# Group by service_type for breakdown
cost_stars += stars
cost_by_service[service_type] += stars
```

## Report Template

```
ВЛАДЕЛЕЦ: {owner_id} | {n_bots} бот(ов) | {n_clients} клиентов

🤖 @{bot_name} ({n_clients} клиентов)
   💰 ДОХОД:
      Telegram Stars: {stars}⭐ = {stars*1.456}₽ = ${stars*0.016}
      Robokassa:                = {rub}₽          = ${rub/91}
      ИТОГО:                    = {total_rub}₽    = ${total_usd}
   
   💸 СЕБЕСТОИМОСТЬ AI:
      {service}: {cost}⭐ = {cost*1.456}₽ = ${cost*0.016}
      ИТОГО:    {total_cost}⭐ = {cost_rub}₽ = ${cost_usd}
   
   📊 ПРИБЫЛЬ: {profit_rub}₽ = ${profit_usd} ({margin}%)
   ⚠️  ДОЛГ:    {cost_rub}₽ = ${cost_usd}
```

## Common Pitfalls

1. **Pagination**: Default Supabase limit is 1000. Without pagination, you lose 94% of data
2. **Amount vs Stars**: For RUB payments, `amount` = rubles, `stars` = converted. Use `amount` for real RUB income
3. **System payments**: Filter out payment_method NOT IN REAL set — these are bonuses/migrations, not real owner income
4. **Bot ownership**: Always join through `avatars` table, not by telegram_id in payments
