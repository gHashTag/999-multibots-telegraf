/**
 * Константы ботов для отчетности
 * Используется во всех скриптах отчетности
 */

module.exports = {
  /**
   * ПРОДАКШЕН боты - реальные боты с доходами
   */
  PRODUCTION_BOTS: [
    'neuro_blogger_bot',
    'MetaMuse_Manifest_bot',
    'HaimGroupMedia_bot',
    'AI_STARS_bot',
    'Gaia_Kamskaia_bot',
    'NeuroLenaAssistant_bot',
    'NeurostylistShtogrina_bot',
    'Kaya_easy_art_bot',
    'OM_AI_Digital_studio_bot',
    't27ai_bot'
  ],

  /**
   * ТЕСТОВЫЕ боты - для тестирования функционала
   * clip_maker_neuro_bot - основной тестовый бот по умолчанию
   */
  TEST_BOTS: [
    'clip_maker_neuro_bot',
    'ai_koshey_bot'
  ],

  /**
   * ФЕЙКОВЫЕ боты - исключаются из анализа
   * Включает: системные боты, админские, тестовые, дубликаты
   */
  FAKE_BOTS: [
    'admin_system',
    'admin_grant',
    'admin_script',
    'admin_cli',
    'admin_fix',
    'admin_unlimited',
    'diagnostic_test',
    'test_bot',
    'TestNeurocoder_bot',
    'vibecoder999',
    'VibeCoder999',
    'DAO999',
    'unknown_bot',
    'neuroblogger_bot',
    'neuroblogger',
    'vibecoding',
    'AnalyticsBot',
    'neuro-video-bot',
    'neuro_video_bot',
    'admin_unlimited',
    'system_recovery',
    'system_grant',
    'admin_fix',
    'mcp-server',
    'public_test',
    'webhook-test-bot',
    'neuro_coder_bot',
    'multibots',
    'helper_999_bot',
    'LeeSolarbot',
    'NeuroBloggerBot',
    'ZavaraBot'
  ],

  /**
   * ВСЕ боты для анализа (продакшн + тестовые)
   */
  ALL_ANALYSIS_BOTS: [
    'neuro_blogger_bot',
    'MetaMuse_Manifest_bot',
    'HaimGroupMedia_bot',
    'AI_STARS_bot',
    'Gaia_Kamskaia_bot',
    'NeuroLenaAssistant_bot',
    'NeurostylistShtogrina_bot',
    'Kaya_easy_art_bot',
    'OM_AI_Digital_studio_bot',
    't27ai_bot',
    'ai_koshey_bot',
    'clip_maker_neuro_bot'
  ],

  /**
   * Реальные методы оплаты (учитываются в доходах)
   */
  REAL_PAYMENT_METHODS: ['Telegram', 'Robokassa'],

  /**
   * Фейковые методы STARS (исключаются из анализа)
   */
  FAKE_STARS_METHODS: ['System', 'SYSTEM', 'admin', 'Admin', 'balance', ''],

  /**
   * Все фейковые методы (исключаются)
   */
  FAKE_PAYMENT_METHODS: [
    'SYSTEM',
    'Internal',
    'balance',
    'text_to_image',
    'image-to-video',
    'System_Balance_Migration',
    'image_to_video',
    'unknown_mode',
    'flux_kontext',
    'image_to_image',
    'video_to_image',
    'text_to_video',
    'Manual',
    'Tester_Bonus',
    'System_Operation',
    'Admin',
    'admin',
    'video-generation-refund',
    'image-to-video-refund',
    'bank_card',
    'system_grant',
    'system_recovery',
    'admin_cli',
    'admin_fix',
    'admin_unlimited',
    'mcp-server',
    'public_test',
    'webhook-test-bot'
  ]
};
