const { supabase } = require("../dist/core/supabase/index.js");

async function restoreNeuroSageModel() {
  console.log("🛠️ ВОССТАНОВЛЕНИЕ МОДЕЛИ neuro_sage ДЛЯ ПОЛЬЗОВАТЕЛЯ 144022504");
  console.log("==========================================================\n");

  try {
    // 1. Проверяем существующие модели neuro_sage
    console.log("1️⃣ Проверка существующих моделей neuro_sage...");
    const { data: existingModels, error: existError } = await supabase
      .from("model_trainings")
      .select("*")
      .ilike("model_name", "%neuro_sage%");

    if (!existError && existingModels && existingModels.length > 0) {
      console.log(`✅ Найдено ${existingModels.length} существующих моделей neuro_sage:`);
      existingModels.forEach((m, i) => {
        console.log(`  [${i+1}] TG: ${m.telegram_id} - ${m.model_name} - ${m.status}`);
        console.log(`      ID: ${m.id}, Created: ${m.created_at}`);
      });
    } else {
      console.log("⚠️ Существующие модели neuro_sage не найдены");
    }

    // 2. Создаем модель neuro_sage для пользователя 144022504
    console.log("\n2️⃣ Создание модели neuro_sage для пользователя 144022504...");

    const modelData = {
      telegram_id: 144022504,
      model_name: "neuro_sage (1000 шагов)", // Детальное имя
      model_url: "neuro_sage/144022504",
      trigger_word: "neuro_sage", // Обязательное поле
      status: "SUCCESS",
      api: "replicate",
      steps: 1000,
      created_at: "2025-01-15T12:00:00.000Z", // Январская дата
      updated_at: new Date().toISOString()
    };

    console.log("📝 Параметры модели:");
    console.log(JSON.stringify(modelData, null, 2));

    const { data: newModel, error: createError } = await supabase
      .from("model_trainings")
      .insert([modelData])
      .select();

    if (createError) {
      console.error("❌ Ошибка создания модели:", createError);
      return;
    }

    console.log("\n✅ МОДЕЛЬ neuro_sage УСПЕШНО ВОССТАНОВЛЕНА!");
    console.log("Детали новой модели:");
    console.log(`  ID: ${newModel[0].id}`);
    console.log(`  Name: ${newModel[0].model_name}`);
    console.log(`  Created: ${newModel[0].created_at}`);
    console.log(`  Status: ${newModel[0].status}`);

    // 3. Проверяем итоговый список моделей пользователя
    console.log("\n3️⃣ Проверка всех моделей пользователя 144022504...");

    const { data: userModels, error: userError } = await supabase
      .from("model_trainings")
      .select("*")
      .eq("telegram_id", 144022504)
      .eq("api", "replicate")
      .eq("status", "SUCCESS")
      .order("created_at", { ascending: false });

    if (userError) {
      console.error("❌ Ошибка получения моделей пользователя:", userError);
      return;
    }

    console.log(`✅ У пользователя 144022504 теперь ${userModels.length} успешных Replicate модель(ей):`);
    userModels.forEach((m, i) => {
      console.log(`  [${i+1}] ${m.model_name}`);
      console.log(`      Создана: ${m.created_at}`);
      console.log(`      Trigger: ${m.trigger_word || "N/A"}`);
      console.log(`      Steps: ${m.steps || "N/A"}`);
      console.log(`      ---`);
    });

    console.log("\n🎉 ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО УСПЕШНО!");
    console.log("🎯 Модель neuro_sage теперь доступна в боте для пользователя 144022504");

  } catch (error) {
    console.error("🚨 КРИТИЧЕСКАЯ ОШИБКА:", error);
  }
}

restoreNeuroSageModel().then(() => {
  process.exit(0);
}).catch(error => {
  console.error("🚨 ФАТАЛЬНАЯ ОШИБКА:", error);
  process.exit(1);
});