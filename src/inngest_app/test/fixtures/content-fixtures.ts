/**
 * CONTENT FUNCTIONS FIXTURES
 *
 * Тестовые данные для content функций:
 * - analyzeCompetitorReels
 * - extractTopContent
 * - findCompetitors
 * - generateContentScripts
 * - generateDetailedScript
 * - generateScenarioClips
 */

export const analyzeCompetitorReelsData = {
  valid_with_competitor: {
    telegram_id: '123456789',
    competitor_url: 'https://instagram.com/competitor',
    analysis_depth: 'basic',
    include_metrics: true,
  },

  valid_advanced: {
    telegram_id: '123456789',
    competitor_url: 'https://instagram.com/top_competitor',
    analysis_depth: 'deep',
    include_metrics: true,
    include_hashtags: true,
    include_music: true,
    limit: 50,
  },

  invalid_url: {
    telegram_id: '123456789',
    competitor_url: '',
    analysis_depth: 'basic',
  },
}

export const extractTopContentData = {
  valid_basic: {
    telegram_id: '123456789',
    hashtags: ['#travel', '#nature'],
    content_type: 'video',
    limit: 20,
  },

  valid_advanced: {
    telegram_id: '123456789',
    hashtags: ['#food', '#recipe', '#cooking'],
    content_type: 'image',
    limit: 100,
    min_likes: 1000,
    region: 'ru',
    language: 'ru',
  },

  invalid_hashtags: {
    telegram_id: '123456789',
    hashtags: [],
    content_type: 'video',
  },
}

export const findCompetitorsData = {
  valid_niche: {
    telegram_id: '123456789',
    niche: 'fitness',
    region: 'ru',
    limit: 10,
  },

  valid_keyword: {
    telegram_id: '123456789',
    keyword: 'йога',
    region: 'ru',
    limit: 15,
  },

  invalid_niche: {
    telegram_id: '123456789',
    niche: '',
    region: 'ru',
  },
}

export const generateContentScriptsData = {
  valid_trending: {
    telegram_id: '123456789',
    topic: 'health',
    script_count: 5,
    duration: 30,
    style: 'engaging',
  },

  valid_custom: {
    telegram_id: '123456789',
    topic: 'cooking',
    script_count: 10,
    duration: 60,
    style: 'educational',
    tone: 'friendly',
    include_hashtags: true,
  },

  invalid_topic: {
    telegram_id: '123456789',
    topic: '',
    script_count: 5,
    duration: 30,
  },
}

export const generateDetailedScriptData = {
  valid_complete: {
    telegram_id: '123456789',
    brief: 'Создать видео о пользе здорового питания',
    duration: 60,
    style: 'informative',
    target_audience: 'adults',
    include_visuals: true,
    include_music: true,
  },

  valid_minimal: {
    telegram_id: '123456789',
    brief: 'Короткое видео о тренировках',
    duration: 30,
  },

  invalid_brief: {
    telegram_id: '123456789',
    brief: '',
    duration: 60,
  },
}

export const generateScenarioClipsData = {
  valid_full_scenario: {
    telegram_id: '123456789',
    scenario_id: 'scenario_123',
    clip_count: 5,
    transition_style: 'smooth',
  },

  valid_custom: {
    telegram_id: '123456789',
    scenario_id: 'scenario_456',
    clip_count: 10,
    transition_style: 'dynamic',
    include_effects: true,
    include_text_overlay: true,
  },

  invalid_scenario: {
    telegram_id: '123456789',
    scenario_id: '',
    clip_count: 5,
  },
}

export const contentExpectedResults = {
  success_analysis: {
    success: true,
    competitor: 'competitor',
    reels_analyzed: 10,
    average_engagement: 5.2,
    top_hashtags: ['#hashtag1', '#hashtag2'],
  },

  success_extraction: {
    success: true,
    content_found: 20,
    top_content: [
      {
        url: 'https://example.com/video1',
        likes: 5000,
        hashtags: ['#hashtag1'],
      },
    ],
  },

  success_competitors: {
    success: true,
    competitors_found: 10,
    competitors: [
      {
        username: 'competitor1',
        followers: 100000,
        engagement_rate: 4.5,
      },
    ],
  },

  success_scripts: {
    success: true,
    scripts_generated: 5,
    scripts: [
      {
        id: 'script_1',
        title: 'Script Title',
        content: 'Script content...',
        duration: 30,
      },
    ],
  },

  success_detailed_script: {
    success: true,
    script_id: 'script_detailed_123',
    title: 'Detailed Script',
    scenes: [
      {
        scene_number: 1,
        description: 'Scene description',
        duration: 10,
        visuals: 'Visual description',
      },
    ],
  },

  success_scenario_clips: {
    success: true,
    clips_generated: 5,
    clips: [
      {
        clip_id: 'clip_1',
        start_time: 0,
        end_time: 10,
        description: 'Clip description',
      },
    ],
  },

  error_invalid_input: {
    success: false,
    error: 'Invalid input data',
  },
}

export const contentErrors = {
  competitor_not_found: {
    code: 'COMPETITOR_NOT_FOUND',
    message: 'Конкурент не найден',
  },

  no_content_found: {
    code: 'NO_CONTENT_FOUND',
    message: 'Контент не найден',
  },

  invalid_hashtag: {
    code: 'INVALID_HASHTAG',
    message: 'Недействительный хештег',
  },

  script_generation_failed: {
    code: 'SCRIPT_GENERATION_FAILED',
    message: 'Ошибка генерации сценария',
  },

  scenario_not_found: {
    code: 'SCENARIO_NOT_FOUND',
    message: 'Сценарий не найден',
  },
}
