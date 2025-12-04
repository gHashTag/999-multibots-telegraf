/**
 * 📊 ДЕТАЛЬНЫЙ АНАЛИЗ РАСХОДОВ (MONEY_OUTCOME)
 *
 * Цель: Понять структуру расходов, проверить их реальность и категоризировать
 *
 * Анализ:
 * 1. Все расходы по ботам
 * 2. Функции ботов в расходах
 * 3. Категории расходов
 * 4. Аномальные расходы
 * 5. Фиктивные vs Реальные расходы
 */

import fs from 'fs';

interface OutcomeRecord {
  telegram_id: number;
  bot_name: string;
  description: string;
  amount: number;
  currency: string;
  type: string;
  created_at: string;
}

interface BotOutcomeAnalysis {
  botName: string;
  totalOutcomes: number;
  totalAmount: number;
  avgAmount: number;
  currencyBreakdown: { [key: string]: number };
  categories: { [key: string]: number };
  anomalies: {
    positiveAmounts: number;
    zeroAmounts: number;
    negativeAmounts: number;
    suspiciousDescriptions: number;
  };
  realOutcomes: OutcomeRecord[];
  fakeOutcomes: OutcomeRecord[];
}

describe('📊 АНАЛИЗ РАСХОДОВ ПО БОТАМ', () => {
  test('Should analyze all MONEY_OUTCOME records in detail', async () => {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ РАСХОДОВ (MONEY_OUTCOME)');
    console.log('='.repeat(80) + '\n');

    const startTime = Date.now();

    // 1. ЗАГРУЗКА ДАННЫХ
    console.log('📥 Этап 1: Загрузка данных...');
    const rawData = JSON.parse(fs.readFileSync('payments_data.json', 'utf-8'));
    console.log(`   ✅ Загружено: ${rawData.length} записей\n`);

    // 2. ФИЛЬТРАЦИЯ РАСХОДОВ
    console.log('💸 Этап 2: Извлечение всех расходов...');
    const allOutcomes = rawData.filter((row: any) => row.type === 'MONEY_OUTCOME');
    console.log(`   📊 Всего расходов: ${allOutcomes.length}`);
    console.log(`   📈 Доля от общего: ${((allOutcomes.length / rawData.length) * 100).toFixed(1)}%\n`);

    // 3. АНАЛИЗ ПО БОТАМ
    console.log('🤖 Этап 3: Анализ расходов по ботам...\n');

    const botAnalysis = new Map<string, BotOutcomeAnalysis>();

    allOutcomes.forEach((outcome: any) => {
      const botName = outcome.bot_name;
      if (!botAnalysis.has(botName)) {
        botAnalysis.set(botName, {
          botName,
          totalOutcomes: 0,
          totalAmount: 0,
          avgAmount: 0,
          currencyBreakdown: {},
          categories: {},
          anomalies: {
            positiveAmounts: 0,
            zeroAmounts: 0,
            negativeAmounts: 0,
            suspiciousDescriptions: 0
          },
          realOutcomes: [],
          fakeOutcomes: []
        });
      }

      const analysis = botAnalysis.get(botName)!;
      analysis.totalOutcomes++;

      const amount = parseFloat(outcome.amount) || 0;
      analysis.totalAmount += Math.abs(amount);

      // Валютная разбивка
      analysis.currencyBreakdown[outcome.currency] = (analysis.currencyBreakdown[outcome.currency] || 0) + 1;

      // Анализ аномалий
      if (amount > 0) {
        analysis.anomalies.positiveAmounts++;
        analysis.fakeOutcomes.push(outcome);
      } else if (amount === 0) {
        analysis.anomalies.zeroAmounts++;
        analysis.fakeOutcomes.push(outcome);
      } else {
        analysis.anomalies.negativeAmounts++;
        analysis.realOutcomes.push(outcome);
      }

      // Анализ категорий по описанию
      const desc = outcome.description || '';
      let category = 'OTHER';

      // Определяем категорию по ключевым словам
      if (desc.toLowerCase().includes('generation') || desc.toLowerCase().includes('генераци')) {
        category = 'AI_GENERATION';
      } else if (desc.toLowerCase().includes('training') || desc.toLowerCase().includes('обучен')) {
        category = 'MODEL_TRAINING';
      } else if (desc.toLowerCase().includes('lip') || desc.toLowerCase().includes('синхрон')) {
        category = 'LIP_SYNC';
      } else if (desc.toLowerCase().includes('video') || desc.toLowerCase().includes('видео')) {
        category = 'VIDEO_PROCESSING';
      } else if (desc.toLowerCase().includes('image') || desc.toLowerCase().includes('изображен')) {
        category = 'IMAGE_PROCESSING';
      } else if (desc.toLowerCase().includes('subscription') || desc.toLowerCase().includes('подпис')) {
        category = 'SUBSCRIPTION';
      } else if (desc.toLowerCase().includes('refund') || desc.toLowerCase().includes('возврат')) {
        category = 'REFUND';
      } else if (desc.toLowerCase().includes('system') || desc.toLowerCase().includes('системн')) {
        category = 'SYSTEM';
      } else if (desc.toLowerCase().includes('test') || desc.toLowerCase().includes('тест')) {
        category = 'TEST_DATA';
      }

      analysis.categories[category] = (analysis.categories[category] || 0) + 1;

      // Подозрительные описания
      if (desc.includes('⭐️') || desc.includes('Payment for') || desc.includes('payment')) {
        analysis.anomalies.suspiciousDescriptions++;
      }
    });

    // Расчет средних значений
    botAnalysis.forEach(analysis => {
      analysis.avgAmount = analysis.totalOutcomes > 0 ? analysis.totalAmount / analysis.totalOutcomes : 0;
    });

    // 4. ВЫВОД ПО КАЖДОМУ БОТУ
    console.log('📊 РАСХОДЫ ПО КАЖДОМУ БОТУ:\n');
    console.log('═'.repeat(80));

    const sortedBots = Array.from(botAnalysis.values())
      .sort((a, b) => b.totalAmount - a.totalAmount);

    sortedBots.forEach(bot => {
      console.log(`\n🤖 Бот: ${bot.botName}`);
      console.log('─'.repeat(80));
      console.log(`   💸 Всего расходов: ${bot.totalOutcomes}`);
      console.log(`   💰 Общая сумма: ${Math.round(bot.totalAmount).toLocaleString()}`);
      console.log(`   📊 Средний расход: ${Math.round(bot.avgAmount).toLocaleString()}`);

      console.log(`\n   💱 Валюты:`);
      Object.entries(bot.currencyBreakdown).forEach(([curr, count]) => {
        console.log(`      ${curr}: ${count} (${((count / bot.totalOutcomes) * 100).toFixed(1)}%)`);
      });

      console.log(`\n   📂 Категории:`);
      Object.entries(bot.categories)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
          console.log(`      ${cat}: ${count} (${((count / bot.totalOutcomes) * 100).toFixed(1)}%)`);
        });

      console.log(`\n   ⚠️  Аномалии:`);
      console.log(`      Положительные суммы: ${bot.anomalies.positiveAmounts}`);
      console.log(`      Нулевые суммы: ${bot.anomalies.zeroAmounts}`);
      console.log(`      Отрицательные суммы: ${bot.anomalies.negativeAmounts}`);
      console.log(`      Подозрительные описания: ${bot.anomalies.suspiciousDescriptions}`);

      console.log(`\n   ✅ Реальные расходы: ${bot.realOutcomes.length}`);
      console.log(`   ❌ Фейковые расходы: ${bot.fakeOutcomes.length}`);
      console.log(`   📈 Доля фейка: ${((bot.fakeOutcomes.length / bot.totalOutcomes) * 100).toFixed(1)}%`);

      // Показываем примеры
      if (bot.fakeOutcomes.length > 0) {
        console.log(`\n   🔍 Примеры фейковых расходов:`);
        bot.fakeOutcomes.slice(0, 3).forEach((outcome, i) => {
          console.log(`      ${i + 1}. [${outcome.currency}] ${outcome.amount} - ${outcome.description.substring(0, 60)}...`);
        });
      }
    });

    console.log('\n' + '='.repeat(80));

    // 5. ОБЩАЯ СТАТИСТИКА
    console.log('\n📊 ОБЩАЯ СТАТИСТИКА ПО РАСХОДАМ:\n');

    const totalOutcomes = allOutcomes.length;
    const totalAmount = allOutcomes.reduce((sum, o) => sum + Math.abs(parseFloat(o.amount) || 0), 0);

    const fakeCount = allOutcomes.filter(o => parseFloat(o.amount) >= 0).length;
    const realCount = allOutcomes.filter(o => parseFloat(o.amount) < 0).length;

    const allCategories = new Map<string, number>();
    allOutcomes.forEach(outcome => {
      const desc = outcome.description || '';
      let category = 'OTHER';

      if (desc.toLowerCase().includes('generation') || desc.toLowerCase().includes('генераци')) {
        category = 'AI_GENERATION';
      } else if (desc.toLowerCase().includes('training') || desc.toLowerCase().includes('обучен')) {
        category = 'MODEL_TRAINING';
      } else if (desc.toLowerCase().includes('lip') || desc.toLowerCase().includes('синхрон')) {
        category = 'LIP_SYNC';
      } else if (desc.toLowerCase().includes('video') || desc.toLowerCase().includes('видео')) {
        category = 'VIDEO_PROCESSING';
      } else if (desc.toLowerCase().includes('image') || desc.toLowerCase().includes('изображен')) {
        category = 'IMAGE_PROCESSING';
      } else if (desc.toLowerCase().includes('subscription') || desc.toLowerCase().includes('подпис')) {
        category = 'SUBSCRIPTION';
      } else if (desc.toLowerCase().includes('refund') || desc.toLowerCase().includes('возврат')) {
        category = 'REFUND';
      } else if (desc.toLowerCase().includes('system') || desc.toLowerCase().includes('системн')) {
        category = 'SYSTEM';
      } else if (desc.toLowerCase().includes('test') || desc.toLowerCase().includes('тест')) {
        category = 'TEST_DATA';
      }

      allCategories.set(category, (allCategories.get(category) || 0) + 1);
    });

    console.log(`   💸 Всего расходов: ${totalOutcomes.toLocaleString()}`);
    console.log(`   💰 Общая сумма: ${Math.round(totalAmount).toLocaleString()}`);
    console.log(`   ✅ Реальные расходы (отриц. суммы): ${realCount.toLocaleString()}`);
    console.log(`   ❌ Фейковые расходы (положит./нулевые): ${fakeCount.toLocaleString()}`);
    console.log(`   📊 Доля фейка: ${((fakeCount / totalOutcomes) * 100).toFixed(1)}%\n`);

    console.log('   📂 Категории расходов (все боты):');
    Object.entries(Object.fromEntries(allCategories))
      .sort((a: any, b: any) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`      ${cat}: ${count} (${((count / totalOutcomes) * 100).toFixed(1)}%)`);
      });

    // 6. ВЫЯВЛЕНИЕ ПРОБЛЕМНЫХ БОТОВ
    console.log('\n🚨 ПРОБЛЕМНЫЕ БОТЫ (больше 50% фейковых расходов):\n');

    const problematicBots = sortedBots.filter(bot => (bot.fakeOutcomes.length / bot.totalOutcomes) > 0.5);

    if (problematicBots.length > 0) {
      problematicBots.forEach(bot => {
        console.log(`   ❌ ${bot.botName}: ${((bot.fakeOutcomes.length / bot.totalOutcomes) * 100).toFixed(1)}% фейка`);
        console.log(`      ${bot.fakeOutcomes.length} из ${bot.totalOutcomes} расходов - подозрительные`);
      });
    } else {
      console.log('   ✅ Все боты имеют менее 50% фейковых расходов\n');
    }

    // 7. ПРИМЕРЫ РЕАЛЬНЫХ РАСХОДОВ
    console.log('\n✅ ПРИМЕРЫ РЕАЛЬНЫХ РАСХОДОВ (отрицательные суммы):\n');

    const realOutcomes = allOutcomes.filter(o => parseFloat(o.amount) < 0);
    if (realOutcomes.length > 0) {
      realOutcomes.slice(0, 10).forEach((outcome, i) => {
        console.log(`   ${i + 1}. [${outcome.bot_name}] ${outcome.amount} ${outcome.currency}`);
        console.log(`      ${outcome.description}`);
        console.log('');
      });
    } else {
      console.log('   ⚠️  РЕАЛЬНЫХ РАСХОДОВ НЕ НАЙДЕНО!\n');
    }

    // 8. ПРИМЕРЫ ФЕЙКОВЫХ РАСХОДОВ
    console.log('❌ ПРИМЕРЫ ФЕЙКОВЫХ РАСХОДОВ (положительные суммы с типом MONEY_OUTCOME):\n');

    const fakeOutcomes = allOutcomes.filter(o => parseFloat(o.amount) >= 0);
    if (fakeOutcomes.length > 0) {
      fakeOutcomes.slice(0, 10).forEach((outcome, i) => {
        console.log(`   ${i + 1}. [${outcome.bot_name}] ${outcome.amount} ${outcome.currency}`);
        console.log(`      ${outcome.description}`);
        console.log('');
      });
    }

    // 9. СОХРАНЕНИЕ ОТЧЕТА
    const report = {
      totalOutcomes,
      realOutcomes: realCount,
      fakeOutcomes: fakeCount,
      fakePercentage: ((fakeCount / totalOutcomes) * 100).toFixed(2),
      bots: Object.fromEntries(botAnalysis),
      categories: Object.fromEntries(allCategories),
      problematicBots: problematicBots.map(b => b.botName)
    };

    fs.writeFileSync('OUTCOME_ANALYSIS_REPORT.json', JSON.stringify(report, null, 2));

    console.log('='.repeat(80));
    console.log('✅ АНАЛИЗ РАСХОДОВ ЗАВЕРШЕН');
    console.log('='.repeat(80));
    console.log(`\n📄 Отчет сохранен: OUTCOME_ANALYSIS_REPORT.json`);
    console.log(`\n🔍 КЛЮЧЕВЫЕ ВЫВОДЫ:`);
    console.log(`   💸 Всего расходов: ${totalOutcomes.toLocaleString()}`);
    console.log(`   ✅ Реальных: ${realCount.toLocaleString()} (${((realCount / totalOutcomes) * 100).toFixed(1)}%)`);
    console.log(`   ❌ Фейковых: ${fakeCount.toLocaleString()} (${((fakeCount / totalOutcomes) * 100).toFixed(1)}%)`);
    console.log(`   🚨 Проблемных ботов: ${problematicBots.length}`);
    console.log(`\n⏱️  Время выполнения: ${((Date.now() - startTime) / 1000).toFixed(2)} сек`);
    console.log('='.repeat(80) + '\n');

    expect(totalOutcomes).toBeGreaterThan(0);

    return report;

  }, 300000);
});
