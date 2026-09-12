// xlsx replaced by exceljs-backed shim; requires `bun run build` (dist/)
const XLSX = require('../../dist/utils/excelCompat');

const STAR_TO_RUB_RATE = 1.8;

// ВСЕ ДАННЫЕ (ВКЛЮЧАЯ БОНУСЫ)
const rub_payments = 57879.00; // владелец получил доходов
const real_income_stars = 60462.00; // реальные доходы в звёздах
const bonus_income_stars = 158236.81; // бонусные доходы в звёздах
const total_income_stars = real_income_stars + bonus_income_stars; // 218 698.81 ⭐
const total_income_stars_rub = total_income_stars * STAR_TO_RUB_RATE; // 393 657.86 ₽

// ВСЕ расходы бота
const total_expense_stars = 102819.97; // все расходы включая бонусы
const total_cost_stars = 32593.96; // себестоимость
const bot_total_expenses_rub = (total_expense_stars + total_cost_stars) * STAR_TO_RUB_RATE; // 243 745.07 ₽

// Общие доходы = рубли владельца + рублёвый эквивалент всех звёзд
const total_income_rub = rub_payments + total_income_stars_rub; // 451 536.86 ₽

// Деление 50/50
const owner_share = total_income_rub / 2; // 225 768.43 ₽

// Что владелец фактически получил
const owner_received = rub_payments; // 57 879 ₽

// Недополучил владелец
const owner_underpaid = owner_share - owner_received; // 225 768.43 - 57 879 = 167 889.43 ₽

// Владелец заплатил расходы
const owner_paid_expenses = bot_total_expenses_rub; // 243 745.07 ₽

// Минус владельца
const owner_net_loss = owner_paid_expenses - owner_received; // 243 745.07 - 57 879 = 185 866.07 ₽

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

