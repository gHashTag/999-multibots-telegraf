/**
 * 🔍 IMMEDIATE POST-GRANT VERIFICATION
 * Run this immediately after granting unlimited access to user 8190001592
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const USER_ID = "8190001592";

async function immediateVerification() {
  console.log("🔍 IMMEDIATE POST-GRANT VERIFICATION");
  console.log("===================================");
  console.log(`User ID: ${USER_ID}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const verificationCommand = `ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && node -e "
const { getUserDetailsSubscription } = require(\\"./dist/core/supabase/getUserDetailsSubscription.js\\");
const { getUserBalance } = require(\\"./dist/core/supabase/getUserBalance.js\\");
const { supabase } = require(\\"./dist/core/supabase/index.js\\");

async function immediateCheck(id) {
  console.log(\\"🔍 IMMEDIATE VERIFICATION FOR USER:\\", id);
  console.log(\\"Time:\\", new Date().toISOString());
  console.log();

  try {
    // 1. Get current subscription details
    console.log(\\"1️⃣ SUBSCRIPTION STATUS:\\"");
    const details = await getUserDetailsSubscription(id);
    console.log(\\"   📋 Type:\\", details.subscriptionType);
    console.log(\\"   🔄 Active:\\", details.isSubscriptionActive);
    console.log(\\"   📅 Start:\\", details.subscriptionStartDate);
    console.log(\\"   ⏰ Expiry:\\", details.subscriptionExpiryDate);

    // 2. Check balance
    console.log(\\"\\n2️⃣ BALANCE STATUS:\\"");
    const balance = await getUserBalance(id);
    console.log(\\"   💰 Stars:\\", balance);

    // 3. Verify latest payment record
    console.log(\\"\\n3️⃣ LATEST PAYMENT VERIFICATION:\\"");
    const latestPayment = await supabase
      .from(\\"payments_v2\\")
      .select(\\"*\\")
      .eq(\\"telegram_id\\", id)
      .order(\\"payment_date\\", { ascending: false })
      .limit(1);

    if (latestPayment.data && latestPayment.data.length > 0) {
      const payment = latestPayment.data[0];
      console.log(\\"   📊 Latest payment:\\"');
      console.log(\\"     💰 Amount:\\", payment.amount);
      console.log(\\"     🌟 Stars:\\", payment.stars);
      console.log(\\"     📋 Type:\\", payment.subscription_type);
      console.log(\\"     📊 Status:\\", payment.status);
      console.log(\\"     📅 Date:\\", payment.payment_date);
      console.log(\\"     🔗 ID:\\", payment.inv_id);
      console.log(\\"     💬 Description:\\", payment.description);
    } else {
      console.log(\\"   ❌ No payment records found\\");
    }

    // 4. Final verification result
    console.log(\\"\\n🎯 FINAL VERIFICATION RESULT:\\"');
    const isUnlimited = details.subscriptionType === 'NEUROTESTER' && details.isSubscriptionActive;

    if (isUnlimited) {
      console.log(\\"   ✅ SUCCESS: User has UNLIMITED access\\");
      console.log(\\"   🎉 Grant verification PASSED\\");
      console.log(\\"   🚀 User can now access all premium features\\");
    } else {
      console.log(\\"   ❌ FAILURE: User still has LIMITED access\\");
      console.log(\\"   🔴 Grant verification FAILED\\");
      console.log(\\"   🛠️ Manual investigation required\\");
    }

    // 5. Quick access test
    console.log(\\"\\n5️⃣ ACCESS LEVEL SUMMARY:\\"');
    console.log(\\"   User:\\", id);
    console.log(\\"   Status:\\", isUnlimited ? 'UNLIMITED' : 'LIMITED');
    console.log(\\"   Subscription:\\", details.subscriptionType || 'NONE');
    console.log(\\"   Active:\\", details.isSubscriptionActive ? 'YES' : 'NO');

    return {
      userId: id,
      timestamp: new Date().toISOString(),
      isUnlimited,
      subscriptionType: details.subscriptionType,
      isActive: details.isSubscriptionActive,
      balance,
      verificationPassed: isUnlimited
    };

  } catch (error) {
    console.error(\\"❌ VERIFICATION ERROR:\\", error);
    return {
      userId: id,
      timestamp: new Date().toISOString(),
      error: error.message,
      verificationPassed: false
    };
  }
}

immediateCheck(\\"${USER_ID}\\").then((result) => {
  console.log(\\"\\n📊 VERIFICATION SUMMARY:\\"');
  console.log(JSON.stringify(result, null, 2));

  if (result.verificationPassed) {
    console.log(\\"\\n🎉 VERIFICATION SUCCESSFUL!\\"');
  } else {
    console.log(\\"\\n❌ VERIFICATION FAILED - CHECK LOGS\\"');
  }

  process.exit(0);
});
"'`;

  try {
    console.log("🚀 Executing verification...\n");
    const { stdout, stderr } = await execAsync(verificationCommand);

    console.log(stdout);

    if (stderr) {
      console.error("❌ Verification errors:");
      console.error(stderr);
    }

    console.log("\n✅ Immediate verification completed");

  } catch (error) {
    console.error("❌ Verification execution failed:", error.message);

    // Provide fallback verification command
    console.log("\n🔄 FALLBACK VERIFICATION COMMAND:");
    console.log("Run this manually if automatic verification failed:");
    console.log(verificationCommand);
  }
}

// Run if called directly
if (require.main === module) {
  immediateVerification().catch(console.error);
}

module.exports = { immediateVerification, USER_ID };