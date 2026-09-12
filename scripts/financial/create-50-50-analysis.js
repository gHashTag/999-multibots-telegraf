// xlsx replaced by exceljs-backed shim; requires `bun run build` (dist/)
const XLSX = require('../../dist/utils/excelCompat');

const STAR_TO_RUB_RATE = 1.8;

// РЕАЛЬНЫЕ ДАННЫЕ
const rub_payments = 57879.00; // поступили владельцу
const real_xtr_payments = 34745.00; // поступили боту в звёздах
const real_xtr_rub_equivalent = real_xtr_payments * STAR_TO_RUB_RATE; // 62541 ₽

// Общие доходы = рубли владельца + рублёвый эквивалент звёзд
const total_income_rub = rub_payments + real_xtr_rub_equivalent; // 120 420 ₽

// Деление 50/50
const owner_share = total_income_rub / 2; // 60 210 ₽
const bot_share_rub = total_income_rub / 2; // 60 210 ₽
const bot_share_stars = bot_share_rub / STAR_TO_RUB_RATE; // 33450 звёзд

// Что уже получил владелец
const owner_already_has = rub_payments; // 57 879 ₽

// Что должен получить владелец дополнительно
const owner_needs_more = owner_share - owner_already_has; // 60 210 - 57 879 = 2 331 ₽

// Расходы бота
const bot_expenses_stars = 41346.04; // в звёздах
const bot_expenses_xtr = 61338.93; // в XTR
const bot_total_expenses_rub = (bot_expenses_stars + bot_expenses_xtr) * STAR_TO_RUB_RATE; // 184 832.94 ₽

// Итоговый расчёт
const bot_should_pay_owner = bot_total_expenses_rub - (bot_share_rub + real_xtr_rub_equivalent);
const final_debt = owner_needs_more + bot_should_pay_owner;

