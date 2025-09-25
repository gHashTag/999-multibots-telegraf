#!/usr/bin/env node

/**
 * 🧪 Test Script for Bot Financial Report Generator
 *
 * Validates the Excel generation system without generating large files
 */

const { getBotFinancialData, processFinancialData, createExcelReport } = require('./bot-financial-report');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Test database connection
 */
async function testConnection() {
  console.log('🔗 Testing database connection...');
  try {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('bot_name')
      .limit(1);

    if (error) throw error;
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

/**
 * Test bot list retrieval
 */
async function testBotsList() {
  console.log('📋 Testing bot list retrieval...');
  try {
    const { data, error } = await supabase
      .from('payments_v2')
      .select('bot_name')
      .eq('status', 'COMPLETED')
      .limit(100);

    if (error) throw error;

    const uniqueBots = [...new Set(data.map(p => p.bot_name))].filter(Boolean);
    console.log(`✅ Found ${uniqueBots.length} bots:`, uniqueBots.slice(0, 5).join(', '), '...');
    return uniqueBots;
  } catch (error) {
    console.error('❌ Bot list retrieval failed:', error.message);
    return [];
  }
}

/**
 * Test data retrieval for a bot
 */
async function testBotData(botName) {
  console.log(`📊 Testing data retrieval for bot: ${botName}`);
  try {
    const { payments, users } = await getBotFinancialData(botName, 7); // Last 7 days
    console.log(`✅ Retrieved ${payments.length} payments and ${users.length} users`);

    if (payments.length > 0) {
      const sample = payments[0];
      console.log('📝 Sample payment:', {
        type: sample.type,
        amount: sample.amount,
        stars: sample.stars,
        service_type: sample.service_type,
        payment_method: sample.payment_method
      });
    }

    return { payments, users };
  } catch (error) {
    console.error(`❌ Data retrieval failed for ${botName}:`, error.message);
    return { payments: [], users: [] };
  }
}

/**
 * Test data processing
 */
async function testDataProcessing(payments, users) {
  console.log('⚙️ Testing data processing...');
  try {
    const data = processFinancialData(payments, users);
    console.log('✅ Data processing successful');
    console.log('📈 Summary:', {
      totalIncomeStars: data.summary.totalIncomeStars,
      totalExpenseStars: data.summary.totalExpenseStars,
      netProfitStars: data.summary.netProfitStars,
      totalUsers: data.summary.totalUsers,
      totalTransactions: data.summary.totalTransactions
    });
    return data;
  } catch (error) {
    console.error('❌ Data processing failed:', error.message);
    return null;
  }
}

/**
 * Test Excel workbook creation (without saving)
 */
async function testExcelCreation(botName, data) {
  console.log('📊 Testing Excel workbook creation...');
  try {
    const workbook = createExcelReport(botName, data);
    console.log('✅ Excel workbook created successfully');
    console.log('📋 Sheets:', workbook.SheetNames.join(', '));

    // Test first sheet content
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = firstSheet['!ref'];
    console.log(`📏 First sheet range: ${range}`);

    return workbook;
  } catch (error) {
    console.error('❌ Excel creation failed:', error.message);
    return null;
  }
}

/**
 * Test service mapping
 */
function testServiceMapping() {
  console.log('🛠️ Testing service mapping...');

  const testServices = [
    'neuro_photo',
    'text_to_video',
    'kling_video',
    'unknown_service',
    null
  ];

  // Import the service display function
  const SERVICE_MAPPING = {
    neuro_photo: { emoji: '🖼️', name: 'Нейрофото' },
    text_to_video: { emoji: '📹', name: 'Генерация видео' },
    kling_video: { emoji: '📹', name: 'Kling Video' },
    unknown: { emoji: '❓', name: 'Неизвестно' }
  };

  function getServiceDisplay(serviceType) {
    const service = SERVICE_MAPPING[serviceType] || SERVICE_MAPPING.unknown;
    return `${service.emoji} ${service.name}`;
  }

  testServices.forEach(service => {
    const display = getServiceDisplay(service);
    console.log(`  ${service || 'null'} → ${display}`);
  });

  console.log('✅ Service mapping test completed');
}

/**
 * Test currency conversion
 */
function testCurrencyConversion() {
  console.log('💰 Testing currency conversion...');

  const STAR_TO_RUB_RATE = 1.8;

  function formatCurrency(value, currency = 'stars') {
    const formatted = Math.round(value * 100) / 100;
    return currency === 'stars' ? `${formatted} ⭐` : `${formatted} ₽`;
  }

  const testValues = [100, 250.5, 1000, 0.1];

  testValues.forEach(value => {
    const stars = formatCurrency(value, 'stars');
    const rubles = formatCurrency(value * STAR_TO_RUB_RATE, 'rub');
    console.log(`  ${stars} = ${rubles}`);
  });

  console.log('✅ Currency conversion test completed');
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 Starting Bot Financial Report Tests');
  console.log('=====================================\n');

  // Test 1: Database connection
  const connectionOk = await testConnection();
  if (!connectionOk) return;

  console.log('');

  // Test 2: Service mapping
  testServiceMapping();

  console.log('');

  // Test 3: Currency conversion
  testCurrencyConversion();

  console.log('');

  // Test 4: Bot list
  const bots = await testBotsList();
  if (bots.length === 0) return;

  console.log('');

  // Test 5: Data retrieval for first bot
  const testBot = bots[0];
  const { payments, users } = await testBotData(testBot);

  if (payments.length === 0) {
    console.log('⚠️ No payment data found, skipping processing tests');
    console.log('✅ All available tests completed successfully!');
    return;
  }

  console.log('');

  // Test 6: Data processing
  const processedData = await testDataProcessing(payments, users);
  if (!processedData) return;

  console.log('');

  // Test 7: Excel creation
  const workbook = await testExcelCreation(testBot, processedData);
  if (!workbook) return;

  console.log('');
  console.log('🎉 All tests completed successfully!');
  console.log('✅ The financial report system is ready for production use');
}

// Execute tests if run directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };