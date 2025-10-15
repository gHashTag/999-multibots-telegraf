const { supabase } = require("../dist/core/supabase/index.js");

async function comprehensiveSearch() {
  console.log("🕵️ ДЕТАЛЬНЫЙ ПОИСК ДАННЫХ ПОЛЬЗОВАТЕЛЯ 144022504");
  console.log("=================================================");

  const userId = 144022504;

  try {
    // 1. Анализ payments_v2 - ищем следы моделей
    console.log("1️⃣ Анализ payments_v2...");
    const { data: payments, error: paymentsError } = await supabase
      .from("payments_v2")
      .select("*")
      .eq("telegram_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (paymentsError) {
      console.error("❌ Ошибка поиска payments_v2:", paymentsError);
    } else if (payments && payments.length > 0) {
      console.log(`✅ Найдено ${payments.length} платежей`);

      // Ищем модели в описаниях
      const modelPayments = payments.filter(p =>
        p.description && (
          p.description.includes("neuro_sage") ||
          p.description.includes("neuro_photo") ||
          p.description.includes("Model") ||
          p.description.includes("model")
        )
      );

      if (modelPayments.length > 0) {
        console.log(`🎯 КРИТИЧНО: Найдено ${modelPayments.length} платежей с моделями:`);
        modelPayments.slice(0, 15).forEach((p, i) => {
          console.log(`  [${i+1}] ${p.created_at}`);
          console.log(`      Description: ${p.description}`);
          console.log(`      Amount: ${p.amount} ${p.currency}, Status: ${p.status}`);
          console.log("      ---");
        });
      } else {
        console.log("⚠️ Платежи с моделями не найдены");
      }

      // Показываем последние платежи
      console.log(`📊 Последние ${Math.min(5, payments.length)} платежей:`);
      payments.slice(0, 5).forEach((p, i) => {
        console.log(`  [${i+1}] ${p.created_at} - ${p.description || "No description"}`);
      });
    } else {
      console.log("❌ Платежи не найдены");
    }

    // 2. Все модели в model_trainings
    console.log("\n2️⃣ Анализ model_trainings...");
    const { data: allModels, error: modelsError } = await supabase
      .from("model_trainings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (modelsError) {
      console.error("❌ Ошибка model_trainings:", modelsError);
    } else if (allModels && allModels.length > 0) {
      console.log(`✅ Всего моделей в базе: ${allModels.length}`);

      // Модели конкретного пользователя
      const userModels = allModels.filter(m => m.telegram_id === userId);
      console.log(`📊 Модели пользователя ${userId}: ${userModels.length}`);
      if (userModels.length > 0) {
        userModels.forEach((m, i) => {
          console.log(`  [${i+1}] ${m.created_at} - ${m.model_name} (${m.status})`);
          console.log(`      ID: ${m.id}, API: ${m.api || "N/A"}`);
        });
      }

      // Модели с названием neuro_sage от всех пользователей
      const neuroSageModels = allModels.filter(m =>
        m.model_name && m.model_name.toLowerCase().includes("neuro_sage")
      );

      if (neuroSageModels.length > 0) {
        console.log(`\n🎯 НАЙДЕНЫ МОДЕЛИ neuro_sage: ${neuroSageModels.length}`);
        neuroSageModels.forEach((m, i) => {
          console.log(`  [${i+1}] TG: ${m.telegram_id} - ${m.model_name}`);
          console.log(`      Created: ${m.created_at}, Status: ${m.status}`);
          console.log(`      ID: ${m.id}, API: ${m.api || "N/A"}`);
          console.log("      ---");
        });
      } else {
        console.log("⚠️ Модели neuro_sage НЕ НАЙДЕНЫ в базе");
      }

      // Январские модели (как упомянул пользователь)
      const januaryModels = allModels.filter(m =>
        m.created_at && m.created_at.startsWith("2025-01")
      );

      if (januaryModels.length > 0) {
        console.log(`\n📅 ЯНВАРСКИЕ МОДЕЛИ 2025: ${januaryModels.length}`);
        januaryModels.forEach((m, i) => {
          console.log(`  [${i+1}] TG: ${m.telegram_id} - ${m.model_name}`);
          console.log(`      Created: ${m.created_at}`);
        });
      }
    }

    // 3. Поиск связанных пользователей
    console.log("\n3️⃣ Поиск связанных пользователей...");
    const { data: allUsers, error: usersError } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (usersError) {
      console.error("❌ Ошибка users:", usersError);
    } else if (allUsers) {
      // Пользователи созданные сегодня (подозрительно)
      const todayUsers = allUsers.filter(u =>
        u.created_at && u.created_at.startsWith("2025-09-16")
      );

      if (todayUsers.length > 0) {
        console.log(`🚨 ПОЛЬЗОВАТЕЛИ СОЗДАННЫЕ СЕГОДНЯ: ${todayUsers.length}`);
        todayUsers.forEach((u, i) => {
          console.log(`  [${i+1}] ${u.telegram_id} - @${u.username || "N/A"} - ${u.first_name || "N/A"}`);
          console.log(`      Created: ${u.created_at}`);
        });
      }

      // Пользователи с похожими данными
      const similarUsers = allUsers.filter(u =>
        u.username === "neuro_sage" ||
        (u.first_name && u.first_name.toLowerCase().includes("dmitr"))
      );

      if (similarUsers.length > 0) {
        console.log(`\n👥 ПОХОЖИЕ ПОЛЬЗОВАТЕЛИ: ${similarUsers.length}`);
        similarUsers.forEach((u, i) => {
          console.log(`  [${i+1}] ${u.telegram_id} - @${u.username || "N/A"} - ${u.first_name || "N/A"}`);
          console.log(`      Created: ${u.created_at}`);
        });
      }
    }

  } catch (error) {
    console.error("🚨 КРИТИЧЕСКАЯ ОШИБКА:", error);
  }

  console.log("\n🏁 ПОИСК ЗАВЕРШЕН");
}

comprehensiveSearch().then(() => {
  process.exit(0);
}).catch(error => {
  console.error("🚨 ФАТАЛЬНАЯ ОШИБКА:", error);
  process.exit(1);
});