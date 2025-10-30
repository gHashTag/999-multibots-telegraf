const { supabase } = require("../dist/core/supabase/index.js");

async function emergencyRecovery() {
  console.log("🚨 ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ 144022504");
  console.log("=======================================================");

  const userId = 144022504;

  try {
    // 1. Поиск в generated_images
    console.log("1️⃣ Поиск в generated_images...");
    const { data: images, error: imgError } = await supabase
      .from("generated_images")
      .select("*")
      .eq("telegram_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (imgError) {
      console.error("❌ Ошибка поиска generated_images:", imgError);
    } else if (images && images.length > 0) {
      console.log(`✅ Найдено ${images.length} записей в generated_images`);
      images.slice(0, 5).forEach((img, i) => {
        console.log(`  [${i+1}] ${img.created_at} - Model: ${img.model_name || "N/A"} - Bot: ${img.bot_name || "N/A"}`);
      });
    } else {
      console.log("⚠️ Записи не найдены в generated_images");
    }

    // 2. Поиск рефералов
    console.log("\n2️⃣ Поиск рефералов...");
    const { data: referrals, error: refError } = await supabase
      .from("users")
      .select("telegram_id, username, first_name, created_at, invited_by")
      .eq("invited_by", "144022504")
      .order("created_at", { ascending: false });

    if (refError) {
      console.error("❌ Ошибка поиска рефералов:", refError);
    } else if (referrals && referrals.length > 0) {
      console.log(`✅ КРИТИЧНО: Найдено ${referrals.length} рефералов! Связи нарушены!`);
      referrals.slice(0, 10).forEach((user, i) => {
        console.log(`  [${i+1}] ${user.telegram_id} - @${user.username || "N/A"} - ${user.first_name || "N/A"} - ${user.created_at}`);
      });
    } else {
      console.log("❌ Рефералы не найдены - связи потеряны!");
    }

    // 3. Поиск моделей neuro_sage
    console.log("\n3️⃣ Поиск моделей neuro_sage...");
    const { data: neuroModels, error: neuroError } = await supabase
      .from("generated_images")
      .select("telegram_id, model_name, created_at, bot_name")
      .ilike("model_name", "%neuro_sage%")
      .order("created_at", { ascending: false })
      .limit(20);

    if (neuroError) {
      console.error("❌ Ошибка поиска neuro_sage:", neuroError);
    } else if (neuroModels && neuroModels.length > 0) {
      console.log(`✅ ВАЖНО: Найдено ${neuroModels.length} записей с neuro_sage`);
      neuroModels.forEach((model, i) => {
        console.log(`  [${i+1}] TG: ${model.telegram_id} - ${model.model_name} - ${model.created_at} - Bot: ${model.bot_name || "N/A"}`);
      });
    } else {
      console.log("❌ Модели neuro_sage не найдены");
    }

    // 4. Поиск в history
    console.log("\n4️⃣ Поиск в history...");
    const { data: history, error: histError } = await supabase
      .from("history")
      .select("*")
      .eq("telegram_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (histError) {
      console.error("❌ Ошибка поиска history:", histError);
    } else if (history && history.length > 0) {
      console.log(`✅ Найдено ${history.length} записей в history`);
      history.slice(0, 3).forEach((h, i) => {
        console.log(`  [${i+1}] ${h.created_at} - ${h.request || "N/A"}`);
      });
    } else {
      console.log("❌ История не найдена");
    }

    // 5. Проверяем актуальное состояние пользователя
    console.log("\n5️⃣ Текущее состояние пользователя...");
    const { data: currentUser, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", userId)
      .single();

    if (userError) {
      console.error("❌ Ошибка получения пользователя:", userError);
    } else {
      console.log("✅ Текущий пользователь:");
      console.log(`    Created: ${currentUser.created_at}`);
      console.log(`    Username: @${currentUser.username || "N/A"}`);
      console.log(`    Name: ${currentUser.first_name || "N/A"}`);
      console.log(`    Subscription: ${currentUser.subscription || "N/A"}`);
      console.log(`    Invited by: ${currentUser.invited_by || "N/A"}`);
    }

  } catch (error) {
    console.error("🚨 КРИТИЧЕСКАЯ ОШИБКА:", error);
  }
}

emergencyRecovery().then(() => {
  console.log("\n🏁 ЗАВЕРШЕНИЕ ЭКСТРЕННОГО ПОИСКА");
  process.exit(0);
}).catch(error => {
  console.error("🚨 ФАТАЛЬНАЯ ОШИБКА:", error);
  process.exit(1);
});