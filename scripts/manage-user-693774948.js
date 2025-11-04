/**
 * User Management Script для Telegram ID: 693774948
 * Задача: Добавить подписку "Мировидео" (NEUROVIDEO) и предоставить полный доступ
 *
 * Выполнение на production сервере: 212.86.115.30
 * Проект: /root/bot-farm
 */

const { createClient } = require("@supabase/supabase-js");

// Supabase credentials (загружаются из .env на production сервере)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ ОШИБКА: Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TELEGRAM_ID = "693774948";

/**
 * Шаг 1: Проверка текущего статуса пользователя
 */
async function checkUserStatus() {
  console.log("🔍 [ШАГ 1] Проверка текущего статуса пользователя", TELEGRAM_ID);

  try {
    // Проверяем существование в таблице users
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", TELEGRAM_ID)
      .maybeSingle();

    if (userError) {
      console.error("❌ Ошибка при проверке users:", userError.message);
      return { exists: false, userData: null };
    }

    if (!userData) {
      console.log("⚠️ Пользователь НЕ найден в таблице users");
      return { exists: false, userData: null };
    }

    console.log("✅ Пользователь найден в users:");
    console.log({
      telegram_id: userData.telegram_id,
      first_name: userData.first_name,
      username: userData.username,
      created_at: userData.created_at,
      subscription: userData.subscription,
    });

    // Проверяем баланс через SQL функцию
    const { data: balanceData, error: balanceError } = await supabase.rpc(
      "get_user_balance",
      { user_telegram_id: TELEGRAM_ID }
    );

    const balance = balanceError ? 0 : (balanceData || 0);
    console.log(`💰 Текущий баланс: ${balance} звезд`);

    // Проверяем активные подписки в payments_v2
    const { data: subscriptions, error: subError } = await supabase
      .from("payments_v2")
      .select("*")
      .eq("telegram_id", TELEGRAM_ID)
      .eq("status", "COMPLETED")
      .in("subscription_type", ["NEUROTESTER", "NEUROVIDEO", "NEUROPHOTO"])
      .order("payment_date", { ascending: false });

    if (subError) {
      console.error("❌ Ошибка при проверке подписок:", subError.message);
    } else {
      console.log(`📋 Найдено подписок: ${subscriptions?.length || 0}`);

      if (subscriptions && subscriptions.length > 0) {
        console.log("Последние подписки:");
        subscriptions.slice(0, 3).forEach((sub, idx) => {
          const paymentDate = new Date(sub.payment_date);
          const expirationDate = new Date(paymentDate);
          expirationDate.setDate(paymentDate.getDate() + 30);
          const isActive = sub.subscription_type === "NEUROTESTER" || new Date() < expirationDate;

          console.log(`  ${idx + 1}. ${sub.subscription_type} - ${isActive ? '✅ АКТИВНА' : '❌ ИСТЕКЛА'}`);
          console.log(`     Дата: ${sub.payment_date}`);
          console.log(`     Истекает: ${sub.subscription_type === "NEUROTESTER" ? "Бессрочная" : expirationDate.toISOString()}`);
        });
      } else {
        console.log("⚠️ Активных подписок не найдено");
      }
    }

    return {
      exists: true,
      userData,
      balance,
      subscriptions: subscriptions || [],
    };
  } catch (error) {
    console.error("❌ Критическая ошибка при проверке статуса:", error);
    return { exists: false, userData: null };
  }
}

/**
 * Шаг 2: Добавление подписки NEUROVIDEO ("Мировидео")
 */
