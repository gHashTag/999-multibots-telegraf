import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env
config({ path: path.join(process.cwd(), '.env') });

async function getUserStats() {
  console.log('🔐 Loading secrets from Infisical...\n');

  try {
    // Инициализация Infisical
    const { initInfisical, getSecret } = await import('../src/core/infisical');
    await initInfisical();

    const supabaseUrl = getSecret('SUPABASE_URL');
    const supabaseKey = getSecret('SUPABASE_SERVICE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase credentials in Infisical');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('✅ Connected to Supabase\n');

    // Get all payment records with user info (remove limit to get all data)
    console.log('🔍 Fetching ALL user payment data (INCOME + OUTCOME)...\n');
    const { data: records, error } = await supabase
      .from('payments_v2')
      .select('telegram_id, amount, currency, type, bot_name, created_at, payment_method')
      .order('telegram_id')
      .limit(50000); // Get all records (max 50K)

    if (error) {
      console.log('❌ Query error:', error.message);
      return;
    }

    console.log(`✅ Found ${records.length} payment records\n`);

    // Process user data - separately track INCOME and OUTCOME
    const userStats: Record<string, any> = {};

    records.forEach(record => {
      const userId = record.telegram_id;

      if (!userId) return; // Skip records without user ID

      if (!userStats[userId]) {
        userStats[userId] = {
          telegram_id: userId,
          total_income_rub: 0,
          total_spent_rub: 0,
          income_operations: 0,
          spending_operations: 0,
          income_bots: new Set(),
          spending_bots: new Set(),
          income_currency: { RUB: 0, XTR: 0, STARS: 0 },
          spending_currency: { RUB: 0, XTR: 0, STARS: 0 }
        };
      }

      const amount = parseFloat(record.amount) || 0;
      let amountInRub = amount;

      // Convert to RUB (XTR=1.8, STARS=1.8, RUB=1.0)
      if (record.currency === 'XTR') amountInRub = amount * 1.8;
      if (record.currency === 'STARS') amountInRub = amount * 1.8;

      // Track INCOME (MONEY_INCOME)
      if (record.type === 'MONEY_INCOME') {
        userStats[userId].total_income_rub += amountInRub;
        userStats[userId].income_operations += 1;
        userStats[userId].income_bots.add(record.bot_name);
        userStats[userId].income_currency[record.currency] += amount;
      }

      // Track OUTCOME (MONEY_OUTCOME)
      if (record.type === 'MONEY_OUTCOME') {
        userStats[userId].total_spent_rub += amountInRub;
        userStats[userId].spending_operations += 1;
        userStats[userId].spending_bots.add(record.bot_name);
        userStats[userId].spending_currency[record.currency] += amount;
      }
    });

    // Get user profiles for usernames
    console.log('🔍 Fetching user profiles for usernames...\n');
    const userIds = Object.keys(userStats);

    let profiles: any[] = [];
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
    const profileMap: Record<string, any> = {};
    profiles.forEach(profile => {
      profileMap[profile.telegram_id] = profile;
    });

    // Create TOP 200 users by INCOME (who brought the most money)
    const topIncomeUsers = Object.values(userStats)
      .filter((user: any) => user.total_income_rub > 0)
      .sort((a: any, b: any) => b.total_income_rub - a.total_income_rub)
      .slice(0, 200);

    console.log('🎯 TOP 30 USERS BY INCOME (Who Brought Most Money):\n');
    console.log('='.repeat(80));

    topIncomeUsers.slice(0, 30).forEach((user: any, index: number) => {
      const profile = profileMap[user.telegram_id];
      const username = profile?.username ? `@${profile.username}` : 'N/A';
      const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'N/A';

      console.log(`\n${index + 1}. 💰 ${name} (${username})`);
      console.log(`   🆔 ID: ${user.telegram_id}`);
      console.log(`   💎 Total INCOME: ${Math.round(user.total_income_rub).toLocaleString()}₽`);
      console.log(`   📊 Income Operations: ${user.income_operations}`);
      console.log(`   🤖 Income Bots: ${user.income_bots.size} (${Array.from(user.income_bots).slice(0, 3).join(', ')}${user.income_bots.size > 3 ? '...' : ''})`);
      console.log(`   💸 Total SPENT: ${Math.round(user.total_spent_rub).toLocaleString()}₽`);
      console.log(`   📊 Spending Operations: ${user.spending_operations}`);
    });

    console.log('\n' + '='.repeat(80));

    // Create TOP 200 users by SPENDING (who spent the most)
    const topSpendingUsers = Object.values(userStats)
      .filter((user: any) => user.total_spent_rub > 0)
      .sort((a: any, b: any) => b.total_spent_rub - a.total_spent_rub)
      .slice(0, 200);

    console.log('\n\n🎯 TOP 30 USERS BY SPENDING:\n');
    console.log('='.repeat(80));

    topSpendingUsers.slice(0, 30).forEach((user: any, index: number) => {
      const profile = profileMap[user.telegram_id];
      const username = profile?.username ? `@${profile.username}` : 'N/A';
      const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'N/A';

      console.log(`\n${index + 1}. 👤 ${name} (${username})`);
      console.log(`   🆔 ID: ${user.telegram_id}`);
      console.log(`   💸 Total SPENT: ${Math.round(user.total_spent_rub).toLocaleString()}₽`);
      console.log(`   📊 Spending Operations: ${user.spending_operations}`);
      console.log(`   🤖 Spending Bots: ${user.spending_bots.size} (${Array.from(user.spending_bots).slice(0, 3).join(', ')}${user.spending_bots.size > 3 ? '...' : ''})`);
      console.log(`   💎 Breakdown - RUB: ${Math.round(user.spending_currency.RUB)} | XTR: ${Math.round(user.spending_currency.XTR)} | STARS: ${Math.round(user.spending_currency.STARS)}`);
      console.log(`   💰 Total INCOME: ${Math.round(user.total_income_rub).toLocaleString()}₽`);
    });

    console.log('\n' + '='.repeat(80));

    // Save TOP INCOME users to JSON for Excel
    const incomeDataForExcel = topIncomeUsers.map((user: any, index: number) => {
      const profile = profileMap[user.telegram_id];
      return {
        rank: index + 1,
        telegram_id: user.telegram_id,
        username: profile?.username || '',
        name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '',
        total_income_rub: Math.round(user.total_income_rub),
        income_operations: user.income_operations,
        income_bots_count: user.income_bots.size,
        income_bots_list: Array.from(user.income_bots).join(', '),
        total_spent_rub: Math.round(user.total_spent_rub),
        spending_operations: user.spending_operations,
        income_rub: Math.round(user.income_currency.RUB),
        income_xtr: Math.round(user.income_currency.XTR),
        income_stars: Math.round(user.income_currency.STARS),
        spending_rub: Math.round(user.spending_currency.RUB),
        spending_xtr: Math.round(user.spending_currency.XTR),
        spending_stars: Math.round(user.spending_currency.STARS)
      };
    });

    // Save TOP SPENDING users to JSON for Excel
    const spendingDataForExcel = topSpendingUsers.map((user: any, index: number) => {
      const profile = profileMap[user.telegram_id];
      return {
        rank: index + 1,
        telegram_id: user.telegram_id,
        username: profile?.username || '',
        name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '',
        total_spent_rub: Math.round(user.total_spent_rub),
        spending_operations: user.spending_operations,
        spending_bots_count: user.spending_bots.size,
        spending_bots_list: Array.from(user.spending_bots).join(', '),
        total_income_rub: Math.round(user.total_income_rub),
        income_operations: user.income_operations,
        spending_rub: Math.round(user.spending_currency.RUB),
        spending_xtr: Math.round(user.spending_currency.XTR),
        spending_stars: Math.round(user.spending_currency.STARS),
        income_rub: Math.round(user.income_currency.RUB),
        income_xtr: Math.round(user.income_currency.XTR),
        income_stars: Math.round(user.income_currency.STARS)
      };
    });

    fs.writeFileSync('user_income_data.json', JSON.stringify(incomeDataForExcel, null, 2));
    fs.writeFileSync('user_spending_data.json', JSON.stringify(spendingDataForExcel, null, 2));

    console.log(`\n✅ Saved top ${topIncomeUsers.length} users by INCOME to user_income_data.json`);
    console.log(`✅ Saved top ${topSpendingUsers.length} users by SPENDING to user_spending_data.json`);

    return {
      topIncomeUsers: incomeDataForExcel,
      topSpendingUsers: spendingDataForExcel
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

getUserStats();
