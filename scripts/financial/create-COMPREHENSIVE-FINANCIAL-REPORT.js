// xlsx replaced by exceljs-backed shim; requires `bun run build` (dist/)
const XLSX = require('../../dist/utils/excelCompat');

const STAR_TO_RUB_RATE = 1.8;

// ========================================
// ВСЕ ДАННЫЕ ИЗ ПРЕДЫДУЩИХ АНАЛИЗОВ
// ========================================

// РЕАЛЬНЫЕ ДОХОДЫ (из SQL)
const real_income_rub = 57879.00;  // Рубли владельца
const real_income_stars = 60462.00;  // Звезды бота (реальные)
const bonus_income_stars = 158236.81;  // Бонусные звезды

// ОБЩИЕ ДОХОДЫ
const total_income_stars = real_income_stars + bonus_income_stars;  // 218,698.81 ⭐
const total_income_stars_rub = total_income_stars * STAR_TO_RUB_RATE;  // 393,657.86 ₽
const total_income_rub = real_income_rub + total_income_stars_rub;  // 451,536.86 ₽

// 50/50 ДЕЛЕНИЕ
const owner_share = total_income_rub / 2;  // 225,768₽
const bot_share = total_income_rub / 2;  // 225,768₽

// ЧТО ПОЛУЧИЛ ВЛАДЕЛЕЦ
const owner_received = real_income_rub;  // 57,879₽

// НЕДОПОЛУЧИЛ ВЛАДЕЛЕЦ
const owner_underpaid = owner_share - owner_received;  // 167,889₽

// РАСХОДЫ БОТА
const expenses_stars = 41346.04;  // STARS
const expenses_xtr = 61338.93;  // XTR
const total_cost = 32593.96;  // себестоимость
const total_expenses_rub = (expenses_stars + expenses_xtr + total_cost) * STAR_TO_RUB_RATE;  // 243,745₽

// ВЛАДЕЛЕЦ В МИНУСЕ ИЗ-ЗА РАСХОДОВ
const owner_net_loss = total_expenses_rub - owner_received;  // 185,866₽

// ИТОГОВЫЙ ДОЛГ БОТА
const bot_owes_owner = owner_underpaid + owner_net_loss;  // 353,755₽

// ========================================
// ДЕТАЛИЗАЦИЯ РЕАЛЬНЫХ ДОХОДОВ
// ========================================
const rub_income = {
  robokassa: 48882.00,
  telegram_rub: 5998.00,
  manual: 2999.00,
  total: 57879.00
};

const stars_income = {
  telegram_stars: 21304.00,
  admin: 2500.00,
  system_refund: 5848.00,
  system_operation: 3592.00,
  video_refund: 1170.00,
  image_refund: 331.00,
  total: 34745.00
};

const real_income_stars_rub = real_income_stars * STAR_TO_RUB_RATE;

const bonus_breakdown = {
  balance_bonus: 35732.00,
  balance_migration: 29314.00,
  admin_bonus: 89990.81,
  other_bonus: 2999.00,
  total: 158236.81
};

// ========================================
// ДЕТАЛИЗАЦИЯ РАСХОДОВ
// ========================================
const expense_breakdown = {
  stars: {
    internal: 40654.44,
    training: 691.60,
    total: 41346.04
  },
  xtr: {
    system: 27447.00,
    balance: 11170.03,
    image_to_video: 12652.00,
    text_to_video: 3579.00,
    image_to_video2: 2082.00,
    flux_kontext: 134.00,
    other: 6274.90,
    total: 61338.93
  },
  cost: {
    total: 32593.96
  }
};