async function grantNeurovideoSubscription() {
  console.log("\n⚡ [ШАГ 2] Добавление подписки NEUROVIDEO (Мировидео)");

  try {
    const paymentData = {
      telegram_id: TELEGRAM_ID,
      amount: 0,
      stars: 0,
      currency: "RUB",
      status: "COMPLETED",
      type: "MONEY_INCOME",
      subscription_type: "NEUROVIDEO",
      payment_method: "Manual",
      bot_name: "neuro_blogger_bot",
      inv_id: `manual-neurovideo-${Date.now()}`,
      description: "Manual NEUROVIDEO subscription grant by admin - Мировидео",
      payment_date: new Date().toISOString(),
      is_system_payment: true,
      category: "BONUS",
    };

    const { data, error } = await supabase
      .from("payments_v2")
      .insert(paymentData)
      .select();

    if (error) {
      console.error("❌ Ошибка при добавлении подписки:", error.message);
      return false;
    }

    console.log("✅ Подписка NEUROVIDEO успешно добавлена!");
    console.log("Детали транзакции:");
    console.log({
      inv_id: paymentData.inv_id,
      subscription_type: paymentData.subscription_type,
      payment_date: paymentData.payment_date,
      status: paymentData.status,
    });

    return true;
  } catch (error) {
    console.error("❌ Критическая ошибка при добавлении подписки:", error);
    return false;
  }
}

/**
 * Шаг 3: Верификация результата
 */
async function verifySubscription() {
  console.log("\n🔍 [ШАГ 3] Верификация подписки");

  try {
    const { data: latestSub, error } = await supabase
      .from("payments_v2")
      .select("*")
      .eq("telegram_id", TELEGRAM_ID)
      .eq("subscription_type", "NEUROVIDEO")
      .eq("status", "COMPLETED")
      .order("payment_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("❌ Ошибка верификации:", error.message);
      return false;
    }

    if (!latestSub) {
      console.error("❌ Подписка NEUROVIDEO не найдена после добавления!");
      return false;
    }

    const paymentDate = new Date(latestSub.payment_date);
    const expirationDate = new Date(paymentDate);
    expirationDate.setDate(paymentDate.getDate() + 30);
    const isActive = new Date() < expirationDate;

    console.log("✅ Подписка NEUROVIDEO верифицирована:");
    console.log({
      subscription_type: latestSub.subscription_type,
      status: latestSub.status,
      payment_date: latestSub.payment_date,
      expiration_date: expirationDate.toISOString(),
      is_active: isActive,
      days_remaining: Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60 * 24)),
    });

    return true;
  } catch (error) {
    console.error("❌ Критическая ошибка верификации:", error);
    return false;
  }
}

/**
 * Основная функция выполнения
 */
async function main() {
  console.log("=" .repeat(80));
  console.log("🤖 УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЕМ TELEGRAM BOT");
  console.log("=" .repeat(80));
  console.log(`📱 Telegram ID: ${TELEGRAM_ID}`);
  console.log(`🎯 Задача: Добавить подписку NEUROVIDEO (Мировидео)`);
  console.log("=" .repeat(80));
  console.log("");

  // Шаг 1: Проверка текущего статуса
  const status = await checkUserStatus();

  if (!status.exists) {
    console.log("\n❌ ОШИБКА: Пользователь не найден в базе данных!");
    console.log("Рекомендация: Пользователь должен сначала запустить бота (/start)");
    process.exit(1);
  }

  // Шаг 2: Добавление подписки
  const grantSuccess = await grantNeurovideoSubscription();

  if (!grantSuccess) {
    console.log("\n❌ ОШИБКА: Не удалось добавить подписку!");
    process.exit(1);
  }

  // Шаг 3: Верификация
  const verifySuccess = await verifySubscription();

  if (!verifySuccess) {
    console.log("\n❌ ОШИБКА: Верификация подписки не прошла!");
    process.exit(1);
  }

  // Финальный отчет
  console.log("\n" + "=" .repeat(80));
  console.log("✅ УСПЕШНОЕ ЗАВЕРШЕНИЕ");
  console.log("=" .repeat(80));
  console.log(`📱 Пользователь: ${TELEGRAM_ID}`);
  console.log("🎬 Подписка: NEUROVIDEO (Мировидео)");
  console.log("✅ Статус: АКТИВНА");
  console.log("⏰ Длительность: 30 дней");
  console.log("🚀 Доступ: ПОЛНЫЙ");
  console.log("=" .repeat(80));

  process.exit(0);
}

// Запуск скрипта
main().catch(error => {
  console.error("💥 КРИТИЧЕСКАЯ ОШИБКА:", error);
  process.exit(1);
});
