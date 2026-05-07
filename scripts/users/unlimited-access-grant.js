#!/usr/bin/env node

/**
 * UNLIMITED NEUROTESTER ACCESS GRANT SYSTEM
 * For user 8190001592 - Comprehensive Solution
 *
 * This script provides truly unlimited access by:
 * 1. Setting massive star balance (999,999,999 stars)
 * 2. Granting NEUROTESTER subscription
 * 3. Creating backup/rollback procedures
 * 4. Implementing safeguards
 */

const { supabase } = require("../dist/core/supabase/index.js");

// CONFIGURATION
const TARGET_USER_ID = "8190001592";
const UNLIMITED_STARS = 999999999; // Nearly unlimited stars
const SUBSCRIPTION_TYPE = "NEUROTESTER";
const ADMIN_GRANT_MARKER = "ADMIN_UNLIMITED_GRANT_2025";

/**
 * PHASE 1: Backup current user state
 */
async function backupUserState(telegramId) {
    console.log("🔄 PHASE 1: Backing up current user state...");

    try {
        // Get current user data
        const userData = await supabase
            .from("users")
            .select("*")
            .eq("telegram_id", telegramId)
            .single();

        // Get current balance
        const { getUserBalance } = require("../dist/core/supabase/getUserBalance.js");
        const currentBalance = await getUserBalance(telegramId);

        // Get recent payments
        const payments = await supabase
            .from("payments_v2")
            .select("*")
            .eq("telegram_id", telegramId)
            .order("payment_date", { ascending: false })
            .limit(10);

        const backup = {
            timestamp: new Date().toISOString(),
            user_data: userData.data,
            current_balance: currentBalance,
            recent_payments: payments.data,
            telegram_id: telegramId
        };

        // Store backup in a special backup table or as a JSON file
        const backupRecord = await supabase
            .from("payments_v2")
            .insert({
                telegram_id: telegramId,
                amount: 0,
                stars: 0,
                currency: "BACKUP",
                status: "COMPLETED",
                type: "BACKUP_RECORD",
                subscription_type: "BACKUP_DATA",
                payment_method: "System_Backup",
                bot_name: "admin_backup",
                inv_id: `backup-${telegramId}-${Date.now()}`,
                description: `BACKUP: User state before unlimited grant - ${JSON.stringify(backup)}`,
                payment_date: new Date().toISOString()
            });

        console.log("✅ Backup completed successfully");
        return backup;
    } catch (error) {
        console.error("❌ Backup failed:", error);
        throw error;
    }
}

/**
 * PHASE 2: Grant massive star balance
 */
async function grantUnlimitedStars(telegramId) {
    console.log("🔄 PHASE 2: Granting unlimited stars balance...");

    try {
        const result = await supabase
            .from("payments_v2")
            .insert({
                telegram_id: telegramId,
                amount: 0,
                stars: UNLIMITED_STARS,
                currency: "XTR",
                status: "COMPLETED",
                type: "MONEY_INCOME",
                subscription_type: null,
                payment_method: "Admin_Unlimited_Grant",
                bot_name: "admin_unlimited",
                inv_id: `unlimited-stars-${telegramId}-${Date.now()}`,
                description: `${ADMIN_GRANT_MARKER}: Unlimited stars balance grant - ${UNLIMITED_STARS.toLocaleString()} stars`,
                payment_date: new Date().toISOString(),
                metadata: {
                    grant_type: "unlimited_access",
                    original_balance_check: true,
                    admin_action: true,
                    reversible: true
                }
            });

        console.log(`✅ Granted ${UNLIMITED_STARS.toLocaleString()} stars successfully`);
        return result;
    } catch (error) {
        console.error("❌ Star grant failed:", error);
        throw error;
    }
}

/**
 * PHASE 3: Grant NEUROTESTER subscription
 */
async function grantNeurotesterSubscription(telegramId) {
    console.log("🔄 PHASE 3: Granting NEUROTESTER subscription...");

    try {
        const result = await supabase
            .from("payments_v2")
            .insert({
                telegram_id: telegramId,
                amount: 0,
                stars: 0,
                currency: "RUB",
                status: "COMPLETED",
                type: "MONEY_INCOME",
                subscription_type: SUBSCRIPTION_TYPE,
                payment_method: "Admin_Unlimited_Grant",
                bot_name: "admin_unlimited",
                inv_id: `unlimited-neurotester-${telegramId}-${Date.now()}`,
                description: `${ADMIN_GRANT_MARKER}: Unlimited NEUROTESTER subscription grant`,
                payment_date: new Date().toISOString(),
                metadata: {
                    grant_type: "unlimited_subscription",
                    subscription_duration: "permanent",
                    admin_action: true,
                    reversible: true
                }
            });

        console.log("✅ NEUROTESTER subscription granted successfully");
        return result;
    } catch (error) {
        console.error("❌ Subscription grant failed:", error);
        throw error;
    }
}

