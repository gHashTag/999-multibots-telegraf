// xlsx replaced by exceljs-backed shim; requires `bun run build` (dist/)
const XLSX = require('../../dist/utils/excelCompat');

const STAR_TO_RUB_RATE = 1.8;

// РЕАЛЬНЫЕ ДАННЫЕ
const rub_payments = 57879.00; // владелец получил доходов
const real_xtr_payments = 34745.00; // бот получил доходов в звёздах
const real_xtr_rub_equivalent = real_xtr_payments * STAR_TO_RUB_RATE; // 62541 ₽

// Общие доходы = рубли владельца + рублёвый эквивалент звёзд
const total_income_rub = rub_payments + real_xtr_rub_equivalent; // 120 420 ₽

// Деление 50/50
const owner_share = total_income_rub / 2; // 60 210 ₽
const bot_share_rub = total_income_rub / 2; // 60 210 ₽
const bot_share_stars = bot_share_rub / STAR_TO_RUB_RATE; // 33450 звёзд

// Расходы бота (которые ВЛАДЕЛЕЦ фактически платит!)
const bot_expenses_stars = 41346.04; // в звёздах
const bot_expenses_xtr = 61338.93; // в XTR
const bot_total_expenses_rub = (bot_expenses_stars + bot_expenses_xtr) * STAR_TO_RUB_RATE; // 184 832.94 ₽

// ЧТО ВЛАДЕЛЕЦ ФАКТИЧЕСКИ ПОЛУЧИЛ
const owner_received = rub_payments; // 57 879 ₽

// ЧТО ВЛАДЕЛЕЦ ДОЛЖЕН БЫЛ ПОЛУЧИТЬ
const owner_should_receive = owner_share; // 60 210 ₽

// ЧТО ВЛАДЕЛЕЦ ПЛАТИЛ ЗА РАСХОДЫ
const owner_paid_expenses = bot_total_expenses_rub; // 184 833 ₽

// НЕДОПОЛУЧИЛ владелец из своих доходов
const owner_underpaid = owner_should_receive - owner_received; // 2 331 ₽

// ВЛАДЕЛЕЦ в минусе из-за того что платил расходы
const owner_net_loss = owner_paid_expenses - owner_received; // 126 954 ₽

// ИТОГО бот должен владельцу
const bot_owes_owner = owner_net_loss + owner_underpaid;

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

