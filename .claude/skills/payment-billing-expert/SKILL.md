---
name: payment-billing-expert
description: Payment processing and billing expert for Telegram bot with Robokassa integration, Telegram Stars, balance management, and transaction handling. CRITICAL for business operations. Covers webhook handling, atomic transactions, idempotency, refunds, and subscription management. Use for all payment-related features and troubleshooting.
---

# 💰 Payment & Billing Expert - Мастер Платежных Операций

**Sanskrit Wisdom**: 🕉️ *"धनं प्रमाणं सर्वस्य"* (Dhanam Pramanam Sarvasya) - "Деньги требуют точности во всём"

**Философия**: "One payment error = lost customer trust. Atomicity is not optional. Idempotency is mandatory."

## 🎯 Core Knowledge

Этот Skill обеспечивает безопасность платежей через:
- 💳 Robokassa integration patterns
- ⭐ Telegram Stars payment
- 💰 Balance management (atomic operations)
- 🔁 Transaction atomicity (ACID compliance)
- 🔑 Idempotency keys
- 💸 Refund processing
- 📊 Subscription management
- 🔒 Webhook signature verification

**CRITICAL Importance**: Это **бизнес-критичная** система - ошибки недопустимы!

---

## 💳 Robokassa Integration

### Pattern 1: Generate Payment Link

```typescript
// src/handlers/paymentHandlers/handleTopUp.ts

import crypto from 'crypto';
import { getSecret } from '@/core/infisical/client';

export interface RobokassaPaymentParams {
  amount: number;          // Сумма в рублях
  userId: string;          // User ID для привязки
  description: string;     // Описание платежа
  invoiceId?: number;      // Опционально, для идемпотентности
}

export async function generateRobokassaLink(
  params: RobokassaPaymentParams
): Promise<string> {
  // 1. Get Robokassa credentials from Infisical
  const merchantLogin = await getSecret('ROBOKASSA_MERCHANT_LOGIN');
  const password1 = await getSecret('ROBOKASSA_PASSWORD_1');
  const isTest = process.env.NODE_ENV !== 'production';

  // 2. Generate signature (MD5)
  // Format: MerchantLogin:OutSum:InvoiceID:Password1:Shp_user_id
  const signatureString = [
    merchantLogin,
    params.amount.toFixed(2),
    params.invoiceId || Date.now(),
    password1,
    `Shp_user_id=${params.userId}`
  ].join(':');

  const signature = crypto
    .createHash('md5')
    .update(signatureString)
    .digest('hex');

  // 3. Build payment URL
  const baseUrl = isTest
    ? 'https://auth.robokassa.ru/Merchant/Index.aspx'
    : 'https://auth.robokassa.ru/Merchant/Index.aspx';

  const params = new URLSearchParams({
    MerchantLogin: merchantLogin,
    OutSum: params.amount.toFixed(2),
    InvoiceID: String(params.invoiceId || Date.now()),
    Description: params.description,
    SignatureValue: signature,
    Shp_user_id: params.userId,
    IsTest: isTest ? '1' : '0'
  });

  return `${baseUrl}?${params.toString()}`;
}

// Usage in Telegram scene
bot.action('topup_100', async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id.toString();
  const paymentLink = await generateRobokassaLink({
    amount: 100,
    userId,
    description: 'Пополнение баланса 100 RUB'
  });

  await ctx.reply(
    '💳 Для пополнения перейдите по ссылке:',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '💰 Оплатить 100 ₽', url: paymentLink }
        ]]
      }
    }
  );
});
```

### Pattern 2: Handle Robokassa Result (Success Redirect)

```typescript
// src/webhooks/robokassa-result.ts

export async function handleRobokassaResult(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;

  // 1. Extract parameters
  const outSum = params.get('OutSum');
  const invoiceId = params.get('InvId');
  const signature = params.get('SignatureValue');
  const userId = params.get('Shp_user_id');

  // 2. Verify signature (Password1 for Result URL)
  const password1 = await getSecret('ROBOKASSA_PASSWORD_1');

  const signatureString = `${outSum}:${invoiceId}:${password1}:Shp_user_id=${userId}`;
  const expectedSignature = crypto
    .createHash('md5')
    .update(signatureString)
    .digest('hex')
    .toUpperCase();

  if (signature?.toUpperCase() !== expectedSignature) {
    console.error('❌ Invalid Robokassa Result signature');
    return new Response('Invalid signature', { status: 403 });
  }

  // 3. This is just user redirect - don't process payment here!
  // Payment processing happens in webhook (Success URL)

  // 4. Redirect to Telegram bot with success message
  return new Response(
    `<html>
      <body>
        <h1>✅ Платёж успешен!</h1>
        <p>Баланс будет пополнен в течение минуты.</p>
        <a href="https://t.me/your_bot">Вернуться в бот</a>
      </body>
    </html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}