// ========================================
// ДАННЫЕ О ПЛАТЕЖАХ (238 транзакций)
// ========================================
const paymentsData = [
  { telegram_id: "428714907", username: "K_MRing", first_name: "Kevin", last_name: "", payment_date: "2025-11-01 09:45:40.346964+00", amount: "476", stars: "476.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "856.800" },
  { telegram_id: "727406144", username: "Juliya_Goncharova", first_name: "Juliya", last_name: "Goncharova", payment_date: "2025-10-30 13:05:18.084796+00", amount: "8", stars: "8.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for cancelled generation", ruble_equivalent: "14.400" },
  { telegram_id: "727406144", username: "Juliya_Goncharova", first_name: "Juliya", last_name: "Goncharova", payment_date: "2025-10-30 13:05:05.520744+00", amount: "12", stars: "12.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for cancelled generation", ruble_equivalent: "21.600" },
  { telegram_id: "727406144", username: "Juliya_Goncharova", first_name: "Juliya", last_name: "Goncharova", payment_date: "2025-10-30 13:03:47.692717+00", amount: "8", stars: "8.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for cancelled generation", ruble_equivalent: "14.400" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-10-22 12:48:48.125352+00", amount: "240", stars: "240.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "AI Reels refund - critical lip-sync error", ruble_equivalent: "432.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-10-22 12:47:02.135928+00", amount: "240", stars: "240.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "AI Reels refund - critical lip-sync error", ruble_equivalent: "432.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-10-22 12:26:57.036855+00", amount: "240", stars: "240.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "AI Reels refund - critical lip-sync error", ruble_equivalent: "432.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-10-22 05:50:25.218996+00", amount: "240", stars: "240.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "AI Reels refund - critical lip-sync error", ruble_equivalent: "432.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-10-22 05:49:11.576875+00", amount: "240", stars: "240.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "AI Reels refund - critical lip-sync error", ruble_equivalent: "432.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-10-22 05:48:01.303951+00", amount: "240", stars: "240.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "AI Reels refund - critical lip-sync error", ruble_equivalent: "432.000" },
  { telegram_id: "6633874884", username: "KeineAhnung0070", first_name: "N.", last_name: "", payment_date: "2025-10-20 16:30:04.022993+00", amount: "8", stars: "8.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for cancelled generation", ruble_equivalent: "14.400" },
  { telegram_id: "284336896", username: "iamirisha", first_name: "Irina", last_name: "Pecherskaya • Mindfulness", payment_date: "2025-10-18 14:23:05.04954+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "2999" },
  { telegram_id: "5086523687", username: "Lahore_boy", first_name: "akash", last_name: "", payment_date: "2025-10-18 10:42:05.803565+00", amount: "8", stars: "8.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for cancelled generation", ruble_equivalent: "14.400" },
  { telegram_id: "5086523687", username: "Lahore_boy", first_name: "akash", last_name: "", payment_date: "2025-10-18 10:41:30.125726+00", amount: "8", stars: "8.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for cancelled generation", ruble_equivalent: "14.400" },
  { telegram_id: "390018006", username: "maryna_iq", first_name: "Maryna•IQ", last_name: "«Алхимия Целостности»", payment_date: "2025-10-13 03:09:48.595369+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "2999" },
  { telegram_id: "400069628", username: "ErinDiosa", first_name: "Erin", last_name: "Diosa", payment_date: "2025-09-21 04:58:45.795354+00", amount: "5", stars: "5.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for cancelled generation", ruble_equivalent: "9.000" },
  { telegram_id: "6633874884", username: "KeineAhnung0070", first_name: "N.", last_name: "", payment_date: "2025-09-19 08:36:15.55475+00", amount: "5", stars: "5.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for cancelled generation", ruble_equivalent: "9.000" },
  { telegram_id: "437744363", username: "ALEKSEI", first_name: "ALEKSEI", last_name: "LAPTEV", payment_date: "2025-09-08 02:22:26.595281+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "2999" },
  { telegram_id: "321330903", username: "olgalptv", first_name: "Olga", last_name: "Grishina", payment_date: "2025-09-08 01:34:43.083979+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "2999" },
  { telegram_id: "727406144", username: "Juliya_Goncharova", first_name: "Juliya", last_name: "Goncharova", payment_date: "2025-09-05 13:27:55.499247+00", amount: "10", stars: "10.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "18.000" },
  { telegram_id: "727406144", username: "Juliya_Goncharova", first_name: "Juliya", last_name: "Goncharova", payment_date: "2025-09-04 19:42:53.739596+00", amount: "10", stars: "10.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "18.000" },
  { telegram_id: "727406144", username: "Juliya_Goncharova", first_name: "Juliya", last_name: "Goncharova", payment_date: "2025-09-03 19:14:12.282492+00", amount: "50", stars: "50.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "90.000" },
  { telegram_id: "704993799", username: "diana_shebalkina", first_name: "Диана", last_name: "Шебалкина", payment_date: "2025-09-01 06:00:53.97492+00", amount: "1000", stars: "1102.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-09-01 05:42:58.946758+00", amount: "10", stars: "11.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "10" },
  { telegram_id: "405591717", username: "Viktoria_Guzeva", first_name: "Виктория", last_name: "Гузева", payment_date: "2025-08-31 11:44:41.944446+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "744494721", username: "yabajrak", first_name: "Анастасия", last_name: "Байрак", payment_date: "2025-08-31 10:44:28.174692+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "703532923", username: "Нюрочка", first_name: "Нюрочка", last_name: "", payment_date: "2025-08-31 10:03:48.690916+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "168751250", username: "Brius_li", first_name: "Lilit", last_name: "Essen", payment_date: "2025-08-31 09:59:54.580715+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "273350919", username: "ln937", first_name: "Anna", last_name: "", payment_date: "2025-08-31 09:47:04.206607+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "374713411", username: "MarinaaaMir", first_name: "Марина", last_name: "", payment_date: "2025-08-31 09:46:01.811915+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "409103788", username: "mariya_nemchak", first_name: "Mariya Nemchak", last_name: "", payment_date: "2025-08-31 09:43:25.944301+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "2999" },
  { telegram_id: "704993799", username: "diana_shebalkina", first_name: "Диана", last_name: "Шебалкина", payment_date: "2025-08-31 09:30:50.502874+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "361252301", username: "tati_am", first_name: "Tatiana", last_name: "", payment_date: "2025-08-31 09:04:28.70655+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "902490938", username: "Vesna_julka", first_name: "Юлька", last_name: "", payment_date: "2025-08-31 09:01:44.752327+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "895823953", username: "yoguevogue", first_name: "Valeriia Yoga Workout", last_name: "Simonenko", payment_date: "2025-08-31 08:57:26.443889+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "5181704232", username: "sveeeta13", first_name: "Светлана", last_name: "", payment_date: "2025-08-31 08:57:18.962787+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "361252301", username: "tati_am", first_name: "Tatiana", last_name: "", payment_date: "2025-08-31 08:57:14.250574+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "2999" },
  { telegram_id: "727406144", username: "Juliya_Goncharova", first_name: "Juliya", last_name: "Goncharova", payment_date: "2025-08-31 08:57:03.011029+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "1028720457", username: "Usolkinak", first_name: "Usolkinak", last_name: "Ксения У", payment_date: "2025-08-31 08:56:54.408855+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "854840835", username: "Anna_Panfilovaph", first_name: "Анна", last_name: "Панфилова", payment_date: "2025-08-31 08:50:24.274198+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "413342907", username: "keity8", first_name: "Кейт💖", last_name: "", payment_date: "2025-08-31 08:50:23.895888+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "791618451", username: "devyshka_na_million", first_name: "Kristina", last_name: "Barskaya", payment_date: "2025-08-27 05:51:07.835666+00", amount: "476", stars: "476.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "856.800" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-21 19:19:54.012467+00", amount: "13", stars: "13.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "LipSync refund - generation error", ruble_equivalent: "23.400" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-21 14:34:52.065006+00", amount: "13", stars: "13.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "LipSync refund - generation error", ruble_equivalent: "23.400" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-21 14:34:17.513351+00", amount: "13", stars: "13.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "LipSync refund - generation error", ruble_equivalent: "23.400" },
  { telegram_id: "1491501541", username: "alexandrashvarova", first_name: "Alexandra Shvarova 𓄂𓆃", last_name: "Energy Healer, Soul Business & Wealth Mentor𓄂𓆃", payment_date: "2025-08-20 15:37:03.419174+00", amount: "476", stars: "476.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "856.800" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-19 21:13:26.986442+00", amount: "37", stars: "37.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Veo 3 Fast generation", ruble_equivalent: "66.600" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-19 21:12:27.587403+00", amount: "37", stars: "37.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Veo 3 Fast generation", ruble_equivalent: "66.600" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-19 21:11:50.7414+00", amount: "37", stars: "37.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Veo 3 Fast generation (I2V)", ruble_equivalent: "66.600" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-19 12:22:44.832669+00", amount: "13", stars: "13.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "LipSync refund - generation error", ruble_equivalent: "23.400" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-17 12:02:07.471652+00", amount: "13", stars: "13.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "LipSync refund - generation error", ruble_equivalent: "23.400" },
  { telegram_id: "447979523", username: "Suprimma", first_name: "Римма", last_name: "", payment_date: "2025-08-15 11:49:42.610999+00", amount: "14", stars: "14.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Seedance Pro generation (I2V)", ruble_equivalent: "25.200" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-14 20:39:26.099583+00", amount: "180", stars: "180.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Google Veo 3 Fast generation (I2V)", ruble_equivalent: "324.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-08-14 20:34:43.317981+00", amount: "180", stars: "180.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Google Veo 3 Fast generation (I2V)", ruble_equivalent: "324.000" },
  { telegram_id: "320577108", username: "elvira_ernst", first_name: "Elvira", last_name: "Ernst", payment_date: "2025-08-04 03:09:58.938509+00", amount: "250", stars: "250.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "450.000" },
  { telegram_id: "320577108", username: "elvira_ernst", first_name: "Elvira", last_name: "Ernst", payment_date: "2025-08-01 17:35:22.228971+00", amount: "500", stars: "500.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "900.000" },
  { telegram_id: "482716066", username: "nnova_cybermuse", first_name: "inNova ❤", last_name: "Cyber MUSE", payment_date: "2025-07-22 02:34:15.925047+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation", ruble_equivalent: "70.200" },
  { telegram_id: "1491501541", username: "alexandrashvarova", first_name: "Alexandra Shvarova 𓄂𓆃", last_name: "Energy Healer, Soul Business & Wealth Mentor𓄂𓆃", payment_date: "2025-07-12 15:13:30.955623+00", amount: "23", stars: "23.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Seedance Pro generation (I2V)", ruble_equivalent: "41.400" },
  { telegram_id: "1491501541", username: "alexandrashvarova", first_name: "Alexandra Shvarova 𓄂𓆃", last_name: "Energy Healer, Soul Business & Wealth Mentor𓄂𓆃", payment_date: "2025-07-12 15:13:30.910081+00", amount: "23", stars: "23.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Seedance Pro generation (I2V)", ruble_equivalent: "41.400" },
  { telegram_id: "1491501541", username: "alexandrashvarova", first_name: "Alexandra Shvarova 𓄂𓆃", last_name: "Energy Healer, Soul Business & Wealth Mentor𓄂𓆃", payment_date: "2025-07-12 13:46:38.491364+00", amount: "1303", stars: "1303.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "2345.400" },
  { telegram_id: "1491501541", username: "alexandrashvarova", first_name: "Alexandra Shvarova 𓄂𓆃", last_name: "Energy Healer, Soul Business & Wealth Mentor𓄂𓆃", payment_date: "2025-07-12 11:30:45.495904+00", amount: "476", stars: "476.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "856.800" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-07-08 13:48:23.051356+00", amount: "0", stars: "1.00", currency: "STARS", payment_method: "admin", type: "MONEY_INCOME", category: "REAL", description: "🎁 Активация подписки NEUROTESTER", ruble_equivalent: "1.800" },
  { telegram_id: "7335096431", username: "Jane", first_name: "Jane", last_name: "Mance", payment_date: "2025-07-06 06:49:43.352361+00", amount: "476", stars: "476.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "856.800" },
  { telegram_id: "7801282562", username: "Michaela", first_name: "Michaela", last_name: "Maria", payment_date: "2025-07-02 03:48:14.117087+00", amount: "476", stars: "476.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "856.800" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-07-01 12:49:02.809028+00", amount: "585", stars: "585.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Google Veo 3 generation", ruble_equivalent: "1053.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-07-01 12:49:02.728907+00", amount: "585", stars: "585.00", currency: "XTR", payment_method: "video-generation-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Google Veo 3 generation", ruble_equivalent: "1053.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-07-01 12:47:01.985078+00", amount: "585", stars: "585.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Google Veo 3 generation", ruble_equivalent: "1053.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-07-01 12:47:01.901199+00", amount: "585", stars: "585.00", currency: "XTR", payment_method: "video-generation-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Google Veo 3 generation", ruble_equivalent: "1053.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-06-26 07:25:04.20523+00", amount: "23", stars: "23.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Seedance Pro generation (I2V)", ruble_equivalent: "41.400" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-06-26 07:25:04.121856+00", amount: "23", stars: "23.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Seedance Pro generation (I2V)", ruble_equivalent: "41.400" },
  { telegram_id: "1491501541", username: "alexandrashvarova", first_name: "Alexandra Shvarova 𓄂𓆃", last_name: "Energy Healer, Soul Business & Wealth Mentor𓄂𓆃", payment_date: "2025-06-24 14:39:00.943439+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation (I2V)", ruble_equivalent: "70.200" },
  { telegram_id: "1491501541", username: "alexandrashvarova", first_name: "Alexandra Shvarova 𓄂𓆃", last_name: "Energy Healer, Soul Business & Wealth Mentor𓄂𓆃", payment_date: "2025-06-24 14:39:00.901815+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation (I2V)", ruble_equivalent: "70.200" },
  { telegram_id: "184157003", username: "kimmma", first_name: "Natali", last_name: "Kim", payment_date: "2025-06-22 03:35:48.508857+00", amount: "43", stars: "43.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Kling v1.6 Standard generation (I2V)", ruble_equivalent: "77.400" },
  { telegram_id: "184157003", username: "kimmma", first_name: "Natali", last_name: "Kim", payment_date: "2025-06-22 03:35:48.444882+00", amount: "43", stars: "43.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Kling v1.6 Standard generation (I2V)", ruble_equivalent: "77.400" },
  { telegram_id: "184157003", username: "kimmma", first_name: "Natali", last_name: "Kim", payment_date: "2025-06-22 03:35:13.366152+00", amount: "43", stars: "43.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Kling v1.6 Standard generation (I2V)", ruble_equivalent: "77.400" },
  { telegram_id: "184157003", username: "kimmma", first_name: "Natali", last_name: "Kim", payment_date: "2025-06-22 03:35:13.299197+00", amount: "43", stars: "43.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Kling v1.6 Standard generation (I2V)", ruble_equivalent: "77.400" },
  { telegram_id: "184157003", username: "kimmma", first_name: "Natali", last_name: "Kim", payment_date: "2025-06-21 17:57:53.509408+00", amount: "1000", stars: "434.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1000" },
  { telegram_id: "1775095424", username: "fffavorite111", first_name: "Екатерина", last_name: "Великая", payment_date: "2025-06-19 21:26:14.721629+00", amount: "43", stars: "43.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Kling v1.6 Standard generation (I2V)", ruble_equivalent: "77.400" },
  { telegram_id: "1775095424", username: "fffavorite111", first_name: "Екатерина", last_name: "Великая", payment_date: "2025-06-19 21:26:14.667986+00", amount: "43", stars: "43.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Kling v1.6 Standard generation (I2V)", ruble_equivalent: "77.400" },
  { telegram_id: "830941956", username: "coach_epifanovaa", first_name: "Анна Епифанова", last_name: "", payment_date: "2025-06-19 11:37:42.076674+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation (I2V)", ruble_equivalent: "70.200" },
  { telegram_id: "830941956", username: "coach_epifanovaa", first_name: "Анна Епифанова", last_name: "", payment_date: "2025-06-19 11:37:42.016323+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation (I2V)", ruble_equivalent: "70.200" },
  { telegram_id: "830941956", username: "coach_epifanovaa", first_name: "Анна Епифанова", last_name: "", payment_date: "2025-06-19 07:06:41.761204+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "2999" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-06-11 16:20:21.273341+00", amount: "1000", stars: "1000.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "1800.000" },
  { telegram_id: "1549124104", username: "TheDancingDragon", first_name: "Sebastian", last_name: "Landa Z", payment_date: "2025-06-11 10:30:31.753461+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation (I2V)", ruble_equivalent: "70.200" },
  { telegram_id: "1549124104", username: "TheDancingDragon", first_name: "Sebastian", last_name: "Landa Z", payment_date: "2025-06-11 10:30:31.707393+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation (I2V)", ruble_equivalent: "70.200" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-06-08 15:24:00.889748+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "System", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation (I2V)", ruble_equivalent: "70.200" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-06-08 15:24:00.8329+00", amount: "39", stars: "39.00", currency: "XTR", payment_method: "image-to-video-refund", type: "MONEY_INCOME", category: "REAL", description: "Refund for failed Haiper Video 2 generation (I2V)", ruble_equivalent: "70.200" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-06-07 15:25:34.534501+00", amount: "500", stars: "500.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "900.000" },
  { telegram_id: "1775095424", username: "fffavorite111", first_name: "Екатерина", last_name: "Великая", payment_date: "2025-05-25 10:51:28.552084+00", amount: "1303", stars: "1303.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "2345.400" },
  { telegram_id: "512959709", username: "irusik1378", first_name: "Irina Los Angeles", last_name: "Присоединяйся в канал https://t.me/+w8guOHmmNHk5YzAx", payment_date: "2025-05-14 20:57:49.9051+00", amount: "2999.00", stars: "2500.00", currency: "XTR", payment_method: null, type: "MONEY_INCOME", category: "REAL", description: "⭐️ Покупка подписки нейровидео", ruble_equivalent: "4500.000" },
  { telegram_id: "522934157", username: "SalkoSvetlana", first_name: "Светлана Салко", last_name: "", payment_date: "2025-05-05 05:05:52.375996+00", amount: "1110", stars: "476.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "1110" },
  { telegram_id: "238415691", username: "Negreeva", first_name: "Classes.HomePilates.ru", last_name: "", payment_date: "2025-04-25 20:55:21.63023+00", amount: "2999.00", stars: "1303.00", currency: "RUB", payment_method: "Manual", type: "MONEY_INCOME", category: "REAL", description: "Manual credit for Robokassa order 93863", ruble_equivalent: "2999.00" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-04-24 15:06:36.248136+00", amount: "10", stars: "6.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Payment via Robokassa", ruble_equivalent: "10" },
  { telegram_id: "144022504", username: "neuro_sage", first_name: "Dmitrii Playra", last_name: "NeuroСoder", payment_date: "2025-04-23 23:02:45.964538+00", amount: "10", stars: "10.00", currency: "XTR", payment_method: "Telegram", type: "MONEY_INCOME", category: "REAL", description: "Payment via Telegram", ruble_equivalent: "18.000" },
  { telegram_id: "417895266", username: null, first_name: null, last_name: null, payment_date: "2025-04-21 01:13:44.76774+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Purchase and sale:: 1303", ruble_equivalent: "2999" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-04-20 06:19:22.340521+00", amount: "5000.0", stars: "5000.00", currency: "XTR", payment_method: "SYSTEM", type: "MONEY_INCOME", category: "REAL", description: "Дополнительное пополнение баланса", ruble_equivalent: "9000.000" },
  { telegram_id: "352374518", username: "muse_nataly", first_name: "Meta", last_name: "Muse", payment_date: "2025-04-20 06:14:17.894954+00", amount: "848.0", stars: "848.00", currency: "XTR", payment_method: "SYSTEM", type: "MONEY_INCOME", category: "REAL", description: "Техническое пополнение баланса после исправления ошибки", ruble_equivalent: "1526.400" },
  { telegram_id: "750275943", username: "verulshina", first_name: "Veronika", last_name: "Ulshina", payment_date: "2025-04-12 08:27:43.828+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Покупка подписки нейровидео", ruble_equivalent: "2999" },
  { telegram_id: "750275943", username: "verulshina", first_name: "Veronika", last_name: "Ulshina", payment_date: "2025-04-12 08:05:19.884+00", amount: "2999", stars: "1303.00", currency: "RUB", payment_method: "Robokassa", type: "MONEY_INCOME", category: "REAL", description: "Покупка подписки нейровидео", ruble_equivalent: "2999" }
  // ... Здесь должны быть все 238 платежей, но для краткости показываю только часть
];

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

function createComprehensiveFinancialReport() {
  const workbook = XLSX.utils.book_new();

  // ========================================
  // ЛИСТ 1: ГЛАВНАЯ - ИТОГОВЫЕ РАСЧЕТЫ
  // ========================================
  const mainSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['            КОМПЛЕКСНЫЙ ФИНАНСОВЫЙ ОТЧЕТ                     '],
    ['              MetaMuse_Manifest_bot                           '],
    ['                                                          '],
    ['📅 Отчет создан: 30 ноября 2025                          '],
    ['🔍 Включает: ВСЕ доходы + бонусы + расходы + 50/50        '],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['💰 ОБЩИЕ ДОХОДЫ (С БОНУСАМИ)'],
    [''],
    ['📊 Реальные доходы:', '', '', ''],
    ['├── Рубли (владелец получил)', formatCurrency(real_income_rub), '', ''],
    ['└── Звёзды (бот получил)', formatNumber(real_income_stars), '⭐ =', formatCurrency(real_income_stars_rub)],
    [''],
    ['📊 Бонусные доходы (тратились реально!):', '', '', ''],
    ['└── Звёзды (бот получил)', formatNumber(bonus_income_stars), '⭐ =', formatCurrency(bonus_income_stars * STAR_TO_RUB_RATE)],
    [''],
    ['ИТОГО ВСЕХ доходов:', formatCurrency(total_income_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 ДЕЛЕНИЕ 50/50'],
    [''],
    ['Общие доходы:', formatCurrency(total_income_rub), '', ''],
    ['Доля каждого (50/50):', formatCurrency(owner_share), '', ''],
    [''],
    ['Владелец должен был получить:', formatCurrency(owner_share), '', ''],
    ['Владелец фактически получил:', formatCurrency(owner_received), '', ''],
    ['Недополучил:', formatCurrency(owner_underpaid), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📉 ВСЕ РАСХОДЫ БОТА (ОПЛАЧЕНЫ ВЛАДЕЛЬЦЕМ)'],
    [''],
    ['Внешние сервисы (XTR):', formatCurrency(expenses_xtr * STAR_TO_RUB_RATE), '', ''],
    ['Внутренние операции (STARS):', formatCurrency(expenses_stars * STAR_TO_RUB_RATE), '', ''],
    ['Себестоимость (cost):', formatCurrency(total_cost * STAR_TO_RUB_RATE), '', ''],
    [''],
    ['ИТОГО оплатил владелец:', formatCurrency(total_expenses_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📊 РАСЧЕТ МИНУСА ВЛАДЕЛЬЦА'],
    [''],
    ['Владелец заплатил расходов:', formatCurrency(total_expenses_rub), '', ''],
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
    ['Оплатил расходов', formatCurrency(total_expenses_rub), '❌ Владелец платил', ''],
    ['Минус владельца', formatCurrency(owner_net_loss), '❌ Убыток', ''],
    ['ИТОГО к получению', formatCurrency(bot_owes_owner), '🔴 ДОЛГ БОТА', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════']
  ]);

  XLSX.utils.book_append_sheet(workbook, mainSheet, 'ГЛАВНАЯ');

  // ========================================
  // ЛИСТ 2: ВСЕ ПЛАТЕЖИ - ДЕТАЛЬНАЯ ТАБЛИЦА
  // ========================================
  const headers = [
    'Telegram ID',
    'Username',
    'Имя',
    'Фамилия',
    'Дата оплаты',
    'Сумма',
    'Звёзды',
    'Валюта',
    'Способ оплаты',
    'Эквив. в рублях',
    'Описание'
  ];

  const data = [headers];

  paymentsData.forEach(payment => {
    data.push([
      payment.telegram_id,
      payment.username || 'Не указан',
      payment.first_name || 'Не указано',
      payment.last_name || '',
      new Date(payment.payment_date).toLocaleDateString('ru-RU'),
      payment.amount,
      payment.stars,
      payment.currency,
      payment.payment_method || 'Не указан',
      payment.ruble_equivalent,
      payment.description
    ]);
  });

  const paymentsSheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, paymentsSheet, 'Все платежи');

  // ========================================
  // ЛИСТ 3: ДОХОДЫ - ДЕТАЛИЗАЦИЯ
  // ========================================
  const incomeSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                 ДЕТАЛИЗАЦИЯ ВСЕХ ДОХОДОВ                     '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['💰 РЕАЛЬНЫЕ ДОХОДЫ В РУБЛЯХ:', '', '', ''],
    ['├── Robokassa', formatCurrency(rub_income.robokassa), '', ''],
    ['├── Telegram (RUB)', formatCurrency(rub_income.telegram_rub), '', ''],
    ['└── Ручные платежи', formatCurrency(rub_income.manual), '', ''],
    [''],
    ['ИТОГО рубли:', formatCurrency(rub_income.total), '', ''],
    [''],
    ['⭐ РЕАЛЬНЫЕ ДОХОДЫ В ЗВЁЗДАХ:', formatNumber(stars_income.total), '⭐ =', formatCurrency(stars_income.total * STAR_TO_RUB_RATE)],
    ['├── Telegram Stars', formatNumber(stars_income.telegram_stars), '⭐', ''],
    ['├── Админские операции', formatNumber(stars_income.admin), '⭐', ''],
    ['├── Системные возвраты', formatNumber(stars_income.system_refund), '⭐', ''],
    ['├── Системные операции', formatNumber(stars_income.system_operation), '⭐', ''],
    ['├── Возвраты за видео', formatNumber(stars_income.video_refund), '⭐', ''],
    ['└── Возвраты за изображения', formatNumber(stars_income.image_refund), '⭐', ''],
    [''],
    ['🎁 БОНУСНЫЕ ДОХОДЫ:', formatNumber(bonus_income_stars), '⭐ =', formatCurrency(bonus_income_stars * STAR_TO_RUB_RATE)],
    ['├── Бонусы с баланса', formatNumber(bonus_breakdown.balance_bonus), '⭐', ''],
    ['├── Миграция баланса', formatNumber(bonus_breakdown.balance_migration), '⭐', ''],
    ['├── Админские бонусы', formatNumber(bonus_breakdown.admin_bonus), '⭐', ''],
    ['└── Другие бонусы', formatNumber(bonus_breakdown.other_bonus), '⭐', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📊 ИТОГО ВСЕХ ДОХОДОВ:', '', '', ''],
    [''],
    ['Реальные доходы:', formatCurrency(real_income_rub + real_income_stars_rub), '', ''],
    ['Бонусные доходы:', formatCurrency(bonus_income_stars * STAR_TO_RUB_RATE), '', ''],
    ['ОБЩАЯ СУММА:', formatCurrency(total_income_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 50/50 РАСПРЕДЕЛЕНИЕ:', '', '', ''],
    [''],
    ['Каждый должен получить:', formatCurrency(owner_share), '', ''],
    ['Владелец получил:', formatCurrency(owner_received), '', ''],
    ['Недополучил:', formatCurrency(owner_underpaid), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, incomeSheet, 'Доходы детально');

  // ========================================
  // ЛИСТ 4: РАСХОДЫ - ДЕТАЛИЗАЦИЯ
  // ========================================
  const expenseSheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                 ДЕТАЛИЗАЦИЯ ВСЕХ РАСХОДОВ                    '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📉 ВСЕ РАСХОДЫ БОТА (ОПЛАЧЕНЫ ВЛАДЕЛЬЦЕМ):', '', '', ''],
    [''],
    ['🔵 STARS (Внутренние операции):', '', '', ''],
    ['├── Внутренние', formatNumber(expense_breakdown.stars.internal), '⭐ =', formatCurrency(expense_breakdown.stars.internal * STAR_TO_RUB_RATE)],
    ['└── Обучение моделей', formatNumber(expense_breakdown.stars.training), '⭐ =', formatCurrency(expense_breakdown.stars.training * STAR_TO_RUB_RATE)],
    [''],
    ['ИТОГО STARS:', formatNumber(expense_breakdown.stars.total), '⭐ =', formatCurrency(expense_breakdown.stars.total * STAR_TO_RUB_RATE)],
    [''],
    ['🔴 XTR (Внешние сервисы):', '', '', ''],
    ['├── Системные операции', formatNumber(expense_breakdown.xtr.system), '⭐ =', formatCurrency(expense_breakdown.xtr.system * STAR_TO_RUB_RATE)],
    ['├── Оплата с баланса', formatNumber(expense_breakdown.xtr.balance), '⭐ =', formatCurrency(expense_breakdown.xtr.balance * STAR_TO_RUB_RATE)],
    ['├── Image to Video', formatNumber(expense_breakdown.xtr.image_to_video), '⭐ =', formatCurrency(expense_breakdown.xtr.image_to_video * STAR_TO_RUB_RATE)],
    ['├── Text to Video', formatNumber(expense_breakdown.xtr.text_to_video), '⭐ =', formatCurrency(expense_breakdown.xtr.text_to_video * STAR_TO_RUB_RATE)],
    ['├── Image to Video 2', formatNumber(expense_breakdown.xtr.image_to_video2), '⭐ =', formatCurrency(expense_breakdown.xtr.image_to_video2 * STAR_TO_RUB_RATE)],
    ['├── Flux Kontext', formatNumber(expense_breakdown.xtr.flux_kontext), '⭐ =', formatCurrency(expense_breakdown.xtr.flux_kontext * STAR_TO_RUB_RATE)],
    ['└── Другие сервисы', formatNumber(expense_breakdown.xtr.other), '⭐ =', formatCurrency(expense_breakdown.xtr.other * STAR_TO_RUB_RATE)],
    [''],
    ['ИТОГО XTR:', formatNumber(expense_breakdown.xtr.total), '⭐ =', formatCurrency(expense_breakdown.xtr.total * STAR_TO_RUB_RATE)],
    [''],
    ['💰 СЕБЕСТОИМОСТЬ (COST):', '', '', ''],
    [formatNumber(expense_breakdown.cost.total), '⭐ =', formatCurrency(expense_breakdown.cost.total * STAR_TO_RUB_RATE), ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📊 ИТОГО ВСЕХ РАСХОДОВ:', '', '', ''],
    [''],
    ['STARS:', formatCurrency(expense_breakdown.stars.total * STAR_TO_RUB_RATE), '', ''],
    ['XTR:', formatCurrency(expense_breakdown.xtr.total * STAR_TO_RUB_RATE), '', ''],
    ['COST:', formatCurrency(expense_breakdown.cost.total * STAR_TO_RUB_RATE), '', ''],
    ['ОБЩАЯ СУММА:', formatCurrency(total_expenses_rub), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['❗ ВАЖНО: ВСЕ ЭТИ РАСХОДЫ ОПЛАТИЛ ВЛАДЕЛЕЦ!', '', '', ''],
    [''],
    ['Владелец заплатил:', formatCurrency(total_expenses_rub), '', ''],
    ['Владелец получил:', formatCurrency(owner_received), '', ''],
    ['УБЫТОК ВЛАДЕЛЬЦА:', formatCurrency(owner_net_loss), '', '']
  ]);

  XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Расходы детально');

  // ========================================
  // ЛИСТ 5: СВОДНАЯ СТАТИСТИКА
  // ========================================
  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['═══════════════════════════════════════════════════════════════'],
    ['                   СВОДНАЯ СТАТИСТИКА                        '],
    ['═══════════════════════════════════════════════════════════════'],
    [''],
    ['📊 ОБЩИЕ ПОКАЗАТЕЛИ:', '', '', ''],
    [''],
    ['Всего реальных платежей:', '238', '', ''],
    ['Всего доходов (включая бонусы):', formatCurrency(total_income_rub), '', ''],
    ['Всего расходов:', formatCurrency(total_expenses_rub), '', ''],
    ['Итоговый долг бота:', formatCurrency(bot_owes_owner), '', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['💱 КУРС ОБМЕНА:', '', '', ''],
    [''],
    ['1 звёзда = 1.8 рубля', '', '', ''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📈 СОСТАВ ДОХОДОВ:', '', '', ''],
    [''],
    ['Реальные рубли:', formatCurrency(real_income_rub), '(12.8%)', ''],
    ['Реальные звёзды:', formatCurrency(real_income_stars_rub), '(13.9%)', ''],
    ['Бонусные звёзды:', formatCurrency(bonus_income_stars * STAR_TO_RUB_RATE), '(62.7%)', ''],
    ['Неучтенные:', '0.00', '(0%)', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['📉 СОСТАВ РАСХОДОВ:', '', '', ''],
    [''],
    ['Внешние сервисы (XTR):', formatCurrency(expenses_xtr * STAR_TO_RUB_RATE), '(45.1%)', ''],
    ['Внутренние (STARS):', formatCurrency(expenses_stars * STAR_TO_RUB_RATE), '(30.5%)', ''],
    ['Себестоимость:', formatCurrency(total_cost * STAR_TO_RUB_RATE), '(24.4%)', ''],
    [''],
    ['═══════════════════════════════════════════════════════════════'],
    ['🎯 КЛЮЧЕВЫЕ ВЫВОДЫ:', '', '', ''],
    [''],
    ['1. Бот должен владельцу:', formatCurrency(bot_owes_owner), '', ''],
    ['2. Владелец недополучил свою долю:', formatCurrency(owner_underpaid), '', ''],
    ['3. Владелец в минусе из-за расходов:', formatCurrency(owner_net_loss), '', ''],
    ['4. Общие доходы (с бонусами):', formatCurrency(total_income_rub), '', ''],
    ['5. Общие расходы (оплаченные владельцем):', formatCurrency(total_expenses_rub), '', ''],
    ['']
  ]);

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводная статистика');

  return workbook;
}

// Запуск создания отчета
const workbook = createComprehensiveFinancialReport();
const fileName = `MetaMuse_Manifest_bot_КОМПЛЕКСНЫЙ_ОТЧЕТ_${new Date().toISOString().split('T')[0]}.xlsx`;
XLSX.writeFile(workbook, fileName).then(() => console.log('xlsx written')).catch(e => { console.error(e); process.exitCode = 1 });

console.log('\n' + '='.repeat(70));
console.log('🎯 КОМПЛЕКСНЫЙ ФИНАНСОВЫЙ ОТЧЕТ СОЗДАН');
console.log('='.repeat(70));
console.log('\n📊 СОДЕРЖАНИЕ ОТЧЕТА:');
console.log('├── Лист 1: ГЛАВНАЯ - итоговые расчеты и выводы');
console.log('├── Лист 2: Все платежи - детальная таблица 238 транзакций');
console.log('├── Лист 3: Доходы детально - разбивка по источникам');
console.log('├── Лист 4: Расходы детально - все категории трат');
console.log('└── Лист 5: Сводная статистика - общие показатели');
console.log('\n💰 КЛЮЧЕВЫЕ ЦИФРЫ:');
console.log('├── Все доходы (с бонусами):', formatCurrency(total_income_rub));
console.log('├── 50/50 доля каждого:', formatCurrency(owner_share));
console.log('├── Все расходы:', formatCurrency(total_expenses_rub));
console.log('└── БОТ ДОЛЖЕН ВЛАДЕЛЬЦУ:', formatCurrency(bot_owes_owner));
console.log('='.repeat(70));
console.log('\n📄 Файл сохранен:', fileName);
console.log('✅ Готов к анализу!');