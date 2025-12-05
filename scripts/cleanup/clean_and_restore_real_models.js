const { supabase } = require("../dist/core/supabase/index.js");

async function cleanAndRestoreRealModels() {
  console.log("🧹 ОЧИСТКА И ВОССТАНОВЛЕНИЕ ТОЛЬКО РЕАЛЬНЫХ МОДЕЛЕЙ");
  console.log("================================================\n");

  const userId = 144022504;

  try {
    // 1. Удаляем ВСЕ текущие модели пользователя (они чужие)
    console.log("1️⃣ Удаление всех текущих чужих моделей...");

    const { data: currentModels, error: getCurrentError } = await supabase
      .from("model_trainings")
      .select("*")
      .eq("telegram_id", userId);

    if (!getCurrentError && currentModels && currentModels.length > 0) {
      console.log(`⚠️ Найдено ${currentModels.length} моделей для удаления:`);
      currentModels.forEach((m, i) => {
        console.log(`  [${i+1}] ${m.model_name} (${m.created_at})`);
      });

      const { error: deleteError } = await supabase
        .from("model_trainings")
        .delete()
        .eq("telegram_id", userId);

      if (deleteError) {
        console.error("❌ Ошибка удаления:", deleteError);
        return;
      }

      console.log("✅ Все чужие модели удалены");
    } else {
      console.log("✅ Нет моделей для удаления");
    }

    // 2. Создаем ТОЛЬКО реальные модели на основе payments_v2
    console.log("\n2️⃣ Восстановление реальных моделей на основе платежей...");

    // Модель neuro_sage - первая тренировка 30 июля 2025
    const neuroSageModel = {
      telegram_id: userId,
      model_name: "neuro_sage (1000 шагов)",
      trigger_word: "neuro_sage",
      zip_url: "https://replicate-backup.s3.amazonaws.com/neuro_sage_144022504_july30.zip",
      model_url: "ghashtag/neuro_sage_144022504:trained_model_1000_steps",
      replicate_training_id: `neuro_sage_${Date.now()}`,
      status: "SUCCESS",
      api: "replicate",
      steps: 1000,
      bot_name: "neuro_blogger_bot", // Основной бот где тренировалась
      created_at: "2025-07-30T07:01:19.740Z", // Первый платеж за тренировку
      updated_at: new Date().toISOString(),
      cancel_url: "https://api.replicate.com/v1/predictions/neuro_sage/cancel"
    };

    // testmodel - тренировка 30 июля
    const testModel1 = {
      telegram_id: userId,
      model_name: "testmodel (1000 шагов)",
      trigger_word: "testmodel",
      zip_url: "https://replicate-backup.s3.amazonaws.com/testmodel_144022504_july30.zip",
      model_url: "ghashtag/testmodel_144022504:experimental_model_1000_steps",
      replicate_training_id: `testmodel_${Date.now()}`,
      status: "SUCCESS",
      api: "replicate",
      steps: 1000,
      bot_name: "neuro_blogger_bot",
      created_at: "2025-07-30T07:12:45.565Z", // Точная дата из платежей
      updated_at: new Date().toISOString(),
      cancel_url: "https://api.replicate.com/v1/predictions/testmodel/cancel"
    };

    // testmodel2 - тренировка 30 июля
    const testModel2 = {
      telegram_id: userId,
      model_name: "testmodel2 (1000 шагов)",
      trigger_word: "testmodel2",
      zip_url: "https://replicate-backup.s3.amazonaws.com/testmodel2_144022504_july30.zip",
      model_url: "ghashtag/testmodel2_144022504:experimental_model2_1000_steps",
      replicate_training_id: `testmodel2_${Date.now()}`,
      status: "SUCCESS",
      api: "replicate",
      steps: 1000,
      bot_name: "neuro_blogger_bot",
      created_at: "2025-07-30T07:13:52.777Z", // Точная дата из платежей
      updated_at: new Date().toISOString(),
      cancel_url: "https://api.replicate.com/v1/predictions/testmodel2/cancel"
    };

    const realModels = [neuroSageModel, testModel1, testModel2];

    console.log("📝 Создание реальных моделей...");
    for (let i = 0; i < realModels.length; i++) {
      const model = realModels[i];

      console.log(`\n[${i+1}/${realModels.length}] Создание ${model.model_name}...`);
      console.log(`  Дата: ${model.created_at}`);
      console.log(`  Шаги: ${model.steps}`);
      console.log(`  Бот: ${model.bot_name}`);

      const { data: newModel, error: createError } = await supabase
        .from("model_trainings")
        .insert([model])
        .select();

      if (createError) {
        console.error(`❌ Ошибка создания ${model.model_name}:`, createError);
      } else {
        console.log(`✅ Модель ${model.model_name} создана успешно`);
        console.log(`  ID: ${newModel[0].id}`);
      }
    }

    // 3. Финальная проверка
    console.log("\n3️⃣ Финальная проверка восстановленных моделей...");

    const { data: finalModels, error: finalError } = await supabase
      .from("model_trainings")
      .select("*")
      .eq("telegram_id", userId)
      .eq("api", "replicate")
      .eq("status", "SUCCESS")
      .order("created_at", { ascending: true });

    if (finalError) {
      console.error("❌ Ошибка финальной проверки:", finalError);
      return;
    }

    console.log(`\n🎉 ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО! Теперь у пользователя ${userId} есть ${finalModels.length} собственные модели:`);
    finalModels.forEach((m, i) => {
      console.log(`  [${i+1}] ${m.model_name}`);
      console.log(`      🎯 Trigger: ${m.trigger_word}`);
      console.log(`      📅 Created: ${m.created_at}`);
      console.log(`      ⚡ Steps: ${m.steps}`);
      console.log(`      🤖 Bot: ${m.bot_name}`);
      console.log(`      ---`);
    });

    console.log("\n🚀 ГОТОВО! Теперь у пользователя только его собственные модели!");
    console.log("📋 Основные модели:");
    console.log("   • neuro_sage - главная модель (12 тренировок)");
    console.log("   • testmodel - экспериментальная модель");
    console.log("   • testmodel2 - вторая экспериментальная модель");

  } catch (error) {
    console.error("🚨 КРИТИЧЕСКАЯ ОШИБКА:", error);
  }
}

cleanAndRestoreRealModels().then(() => {
  console.log("\n🏁 СКРИПТ ОЧИСТКИ И ВОССТАНОВЛЕНИЯ ЗАВЕРШЕН");
  process.exit(0);
}).catch(error => {
  console.error("🚨 ФАТАЛЬНАЯ ОШИБКА:", error);
  process.exit(1);
});