```

### Pattern 3: Handle Robokassa Webhook (SUCCESS - Critical!)

```typescript
// src/webhooks/robokassa-success.ts

export async function handleRobokassaWebhook(req: Request): Promise<Response> {
  try {
    const params = await req.json();

    // 1. Extract parameters
    const outSum = parseFloat(params.OutSum);
    const invoiceId = params.InvId;
    const signature = params.SignatureValue;
    const userId = params.Shp_user_id;

    // 2. Verify signature (Password2 for Success URL)
    const password2 = await getSecret('ROBOKASSA_PASSWORD_2');

    const signatureString = `${outSum}:${invoiceId}:${password2}:Shp_user_id=${userId}`;
    const expectedSignature = crypto
      .createHash('md5')
      .update(signatureString)
      .digest('hex')
      .toUpperCase();

    if (signature?.toUpperCase() !== expectedSignature) {
      console.error('❌ Invalid Robokassa webhook signature', {
        received: signature,
        expected: expectedSignature
      });
      return new Response('Invalid signature', { status: 403 });
    }

    // 3. Check idempotency (prevent duplicate processing)
    const existingTransaction = await supabase
      .from('transactions')
      .select('id')
      .eq('external_id', invoiceId)
      .eq('provider', 'robokassa')
      .single();

    if (existingTransaction.data) {
      console.log(`⚠️  Duplicate webhook ignored: ${invoiceId}`);
      return new Response(`OK${invoiceId}`, { status: 200 });
    }

    // 4. Process payment ATOMICALLY
    await processSuccessfulPayment({
      userId,
      amount: outSum,
      invoiceId,
      provider: 'robokassa'
    });

    // 5. Send confirmation to Robokassa
    return new Response(`OK${invoiceId}`, { status: 200 });

  } catch (error) {
    console.error('❌ Robokassa webhook error:', error);
    return new Response('Internal error', { status: 500 });
  }
}
```

---

## ⚛️ Atomic Balance Operations

### Pattern 1: Atomic Balance Update (Transaction)

```typescript
// ❌ НЕПРАВИЛЬНО - race condition!
async function updateBalance(userId: string, amount: number) {
  // 1. Read balance
  const { data: user } = await supabase
    .from('users')
    .select('balance')
    .eq('id', userId)
    .single();

  // ⚠️  Another request might change balance here!

  // 2. Update balance
  const newBalance = user.balance + amount;

  await supabase
    .from('users')
    .update({ balance: newBalance })
    .eq('id', userId);

  // ❌ Lost update problem!
}

// ✅ ПРАВИЛЬНО - atomic operation
async function updateBalanceAtomic(userId: string, amount: number) {
  // Use Supabase RPC for atomic increment
  const { data, error } = await supabase.rpc('increment_user_balance', {
    p_user_id: userId,
    p_amount: amount
  });

  if (error) {
    throw new Error(`Failed to update balance: ${error.message}`);
  }

  return data;
}

// PostgreSQL function (create via migration)
/*
CREATE OR REPLACE FUNCTION increment_user_balance(
  p_user_id TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  UPDATE users
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  RETURN v_new_balance;
END;
$$;
*/
```

### Pattern 2: Atomic Deduction with Check

```typescript
// Deduct balance ONLY if sufficient funds
async function deductBalanceAtomic(
  userId: string,
  amount: number
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  // Use PostgreSQL function with check
  const { data, error } = await supabase.rpc('deduct_user_balance', {
    p_user_id: userId,
    p_amount: amount
  });

  if (error) {
    if (error.message.includes('Insufficient balance')) {
      return {
        success: false,
        error: 'Недостаточно средств'
      };
    }
    throw error;
  }

  return {
    success: true,
    newBalance: data
  };
}

// PostgreSQL function
/*
CREATE OR REPLACE FUNCTION deduct_user_balance(
  p_user_id TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Get current balance with row lock
  SELECT balance INTO v_current_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Check if sufficient balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: has %, needs %',
      v_current_balance, p_amount;
  END IF;

  -- Deduct balance
  v_new_balance := v_current_balance - p_amount;

  UPDATE users
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN v_new_balance;
END;
$$;
*/
```

### Pattern 3: Full Transaction with Rollback

```typescript
// Complete payment processing with transaction
async function processSuccessfulPayment(params: {
  userId: string;
  amount: number;
  invoiceId: string;
  provider: 'robokassa' | 'telegram_stars';
}): Promise<void> {
  // Start transaction
  const { data, error } = await supabase.rpc('process_payment_transaction', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_invoice_id: params.invoiceId,
    p_provider: params.provider
  });

  if (error) {
    console.error('❌ Payment processing failed:', error);
    throw error;
  }

  // Send notification to user via Telegram
  await notifyUserBalanceUpdate(params.userId, params.amount);
}

