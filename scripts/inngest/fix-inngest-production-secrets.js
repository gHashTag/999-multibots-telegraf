/**
 * Script: fix-inngest-production-secrets.js
 * Purpose: Fix missing BOT_INNGEST_* environment variables in production
 *
 * CRITICAL ISSUE:
 * Production environment is missing BOT_INNGEST_EVENT_KEY, BOT_INNGEST_SIGNING_KEY, and BOT_INNGEST_BASE_URL
 * This causes "404 Event key not found" errors when trying to send Inngest events
 *
 * SOLUTION:
 * Add these variables to Infisical for the 'prod' environment
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('='.repeat(80));
console.log('🚨 INNGEST PRODUCTION SECRET FIX SCRIPT');
console.log('='.repeat(80));
console.log();

console.log('📋 PROBLEM DIAGNOSIS:');
console.log('❌ BOT_INNGEST_EVENT_KEY - NOT SET in production');
console.log('❌ BOT_INNGEST_SIGNING_KEY - NOT SET in production');
console.log('❌ BOT_INNGEST_BASE_URL - NOT SET in production');
console.log();
console.log('📈 IMPACT:');
console.log('   - Model training scenes fail with "404 Event key not found"');
console.log('   - Users cannot trigger background jobs');
console.log('   - All Inngest event sending is broken');
console.log();

console.log('🔧 REQUIRED VARIABLES (from docs/INNGEST_PRODUCTION_SECRETS.md):');
console.log();
console.log('1️⃣  BOT_INNGEST_EVENT_KEY');
console.log('   Value: akoHhkQS3NGSQhDzcosD7o-0dGSJ9PWLiGol-fi5QMnZOG5XpvuxGBlnh_an9VQ0ygwA4BZEa3lfjKlbgm3U2A');
console.log();
console.log('2️⃣  BOT_INNGEST_SIGNING_KEY');
console.log('   Value: signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047');
console.log();
console.log('3️⃣  BOT_INNGEST_BASE_URL');
console.log('   Value: https://three-head-dragon.shop/api/inngest');
console.log();

console.log('📝 MANUAL STEPS TO FIX:');
console.log();
console.log('Step 1: Login to Infisical');
console.log('   $ infisical login');
console.log();
console.log('Step 2: Set production environment variables');
console.log('   $ infisical secrets set --env=prod --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 BOT_INNGEST_EVENT_KEY=akoHhkQS3NGSQhDzcosD7o-0dGSJ9PWLiGol-fi5QMnZOG5XpvuxGBlnh_an9VQ0ygwA4BZEa3lfjKlbgm3U2A');
console.log();
console.log('   $ infisical secrets set --env=prod --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 BOT_INNGEST_SIGNING_KEY=signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047');
console.log();
console.log('   $ infisical secrets set --env=prod --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 BOT_INNGEST_BASE_URL=https://three-head-dragon.shop/api/inngest');
console.log();

console.log('Alternative: Use Infisical Dashboard');
console.log('   1. Go to: https://app.infisical.com/');
console.log('   2. Navigate to: Project → fd763fa3-35d5-4045-93bd-1795c5f00fc3 → Production');
console.log('   3. Add the 3 variables above');
console.log();

console.log('Step 3: Deploy updated secrets to production');
console.log('   $ ./deploy.sh production');
console.log();

console.log('Step 4: Verify fix');
console.log('   $ ssh prod999 "docker logs 999-multibots --tail 50 | grep INNGEST"');
console.log();

console.log('='.repeat(80));
console.log('✅ AFTER FIX: Check that logs show:');
console.log('   "🔥 [INNGEST CLIENT] Единственный источник правды инициализирован"');
console.log('   with hasEventKey: true and hasSigningKey: true');
console.log('='.repeat(80));
console.log();

// Export the secrets for automation
module.exports = {
  productionSecrets: {
    BOT_INNGEST_EVENT_KEY: 'akoHhkQS3NGSQhDzcosD7o-0dGSJ9PWLiGol-fi5QMnZOG5XpvuxGBlnh_an9VQ0ygwA4BZEa3lfjKlbgm3U2A',
    BOT_INNGEST_SIGNING_KEY: 'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047',
    BOT_INNGEST_BASE_URL: 'https://three-head-dragon.shop/api/inngest'
  },
  projectId: 'fd763fa3-35d5-4045-93bd-1795c5f00fc3'
};
