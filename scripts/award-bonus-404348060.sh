#!/bin/bash
# Award 100 stars bonus to user 404348060 for discovering Cancel button bug

ssh -i ~/.ssh/zomro root@212.86.115.30 'docker exec 999-multibots node -e "
const { supabase } = require(\"/app/dist/core/supabase/index.js\");

async function awardBonus(telegramId) {
  try {
    console.log(\"🎁 Awarding 100 stars bonus to user:\", telegramId);

    // Get current balance
    const { getUserBalance } = require(\"/app/dist/core/supabase/getUserBalance.js\");
    const currentBalance = await getUserBalance(telegramId);
    console.log(\"💰 Current balance:\", currentBalance, \"stars\");

    // Create bonus payment record
    const bonusAmount = 100;
    const result = await supabase.from(\"payments_v2\").insert({
      telegram_id: telegramId,
      amount: 0,
      stars: bonusAmount,
      currency: \"STARS\",
      status: \"COMPLETED\",
      type: \"MONEY_INCOME\",
      subscription_type: null,
      payment_method: \"Admin_Bonus\",
      bot_name: \"AI_STARS_bot\",
      inv_id: \"bonus-cancel-bug-\" + Date.now(),
      description: \"Bonus 100 stars for discovering critical Cancel button bug in Neuro Photo wizard\",
      payment_date: new Date().toISOString()
    });

    if (result.error) {
      console.error(\"❌ Error adding bonus:\", result.error);
      return;
    }

    console.log(\"✅ Bonus payment record created:\", result.data);

    // Verify new balance
    const newBalance = await getUserBalance(telegramId);
    console.log(\"💎 New balance:\", newBalance, \"stars\");
    console.log(\"✨ Bonus added successfully! +100 stars\");
    console.log(\"📊 Balance change:\", currentBalance, \"→\", newBalance);

  } catch (error) {
    console.error(\"❌ Error:\", error.message);
  }
}

awardBonus(\"404348060\").then(() => process.exit(0));"'
