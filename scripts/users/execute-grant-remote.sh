#!/bin/bash

# Script to grant subscription to user 7912847443 on production server
# Server: 212.86.115.30 (as specified by user)

# service_role ключ берётся только из окружения. Пустая строка вместо ключа
# даёт невнятную ошибку от Supabase, поэтому падаем сразу и громко.
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "SUPABASE_SERVICE_ROLE_KEY не задан. Возьмите: railway variables --kv | grep SUPABASE" >&2
  exit 1
fi

echo "=========================================="
echo "Connecting to production server..."
echo "Server: root@212.86.115.30"
echo "=========================================="

# Create the grant script content
SCRIPT_CONTENT='const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://yuukfqcsdhkyxegfwlcb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "'"$SUPABASE_SERVICE_ROLE_KEY"'";

const TELEGRAM_ID = "7912847443";

async function grantSubscription() {
  console.log("=".repeat(60));
  console.log("GRANTING SUBSCRIPTION TO USER:", TELEGRAM_ID);
  console.log("=".repeat(60));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log("\n[1] Checking user status...");
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", TELEGRAM_ID)
      .single();

    if (userData) {
      console.log("✓ User found:", userData.username || userData.first_name || "N/A");
    } else {
      console.log("⚠ User not found (will be created on first interaction)");
    }

    console.log("\n[2] Checking current subscriptions...");
    const { data: existingSubs } = await supabase
      .from("payments_v2")
      .select("*")
      .eq("telegram_id", TELEGRAM_ID)
      .in("subscription_type", ["NEUROVIDEO", "NEUROTESTER", "NEUROPHOTO", "NEUROBLOGGER"])
      .eq("status", "COMPLETED")
      .order("created_at", { ascending: false });

    if (existingSubs && existingSubs.length > 0) {
      console.log("✓ Found existing subscriptions:");
      existingSubs.forEach(sub => {
        console.log(`  - ${sub.subscription_type} (expires: ${sub.subscription_expires_at || "never"})`);
      });
    }

    console.log("\n[3] Granting NEUROVIDEO subscription (30 days)...");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data: insertData, error: insertError } = await supabase
      .from("payments_v2")
      .insert({
        telegram_id: TELEGRAM_ID,
        subscription_type: "NEUROVIDEO",
        status: "COMPLETED",
        type: "MONEY_INCOME",
        category: "BONUS",
        is_system_payment: true,
        payment_method: "Manual",
        bot_name: "neuro_blogger_bot",
        description: "Manual admin grant - standard subscription (NOT ero-video)",
        subscription_expires_at: expiresAt.toISOString(),
        stars: 0,
        currency: "RUB",
        amount: 0,
        inv_id: `manual_grant_${Date.now()}_${TELEGRAM_ID}`,
        created_at: new Date().toISOString()
      })
      .select();

    if (insertError) {
      console.error("✗ Error:", insertError);
      throw insertError;
    }

    console.log("✓ Subscription granted successfully!");
    console.log("  - Type: NEUROVIDEO");
    console.log("  - Expires:", expiresAt.toISOString());

    console.log("\n" + "=".repeat(60));
    console.log("SUCCESS: User can now use the bot!");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("\n✗ ERROR:", error);
    process.exit(1);
  }
}

grantSubscription();'

# Execute on production server
ssh -i ~/.ssh/selectel root@212.86.115.30 << 'ENDSSH'
cd /root/999-agents-telegraf

# Check if docker container exists
if ! docker ps | grep -q 999-multibots; then
  echo "Error: Docker container 999-multibots not found"
  echo "Available containers:"
  docker ps --format "table {{.Names}}\t{{.Status}}"
  exit 1
fi

# Execute the subscription grant
echo "$SCRIPT_CONTENT" | docker exec -i 999-multibots node -e "$(cat)"
ENDSSH

echo ""
echo "Script execution completed!"
