const { supabase } = require("../dist/core/supabase/index.js");

async function searchGeneratedImages() {
  console.log("🔍 Поиск следов моделей в generated_images для 144022504...");

  // Ищем записи с модели пользователя 144022504
  const { data: images, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("telegram_id", 144022504)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("❌ Ошибка поиска в generated_images:", error);
    return;
  }

  if (!images || images.length === 0) {
    console.log("⚠️ Записи с Telegram ID 144022504 НЕ НАЙДЕНЫ в generated_images");
  } else {
    console.log(`✅ Найдено ${images.length} записей в generated_images:`);
    images.forEach((img, index) => {
      console.log(`[${index + 1}] Created: ${img.created_at}`);
      console.log(`    Model: ${img.model_name || "не указано"}`);
      console.log(`    Bot: ${img.bot_name || "не указано"}`);
      console.log(`    URL: ${img.url ? "есть" : "нет"}`);
      console.log(`    ID: ${img.id}`);
      console.log("---");
    });
  }

  // Дополнительный поиск по названию модели neuro_sage
  console.log("\n🔍 Поиск по названию модели 'neuro_sage'...");
  const { data: neuroSageImages, error: neuroError } = await supabase
    .from("generated_images")
    .select("*")
    .ilike("model_name", "%neuro_sage%")
    .order("created_at", { ascending: false })
    .limit(20);

  if (neuroError) {
    console.error("❌ Ошибка поиска neuro_sage:", neuroError);
  } else if (neuroSageImages && neuroSageImages.length > 0) {
    console.log(`✅ Найдено ${neuroSageImages.length} записей с neuro_sage:`);
    neuroSageImages.forEach((img, index) => {
      console.log(`[${index + 1}] Telegram ID: ${img.telegram_id}`);
      console.log(`    Created: ${img.created_at}`);
      console.log(`    Model: ${img.model_name}`);
      console.log(`    Bot: ${img.bot_name}`);
      console.log("---");
    });
  } else {
    console.log("⚠️ Записи с neuro_sage НЕ НАЙДЕНЫ");
  }
}

async function searchReferrals() {
  console.log("\n🔍 Поиск рефералов пользователя 144022504...");

  // Поиск пользователей, приглашенных пользователем 144022504
  const { data: referrals, error } = await supabase
    .from("users")
    .select("telegram_id, username, first_name, created_at, invited_by")
    .eq("invited_by", "144022504")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Ошибка поиска рефералов:", error);
  } else if (referrals && referrals.length > 0) {
    console.log(`✅ Найдено ${referrals.length} рефералов:`);
    referrals.forEach((user, index) => {
      console.log(`[${index + 1}] Telegram ID: ${user.telegram_id}`);
      console.log(`    Username: @${user.username || "нет"}`);
      console.log(`    Name: ${user.first_name || "не указано"}`);
      console.log(`    Created: ${user.created_at}`);
      console.log("---");
    });
  } else {
    console.log("⚠️ Рефералы НЕ НАЙДЕНЫ");
  }
}

searchGeneratedImages()
  .then(() => searchReferrals())
  .then(() => process.exit(0))
  .catch(console.error);