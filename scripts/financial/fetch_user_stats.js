const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');
const path = require('path');

// Load .env
config({ path: path.join(process.cwd(), '.env') });

async function getUserStats() {
  console.log('🔐 Loading secrets from Infisical...\n');

  try {
    // Инициализация Infisical
    const { initInfisical, getSecret } = await import('./src/core/infisical.js');
    await initInfisical();

    const supabaseUrl = getSecret('SUPABASE_URL');
    const supabaseKey = getSecret('SUPABASE_SERVICE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase credentials in Infisical');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('✅ Connected to Supabase\n');

    // Get all payment records with user info
    console.log('🔍 Fetching user spending data...\n');
    const { data: records, error } = await supabase
      .from('payments_v2')
      .select('user_telegram_id, amount, currency, type, bot_name, created_at')
      .order('user_telegram_id');

    if (error) {
      console.log('❌ Query error:', error.message);
      return;
    }

    console.log(`✅ Found ${records.length} payment records\n`);

    // Process user spending
    const userStats = {};

    records.forEach(record => {
      const userId = record.user_telegram_id;

      if (!userId) return; // Skip records without user ID

      if (!userStats[userId]) {
        userStats[userId] = {
          telegram_id: userId,
          total_spent_rub: 0,
          total_operations: 0,
          bots: new Set(),
          currency_breakdown: { RUB: 0, XTR: 0, STARS: 0 }
        };
      }

      // Only count spending (MONEY_OUTCOME)
      if (record.type === 'MONEY_OUTCOME') {
        const amount = parseFloat(record.amount) || 0;
        let amountInRub = amount;

        // Convert to RUB (XTR=1.8, STARS=1.8, RUB=1.0)
        if (record.currency === 'XTR') amountInRub = amount * 1.8;
        if (record.currency === 'STARS') amountInRub = amount * 1.8;

        userStats[userId].total_spent_rub += amountInRub;
        userStats[userId].total_operations += 1;
        userStats[userId].bots.add(record.bot_name);
        userStats[userId].currency_breakdown[record.currency] += amount;
      }
    });

    // Get user profiles for usernames
    console.log('🔍 Fetching user profiles for usernames...\n');
    const userIds = Object.keys(userStats);

    let profiles = [];
    try {
      const { data, error: profileError } = await supabase
        .from('user_profiles')
        .select('telegram_id, username, first_name, last_name')
        .in('telegram_id', userIds);

      if (profileError) {
        console.log('⚠️ Could not fetch usernames:', profileError.message);
      } else {
        profiles = data || [];
        console.log(`✅ Found ${profiles.length} user profiles\n`);
      }
    } catch (e) {
      console.log('⚠️ user_profiles table not found or not accessible');
    }

    // Merge profile data
    const profileMap = {};
    profiles.forEach(profile => {
      profileMap[profile.telegram_id] = profile;
    });

    // Convert to array and sort by total spending
    const topUsers = Object.values(userStats)
      .filter(user => user.total_spent_rub > 0)
      .sort((a, b) => b.total_spent_rub - a.total_spent_rub)
      .slice(0, 100); // Top 100 users

    console.log('🎯 TOP 30 USERS BY SPENDING:\n');
    console.log('='.repeat(80));

    topUsers.slice(0, 30).forEach((user, index) => {
      const profile = profileMap[user.telegram_id];
      const username = profile?.username ? `@${profile.username}` : 'N/A';
      const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'N/A';

      console.log(`\n${index + 1}. 👤 ${name} (${username})`);
      console.log(`   🆔 ID: ${user.telegram_id}`);
      console.log(`   💰 Total Spent: ${Math.round(user.total_spent_rub).toLocaleString()}₽`);
      console.log(`   📊 Operations: ${user.total_operations}`);
      console.log(`   🤖 Bots: ${user.bots.size} (${Array.from(user.bots).slice(0, 3).join(', ')}${user.bots.size > 3 ? '...' : ''})`);
      console.log(`   💎 Breakdown - RUB: ${Math.round(user.currency_breakdown.RUB)} | XTR: ${Math.round(user.currency_breakdown.XTR)} | STARS: ${Math.round(user.currency_breakdown.STARS)}`);
    });

    console.log('\n' + '='.repeat(80));

    // Save to JSON for Excel generation
    const userDataForExcel = topUsers.map((user, index) => {
      const profile = profileMap[user.telegram_id];
      return {
        rank: index + 1,
        telegram_id: user.telegram_id,
        username: profile?.username || '',
        name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '',
        total_spent_rub: Math.round(user.total_spent_rub),
        operations: user.total_operations,
        bots_count: user.bots.size,
        bots_list: Array.from(user.bots).join(', '),
        spent_rub: Math.round(user.currency_breakdown.RUB),
        spent_xtr: Math.round(user.currency_breakdown.XTR),
        spent_stars: Math.round(user.currency_breakdown.STARS)
      };
    });

    require('fs').writeFileSync('user_spending_data.json', JSON.stringify(userDataForExcel, null, 2));
    console.log(`\n✅ Saved top ${topUsers.length} users to user_spending_data.json`);

    return userDataForExcel;

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

getUserStats();
