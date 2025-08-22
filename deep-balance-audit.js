// 🔍 ГЛУБОКИЙ АНАЛИЗ СИСТЕМЫ БАЛАНСА И ПОИСК АНОМАЛИЙ

console.log('🔬 ГЛУБОКИЙ АУДИТ СИСТЕМЫ БАЛАНСА');
console.log('='.repeat(60));

const fs = require('fs');
const path = require('path');

// Найдем все файлы, которые работают с балансом
function findBalanceRelatedFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      findBalanceRelatedFiles(fullPath, files);
    } else if (item.endsWith('.ts') && !item.endsWith('.test.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('balance') || content.includes('payment') || content.includes('stars') || content.includes('amount')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

console.log('\n📊 АНАЛИЗ ПОЛЕЙ amount, stars, cost:');
console.log('-'.repeat(50));

const fieldAnomalies = [];

// 1. Анализ поля amount vs stars
console.log('\n🔍 1. Анализ consistency между amount и stars:');

const amountStarsIssues = [
  {
    file: 'updateUserBalance.ts',
    issue: 'Сложная логика определения amount из modePrice/paymentAmount/stars',
    lines: '75-172',
    risk: 'ВЫСОКИЙ - может неправильно определить сумму',
    code: `
// ПРОБЛЕМНЫЙ КОД:
if (metadata?.modePrice && typeof metadata.modePrice === 'number') {
  safeAmount = metadata.modePrice
} else if (metadata?.paymentAmount && typeof metadata.paymentAmount === 'number') {
  safeAmount = metadata.paymentAmount
} else if (metadata?.stars && typeof metadata.stars === 'number') {
  safeAmount = metadata.stars
}`
  },
  {
    file: 'setPayments.ts', 
    issue: 'amount и stars могут быть разными значениями',
    lines: '95-111',
    risk: 'СРЕДНИЙ - несоответствие amount и stars',
    code: `
// ПОТЕНЦИАЛЬНАЯ ПРОБЛЕМА:
amount: amount,        // Из OutSum
stars: stars,         // Переданное значение
// Могут не совпадать!`
  },
  {
    file: 'directPayment.ts',
    issue: 'amount и stars всегда одинаковые',
    lines: '154-174', 
    risk: 'НИЗКИЙ - корректная логика',
    code: `
// ПРАВИЛЬНО:
amount: normalizedAmount,
stars: normalizedAmount,`
  }
];

amountStarsIssues.forEach((issue, index) => {
  console.log(`\n${index + 1}. 📁 ${issue.file}`);
  console.log(`   ⚠️  ${issue.issue}`);
  console.log(`   📍 Строки: ${issue.lines}`);
  console.log(`   🎯 Риск: ${issue.risk}`);
  
  if (issue.risk.includes('ВЫСОКИЙ') || issue.risk.includes('СРЕДНИЙ')) {
    fieldAnomalies.push({
      type: 'amount_stars_mismatch',
      file: issue.file,
      issue: issue.issue,
      risk: issue.risk
    });
  }
});

console.log('\n🔍 2. Анализ поля cost:');

const costIssues = [
  {
    file: 'updateUserBalance.ts',
    issue: 'cost рассчитывается только для MONEY_OUTCOME операций',
    lines: '409-441',
    risk: 'СРЕДНИЙ - MONEY_INCOME тоже могут иметь cost',
    analysis: 'cost=0 для доходов может быть неправильно для возвратов'
  },
  {
    file: 'setPayments.ts',
    issue: 'cost может быть undefined при расчете',
    lines: '76-93',
    risk: 'НИЗКИЙ - есть fallback расчет',
    analysis: 'Автоматический расчет через calculateServiceCost'
  },
  {
    file: 'calculateServiceCost.ts',
    issue: 'Может вернуть 0 для неизвестных сервисов',
    risk: 'СРЕДНИЙ - потеря данных о себестоимости',
    analysis: 'Неизвестные сервисы получают cost=0'
  }
];

costIssues.forEach((issue, index) => {
  console.log(`\n${index + 1}. 📁 ${issue.file || 'Unknown'}`);
  console.log(`   ⚠️  ${issue.issue}`);
  console.log(`   🎯 Риск: ${issue.risk}`);
  console.log(`   📋 Анализ: ${issue.analysis}`);
  
  if (issue.risk.includes('ВЫСОКИЙ') || issue.risk.includes('СРЕДНИЙ')) {
    fieldAnomalies.push({
      type: 'cost_calculation',
      file: issue.file,
      issue: issue.issue,
      risk: issue.risk
    });
  }
});

console.log('\n💱 АНАЛИЗ ВАЛЮТ И КОНВЕРТАЦИИ:');
console.log('-'.repeat(50));

const currencyIssues = [
  {
    issue: 'Смешивание валют в одной таблице',
    details: 'RUB, XTR, STARS в одном поле currency',
    risk: 'ВЫСОКИЙ - путаница в расчетах',
    files: ['setPayments.ts', 'updateUserBalance.ts'],
    impact: 'Может привести к неправильным суммам'
  },
  {
    issue: 'Нет четкой конвертации между RUB и STARS',
    details: 'Курс конвертации может быть непостоянным',
    risk: 'СРЕДНИЙ - несоответствие курсов',
    files: ['currency-rate/index.ts'],
    impact: 'Пользователи могут получить разные курсы'
  },
  {
    issue: 'XTR и STARS используются как синонимы',
    details: 'Currency.XTR vs "STARS" - непоследовательность',
    risk: 'НИЗКИЙ - только путаница в коде',
    files: ['directPayment.ts', 'updateUserBalance.ts'],
    impact: 'Сложность в отладке'
  }
];

currencyIssues.forEach((issue, index) => {
  console.log(`\n${index + 1}. ⚠️  ${issue.issue}`);
  console.log(`   📋 Детали: ${issue.details}`);
  console.log(`   🎯 Риск: ${issue.risk}`);
  console.log(`   📁 Файлы: ${issue.files.join(', ')}`);
  console.log(`   💥 Влияние: ${issue.impact}`);
  
  if (issue.risk.includes('ВЫСОКИЙ') || issue.risk.includes('СРЕДНИЙ')) {
    fieldAnomalies.push({
      type: 'currency_issues',
      issue: issue.issue,
      risk: issue.risk,
      impact: issue.impact
    });
  }
});

console.log('\n⚡ АНАЛИЗ RACE CONDITIONS:');
console.log('-'.repeat(50));

const raceConditions = [
  {
    scenario: 'Параллельные списания с одного баланса',
    description: 'Два запроса одновременно проверяют баланс и списывают',
    files: ['processBalanceOperation.ts', 'processServiceBalanceOperation.ts'],
    risk: 'КРИТИЧЕСКИЙ',
    solution: 'Нужны транзакции или оптимистичные блокировки',
    code: `
// ПРОБЛЕМНЫЙ СЦЕНАРИЙ:
// Поток 1: getUserBalance() -> 100 звезд
// Поток 2: getUserBalance() -> 100 звезд  
// Поток 1: списывает 80 звезд
// Поток 2: списывает 80 звезд
// РЕЗУЛЬТАТ: -60 звезд (переплата)`
  },
  {
    scenario: 'Одновременное пополнение и списание',
    description: 'Пополнение и списание происходят параллельно',
    files: ['setPayments.ts', 'updateUserBalance.ts'],
    risk: 'ВЫСОКИЙ',
    solution: 'Атомарные операции на уровне БД',
    code: `
// ПОТЕНЦИАЛЬНАЯ ПРОБЛЕМА:
// Пополнение +100 и списание -50 могут конфликтовать`
  },
  {
    scenario: 'Кэш invalidation race',
    description: 'Инвалидация кэша может быть неатомарной',
    files: ['getUserBalance.ts'],
    risk: 'СРЕДНИЙ',
    solution: 'Кэширование уже отключено',
    status: '✅ РЕШЕНО - кэш отключен'
  }
];

raceConditions.forEach((race, index) => {
  console.log(`\n${index + 1}. 🏃‍♂️ ${race.scenario}`);
  console.log(`   📋 ${race.description}`);
  console.log(`   📁 Файлы: ${race.files.join(', ')}`);
  console.log(`   🎯 Риск: ${race.risk}`);
  console.log(`   💡 Решение: ${race.solution}`);
  
  if (race.status) {
    console.log(`   ✅ Статус: ${race.status}`);
  }
  
  if (race.risk === 'КРИТИЧЕСКИЙ' || race.risk === 'ВЫСОКИЙ') {
    fieldAnomalies.push({
      type: 'race_condition',
      scenario: race.scenario,
      risk: race.risk,
      files: race.files
    });
  }
});

console.log('\n📄 АНАЛИЗ METADATA И ИХ ВЛИЯНИЯ:');
console.log('-'.repeat(50));

const metadataIssues = [
  {
    field: 'modePrice vs paymentAmount',
    issue: 'Конфликт приоритетов в updateUserBalance',
    lines: 'updateUserBalance.ts:81-143',
    risk: 'ВЫСОКИЙ',
    details: 'Непонятно какое значение использовать, если оба заданы'
  },
  {
    field: 'currentBalance in metadata',
    issue: 'Может использоваться для расчета amount',
    lines: 'updateUserBalance.ts:155-171', 
    risk: 'СРЕДНИЙ',
    details: 'Логика определения amount по разности балансов сложная'
  },
  {
    field: 'operation_id vs inv_id',
    issue: 'Дублирование идентификаторов операций',
    risk: 'НИЗКИЙ',
    details: 'Два поля для похожих целей могут запутать'
  },
  {
    field: 'category REAL vs BONUS',
    issue: 'Влияет на расчет баланса?',
    risk: 'СРЕДНИЙ',
    details: 'Неясно как категория влияет на вычисления'
  }
];

metadataIssues.forEach((meta, index) => {
  console.log(`\n${index + 1}. 📊 ${meta.field}`);
  console.log(`   ⚠️  ${meta.issue}`);
  console.log(`   🎯 Риск: ${meta.risk}`);
  console.log(`   📋 Детали: ${meta.details}`);
  
  if (meta.lines) {
    console.log(`   📍 Место: ${meta.lines}`);
  }
  
  if (meta.risk === 'ВЫСОКИЙ' || meta.risk === 'СРЕДНИЙ') {
    fieldAnomalies.push({
      type: 'metadata_issues',
      field: meta.field,
      issue: meta.issue,
      risk: meta.risk
    });
  }
});

console.log('\n🕐 АНАЛИЗ ВРЕМЕННЫХ МЕТОК:');
console.log('-'.repeat(50));

const timeIssues = [
  {
    issue: 'payment_date vs created_at дублирование',
    risk: 'НИЗКИЙ',
    details: 'Два поля времени могут отличаться',
    impact: 'Путаница в отчетах'
  },
  {
    issue: 'payment_date может быть null для PENDING операций',
    risk: 'СРЕДНИЙ', 
    details: 'Логика установки даты в updateUserBalance.ts:400-403',
    impact: 'Проблемы с сортировкой по времени'
  },
  {
    issue: 'Нет timezone handling',
    risk: 'СРЕДНИЙ',
    details: 'Используется new Date().toISOString() без учета часовых поясов',
    impact: 'Неправильное время для пользователей из разных зон'
  }
];

timeIssues.forEach((time, index) => {
  console.log(`\n${index + 1}. ⏰ ${time.issue}`);
  console.log(`   🎯 Риск: ${time.risk}`);
  console.log(`   📋 Детали: ${time.details}`);
  console.log(`   💥 Влияние: ${time.impact}`);
  
  if (time.risk === 'ВЫСОКИЙ' || time.risk === 'СРЕДНИЙ') {
    fieldAnomalies.push({
      type: 'time_issues',
      issue: time.issue,
      risk: time.risk,
      impact: time.impact
    });
  }
});

console.log('\n🚨 СВОДКА НАЙДЕННЫХ АНОМАЛИЙ:');
console.log('='.repeat(60));

const criticalIssues = fieldAnomalies.filter(a => a.risk?.includes('КРИТИЧЕСКИЙ'));
const highIssues = fieldAnomalies.filter(a => a.risk?.includes('ВЫСОКИЙ'));
const mediumIssues = fieldAnomalies.filter(a => a.risk?.includes('СРЕДНИЙ'));

console.log(`\n🔴 КРИТИЧЕСКИЕ (${criticalIssues.length}): ${criticalIssues.map(i => i.type || i.scenario).join(', ')}`);
console.log(`🟠 ВЫСОКИЕ (${highIssues.length}): ${highIssues.map(i => i.type || i.scenario).join(', ')}`);
console.log(`🟡 СРЕДНИЕ (${mediumIssues.length}): ${mediumIssues.map(i => i.type || i.scenario).join(', ')}`);

if (criticalIssues.length > 0) {
  console.log('\n🆘 КРИТИЧЕСКИЕ ПРОБЛЕМЫ ТРЕБУЮТ НЕМЕДЛЕННОГО ИСПРАВЛЕНИЯ!');
  criticalIssues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue.scenario || issue.issue}`);
    if (issue.files) console.log(`   📁 ${issue.files.join(', ')}`);
  });
}

if (highIssues.length > 0) {
  console.log('\n⚠️  ВЫСОКИЕ РИСКИ:');
  highIssues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue.issue || issue.scenario}`);
    if (issue.file) console.log(`   📁 ${issue.file}`);
  });
}

console.log('\n💡 ПРИОРИТЕТНЫЕ ИСПРАВЛЕНИЯ:');
console.log('-'.repeat(40));

const recommendations = [
  '1. 🆘 КРИТИЧНО: Добавить блокировки для параллельных операций баланса',
  '2. 🔴 ВЫСОКО: Исправить логику определения amount в updateUserBalance',
  '3. 🟠 ВЫСОКО: Унифицировать валютную систему (RUB/STARS/XTR)',
  '4. 🟡 СРЕДНЕ: Добавить валидацию consistency amount/stars',
  '5. 🟡 СРЕДНЕ: Улучшить обработку временных зон',
  '6. 🔵 НИЗКО: Привести в порядок поля operation_id/inv_id'
];

recommendations.forEach(rec => console.log(rec));

console.log('\n✨ Глубокий аудит завершен!');