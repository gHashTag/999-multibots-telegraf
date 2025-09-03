const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testStats() {
  const userId = '144022504';
  
  console.log('🔍 Testing with userId:', userId);
  console.log('=================================');
  
  // Test 1: Check instagram_apify_reels
  console.log('\n📊 Checking instagram_apify_reels table:');
  const { data: apifyData, error: apifyError } = await supabase
    .from('instagram_apify_reels')
    .select('telegram_id, created_at')
    .limit(10);
  
  if (apifyError) {
    console.log('❌ Error:', apifyError);
  } else {
    console.log('✅ Sample records:');
    apifyData.forEach(r => console.log(`  - telegram_id: "${r.telegram_id}", created_at: ${r.created_at}`));
  }
  
  // Test 2: Search for specific user
  console.log('\n🔍 Searching for user', userId, 'in instagram_apify_reels:');
  const { data: userApify, error: userApifyError } = await supabase
    .from('instagram_apify_reels')
    .select('*')
    .or(`telegram_id.eq.${userId},telegram_id.eq.'${userId}'`)
    .limit(5);
    
  if (userApifyError) {
    console.log('❌ Error:', userApifyError);
  } else {
    console.log(`✅ Found ${userApify?.length || 0} records`);
    if (userApify?.length > 0) {
      console.log('First record:', userApify[0]);
    }
  }
  
  // Test 3: Check instagram_scrapings
  console.log('\n📊 Checking instagram_scrapings table:');
  const { data: scrapingsData, error: scrapingsError } = await supabase
    .from('instagram_scrapings')
    .select('telegram_id, created_at, target, reels_count')
    .limit(10);
  
  if (scrapingsError) {
    console.log('❌ Error:', scrapingsError);
  } else {
    console.log('✅ Sample records:');
    scrapingsData.forEach(r => console.log(`  - telegram_id: "${r.telegram_id}", target: ${r.target}, reels: ${r.reels_count}`));
  }
  
  // Test 4: Search for specific user in scrapings
  console.log('\n🔍 Searching for user', userId, 'in instagram_scrapings:');
  const { data: userScrapings, error: userScrapingsError } = await supabase
    .from('instagram_scrapings')
    .select('*')
    .eq('telegram_id', userId)
    .limit(5);
    
  if (userScrapingsError) {
    console.log('❌ Error:', userScrapingsError);
  } else {
    console.log(`✅ Found ${userScrapings?.length || 0} records`);
    if (userScrapings?.length > 0) {
      console.log('Records:', userScrapings);
    }
  }
  
  // Test 5: Check all possible formats
  console.log('\n🔍 Checking all telegram_id formats in instagram_apify_reels:');
  const formats = [userId, `'${userId}'`, `"${userId}"`, parseInt(userId)];
  
  for (const format of formats) {
    const { data, error } = await supabase
      .from('instagram_apify_reels')
      .select('telegram_id')
      .eq('telegram_id', format)
      .limit(1);
    
    console.log(`  Format "${format}" (type: ${typeof format}):`, data?.length > 0 ? '✅ FOUND' : '❌ NOT FOUND');
  }
}

testStats().catch(console.error);