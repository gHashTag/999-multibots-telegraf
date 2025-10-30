const { supabase } = require("../dist/core/supabase/index.js");

async function addEmployeeSubscriptions() {
  console.log("🚀 ДОБАВЛЕНИЕ NEUROTESTER ПОДПИСОК ДЛЯ НОВЫХ СОТРУДНИКОВ ХАИМ ГРУПП:");

  const newEmployees = ["1036512726", "752224685"];

  for (const telegramId of newEmployees) {
    console.log(`\n👤 Обрабатываю сотрудника ID: ${telegramId}`);

    try {
      // Создаем NEUROTESTER подписку
      const result = await supabase.from("payments_v2").insert({
        telegram_id: telegramId,
        amount: 0,
        stars: 0,
        currency: "RUB",
        status: "COMPLETED",
        type: "MONEY_INCOME",
        subscription_type: "NEUROTESTER",
        payment_method: "Manual",
        bot_name: "admin_grant",
        inv_id: "haim-employee-" + Date.now() + "-" + telegramId,
        description: "🎁 Полный доступ для сотрудника Хаим Групп + подписка NEUROTESTER + доступ к ИИ Рилс",
        payment_date: new Date().toISOString()
      });

      if (result.error) {
        console.log(`❌ Ошибка создания подписки для ${telegramId}:`, result.error.message);
      } else {
        console.log(`✅ NEUROTESTER подписка создана для ${telegramId}`);
      }

      // Проверяем существует ли пользователь в users
      const userData = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();

      if (!userData.data) {
        console.log(`📝 Создаю запись пользователя ${telegramId} в таблице users`);
        const userResult = await supabase.from("users").insert({
          telegram_id: telegramId,
          subscription: "NEUROTESTER",
          stars_balance: 500000, // Дарим стартовый баланс
          created_at: new Date().toISOString()
        });

        if (userResult.error) {
          console.log(`❌ Ошибка создания пользователя ${telegramId}:`, userResult.error.message);
        } else {
          console.log(`✅ Пользователь ${telegramId} создан в базе users`);
        }
      } else {
        // Обновляем подписку существующего пользователя
        const currentBalance = userData.data.stars_balance || 0;
        const updateResult = await supabase.from("users").update({
          subscription: "NEUROTESTER",
          stars_balance: currentBalance + 100000 // Добавляем звезд
        }).eq("telegram_id", telegramId);

        if (updateResult.error) {
          console.log(`❌ Ошибка обновления пользователя ${telegramId}:`, updateResult.error.message);
        } else {
          console.log(`✅ Подписка обновлена для существующего пользователя ${telegramId}`);
          console.log(`💰 Новый баланс: ${currentBalance + 100000} звезд`);
        }
      }

    } catch (error) {
      console.log(`💥 Критическая ошибка для ${telegramId}:`, error.message);
    }

    // Пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n🎉 ПРОЦЕСС ЗАВЕРШЕН!");
  console.log("✅ Новые сотрудники Хаим Групп добавлены с полными правами");
  console.log("🎬 Доступ к ИИ Рилс настроен через HAIM_GROUP_STAFF_IDS");
  console.log("💎 NEUROTESTER подписки активированы");

  // Финальная проверка
  console.log("\n🔍 ФИНАЛЬНАЯ ПРОВЕРКА ДОСТУПА:");
  for (const telegramId of newEmployees) {
    const userData = await supabase.from("users").select("*").eq("telegram_id", telegramId).single();
    const latestPayment = await supabase.from("payments_v2")
      .select("*")
      .eq("telegram_id", telegramId)
      .order("payment_date", { ascending: false })
      .limit(1)
      .single();

    console.log(`👤 Сотрудник ${telegramId}:`);
    console.log(`   📊 В users: ${userData.data ? '✅' : '❌'}`);
    console.log(`   💎 Подписка: ${userData.data?.subscription || 'НЕТ'}`);
    console.log(`   ⭐ Баланс: ${userData.data?.stars_balance || 0} звезд`);
    console.log(`   💰 Последний платеж: ${latestPayment.data?.subscription_type || 'НЕТ'}`);
  }
}

addEmployeeSubscriptions().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error("💥 Критическая ошибка:", error);
  process.exit(1);
});