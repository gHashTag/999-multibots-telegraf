const { getUserDetailsSubscription } = require("../dist/core/supabase/getUserDetailsSubscription.js");
const { supabase } = require("../dist/core/supabase/index.js");

class UserAccessAgent {
  static detectTelegramId(text) {
    const regex = /\b\d{8,12}\b/g;
    return text.match(regex);
  }
  
  static async checkUser(telegramId) {
    try {
      console.log(`🔍 Проверка пользователя ${telegramId}...`);
      
      const { data: userData, error: userError } = await supabase
        .from("users").select("*").eq("telegram_id", telegramId).single();
        
      const details = await getUserDetailsSubscription(telegramId);
      
      return {
        userData: userError ? null : userData,
        details,
        recommendation: this.generateRecommendation(userData, details)
      };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  static generateRecommendation(userData, details) {
    if (!userData) return "❌ Пользователь не найден - создать запись";
    if (details.stars > 50000 && !details.isSubscriptionActive) 
      return "🎯 Высокий баланс - предоставить NEUROTESTER";
    if (details.stars > 10000 && !details.isSubscriptionActive)
      return "💡 Хороший баланс - рассмотреть NEUROTESTER"; 
    if (details.isSubscriptionActive) return "✅ Все в порядке";
    return "⚠️ Требует внимания";
  }
  
  static async generateReport(telegramId) {
    const analysis = await this.checkUser(telegramId);
    if (analysis.error) return `❌ Ошибка: ${analysis.error}`;
    
    const { userData, details } = analysis;
    
    return `
🔍 АНАЛИЗ ПОЛЬЗОВАТЕЛЯ ${telegramId}
========================
📱 Username: ${userData?.username || "N/A"}
🤖 Bot: ${userData?.bot_name || "N/A"}  
💰 Баланс: ${details.stars} звезд ⭐
📋 Подписка: ${details.subscriptionType || "НЕТ"}
✅ Активна: ${details.isSubscriptionActive ? "ДА" : "НЕТ"}

🎯 РЕКОМЕНДАЦИЯ: ${analysis.recommendation}
    `.trim();
  }
}

async function main() {
  const [,, action, telegramId] = process.argv;
  
  if (!action) {
    console.log("Использование: node user-access-auto.js [check|report|analyze] [telegramId|text]");
    return;
  }
  
  if (action === "analyze") {
    const text = process.argv.slice(2).join(" ");
    const ids = UserAccessAgent.detectTelegramId(text);
    if (ids) {
      console.log(`🎯 Обнаружены Telegram ID: ${ids.join(", ")}`);
      for (const id of ids) {
        console.log(await UserAccessAgent.generateReport(id));
      }
    } else {
      console.log("❌ Telegram ID не найдены");
    }
    return;
  }
  
  if (!telegramId) {
    console.log("❌ Укажите Telegram ID");
    return;
  }
  
  switch (action) {
    case "check":
      console.log(JSON.stringify(await UserAccessAgent.checkUser(telegramId), null, 2));
      break;
    case "report":
      console.log(await UserAccessAgent.generateReport(telegramId));
      break;
    default:
      console.log("❌ Неизвестное действие");
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });