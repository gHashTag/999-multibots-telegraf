const { supabase } = require('../dist/core/supabase/index.js');

async function analyzePayments() {
  try {
    console.log('🔍 ANALYZING PAYMENTS_V2 TABLE STRUCTURE AND PATTERNS...\n');

    // Get sample transaction to understand structure
    const { data: sample } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('status', 'COMPLETED')
      .limit(1);

    if (sample && sample.length > 0) {
      console.log('📋 PAYMENTS_V2 SCHEMA:');
      Object.keys(sample[0]).forEach(key => {
        const value = sample[0][key];
        const type = typeof value;
        const example = value !== null ? (type === 'string' ? `"${value}"` : value) : 'null';
        console.log(`  ${key}: ${type} (example: ${example})`);
      });
      console.log('');
    }

    // Get transaction type distribution
    const { data: typeData } = await supabase
      .from('payments_v2')
      .select('type')
      .eq('status', 'COMPLETED');

    const typeDistribution = {};
    typeData?.forEach(item => {
      typeDistribution[item.type] = (typeDistribution[item.type] || 0) + 1;
    });

    console.log('📊 TRANSACTION TYPE DISTRIBUTION:');
    Object.entries(typeDistribution).forEach(([type, count]) => {
      console.log(`  ${type}: ${count.toLocaleString()} transactions`);
    });
    console.log('');

    // Revenue categorization rules
    const { data: incomes } = await supabase
      .from('payments_v2')
      .select('payment_method, currency, category, stars, amount')
      .eq('type', 'MONEY_INCOME')
      .eq('status', 'COMPLETED')
      .limit(100);

    const revenueCategories = {
      robokassa: 0,
      telegram_stars: 0,
      manual: 0,
      bonus: 0,
      admin: 0,
      other: 0
    };

    incomes?.forEach(income => {
      if (income.currency === 'RUB' && income.payment_method === 'Robokassa') {
        revenueCategories.robokassa += income.stars || 0;
      } else if ((income.currency === 'XTR' || income.currency === 'STARS') && income.payment_method === 'Telegram') {
        revenueCategories.telegram_stars += income.stars || 0;
      } else if (income.payment_method === 'Manual') {
        revenueCategories.manual += income.stars || 0;
      } else if (income.category === 'BONUS' || income.payment_method === 'Bonus') {
        revenueCategories.bonus += income.stars || 0;
      } else if (income.payment_method?.includes('admin') || income.payment_method?.includes('Admin')) {
        revenueCategories.admin += income.stars || 0;
      } else {
        revenueCategories.other += income.stars || 0;
      }
    });

    console.log('💰 REVENUE CATEGORIZATION (sample of 100):');
    Object.entries(revenueCategories).forEach(([category, amount]) => {
      if (amount > 0) {
        console.log(`  ${category}: ${amount.toLocaleString()}⭐`);
      }
    });
    console.log('');

    // Bot transaction patterns
    const { data: botData } = await supabase
      .from('payments_v2')
      .select('bot_name, type, stars')
      .eq('status', 'COMPLETED')
      .not('bot_name', 'is', null)
      .limit(500);

    const botStats = {};
    botData?.forEach(transaction => {
      if (!botStats[transaction.bot_name]) {
        botStats[transaction.bot_name] = {
          income_count: 0,
          outcome_count: 0,
          income_stars: 0,
          outcome_stars: 0
        };
      }

      if (transaction.type === 'MONEY_INCOME') {
        botStats[transaction.bot_name].income_count++;
        botStats[transaction.bot_name].income_stars += transaction.stars || 0;
      } else if (transaction.type === 'MONEY_OUTCOME') {
        botStats[transaction.bot_name].outcome_count++;
        botStats[transaction.bot_name].outcome_stars += transaction.stars || 0;
      }
    });

    console.log('🤖 TOP BOTS BY ACTIVITY (sample of 500):');
    Object.entries(botStats)
      .sort(([,a], [,b]) => (b.income_count + b.outcome_count) - (a.income_count + a.outcome_count))
      .slice(0, 8)
      .forEach(([bot, stats]) => {
        const totalTx = stats.income_count + stats.outcome_count;
        const netStars = stats.income_stars - stats.outcome_stars;
        console.log(`  ${bot}: ${totalTx} transactions, ${netStars.toLocaleString()}⭐ net`);
      });
    console.log('');

    // Service types analysis
    const { data: serviceData } = await supabase
      .from('payments_v2')
      .select('service_type, stars, cost')
      .eq('type', 'MONEY_OUTCOME')
      .eq('status', 'COMPLETED')
      .not('service_type', 'is', null)
      .limit(300);

    const serviceStats = {};
    serviceData?.forEach(transaction => {
      const service = transaction.service_type;
      if (!serviceStats[service]) {
        serviceStats[service] = {
          count: 0,
          revenue: 0,
          cost: 0
        };
      }
      serviceStats[service].count++;
      serviceStats[service].revenue += transaction.stars || 0;
      serviceStats[service].cost += transaction.cost || 0;
    });

    console.log('🛠️ TOP SERVICES BY USAGE (sample of 300):');
    Object.entries(serviceStats)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 6)
      .forEach(([service, stats]) => {
        const profit = stats.revenue - stats.cost;
        const margin = stats.revenue > 0 ? ((profit / stats.revenue) * 100).toFixed(1) : '0.0';
        console.log(`  ${service}: ${stats.count} uses, ${stats.revenue.toLocaleString()}⭐ revenue, ${margin}% margin`);
      });

  } catch (error) {
    console.error('❌ Error analyzing payments:', error);
  }

  process.exit(0);
}

analyzePayments();