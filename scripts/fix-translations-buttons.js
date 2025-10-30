const { supabase } = require("../dist/core/supabase/client.js");

console.log("🧹 Очищаем поврежденные buttons в translations...");

async function cleanupButtons() {
  try {
    // Получаем все записи с ключом menu
    const { data: records, error } = await supabase
      .from("translations")
      .select("id, key, language_code, buttons")
      .eq("key", "menu");

    if (error) {
      console.log("❌ Ошибка получения записей:", error.message);
      return;
    }

    console.log(`📋 Найдено ${records.length} записей для ключа 'menu'`);

    let cleanedCount = 0;
    let validCount = 0;

    for (const record of records) {
      if (record.buttons) {
        try {
          const parsed = JSON.parse(record.buttons);
          console.log(`✅ ID ${record.id} (${record.language_code}): валидный JSON (${Array.isArray(parsed) ? parsed.length : 'не массив'} элементов)`);
          validCount++;
        } catch (e) {
          console.log(`🔧 ID ${record.id} (${record.language_code}): поврежденный JSON, очищаем...`);
          const { error: updateError } = await supabase
            .from("translations")
            .update({ buttons: null })
            .eq("id", record.id);

          if (updateError) {
            console.log(`  ❌ Ошибка обновления ID ${record.id}:`, updateError.message);
          } else {
            console.log(`  ✅ ID ${record.id} очищен`);
            cleanedCount++;
          }
        }
      } else {
        console.log(`ℹ️  ID ${record.id} (${record.language_code}): buttons уже null/empty`);
      }
    }

    console.log("\n📊 РЕЗУЛЬТАТ ОЧИСТКИ:");
    console.log(`✅ Валидных записей: ${validCount}`);
    console.log(`🧹 Очищено записей: ${cleanedCount}`);
    console.log("🎉 Очистка завершена успешно!");

  } catch (error) {
    console.log("❌ Общая ошибка:", error.message);
    process.exit(1);
  }
}

cleanupButtons().then(() => {
  console.log("🏁 Скрипт завершен");
  process.exit(0);
});