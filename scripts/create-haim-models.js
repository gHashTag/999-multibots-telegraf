#!/usr/bin/env node

/**
 * СОЗДАНИЕ КОПИЙ МОДЕЛЕЙ ДЛЯ СОТРУДНИКОВ HAIM GROUP
 *
 * Создаёт копии общих моделей (Вячеслав и CocoAge)
 * для каждого сотрудника HAIM Group в таблице model_trainings
 */

const { supabase } = require("../dist/core/supabase/index.js");

const HAIM_STAFF_IDS = [
  "144022504",   // @neuro_coder
  "289259562",   // @Vyacheslav_Neklyudov
  "752224685",   // @voskresenskaya13
  "7669741878",  // @Arhustel
  "164609458",   // @artemfisenko
  "1036512726"   // Новый сотрудник
];

const ORIGINAL_MODEL_ID = "ed2c6365-e782-4816-a1ef-1e26b79f6da0";

// Функция для генерации UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function createModelCopiesForHaimStaff() {
  console.log("🔄 Creating model copies for HAIM Group staff...");

  try {
    // Получаем оригинальную модель
    const { data: originalModel, error: originalError } = await supabase
      .from("model_trainings")
      .select("*")
      .eq("id", ORIGINAL_MODEL_ID)
      .single();

    if (originalError || !originalModel) {
      console.error("❌ Original model not found:", originalError);
      return;
    }

    console.log("✅ Original model found:", originalModel.model_name);
    console.log("📊 Original model details:");
    console.log("  - API:", originalModel.api);
    console.log("  - Model:", originalModel.model);
    console.log("  - Type:", originalModel.type);
    console.log("  - Status:", originalModel.status);

    let successCount = 0;
    let errorCount = 0;

    // Создаём копии для каждого сотрудника HAIM
    for (const staffId of HAIM_STAFF_IDS) {
      console.log(`\n📋 Creating models for staff: ${staffId}`);

      // 1. Модель Вячеслава
      const vyacheslavCopy = {
        id: generateUUID(),
        telegram_id: parseInt(staffId),
        model_name: "Вячеслав",
        trigger_word: originalModel.trigger_word,
        zip_url: originalModel.zip_url,
        model_url: originalModel.model_url,
        replicate_training_id: originalModel.replicate_training_id,
        status: "SUCCESS",
        steps: originalModel.steps,
        api: originalModel.api,
        cancel_url: originalModel.cancel_url,
        weights: originalModel.weights,
        bot_name: originalModel.bot_name,
        gender: originalModel.gender,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: null,
        finetune_id: null,
        result: null
      };

      // 2. Модель CocoAge
      const cocoAgeCopy = {
        id: generateUUID(),
        telegram_id: parseInt(staffId),
        model_name: "CocoAge",
        trigger_word: originalModel.trigger_word,
        zip_url: originalModel.zip_url,
        model_url: originalModel.model_url,
        replicate_training_id: originalModel.replicate_training_id,
        status: "SUCCESS",
        steps: originalModel.steps,
        api: originalModel.api,
        cancel_url: originalModel.cancel_url,
        weights: originalModel.weights,
        bot_name: originalModel.bot_name,
        gender: originalModel.gender,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: null,
        finetune_id: null,
        result: null
      };

      // Вставляем обе модели
      const vyacheslavResult = await supabase
        .from("model_trainings")
        .insert(vyacheslavCopy);

      const cocoAgeResult = await supabase
        .from("model_trainings")
        .insert(cocoAgeCopy);

      if (vyacheslavResult.error) {
        console.error(`❌ Error creating Vyacheslav model for ${staffId}:`, vyacheslavResult.error.message);
        errorCount++;
      } else {
        console.log(`✅ Vyacheslav model created for ${staffId}`);
        successCount++;
      }

      if (cocoAgeResult.error) {
        console.error(`❌ Error creating CocoAge model for ${staffId}:`, cocoAgeResult.error.message);
        errorCount++;
      } else {
        console.log(`✅ CocoAge model created for ${staffId}`);
        successCount++;
      }
    }

    console.log("\n🎉 Model copying completed!");
    console.log(`📊 Summary: ${successCount} successful, ${errorCount} errors`);
    console.log(`👥 Total HAIM staff: ${HAIM_STAFF_IDS.length}`);
    console.log(`🔢 Expected models: ${HAIM_STAFF_IDS.length * 2}`);

  } catch (error) {
    console.error("❌ Unexpected error:", error.message);
  }
}

// Запуск если вызывается напрямую
if (require.main === module) {
  createModelCopiesForHaimStaff().then(() => process.exit(0));
}

module.exports = { createModelCopiesForHaimStaff };