function createAllMoneyExcelReport() {
  const workbook = XLSX.utils.book_new();

  // ЛИСТ 1: ГЛАВНАЯ СТРАНИЦА - ВСЕ ДЕНЬГИ
  const mainSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['            ФИНАНСОВЫЙ ОТЧЁТ СО ВСЕМИ ДЕНЬГАМИ                 '],
    ['              MetaMuse_Manifest_bot                           '],
    ['                                                          '],
    ['🔍 ВНИМАНИЕ: ВКЛЮЧЕНЫ ВСЕ ДЕНЬГИ (РЕАЛЬНЫЕ + БОНУСНЫЕ)        '],
    ['Бонусные деньги тоже тратились реально → нужно всё вернуть!    '],
    [''],
    ['💰 ВСЕ ПОСТУПЛЕНИЯ (РАСПРЕДЕЛИТЬ 50/50):'],
    [''],
    ['📊 Реальные доходы:', '', '', ''],
    ['├── Рубли (владелец получил)', formatCurrency(rub_payments), '', ''],
    ['└── Звёзды (бот получил)', formatNumber(real_income_stars), '⭐ =', formatCurrency(real_income_stars * STAR_TO_RUB_RATE)],
    [''],
    ['📊 Бонусные доходы (тоже тратились!):', '', '', ''],
    ['└── Звёзды (бот получил)', formatNumber(bonus_income_stars), '⭐ =', formatCurrency(bonus_income_stars * STAR_TO_RUB_RATE)],
    [''],
    ['ИТОГО ВСЕХ доходов:', formatCurrency(total_income_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 ДЕЛЕНИЕ 50/50 ВСЕХ ДЕНЕГ'],
    [''],
    ['Общие доходы:', formatCurrency(total_income_rub), '', ''],
    ['Доля каждого (50/50):', formatCurrency(owner_share), '', ''],
    [''],
    ['Владелец должен был получить:', formatCurrency(owner_share), '', ''],
    ['Владелец фактически получил:', formatCurrency(owner_received), '', ''],
    ['Недополучил:', formatCurrency(owner_underpaid), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📉 ВСЕ РАСХОДЫ (ОПЛАЧЕНЫ ВЛАДЕЛЬЦЕМ!)'],
    [''],
    ['Все расходы бота:', formatCurrency(bot_total_expenses_rub), '', ''],
    [''],
    ['В том числе:', '', '', ''],
    ['├── Внешние платежи (XTR/STARS)', formatCurrency(total_expense_stars * STAR_TO_RUB_RATE), '', ''],
    ['└── Себестоимость (cost)', formatCurrency(total_cost_stars * STAR_TO_RUB_RATE), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📊 РАСЧЁТ МИНУСА ВЛАДЕЛЬЦА'],
    [''],
    ['Владелец заплатил расходов:', formatCurrency(owner_paid_expenses), '', ''],
    ['Владелец получил доходов:', formatCurrency(owner_received), '', ''],
    ['Минус владельца:', formatCurrency(owner_net_loss), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['✅ ИТОГОВОЕ ЗАКЛЮЧЕНИЕ'],
    [''],
    ['БОТ ДОЛЖЕН ВЛАДЕЛЬЦУ:', '', '', ''],
    [formatCurrency(bot_owes_owner), '', '', ''],
    [''],
    ['Из них:', '', '', ''],
    ['├── Покрытие минуса владельца:', formatCurrency(owner_net_loss), '', ''],
    ['└── Доплата за долю:', formatCurrency(owner_underpaid), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📋 ИТОГОВАЯ ТАБЛИЦА'],
    [''],
    ['Показатель', 'Сумма', 'Статус', ''],
    ['ВСЕ доходы (рубли + звёзды)', formatCurrency(total_income_rub), '📊 Всего заработано', ''],
    ['Доля владельца (50%)', formatCurrency(owner_share), '🎯 Должен был получить', ''],
    ['Фактически получил', formatCurrency(owner_received), '✅ Получено', ''],
    ['Недополучил долю', formatCurrency(owner_underpaid), '❌ Недоплата', ''],
    ['Оплатил расходов', formatCurrency(owner_paid_expenses), '❌ Владелец платил', ''],
    ['Минус владельца', formatCurrency(owner_net_loss), '❌ Убыток', ''],
    ['ИТОГО к получению', formatCurrency(bot_owes_owner), '🔴 ДОЛГ БОТА', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════']
  ]);

  XLSX.utils.book_append_sheet(workbook, mainSheet, 'ГЛАВНАЯ');

  // ЛИСТ 2: ДЕТАЛИЗАЦИЯ ВСЕХ ДОХОДОВ
  const incomeSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['               ВСЕ ДОХОДЫ (РЕАЛЬНЫЕ + БОНУСНЫЕ)               '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📊 РЕАЛЬНЫЕ ДОХОДЫ В РУБЛЯХ:', formatCurrency(rub_payments), '', ''],
    ['├── Robokassa', formatCurrency(48882.00), '', ''],
    ['├── Telegram (RUB)', formatCurrency(5998.00), '', ''],
    ['└── Ручные платежи', formatCurrency(2999.00), '', ''],
    [''],
    ['📊 РЕАЛЬНЫЕ ДОХОДЫ В ЗВЁЗДАХ:', formatNumber(real_income_stars), '⭐ =', formatCurrency(real_income_stars * STAR_TO_RUB_RATE)],
    ['├── Telegram Stars', formatNumber(21304.00), '⭐', ''],
    ['├── Админские', formatNumber(2500.00), '⭐', ''],
    ['├── Системные возвраты', formatNumber(5848.00), '⭐', ''],
    ['├── Системные операции', formatNumber(3592.00), '⭐', ''],
    ['├── Возвраты за видео', formatNumber(1170.00), '⭐', ''],
    ['└── Возвраты за изображения', formatNumber(331.00), '⭐', ''],
    [''],
    ['📊 БОНУСНЫЕ ДОХОДЫ:', formatNumber(bonus_income_stars), '⭐ =', formatCurrency(bonus_income_stars * STAR_TO_RUB_RATE)],
    ['├── Бонусы с баланса', formatNumber(35732.00), '⭐', ''],
    ['├── Миграция баланса', formatNumber(29314.00), '⭐', ''],
    ['├── Админские бонусы', formatNumber(89990.81), '⭐', ''],
    ['└── Другие бонусы', formatNumber(1200.00), '⭐', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 ИТОГО ВСЕХ ДОХОДОВ:', formatCurrency(total_income_rub), '', ''],
    ['Доля каждого (50/50):', formatCurrency(owner_share), '', ''],
    ['Недополучил владелец:', formatCurrency(owner_underpaid), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, incomeSheet, 'Все доходы');

  // ЛИСТ 3: ВСЕ РАСХОДЫ
  const expenseSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                ВСЕ РАСХОДЫ БОТА                             '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📉 ВСЕ РАСХОДЫ БОТА (ОПЛАЧЕНЫ ВЛАДЕЛЬЦЕМ):'],
    [''],
    ['Внешние платежи (MONEY_OUTCOME):', formatCurrency(total_expense_stars * STAR_TO_RUB_RATE), '', ''],
    ['├── Internal операции', formatCurrency(40654.44 * STAR_TO_RUB_RATE), '', ''],
    ['├── Системные', formatCurrency(27447.00 * STAR_TO_RUB_RATE), '', ''],
    ['├── Image to Video', formatCurrency(12652.00 * STAR_TO_RUB_RATE), '', ''],
    ['├── Text to Video', formatCurrency(3579.00 * STAR_TO_RUB_RATE), '', ''],
    ['├── Баланс', formatCurrency(11170.03 * STAR_TO_RUB_RATE), '', ''],
    ['└── Другие сервисы', formatNumber(7317.50), '⭐', ''],
    [''],
    ['Себестоимость (cost):', formatCurrency(total_cost_stars * STAR_TO_RUB_RATE), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['ИТОГО оплатил владелец:', formatCurrency(bot_total_expenses_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📊 МИНУС ВЛАДЕЛЬЦА:'],
    [''],
    ['Заплатил:', formatCurrency(owner_paid_expenses), '', ''],
    ['Получил:', formatCurrency(owner_received), '', ''],
    ['Убыток:', formatCurrency(owner_net_loss), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Все расходы');

  return workbook;
}

const workbook = createAllMoneyExcelReport();
const fileName = `/tmp/MetaMuse_Manifest_bot_ВСЕ_ДЕНЬГИ_${new Date().toISOString().split('T')[0]}.xlsx`;
XLSX.writeFile(workbook, fileName).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

console.log('\n' + '='.repeat(70));
console.log('🎯 ФИНАЛЬНЫЙ РАСЧЁТ СО ВСЕМИ ДЕНЬГАМИ (ВКЛЮЧАЯ БОНУСЫ)');
console.log('='.repeat(70));
console.log('\n💰 ВСЕ ДОХОДЫ (реальные + бонусные):');
console.log('├── Рубли:', formatCurrency(rub_payments));
console.log('├── Реальные звёзды:', formatNumber(real_income_stars), '⭐ =', formatCurrency(real_income_stars * STAR_TO_RUB_RATE));
console.log('└── Бонусные звёзды:', formatNumber(bonus_income_stars), '⭐ =', formatCurrency(bonus_income_stars * STAR_TO_RUB_RATE));
console.log('ИТОГО:', formatCurrency(total_income_rub));
console.log('\n🎯 Доля каждого (50/50):', formatCurrency(owner_share));
console.log('\n📉 ВСЕ расходы:', formatCurrency(bot_total_expenses_rub));
console.log('\n📊 Минус владельца:', formatCurrency(owner_net_loss));
console.log('\n📊 Недополучил долю:', formatCurrency(owner_underpaid));
console.log('\n✅ БОТ ДОЛЖЕН ВЛАДЕЛЬЦУ:', formatCurrency(bot_owes_owner));
console.log('='.repeat(70));
console.log('\n📊 Excel-отчёт создан:', fileName);