// PostgreSQL function with full transaction
/*
CREATE OR REPLACE FUNCTION process_payment_transaction(
  p_user_id TEXT,
  p_amount NUMERIC,
  p_invoice_id TEXT,
  p_provider TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Everything in one transaction (atomic)

  -- 1. Create transaction record
  INSERT INTO transactions (
    user_id,
    amount,
    type,
    status,
    external_id,
    provider,
    created_at
  ) VALUES (
    p_user_id,
    p_amount,
    'topup',
    'completed',
    p_invoice_id,
    p_provider,
    NOW()
  );

  -- 2. Update user balance (atomic)
  UPDATE users
  SET balance = balance + p_amount,
      total_spent = total_spent + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 3. Check if update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- All or nothing - if any step fails, entire transaction rolls back
END;
$$;
*/
```

---

## 🔑 Idempotency

### Pattern 1: Idempotency Key in Database

```typescript
// Prevent duplicate payment processing
async function processPaymentIdempotent(
  invoiceId: string,
  processFunc: () => Promise<void>
): Promise<{ processed: boolean; duplicate: boolean }> {
  // 1. Try to create idempotency record
  const { data, error } = await supabase
    .from('idempotency_keys')
    .insert({
      key: invoiceId,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  // 2. If key already exists = duplicate
  if (error && error.code === '23505') {  // unique_violation
    console.log(`⚠️  Duplicate payment detected: ${invoiceId}`);
    return { processed: false, duplicate: true };
  }

  if (error) {
    throw error;
  }

  // 3. Process payment
  try {
    await processFunc();
    return { processed: true, duplicate: false };
  } catch (error) {
    // Cleanup idempotency key on failure
    await supabase
      .from('idempotency_keys')
      .delete()
      .eq('key', invoiceId);

    throw error;
  }
}

// Usage
await processPaymentIdempotent(invoiceId, async () => {
  await updateBalance(userId, amount);
  await createTransaction(userId, amount, invoiceId);
  await notifyUser(userId);
});
```

### Pattern 2: Idempotency Table Schema

```sql
-- migrations/create_idempotency_keys.sql

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- Auto-cleanup old keys
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- Cleanup function (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM idempotency_keys
  WHERE expires_at < NOW();
END;
$$;
```

---

## ⭐ Telegram Stars Payment

### Pattern 1: Create Invoice

```typescript
// Telegram Stars payment (native Telegram payment)
export async function createTelegramStarsInvoice(
  ctx: Context,
  params: {
    title: string;
    description: string;
    amount: number;  // in stars
    payload: string; // unique identifier
  }
): Promise<void> {
  await ctx.replyWithInvoice({
    title: params.title,
    description: params.description,
    payload: params.payload,
    currency: 'XTR',  // Telegram Stars currency
    prices: [
      { label: params.title, amount: params.amount }
    ]
  });
}

// Usage
bot.action('buy_100_credits', async (ctx) => {
  await ctx.answerCbQuery();

  const payload = JSON.stringify({
    userId: ctx.from.id,
    amount: 100,
    timestamp: Date.now()
  });

  await createTelegramStarsInvoice(ctx, {
    title: '100 кредитов',
    description: 'Пополнение баланса на 100 кредитов',
    amount: 50,  // 50 stars
    payload
  });
});
```

### Pattern 2: Handle Pre-Checkout Query

```typescript
// Pre-checkout validation
bot.on('pre_checkout_query', async (ctx) => {
  try {
    const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload);
    const userId = payload.userId;

    // Validate user
    const user = await getUserById(userId);
    if (!user) {
      await ctx.answerPreCheckoutQuery(false, 'Пользователь не найден');
      return;
    }

    // Validate amount
    if (payload.amount <= 0 || payload.amount > 10000) {
      await ctx.answerPreCheckoutQuery(false, 'Некорректная сумма');
      return;
    }

    // All checks passed
    await ctx.answerPreCheckoutQuery(true);

  } catch (error) {
    console.error('Pre-checkout error:', error);
    await ctx.answerPreCheckoutQuery(false, 'Внутренняя ошибка');
  }
});
```

### Pattern 3: Handle Successful Payment

```typescript
// Process successful Telegram Stars payment
bot.on('successful_payment', async (ctx) => {
  try {
    const payment = ctx.message.successful_payment;
    const payload = JSON.parse(payment.invoice_payload);

    // Process payment atomically
    await processSuccessfulPayment({
      userId: payload.userId.toString(),
      amount: payload.amount,
      invoiceId: payment.telegram_payment_charge_id,
      provider: 'telegram_stars'
    });

    await ctx.reply(
      `✅ Платёж успешен!\n` +
      `Зачислено: ${payload.amount} кредитов\n` +
      `Новый баланс: ${await getUserBalance(payload.userId)}`
    );

  } catch (error) {
    console.error('Payment processing error:', error);
    await ctx.reply('❌ Ошибка обработки платежа. Обратитесь в поддержку.');
  }
});
```

---

## 💸 Refund Processing

### Pattern 1: Initiate Refund

```typescript
// Refund user balance
export async function refundPayment(params: {
  userId: string;
  amount: number;
  reason: string;
  originalInvoiceId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Start refund transaction
    const { data, error } = await supabase.rpc('process_refund_transaction', {
      p_user_id: params.userId,
      p_amount: params.amount,
      p_reason: params.reason,
      p_original_invoice_id: params.originalInvoiceId
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Notify user
    await notifyUserRefund(params.userId, params.amount, params.reason);

    return { success: true };

  } catch (error) {
    console.error('Refund error:', error);
    return { success: false, error: 'Internal error' };
  }
}

// PostgreSQL function
/*
CREATE OR REPLACE FUNCTION process_refund_transaction(
  p_user_id TEXT,
  p_amount NUMERIC,
  p_reason TEXT,
  p_original_invoice_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create refund transaction record
  INSERT INTO transactions (
    user_id,
    amount,
    type,
    status,
    external_id,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    p_amount,
    'refund',
    'completed',
    p_original_invoice_id,
    jsonb_build_object('reason', p_reason),
    NOW()
  );

  -- Deduct from user balance (refund = negative topup)
  UPDATE users
  SET balance = balance - p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
END;
$$;
*/
```

### Pattern 2: Automatic Refund on Error

```typescript
// Automatically refund if AI generation fails
export async function handleGenerationError(
  ctx: Context,
  error: Error,
  cost: number
): Promise<void> {
  const userId = ctx.from.id.toString();

  try {
    // Refund user
    await refundPayment({
      userId,
      amount: cost,
      reason: `Generation failed: ${error.message}`
    });

    await ctx.reply(
      `❌ Ошибка генерации: ${error.message}\n` +
      `💰 Средства возвращены: ${cost} кредитов`
    );

  } catch (refundError) {
    console.error('Refund failed:', refundError);
    await ctx.reply(
      `❌ Ошибка генерации\n` +
      `⚠️  Не удалось вернуть средства автоматически\n` +
      `Обратитесь в поддержку: @support`
    );
  }
}
```

---

## 📊 Subscription Management

### Pattern 1: Check Subscription Status

```typescript
// Check if user has active subscription
export async function hasActiveSubscription(
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('subscriptions')
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .single();

  return !!data;
}

// Middleware to require subscription
export function requireSubscription() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const userId = ctx.from.id.toString();

    if (!(await hasActiveSubscription(userId))) {
      await ctx.reply(
        '⭐ Эта функция доступна только по подписке\n' +
        'Оформить подписку: /subscribe'
      );
      return;
    }

    await next();
  };
}

// Usage
bot.command('premium_feature',
  requireSubscription(),
  async (ctx) => {
    // ... premium feature logic ...
  }
);
```

### Pattern 2: Create Subscription

```typescript
// Create subscription after payment
export async function createSubscription(params: {
  userId: string;
  planType: 'monthly' | 'yearly';
  amount: number;
  invoiceId: string;
}): Promise<void> {
  const duration = params.planType === 'monthly' ? 30 : 365;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + duration);

  await supabase
    .from('subscriptions')
    .insert({
      user_id: params.userId,
      plan_type: params.planType,
      status: 'active',
      amount: params.amount,
      external_id: params.invoiceId,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString()
    });

  // Create transaction record
  await supabase
    .from('transactions')
    .insert({
      user_id: params.userId,
      amount: params.amount,
      type: 'subscription',
      status: 'completed',
      external_id: params.invoiceId
    });

  // Notify user
  await notifyUserSubscription(params.userId, params.planType, expiresAt);
}
```

---

## 🕉️ Sanskrit Wisdom for Payments

### On Accuracy
*"धनं प्रमाणं सर्वस्य"* (Dhanam Pramanam Sarvasya)
"Деньги требуют точности во всём"

→ Ни одной ошибки в платежах!

### On Atomicity
*"सर्वं वा नकिञ्चित्"* (Sarvam Va Na Kinchit)
"Всё или ничего"

→ Транзакции должны быть атомарными

### On Trust
*"विश्वासः सर्वधर्मेषु"* (Vishvasah Sarva Dharmeshu)
"Доверие превыше всего"

→ Один баг в платежах = потеря доверия пользователей

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Priority**: 🔴 CRITICAL
**Philosophy**: "One payment error = lost customer trust"
**Integration**: Works with security-expert, supabase-database, telegram-bot-expert
