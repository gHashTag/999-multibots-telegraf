/**
 * INSTAGRAM FUNCTIONS FIXTURES
 *
 * Тестовые данные для Instagram функций:
 * - instagramScraper-v2
 * - instagramScraper-v2-simple
 */

export const instagramScraperV2Data = {
  valid_profile: {
    telegram_id: '123456789',
    username: 'test_user',
    scrape_type: 'profile',
    limit: 50,
  },

  valid_hashtag: {
    telegram_id: '123456789',
    hashtag: 'travel',
    scrape_type: 'hashtag',
    limit: 100,
    min_likes: 1000,
  },

  valid_location: {
    telegram_id: '123456789',
    location_id: 'location_123',
    scrape_type: 'location',
    limit: 30,
  },

  invalid_username: {
    telegram_id: '123456789',
    username: '',
    scrape_type: 'profile',
  },
}

export const instagramScraperV2SimpleData = {
  valid_basic: {
    telegram_id: '123456789',
    url: 'https://instagram.com/test_user',
    include_metrics: true,
  },

  valid_with_hashtag: {
    telegram_id: '123456789',
    url: 'https://instagram.com/explore/tags/travel/',
    include_metrics: true,
    include_comments: false,
  },

  invalid_url: {
    telegram_id: '123456789',
    url: '',
    include_metrics: true,
  },
}

export const instagramExpectedResults = {
  success_profile_scrape: {
    success: true,
    posts_found: 50,
    profile_info: {
      username: 'test_user',
      followers: 10000,
      following: 500,
      posts_count: 250,
    },
    posts: [
      {
        post_id: 'post_1',
        image_url: 'https://example.com/img1.jpg',
        likes: 500,
        comments: 25,
        caption: 'Post caption',
      },
    ],
  },

  success_hashtag_scrape: {
    success: true,
    posts_found: 100,
    hashtag: 'travel',
    posts: [
      {
        post_id: 'post_2',
        image_url: 'https://example.com/img2.jpg',
        likes: 2000,
        comments: 50,
      },
    ],
  },

  error_profile_not_found: {
    success: false,
    error: 'Profile not found',
  },

  error_invalid_url: {
    success: false,
    error: 'Invalid Instagram URL',
  },
}

export const instagramErrors = {
  profile_not_found: {
    code: 'PROFILE_NOT_FOUND',
    message: 'Профиль не найден',
  },

  private_account: {
    code: 'PRIVATE_ACCOUNT',
    message: 'Приватный аккаунт',
  },

  rate_limited: {
    code: 'RATE_LIMITED',
    message: 'Превышен лимит запросов',
  },

  invalid_url: {
    code: 'INVALID_URL',
    message: 'Недействительная ссылка Instagram',
  },

  no_posts_found: {
    code: 'NO_POSTS_FOUND',
    message: 'Посты не найдены',
  },

  scraping_failed: {
    code: 'SCRAPING_FAILED',
    message: 'Ошибка скрапинга',
  },
}