function createFinalExcelReport() {
  const workbook = XLSX.utils.book_new();

  // ЛИСТ 1: ГЛАВНАЯ СТРАНИЦА
  const mainSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['            ОКОНЧАТЕЛЬНЫЙ ФИНАНСОВЫЙ ОТЧЁТ                    '],
    ['              MetaMuse_Manifest_bot                           '],
    ['                                                          '],
    ['🔍 АНАЛИЗ: Владелец платит расходы, недополучает доходы'],
    [''],
    ['💰 ЧТО ПОЛУЧИЛ ВЛАДЕЛЕЦ:'],
    [''],
    ['Поступления в рублях:', formatCurrency(owner_received), '', ''],
    [''],
    ['📉 ЧТО ЗАПЛАТИЛ ВЛАДЕЛЕЦ:'],
    [''],
    ['Расходы бота (AI-сервисы):', formatCurrency(owner_paid_expenses), '', ''],
    [''],
    ['🎯 ЧТО ДОЛЖЕН БЫЛ ПОЛУЧИТЬ ВЛАДЕЛЕЦ (50% ДОХОДОВ):'],
    [''],
    ['По расчёту 50/50:', formatCurrency(owner_should_receive), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📊 РАСЧЁТ ДОЛГА БОТА ПЕРЕД ВЛАДЕЛЬЦЕМ'],
    [''],
    ['1. Владелец заплатил расходов:', formatCurrency(owner_paid_expenses), '', ''],
    ['2. Владелец получил доходов:', formatCurrency(owner_received), '', ''],
    ['3. Владелец в минусе:', formatCurrency(owner_net_loss), '', ''],
    [''],
    ['4. Недополучил свою долю:', formatCurrency(owner_underpaid), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['✅ ИТОГ: БОТ ДОЛЖЕН ВЛАДЕЛЬЦУ'],
    [''],
    ['ТОТАЛ К ОПЛАТЕ:', formatCurrency(bot_owes_owner), '', ''],
    [''],
    ['Из них:', '', '', ''],
    ['├── Покрытие минуса владельца:', formatCurrency(owner_net_loss), '', ''],
    ['└── Доплата за долю:', formatCurrency(owner_underpaid), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📋 СВОДНАЯ ТАБЛИЦА'],
    [''],
    ['Показатель', 'Сумма', 'Статус', ''],
    ['Поступления владельцу', formatCurrency(owner_received), '✅ Получено', ''],
    ['Расходы за AI-сервисы', formatCurrency(owner_paid_expenses), '❌ Оплачено владельцем', ''],
    ['Должен был получить (50%)', formatCurrency(owner_should_receive), '❌ Недополучено', ''],
    ['ИТОГО к получению владельцем', formatCurrency(bot_owes_owner), '🔴 ДОЛГ БОТА', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════']
  ]);

  XLSX.utils.book_append_sheet(workbook, mainSheet, 'ГЛАВНАЯ');

  // ЛИСТ 2: ДЕТАЛИЗАЦИЯ ДОХОДОВ
  const incomeSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                 ДЕТАЛИЗАЦИЯ ДОХОДОВ                          '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📊 ПОСТУПЛЕНИЯ В РУБЛЯХ (ВЛАДЕЛЕЦ ПОЛУЧИЛ):'],
    ['├── Robokassa', formatCurrency(48882.00), '', ''],
    ['├── Telegram (RUB)', formatCurrency(5998.00), '', ''],
    ['└── Ручные платежи', formatCurrency(2999.00), '', ''],
    [''],
    ['ИТОГО получено:', formatCurrency(rub_payments), '', ''],
    [''],
    ['📊 ПОСТУПЛЕНИЯ В ЗВЁЗДАХ (БОТ ПОЛУЧИЛ):'],
    ['├── Telegram Stars', formatNumber(21304.00), '⭐ =', formatCurrency(21304.00 * STAR_TO_RUB_RATE)],
    ['├── Админские операции', formatNumber(2500.00), '⭐ =', formatCurrency(2500.00 * STAR_TO_RUB_RATE)],
    ['├── Системные возвраты', formatNumber(5848.00), '⭐ =', formatCurrency(5848.00 * STAR_TO_RUB_RATE)],
    ['├── Системные операции', formatNumber(3592.00), '⭐ =', formatCurrency(3592.00 * STAR_TO_RUB_RATE)],
    ['├── Возвраты за видео', formatNumber(1170.00), '⭐ =', formatCurrency(1170.00 * STAR_TO_RUB_RATE)],
    ['└── Возвраты за изображения', formatNumber(331.00), '⭐ =', formatCurrency(331.00 * STAR_TO_RUB_RATE)],
    [''],
    ['ИТОГО бот получил:', formatNumber(real_xtr_payments), '⭐ =', formatCurrency(real_xtr_rub_equivalent), ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 ОБЩИЕ ДОХОДЫ И РАСПРЕДЕЛЕНИЕ'],
    [''],
    ['Общие доходы (рубли + звёзды):', formatCurrency(total_income_rub), '', ''],
    ['Доля каждого (50/50):', formatCurrency(owner_share), '', ''],
    [''],
    ['Владелец должен был получить:', formatCurrency(owner_share), '', ''],
    ['Владелец фактически получил:', formatCurrency(owner_received), '', ''],
    ['Недополучил:', formatCurrency(owner_underpaid), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, incomeSheet, 'Доходы');

  // ЛИСТ 3: РАСХОДЫ
  const expenseSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                 ДЕТАЛИЗАЦИЯ РАСХОДОВ                         '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📉 КТО ПЛАТИЛ РАСХОДЫ? ВЛАДЕЛЕЦ!'],
    [''],
    ['Все расходы бота оплачивал владелец из своего кармана!'],
    [''],
    ['📊 РАСХОДЫ БОТА (ОПЛАЧЕНЫ ВЛАДЕЛЬЦЕМ):'],
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
    ['ИТОГО оплатил владелец:', formatCurrency(bot_total_expenses_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📊 РАСЧЁТ МИНУСА ВЛАДЕЛЬЦА'],
    [''],
    ['Расходы владельца:', formatCurrency(owner_paid_expenses), '', ''],
    ['Доходы владельца:', formatCurrency(owner_received), '', ''],
    ['Минус владельца:', formatCurrency(owner_net_loss), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Расходы');

  return workbook;
}

const workbook = createFinalExcelReport();
const fileName = `/tmp/MetaMuse_Manifest_bot_ИТОГОВЫЙ_${new Date().toISOString().split('T')[0]}.xlsx`;
XLSX.writeFile(workbook, fileName).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

console.log('\n' + '='.repeat(70));
console.log('🎯 ОКОНЧАТЕЛЬНЫЙ РАСЧЁТ');
console.log('='.repeat(70));
console.log('\n💰 ЧТО ПОЛУЧИЛ ВЛАДЕЛЕЦ:');
console.log('├── Доходы:', formatCurrency(owner_received));
console.log('\n📉 ЧТО ЗАПЛАТИЛ ВЛАДЕЛЕЦ:');
console.log('├── Расходы AI:', formatCurrency(owner_paid_expenses));
console.log('\n🎯 ЧТО ДОЛЖЕН БЫЛ ПОЛУЧИТЬ (50/50):');
console.log('├── Доля:', formatCurrency(owner_should_receive));
console.log('\n📊 РАСЧЁТ ДОЛГА:');
console.log('├── Минус владельца:', formatCurrency(owner_net_loss));
console.log('├── Недополучил свою долю:', formatCurrency(owner_underpaid));
console.log('\n✅ БОТ ДОЛЖЕН ВЛАДЕЛЬЦУ:', formatCurrency(bot_owes_owner));
console.log('='.repeat(70));
console.log('\n📊 Excel-отчёт создан:', fileName);