/**
 * PHASE 4: Verify unlimited access
 */
async function verifyUnlimitedAccess(telegramId) {
    console.log("🔄 PHASE 4: Verifying unlimited access...");

    try {
        const { getUserDetailsSubscription } = require("../dist/core/supabase/getUserDetailsSubscription.js");
        const details = await getUserDetailsSubscription(telegramId);

        console.log("📊 POST-GRANT VERIFICATION:");
        console.log("- Stars balance:", details.stars);
        console.log("- Subscription type:", details.subscriptionType);
        console.log("- Subscription active:", details.isSubscriptionActive);
        console.log("- User exists:", details.isExist);

        const isUnlimited = details.stars >= 999999 &&
                           details.subscriptionType === SUBSCRIPTION_TYPE &&
                           details.isSubscriptionActive;

        if (isUnlimited) {
            console.log("🎉 UNLIMITED ACCESS VERIFIED SUCCESSFULLY!");
            return true;
        } else {
            console.log("⚠️ Unlimited access verification failed");
            return false;
        }
    } catch (error) {
        console.error("❌ Verification failed:", error);
        return false;
    }
}

/**
 * ROLLBACK PROCEDURE
 */
async function rollbackUnlimitedGrant(telegramId) {
    console.log("🔄 ROLLBACK: Reverting unlimited grant...");

    try {
        // Find and mark admin grants as cancelled
        const adminGrants = await supabase
            .from("payments_v2")
            .select("*")
            .eq("telegram_id", telegramId)
            .ilike("description", `%${ADMIN_GRANT_MARKER}%`)
            .eq("status", "COMPLETED");

        for (const grant of adminGrants.data || []) {
            await supabase
                .from("payments_v2")
                .update({
                    status: "CANCELLED",
                    description: grant.description + " [ROLLED_BACK]"
                })
                .eq("id", grant.id);
        }

        console.log("✅ Rollback completed - admin grants cancelled");
        return true;
    } catch (error) {
        console.error("❌ Rollback failed:", error);
        return false;
    }
}

/**
 * MAIN EXECUTION FUNCTION
 */
async function executeUnlimitedGrant(telegramId) {
    console.log("🚀 EXECUTING UNLIMITED ACCESS GRANT");
    console.log("===================================");
    console.log(`👤 Target User: ${telegramId}`);
    console.log(`⭐ Stars to grant: ${UNLIMITED_STARS.toLocaleString()}`);
    console.log(`📋 Subscription: ${SUBSCRIPTION_TYPE}`);
    console.log("");

    try {
        // Phase 1: Backup
        await backupUserState(telegramId);

        // Phase 2: Grant stars
        await grantUnlimitedStars(telegramId);

        // Phase 3: Grant subscription
        await grantNeurotesterSubscription(telegramId);

        // Phase 4: Verify
        const verified = await verifyUnlimitedAccess(telegramId);

        if (verified) {
            console.log("");
            console.log("🎉 SUCCESS: UNLIMITED ACCESS GRANTED!");
            console.log("=====================================");
            console.log("✅ User now has unlimited NEUROTESTER access");
            console.log("✅ Massive star balance for unlimited usage");
            console.log("✅ All changes are logged and reversible");
            console.log("");
            console.log("📝 To rollback if needed:");
            console.log(`node scripts/unlimited-access-grant.js rollback ${telegramId}`);
        } else {
            console.log("❌ Grant completed but verification failed");
        }

    } catch (error) {
        console.error("💥 CRITICAL ERROR during unlimited grant:", error);
        console.log("🔄 Attempting automatic rollback...");
        await rollbackUnlimitedGrant(telegramId);
    }
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const userId = args[1] || TARGET_USER_ID;

    if (command === "rollback") {
        rollbackUnlimitedGrant(userId).then(() => process.exit(0));
    } else if (command === "verify") {
        verifyUnlimitedAccess(userId).then(() => process.exit(0));
    } else {
        executeUnlimitedGrant(userId).then(() => process.exit(0));
    }
}

module.exports = {
    executeUnlimitedGrant,
    rollbackUnlimitedGrant,
    verifyUnlimitedAccess,
    backupUserState
};