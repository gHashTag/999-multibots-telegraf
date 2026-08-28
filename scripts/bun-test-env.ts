/**
 * Детерминированное окружение для `bun test`.
 *
 * ЗАЧЕМ. Без этих переменных тесты падали не из-за кода: визард оплаты
 * обрывался конфиг-ошибкой, не дойдя до проверяемой логики, генератор
 * изображений — тем же, а провайдер lip-sync бросал «KIE_AI_API_KEY is not
 * set» ещё на входе. Прогон измерял, лежит ли у запускающего рабочий .env,
 * а не поведение кода.
 *
 * Значения заведомо нерабочие: тест, который дойдёт с ними до реального
 * вызова, обязан упасть, а не молча сходить в прод. Реальное значение из
 * окружения имеет приоритет — интеграционные прогоны не ломаются.
 *
 * Раньше это же лежало одной строкой в скрипте test:bun; в package.json
 * нельзя поставить комментарий, поэтому пояснение и пометка для гварда
 * секретов жили негде.
 *
 * secret-guard-ok: заглушки для тестов, не секреты — ни одно значение не
 * даёт доступа ни к чему.
 */
const defaults: Record<string, string> = {
  SUPABASE_URL: 'TEST_URL',
  SUPABASE_SERVICE_KEY: 'TEST_KEY',
  MERCHANT_LOGIN: 'test_merchant',
  ROBOKASSA_PASSWORD_1: 'test_pass_1',
  ROBOKASSA_PASSWORD_2: 'test_pass_2',
  FAL_KEY: 'test_fal_key',
  KIE_AI_API_KEY: 'test_kie_key',
  ELEVENLABS_API_KEY: 'test_eleven_key',
}

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value
}
