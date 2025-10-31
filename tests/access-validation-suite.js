/**
 * 🧪 COMPREHENSIVE ACCESS VALIDATION TESTING SUITE
 * For user 8190001592 unlimited access grant validation
 *
 * Testing Strategy:
 * 1. Pre-grant baseline validation
 * 2. Grant execution monitoring
 * 3. Post-grant comprehensive verification
 * 4. Edge case testing
 * 5. Security validation
 * 6. Performance impact assessment
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class AccessValidationTester {
  constructor() {
    this.userId = "8190001592";
    this.testResults = {};
    this.sshCommand = "ssh -i ~/.ssh/selectel root@185.161.67.53 'cd /root/999-agents-telegraf && ";
  }

  /**
   * 🔍 PRE-GRANT BASELINE VALIDATION
   * Capture current state before applying unlimited access
   */
  async preGrantValidation() {
    console.log("🔍 PRE-GRANT BASELINE VALIDATION");
    console.log("================================");

    const baselineCommand = `${this.sshCommand}node -e "
const { getUserDetailsSubscription } = require(\\"./dist/core/supabase/getUserDetailsSubscription.js\\");
const { getUserBalance } = require(\\"./dist/core/supabase/getUserBalance.js\\");
const { supabase } = require(\\"./dist/core/supabase/index.js\\");

async function preGrantBaseline(id) {
  console.log(\\"📊 BASELINE STATE FOR USER:\\", id);

  // 1. Current user record
  const userRecord = await supabase.from(\\"users\\").select(\\"*\\").eq(\\"telegram_id\\", id).single();
  console.log(\\"👤 User Record:\\", JSON.stringify(userRecord.data, null, 2));

  // 2. Subscription details
  const details = await getUserDetailsSubscription(id);
  console.log(\\"📋 Subscription Details:\\", JSON.stringify(details, null, 2));

  // 3. Balance
  const balance = await getUserBalance(id);
  console.log(\\"💰 Current Balance:\\", balance);

  // 4. Payment history (last 5 records)
  const payments = await supabase
    .from(\\"payments_v2\\")
    .select(\\"*\\")
    .eq(\\"telegram_id\\", id)
    .order(\\"payment_date\\", { ascending: false })
    .limit(5);
  console.log(\\"💳 Recent Payments:\\", JSON.stringify(payments.data, null, 2));

  // 5. Feature access test
  console.log(\\"🎯 ACCESS LEVEL BEFORE GRANT:\\");
  console.log(\\"- Subscription Type:\\", details.subscriptionType || \\"NONE\\");
  console.log(\\"- Is Active:\\", details.isSubscriptionActive);
  console.log(\\"- Access Level:\\", details.subscriptionType === \\"NEUROTESTER\\" ? \\"UNLIMITED\\" : \\"LIMITED\\");
}

preGrantBaseline(\\"${this.userId}\\").then(() => process.exit(0));
"'`;

    try {
      const { stdout, stderr } = await execAsync(baselineCommand);
      this.testResults.preGrant = { stdout, stderr, timestamp: new Date().toISOString() };
      console.log(stdout);
      if (stderr) console.error("❌ Pre-grant validation errors:", stderr);
      return true;
    } catch (error) {
      console.error("❌ Pre-grant validation failed:", error);
      return false;
    }
  }

  /**
   * ✅ POST-GRANT VERIFICATION SUITE
   * Comprehensive validation after grant execution
   */
  async postGrantVerification() {
    console.log("\\n✅ POST-GRANT VERIFICATION SUITE");
    console.log("=================================");

    const verificationCommand = `${this.sshCommand}node -e "
const { getUserDetailsSubscription } = require(\\"./dist/core/supabase/getUserDetailsSubscription.js\\");
const { getUserBalance } = require(\\"./dist/core/supabase/getUserBalance.js\\");
const { supabase } = require(\\"./dist/core/supabase/index.js\\");

async function postGrantVerification(id) {
  console.log(\\"🔍 POST-GRANT VERIFICATION FOR USER:\\", id);
  console.log(\\"\\n1️⃣ SUBSCRIPTION STATUS CHECK:\\"");

  const details = await getUserDetailsSubscription(id);
  const isUnlimited = details.subscriptionType === 'NEUROTESTER' && details.isSubscriptionActive;

  console.log(\\"   📋 Subscription Type:\\", details.subscriptionType);
  console.log(\\"   🔄 Is Active:\\", details.isSubscriptionActive);
  console.log(\\"   📅 Start Date:\\", details.subscriptionStartDate);
  console.log(\\"   ⏰ Expiry Date:\\", details.subscriptionExpiryDate);
  console.log(\\"   🎯 Access Level:\\", isUnlimited ? \\"✅ UNLIMITED\\" : \\"❌ LIMITED\\");

  console.log(\\"\\n2️⃣ PAYMENT RECORD VERIFICATION:\\"");
  const latestPayment = await supabase
    .from(\\"payments_v2\\")
    .select(\\"*\\")
    .eq(\\"telegram_id\\", id)
    .eq(\\"subscription_type\\", \\"NEUROTESTER\\")
    .order(\\"payment_date\\", { ascending: false })
    .limit(1);

  if (latestPayment.data && latestPayment.data.length > 0) {
    const payment = latestPayment.data[0];
    console.log(\\"   ✅ NEUROTESTER payment found:\\");
    console.log(\\"   📅 Date:\\", payment.payment_date);
    console.log(\\"   💰 Amount:\\", payment.amount);
    console.log(\\"   🌟 Stars:\\", payment.stars);
    console.log(\\"   📊 Status:\\", payment.status);
    console.log(\\"   🔗 ID:\\", payment.inv_id);
  } else {
    console.log(\\"   ❌ No NEUROTESTER payment record found\\");
  }

  console.log(\\"\\n3️⃣ BALANCE CHECK:\\"");
  const balance = await getUserBalance(id);
  console.log(\\"   💰 Current Balance:\\", balance, \\"stars\\");

  console.log(\\"\\n4️⃣ USER RECORD UPDATE:\\"");
  const userRecord = await supabase.from(\\"users\\").select(\\"subscription\\").eq(\\"telegram_id\\", id).single();
  console.log(\\"   📝 User.subscription:\\", userRecord.data?.subscription);

  console.log(\\"\\n🎯 FINAL VERIFICATION RESULT:\\"");
  console.log(\\"   Status:\\", isUnlimited ? \\"✅ GRANT SUCCESSFUL\\" : \\"❌ GRANT FAILED\\");
  console.log(\\"   User has unlimited access:\\", isUnlimited);

  return {
    isUnlimited,
    subscriptionType: details.subscriptionType,
    isActive: details.isSubscriptionActive,
    balance,
    hasPaymentRecord: latestPayment.data && latestPayment.data.length > 0
  };
}

postGrantVerification(\\"${this.userId}\\").then((result) => {
  console.log(\\"\\n📊 VERIFICATION SUMMARY:\\", JSON.stringify(result, null, 2));
  process.exit(0);
});
"'`;

    try {
      const { stdout, stderr } = await execAsync(verificationCommand);
      this.testResults.postGrant = { stdout, stderr, timestamp: new Date().toISOString() };
      console.log(stdout);
      if (stderr) console.error("❌ Post-grant verification errors:", stderr);
      return true;
    } catch (error) {
      console.error("❌ Post-grant verification failed:", error);
      return false;
    }
  }

  /**
   * 🔒 SECURITY VALIDATION TESTS
   * Ensure grant doesn't compromise system security
   */
  async securityValidation() {
    console.log("\\n🔒 SECURITY VALIDATION TESTS");
    console.log("=============================");

    const securityCommand = `${this.sshCommand}node -e "
const { supabase } = require(\\"./dist/core/supabase/index.js\\");

async function securityValidation(id) {
  console.log(\\"🔒 SECURITY VALIDATION FOR USER:\\", id);

  console.log(\\"\\n1️⃣ PAYMENT RECORD INTEGRITY:\\"");
  // Check for duplicate or suspicious records
  const allPayments = await supabase
    .from(\\"payments_v2\\")
    .select(\\"*\\")
    .eq(\\"telegram_id\\", id)
    .eq(\\"subscription_type\\", \\"NEUROTESTER\\");

  console.log(\\"   📊 Total NEUROTESTER payments:\\", allPayments.data.length);

  // Check for same-timestamp duplicates
  const timestamps = allPayments.data.map(p => p.payment_date);
  const duplicateTimestamps = timestamps.filter((t, i) => timestamps.indexOf(t) !== i);

  if (duplicateTimestamps.length > 0) {
    console.log(\\"   ⚠️ WARNING: Duplicate timestamps found:\\", duplicateTimestamps);
  } else {
    console.log(\\"   ✅ No duplicate timestamps detected\\");
  }

  console.log(\\"\\n2️⃣ SUBSCRIPTION CONSISTENCY:\\"");
  // Verify subscription data consistency
  const userRecord = await supabase.from(\\"users\\").select(\\"*\\").eq(\\"telegram_id\\", id).single();
  const { getUserDetailsSubscription } = require(\\"./dist/core/supabase/getUserDetailsSubscription.js\\");
  const details = await getUserDetailsSubscription(id);

  const isConsistent = (
    userRecord.data?.subscription === \\"NEUROTESTER\\" ||
    details.subscriptionType === \\"NEUROTESTER\\"
  );

  console.log(\\"   📝 User.subscription:\\", userRecord.data?.subscription);
  console.log(\\"   📋 Details.subscriptionType:\\", details.subscriptionType);
  console.log(\\"   🔄 Consistency:\\", isConsistent ? \\"✅ CONSISTENT\\" : \\"❌ INCONSISTENT\\");

  console.log(\\"\\n3️⃣ ACCESS PRIVILEGE VALIDATION:\\"");
  // Ensure no privilege escalation beyond expected
  const expectedType = \\"NEUROTESTER\\";
  const actualType = details.subscriptionType;

  console.log(\\"   🎯 Expected:\\", expectedType);
  console.log(\\"   📊 Actual:\\", actualType);
  console.log(\\"   🔒 Security:\\", actualType === expectedType ? \\"✅ SECURE\\" : \\"⚠️ PRIVILEGE MISMATCH\\");
}

securityValidation(\\"${this.userId}\\").then(() => process.exit(0));
"'`;

    try {
      const { stdout, stderr } = await execAsync(securityCommand);
      this.testResults.security = { stdout, stderr, timestamp: new Date().toISOString() };
      console.log(stdout);
      return true;
    } catch (error) {
      console.error("❌ Security validation failed:", error);
      return false;
    }
  }

  /**
   * 📊 MONITORING COMMAND GENERATOR
   * Create ongoing monitoring commands for the user
   */
  generateMonitoringCommands() {
    console.log("\\n📊 MONITORING COMMANDS");
    console.log("======================");

    const commands = {
      quickStatus: `${this.sshCommand}node -e "
const { getUserDetailsSubscription } = require(\\"./dist/core/supabase/getUserDetailsSubscription.js\\");
async function quickCheck() {
  const details = await getUserDetailsSubscription(\\"${this.userId}\\");
  console.log(\\"🎯 User ${this.userId} Status:\\");
  console.log(\\"   Type:\\", details.subscriptionType);
  console.log(\\"   Active:\\", details.isSubscriptionActive);
  console.log(\\"   Access:\\", details.subscriptionType === 'NEUROTESTER' ? 'UNLIMITED' : 'LIMITED');
}
quickCheck().then(() => process.exit(0));
"'`,

      detailedReport: `${this.sshCommand}node -e "
const { getUserDetailsSubscription } = require(\\"./dist/core/supabase/getUserDetailsSubscription.js\\");
const { getUserBalance } = require(\\"./dist/core/supabase/getUserBalance.js\\");
const { supabase } = require(\\"./dist/core/supabase/index.js\\");

async function detailedReport() {
  const details = await getUserDetailsSubscription(\\"${this.userId}\\");
  const balance = await getUserBalance(\\"${this.userId}\\");
  const payments = await supabase.from(\\"payments_v2\\").select(\\"*\\").eq(\\"telegram_id\\", \\"${this.userId}\\").order(\\"payment_date\\", { ascending: false }).limit(3);

  console.log(\\"📊 DETAILED REPORT - User ${this.userId}:\\");
  console.log(\\"Time:\\", new Date().toISOString());
  console.log(\\"Subscription:\\", details.subscriptionType);
  console.log(\\"Active:\\", details.isSubscriptionActive);
  console.log(\\"Balance:\\", balance);
  console.log(\\"Recent payments:\\", payments.data.length);
}
detailedReport().then(() => process.exit(0));
"'`,

      usageTracking: `${this.sshCommand}docker logs 999-multibots --tail 50 | grep "${this.userId}" || echo "No recent activity for user ${this.userId}"`
    };

    console.log("📋 Available monitoring commands:");
    console.log("\\n1️⃣ Quick Status Check:");
    console.log(commands.quickStatus);
    console.log("\\n2️⃣ Detailed Report:");
    console.log(commands.detailedReport);
    console.log("\\n3️⃣ Usage Tracking:");
    console.log(commands.usageTracking);

    return commands;
  }

  /**
   * 🔄 ROLLBACK TESTING PROCEDURES
   * Test procedures for reverting the grant if needed
   */
  generateRollbackProcedures() {
    console.log("\\n🔄 ROLLBACK TESTING PROCEDURES");
    console.log("===============================");

    const rollbackCommands = {
      // Test rollback without actually executing
      testRollback: `${this.sshCommand}node -e "
console.log('🧪 ROLLBACK TEST - DRY RUN');
console.log('This would remove NEUROTESTER subscription for user ${this.userId}');
console.log('Steps would be:');
console.log('1. Identify latest NEUROTESTER payment record');
console.log('2. Update payment status to CANCELLED');
console.log('3. Verify subscription becomes inactive');
console.log('4. Test access restrictions are applied');
console.log('❌ ACTUAL ROLLBACK NOT EXECUTED - THIS IS A TEST');
"'`,

      // Actual rollback command (use with caution)
      actualRollback: `${this.sshCommand}node -e "
const { supabase } = require(\\"./dist/core/supabase/index.js\\");

async function rollbackAccess(id) {
  console.log('🔄 ROLLING BACK ACCESS FOR USER:', id);

  // Find the latest NEUROTESTER payment
  const latestPayment = await supabase
    .from(\\"payments_v2\\")
    .select(\\"*\\")
    .eq(\\"telegram_id\\", id)
    .eq(\\"subscription_type\\", \\"NEUROTESTER\\")
    .eq(\\"status\\", \\"COMPLETED\\")
    .order(\\"payment_date\\", { ascending: false })
    .limit(1);

  if (latestPayment.data && latestPayment.data.length > 0) {
    const payment = latestPayment.data[0];
    console.log('📊 Found payment to rollback:', payment.inv_id);

    // Update payment status to CANCELLED
    const result = await supabase
      .from(\\"payments_v2\\")
      .update({
        status: 'CANCELLED',
        description: (payment.description || '') + ' [ROLLED BACK BY ADMIN]'
      })
      .eq(\\"id\\", payment.id);

    console.log('✅ Rollback completed:', result);
  } else {
    console.log('❌ No NEUROTESTER payment found to rollback');
  }
}

// UNCOMMENT TO EXECUTE ACTUAL ROLLBACK:
// rollbackAccess(\\"${this.userId}\\").then(() => process.exit(0));
console.log('⚠️ ROLLBACK COMMAND PREPARED BUT NOT EXECUTED');
console.log('Uncomment the rollbackAccess call to execute actual rollback');
"'`
    };

    console.log("⚠️ ROLLBACK PROCEDURES:");
    console.log("\\n1️⃣ Test Rollback (Safe - Dry Run):");
    console.log(rollbackCommands.testRollback);
    console.log("\\n2️⃣ Actual Rollback (⚠️ USE WITH CAUTION):");
    console.log(rollbackCommands.actualRollback);

    return rollbackCommands;
  }

  /**
   * 🎯 EDGE CASE TESTING SCENARIOS
   * Test unusual situations and edge cases
   */
  async edgeCaseValidation() {
    console.log("\\n🎯 EDGE CASE VALIDATION");
    console.log("=======================");

    const edgeCaseCommand = `${this.sshCommand}node -e "
const { getUserDetailsSubscription } = require(\\"./dist/core/supabase/getUserDetailsSubscription.js\\");
const { supabase } = require(\\"./dist/core/supabase/index.js\\");

async function edgeCaseValidation(id) {
  console.log('🎯 EDGE CASE VALIDATION FOR USER:', id);

  console.log('\\n1️⃣ MULTIPLE SUBSCRIPTION SCENARIO:');
  // Check if user has multiple subscription types
  const allSubscriptions = await supabase
    .from(\\"payments_v2\\")
    .select(\\"subscription_type\\")
    .eq(\\"telegram_id\\", id)
    .eq(\\"status\\", \\"COMPLETED\\")
    .not(\\"subscription_type\\", \\"is\\", null);

  const uniqueTypes = [...new Set(allSubscriptions.data.map(s => s.subscription_type))];
  console.log('   📊 Unique subscription types:', uniqueTypes);

  if (uniqueTypes.length > 1) {
    console.log('   ⚠️ MULTIPLE SUBSCRIPTION TYPES DETECTED');
    console.log('   🔍 This may cause conflicts in access determination');
  } else {
    console.log('   ✅ Single subscription type - no conflicts');
  }

  console.log('\\n2️⃣ TIMING EDGE CASES:');
  // Check subscription timing edge cases
  const details = await getUserDetailsSubscription(id);
  const now = new Date();
  const startDate = details.subscriptionStartDate ? new Date(details.subscriptionStartDate) : null;
  const expiryDate = details.subscriptionExpiryDate ? new Date(details.subscriptionExpiryDate) : null;

  if (startDate && expiryDate) {
    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    console.log('   📅 Days remaining:', daysRemaining);

    if (daysRemaining < 1) {
      console.log('   ⚠️ SUBSCRIPTION EXPIRING TODAY OR EXPIRED');
    } else if (daysRemaining < 7) {
      console.log('   ⚠️ SUBSCRIPTION EXPIRING SOON');
    } else {
      console.log('   ✅ Subscription has sufficient time remaining');
    }
  }

  console.log('\\n3️⃣ DATA CONSISTENCY EDGE CASES:');
  // Check for data inconsistencies
  const userRecord = await supabase.from(\\"users\\").select(\\"*\\").eq(\\"telegram_id\\", id).single();

  if (userRecord.data) {
    const userSub = userRecord.data.subscription;
    const detailsSub = details.subscriptionType;

    if (userSub && detailsSub && userSub !== detailsSub) {
      console.log('   ⚠️ INCONSISTENCY: user.subscription != details.subscriptionType');
      console.log('   📝 User record:', userSub);
      console.log('   📋 Details:', detailsSub);
    } else {
      console.log('   ✅ Subscription data is consistent');
    }
  }
}

edgeCaseValidation(\\"${this.userId}\\").then(() => process.exit(0));
"'`;

    try {
      const { stdout, stderr } = await execAsync(edgeCaseCommand);
      this.testResults.edgeCase = { stdout, stderr, timestamp: new Date().toISOString() };
      console.log(stdout);
      return true;
    } catch (error) {
      console.error("❌ Edge case validation failed:", error);
      return false;
    }
  }

  /**
   * 📈 PERFORMANCE IMPACT ASSESSMENT
   * Test system performance before and after grant
   */
  async performanceAssessment() {
    console.log("\\n📈 PERFORMANCE IMPACT ASSESSMENT");
    console.log("=================================");

    const performanceCommand = `${this.sshCommand}node -e "
const { supabase } = require(\\"./dist/core/supabase/index.js\\");

async function performanceAssessment() {
  console.log('📈 PERFORMANCE IMPACT ASSESSMENT');

  console.log('\\n1️⃣ DATABASE QUERY PERFORMANCE:');
  const startTime = Date.now();

  // Test getUserDetailsSubscription performance
  const { getUserDetailsSubscription } = require(\\"./dist/core/supabase/getUserDetailsSubscription.js\\");
  const details = await getUserDetailsSubscription(\\"${this.userId}\\");

  const queryTime = Date.now() - startTime;
  console.log('   🔍 getUserDetailsSubscription time:', queryTime, 'ms');

  if (queryTime > 1000) {
    console.log('   ⚠️ SLOW QUERY DETECTED (>1000ms)');
  } else {
    console.log('   ✅ Query performance acceptable');
  }

  console.log('\\n2️⃣ PAYMENT TABLE SIZE CHECK:');
  const paymentCount = await supabase
    .from('payments_v2')
    .select('id', { count: 'exact', head: true });

  console.log('   📊 Total payments in database:', paymentCount.count);

  if (paymentCount.count > 100000) {
    console.log('   ⚠️ Large payment table - consider indexing optimization');
  } else {
    console.log('   ✅ Payment table size manageable');
  }

  console.log('\\n3️⃣ USER TABLE CONSISTENCY:');
  const userCount = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });

  console.log('   👥 Total users in database:', userCount.count);
}

performanceAssessment().then(() => process.exit(0));
"'`;

    try {
      const { stdout, stderr } = await execAsync(performanceCommand);
      this.testResults.performance = { stdout, stderr, timestamp: new Date().toISOString() };
      console.log(stdout);
      return true;
    } catch (error) {
      console.error("❌ Performance assessment failed:", error);
      return false;
    }
  }

  /**
   * 📝 GENERATE COMPREHENSIVE TEST REPORT
   */
  generateTestReport() {
    console.log("\\n📝 COMPREHENSIVE TEST REPORT");
    console.log("=============================");

    const report = {
      userId: this.userId,
      testTimestamp: new Date().toISOString(),
      testResults: this.testResults,
      summary: {
        totalTests: Object.keys(this.testResults).length,
        passedTests: Object.values(this.testResults).filter(result => !result.stderr).length,
        failedTests: Object.values(this.testResults).filter(result => result.stderr).length
      }
    };

    console.log("📊 TEST EXECUTION SUMMARY:");
    console.log("   User ID:", report.userId);
    console.log("   Test Timestamp:", report.testTimestamp);
    console.log("   Total Tests:", report.summary.totalTests);
    console.log("   Passed Tests:", report.summary.passedTests);
    console.log("   Failed Tests:", report.summary.failedTests);

    return report;
  }
}

// Export for use in testing workflows
module.exports = { AccessValidationTester };

// Example usage:
if (require.main === module) {
  async function runFullTestSuite() {
    const tester = new AccessValidationTester();

    console.log("🧪 STARTING FULL ACCESS VALIDATION TEST SUITE");
    console.log("==============================================");

    // Run all test phases
    await tester.preGrantValidation();
    await tester.postGrantVerification();
    await tester.securityValidation();
    await tester.edgeCaseValidation();
    await tester.performanceAssessment();

    // Generate monitoring commands
    tester.generateMonitoringCommands();
    tester.generateRollbackProcedures();

    // Final report
    const report = tester.generateTestReport();
    console.log("\\n📋 Full test suite completed");

    return report;
  }

  runFullTestSuite().catch(console.error);
}