function formatNumber(num) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function formatCurrency(num) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function create5050ExcelReport() {
  const workbook = XLSX.utils.book_new();

  // ЛИСТ 1: РАСЧЁТ 50/50
  const splitSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['               РАСЧЁТ 50/50 МЕЖДУ ВЛАДЕЛЬЦЕМ И БОТОМ           '],
    ['              MetaMuse_Manifest_bot                           '],
    ['                                                          '],
    ['💰 ОБЩИЕ РЕАЛЬНЫЕ ДОХОДЫ (ПОДЕЛИТЬ 50/50):'],
    [''],
    ['📊 Источники доходов:', '', '', ''],
    ['├── Поступления владельцу (₽)', formatCurrency(rub_payments), '', ''],
    ['└── Поступления боту (⭐)', formatNumber(real_xtr_payments), '⭐ =', formatCurrency(real_xtr_rub_equivalent)],
    [''],
    ['ИТОГО доходов:', formatCurrency(total_income_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 ДЕЛЕНИЕ 50/50'],
    [''],
    ['💎 Доля владельца:', formatCurrency(owner_share), '', ''],
    ['🤖 Доля бота:', formatCurrency(bot_share_rub), '(', formatNumber(bot_share_stars), '⭐)', ''],
    [''],
    ['📊 Что уже получил владелец:', '', '', ''],
    ['└── Наличные (₽)', formatCurrency(owner_already_has), '', ''],
    [''],
    ['❓ Что должен получить владелец ещё:', '', '', ''],
    ['└── Доплата', formatCurrency(owner_needs_more), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📉 РАСХОДЫ БОТА (НА AI-СЕРВИСЫ)'],
    [''],
    ['📊 Расходы:', '', '', ''],
    ['├── Внутренние (STARS)', formatNumber(bot_expenses_stars), '⭐ =', formatCurrency(bot_expenses_stars * STAR_TO_RUB_RATE)],
    ['└── Внешние (XTR)', formatNumber(bot_expenses_xtr), '⭐ =', formatCurrency(bot_expenses_xtr * STAR_TO_RUB_RATE)],
    [''],
    ['ИТОГО расходов:', formatCurrency(bot_total_expenses_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🔄 ИТОГОВЫЕ ВЗАИМОРАСЧЁТЫ'],
    [''],
    ['💰 Что должен получить владелец:', '', '', ''],
    ['├── Доплата за свою долю', formatCurrency(owner_needs_more), '', ''],
    ['└── Покрытие расходов бота', formatCurrency(bot_total_expenses_rub - bot_share_rub - real_xtr_rub_equivalent), '', ''],
    [''],
    ['ИТОГО владелец должен получить:', formatCurrency(final_debt), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['✅ ФИНАЛЬНОЕ ЗАКЛЮЧЕНИЕ'],
    [''],
    ['БОТ ДОЛЖЕН ВЛАДЕЛЬЦУ:'],
    [formatCurrency(final_debt), '', '', ''],
    [''],
    ['Расшифровка:', '', '', ''],
    ['• Доплата за 50% дохода: +', formatCurrency(owner_needs_more), '', ''],
    ['• Покрытие превышения расходов: +', formatCurrency(bot_total_expenses_rub - bot_share_rub - real_xtr_rub_equivalent), '', ''],
    ['• ИТОГО:', formatCurrency(final_debt), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, splitSheet, 'Расчет 50-50');

  // ЛИСТ 2: ДЕТАЛЬНЫЙ АНАЛИЗ
  const detailSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                 ДЕТАЛЬНЫЙ АНАЛИЗ ДОХОДОВ                     '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📊 ПОСТУПЛЕНИЯ В РУБЛЯХ (ВЛАДЕЛЕЦ):'],
    ['├── Robokassa', formatCurrency(48882.00), '', ''],
    ['├── Telegram (RUB)', formatCurrency(5998.00), '', ''],
    ['└── Ручные платежи', formatCurrency(2999.00), '', ''],
    [''],
    ['ИТОГО наличными:', formatCurrency(rub_payments), '', ''],
    [''],
    ['📊 ПОСТУПЛЕНИЯ В ЗВЁЗДАХ (БОТ):'],
    ['├── Telegram Stars', formatNumber(21304.00), '⭐ =', formatCurrency(21304.00 * STAR_TO_RUB_RATE)],
    ['├── Админские операции', formatNumber(2500.00), '⭐ =', formatCurrency(2500.00 * STAR_TO_RUB_RATE)],
    ['├── Системные возвраты', formatNumber(5848.00), '⭐ =', formatCurrency(5848.00 * STAR_TO_RUB_RATE)],
    ['├── Системные операции', formatNumber(3592.00), '⭐ =', formatCurrency(3592.00 * STAR_TO_RUB_RATE)],
    ['├── Возвраты за видео', formatNumber(1170.00), '⭐ =', formatCurrency(1170.00 * STAR_TO_RUB_RATE)],
    ['└── Возвраты за изображения', formatNumber(331.00), '⭐ =', formatCurrency(331.00 * STAR_TO_RUB_RATE)],
    [''],
    ['ИТОГО звёздами:', formatNumber(real_xtr_payments), '⭐ =', formatCurrency(real_xtr_rub_equivalent), ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📉 РАСХОДЫ БОТА ПО СЕРВИСАМ'],
    [''],
    ['Внутренние операции (STARS):', formatCurrency(bot_expenses_stars * STAR_TO_RUB_RATE), '', ''],
    ['├── Внутренние', formatCurrency(40654.44 * STAR_TO_RUB_RATE), '', ''],
    ['└── Обучение моделей', formatCurrency(691.60 * STAR_TO_RUB_RATE), '', ''],
    [''],
    ['Внешние сервисы (XTR):', formatCurrency(bot_expenses_xtr * STAR_TO_RUB_RATE), '', ''],
    ['├── Системные операции', formatCurrency(27447.00 * STAR_TO_RUB_RATE), '', ''],
    ['├── Оплата с баланса', formatCurrency(11170.03 * STAR_TO_RUB_RATE), '', ''],
    ['├── Image to Video', formatCurrency(12652.00 * STAR_TO_RUB_RATE), '', ''],
    ['├── Text to Video', formatCurrency(3579.00 * STAR_TO_RUB_RATE), '', ''],
    ['└── Другие сервисы', formatCurrency(6381.90 * STAR_TO_RUB_RATE), '', ''],
    [''],
    ['ИТОГО расходов:', formatCurrency(bot_total_expenses_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🔍 ФОРМУЛА РАСЧЁТА'],
    [''],
    ['Общие доходы:', formatCurrency(total_income_rub), '=', 'рубли + звёзды'],
    ['Доля каждого:', formatCurrency(owner_share), '=', '50% от общих доходов'],
    [''],
    ['Владелец уже получил:', formatCurrency(owner_already_has), '', ''],
    ['Владелец должен получить ещё:', formatCurrency(owner_needs_more), '', ''],
    [''],
    ['Бот должен покрыть расходы:', formatCurrency(bot_total_expenses_rub - bot_share_rub - real_xtr_rub_equivalent), '', ''],
    [''],
    ['ИТОГО к получению владельцем:', formatCurrency(final_debt), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Детальный анализ');

  return workbook;
}

const workbook = create5050ExcelReport();
const fileName = `/tmp/MetaMuse_Manifest_bot_50-50_${new Date().toISOString().split('T')[0]}.xlsx`;
XLSX.writeFile(workbook, fileName).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

console.log('\n' + '='.repeat(70));
console.log('🎯 РАСЧЁТ 50/50 МЕЖДУ ВЛАДЕЛЬЦЕМ И БОТОМ');
console.log('='.repeat(70));
console.log('\n💰 ОБЩИЕ РЕАЛЬНЫЕ ДОХОДЫ:');
console.log('├── Поступления владельцу (₽):', formatCurrency(rub_payments));
console.log('└── Поступления боту (⭐):', formatNumber(real_xtr_payments), '⭐ =', formatCurrency(real_xtr_rub_equivalent));
console.log('ИТОГО:', formatCurrency(total_income_rub));
console.log('\n🎯 ДЕЛЕНИЕ 50/50:');
console.log('├── Доля владельца:', formatCurrency(owner_share));
console.log('└── Доля бота:', formatCurrency(bot_share_rub), '(', formatNumber(bot_share_stars), '⭐)');
console.log('\n📊 ЧТО ДОЛЖЕН ПОЛУЧИТЬ ВЛАДЕЛЕЦ:');
console.log('├── Доплата за свою долю:', formatCurrency(owner_needs_more));
console.log('└── Покрытие превышения расходов бота:', formatCurrency(bot_total_expenses_rub - bot_share_rub - real_xtr_rub_equivalent));
console.log('\n✅ ИТОГО БОТ ДОЛЖЕН ВЛАДЕЛЬЦУ:', formatCurrency(final_debt));
console.log('='.repeat(70));
console.log('\n📊 Excel-отчёт создан:', fileName);