const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function getUserStats() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in environment variables');
    console.log('Need: SUPABASE_URL and SUPABASE_SERVICE_KEY');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔍 Fetching user spending data from Supabase...\n');

  try {
    // Get all payment records with user info
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

        // Convert to RUB
        if (record.currency === 'XTR') amountInRub = amount * 1.8;
        if (record.currency === 'STARS') amountInRub = amount * 1.8;

        userStats[userId].total_spent_rub += amountInRub;
        userStats[userId].total_operations += 1;
        userStats[userId].bots.add(record.bot_name);
        userStats[userId].currency_breakdown[record.currency] += amount;
      }
    });

    // Convert to array and sort by total spending
    const topUsers = Object.values(userStats)
      .filter(user => user.total_spent_rub > 0)
      .sort((a, b) => b.total_spent_rub - a.total_spent_rub)
      .slice(0, 50); // Top 50 users

    console.log('🎯 TOP 20 USERS BY SPENDING:\n');

    topUsers.slice(0, 20).forEach((user, index) => {
      console.log(`${index + 1}. User ID: ${user.telegram_id}`);
      console.log(`   💰 Total Spent: ${Math.round(user.total_spent_rub).toLocaleString()}₽`);
      console.log(`   📊 Operations: ${user.total_operations}`);
      console.log(`   🤖 Bots Used: ${user.bots.size}`);
      console.log(`   💎 RUB: ${Math.round(user.currency_breakdown.RUB).toLocaleString()}`);
      console.log(`   💎 XTR: ${Math.round(user.currency_breakdown.XTR).toLocaleString()}`);
      console.log(`   💎 STARS: ${Math.round(user.currency_breakdown.STARS).toLocaleString()}`);
      console.log('');
    });

    // Save to JSON for Excel generation
    const userDataForExcel = topUsers.map((user, index) => ({
      rank: index + 1,
      telegram_id: user.telegram_id,
      username: `@user${user.telegram_id}`, // Placeholder - will be updated later
      total_spent_rub: Math.round(user.total_spent_rub),
      operations: user.total_operations,
      bots_count: user.bots.size,
      bots_list: Array.from(user.bots).join(', '),
      spent_rub: Math.round(user.currency_breakdown.RUB),
      spent_xtr: Math.round(user.currency_breakdown.XTR),
      spent_stars: Math.round(user.currency_breakdown.STARS)
    }));

    fs.writeFileSync('user_spending_data.json', JSON.stringify(userDataForExcel, null, 2));
    console.log(`✅ Saved top ${topUsers.length} users to user_spending_data.json`);

    return userDataForExcel;

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

getUserStats();
