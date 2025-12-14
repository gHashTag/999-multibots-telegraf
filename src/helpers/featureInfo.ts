/**
 * 📚 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: Справка по платным функциям бота
 *
 * Этот файл содержит ВСЮ информацию о платных функциях:
 * - Названия (RU/EN)
 * - Подробные описания для новичков
 * - Пошаговые инструкции
 * - Примеры использования
 * - Советы для лучшего результата
 * - Стоимость в Stars
 *
 * Показывается пользователю ПЕРВЫЙ РАЗ при входе в функцию.
 */

import { ModeEnum } from '@/interfaces/modes'

export interface FeatureInfo {
  name: { ru: string; en: string }
  description: { ru: string; en: string }
  howItWorks?: { ru: string; en: string }
  examples?: { ru: string[]; en: string[] }
  tips?: { ru: string[]; en: string[] }
  minCost: number
  maxCost?: number
  isPaid: boolean
}

/**
 * 🎯 СПРАВОЧНАЯ ИНФОРМАЦИЯ ПО ВСЕМ ПЛАТНЫМ ФУНКЦИЯМ
 */
export const FEATURE_INFO: Partial<Record<ModeEnum, FeatureInfo>> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // 📸 ФОТО ФУНКЦИИ
  // ═══════════════════════════════════════════════════════════════════════════

  [ModeEnum.NeuroPhoto]: {
    name: { ru: '📸 Нейрофото', en: '📸 NeuroPhoto' },
    description: {
      ru: `Нейрофото — это технология создания реалистичных фотографий с вашим лицом в любых сценах и локациях.

Представьте: вы можете получить профессиональное фото на яхте в Монако, на вершине Эвереста или в космосе — и всё это без выхода из дома!

<b>Что для этого нужно:</b>
Сначала необходимо создать свой цифровой аватар (обучить модель на ваших фотографиях). После этого вы сможете генерировать неограниченное количество фотографий с собой.

<b>Если у вас ещё нет аватара</b> — сначала перейдите в раздел "🤖 Цифровой аватар" и создайте его.`,

      en: `NeuroPhoto is a technology for creating realistic photos with your face in any scene or location.

Imagine: you can get a professional photo on a yacht in Monaco, on top of Everest, or in space — all without leaving your home!

<b>What you need:</b>
First, you need to create your digital avatar (train a model on your photos). After that, you can generate unlimited photos with yourself.

<b>If you don't have an avatar yet</b> — first go to "🤖 Digital Avatar" section and create one.`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Напишите текстовое описание желаемой сцены
<b>Шаг 2:</b> Дождитесь генерации (30-60 секунд)
<b>Шаг 3:</b> Получите готовое фото и скачайте его

Чем подробнее вы опишете сцену — тем лучше будет результат!`,

      en: `<b>Step 1:</b> Write a text description of the desired scene
<b>Step 2:</b> Wait for generation (30-60 seconds)
<b>Step 3:</b> Get the finished photo and download it

The more detailed your description — the better the result!`,
    },
    examples: {
      ru: [
        '«Я на яхте в Монако, закат, в белой рубашке, ветер развевает волосы»',
        '«Я в деловом костюме на фоне небоскрёбов Нью-Йорка, дневное освещение»',
        '«Я на горнолыжном склоне в Альпах, в спортивной одежде, солнечная погода»',
        '«Я на красной дорожке Каннского фестиваля, вечернее платье/смокинг»',
      ],
      en: [
        '"Me on a yacht in Monaco, sunset, white shirt, wind in my hair"',
        '"Me in business suit with New York skyscrapers behind, daylight"',
        '"Me on ski slope in Alps, sportswear, sunny weather"',
        '"Me on Cannes Festival red carpet, evening dress/tuxedo"',
      ],
    },
    tips: {
      ru: [
        'Указывайте конкретные локации: не "на пляже", а "на пляже Мальдив с белым песком"',
        'Описывайте одежду и аксессуары для реалистичности',
        'Добавляйте время суток и освещение: "на закате", "в студийном свете"',
        'Указывайте позу и выражение лица: "улыбаюсь", "серьёзный взгляд"',
      ],
      en: [
        'Specify exact locations: not "on a beach" but "on a Maldives beach with white sand"',
        'Describe clothing and accessories for realism',
        'Add time of day and lighting: "at sunset", "studio lighting"',
        'Specify pose and expression: "smiling", "serious look"',
      ],
    },
    minCost: 6,
    isPaid: true,
  },

  [ModeEnum.TextToImage]: {
    name: { ru: '🎨 Генерация изображений', en: '🎨 Image Generation' },
    description: {
      ru: `Генерация изображений — создание любых картинок по текстовому описанию с помощью нейросети FLUX.

Вы просто описываете словами, что хотите увидеть, а искусственный интеллект рисует это для вас. Можно создать всё что угодно: от реалистичных фотографий до фантастических миров, от портретов до абстрактного искусства.

<b>Это НЕ требует вашего фото</b> — генерируются полностью новые изображения по вашему описанию.

<b>Для чего подходит:</b>
• Арт и иллюстрации для проектов
• Концепты для дизайна
• Контент для социальных сетей
• Визуализация идей
• Создание обложек и баннеров`,

      en: `Image Generation — creating any images from text descriptions using FLUX neural network.

You simply describe in words what you want to see, and artificial intelligence draws it for you. You can create anything: from realistic photos to fantasy worlds, from portraits to abstract art.

<b>This does NOT require your photo</b> — completely new images are generated based on your description.

<b>What it's good for:</b>
• Art and illustrations for projects
• Design concepts
• Social media content
• Idea visualization
• Creating covers and banners`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Напишите описание желаемого изображения на любом языке
<b>Шаг 2:</b> Выберите соотношение сторон (квадрат, вертикаль, горизонталь)
<b>Шаг 3:</b> Дождитесь генерации (20-40 секунд)
<b>Шаг 4:</b> Получите уникальное изображение в высоком разрешении`,

      en: `<b>Step 1:</b> Write a description of the desired image in any language
<b>Step 2:</b> Choose aspect ratio (square, vertical, horizontal)
<b>Step 3:</b> Wait for generation (20-40 seconds)
<b>Step 4:</b> Get a unique high-resolution image`,
    },
    examples: {
      ru: [
        '«Футуристический город с летающими машинами на закате, киберпанк стиль, 4K»',
        '«Реалистичный портрет кота в костюме космонавта на Луне»',
        '«Уютная кофейня в дождливый вечер, вид через витрину, тёплое освещение»',
        '«Волшебный лес с феями и светящимися грибами, фэнтези арт»',
        '«Минималистичный логотип для IT-компании, синий и белый цвета»',
      ],
      en: [
        '"Futuristic city with flying cars at sunset, cyberpunk style, 4K"',
        '"Realistic portrait of a cat in astronaut suit on the Moon"',
        '"Cozy coffee shop on rainy evening, view through window, warm lighting"',
        '"Magical forest with fairies and glowing mushrooms, fantasy art"',
        '"Minimalist logo for IT company, blue and white colors"',
      ],
    },
    tips: {
      ru: [
        'Добавляйте стиль: «в стиле Ghibli», «реалистичное фото», «акварель», «3D рендер»',
        'Указывайте качество: «4K», «высокая детализация», «кинематографичный»',
        'Описывайте композицию: «крупный план», «вид сверху», «панорама»',
        'Указывайте освещение: «закатный свет», «неоновое свечение», «мягкие тени»',
        'Чем длиннее и детальнее описание — тем точнее результат',
      ],
      en: [
        'Add style: "Ghibli style", "realistic photo", "watercolor", "3D render"',
        'Specify quality: "4K", "high detail", "cinematic"',
        'Describe composition: "close-up", "top view", "panorama"',
        'Specify lighting: "sunset light", "neon glow", "soft shadows"',
        'The longer and more detailed description — the more accurate result',
      ],
    },
    minCost: 6,
    isPaid: true,
  },

  [ModeEnum.ImageToPrompt]: {
    name: { ru: '🔍 Анализ изображения', en: '🔍 Image Analysis' },
    description: {
      ru: `Анализ изображения — искусственный интеллект изучает любую картинку и создаёт подробное текстовое описание (промпт).

<b>Зачем это нужно:</b>
• Вы увидели красивую картинку и хотите создать похожую — загрузите её и получите готовый промпт
• Хотите понять, как описать определённый стиль — загрузите пример и изучите описание
• Нужно создать вариации существующего изображения — получите промпт и модифицируйте его

<b>Как это работает:</b>
ИИ определяет объекты, стиль, композицию, освещение, цветовую палитру и другие детали изображения, а затем формулирует это в виде промпта, который можно использовать для генерации.`,

      en: `Image Analysis — artificial intelligence studies any picture and creates a detailed text description (prompt).

<b>Why you need this:</b>
• You saw a beautiful image and want to create similar — upload it and get a ready prompt
• Want to understand how to describe a certain style — upload an example and study the description
• Need to create variations of an existing image — get the prompt and modify it

<b>How it works:</b>
AI identifies objects, style, composition, lighting, color palette and other image details, then formulates it as a prompt that can be used for generation.`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Отправьте любое изображение боту (фото, скриншот, арт)
<b>Шаг 2:</b> Дождитесь анализа (10-20 секунд)
<b>Шаг 3:</b> Получите подробный промпт на английском языке
<b>Шаг 4:</b> Используйте этот промпт для генерации похожих изображений`,

      en: `<b>Step 1:</b> Send any image to the bot (photo, screenshot, art)
<b>Step 2:</b> Wait for analysis (10-20 seconds)
<b>Step 3:</b> Get a detailed prompt in English
<b>Step 4:</b> Use this prompt to generate similar images`,
    },
    tips: {
      ru: [
        'Загружайте качественные изображения для более точного анализа',
        'Полученный промпт можно редактировать — убирать ненужное и добавлять своё',
        'Анализ работает с любыми изображениями: фото, арт, скриншоты, логотипы',
      ],
      en: [
        'Upload quality images for more accurate analysis',
        'The resulting prompt can be edited — remove unnecessary and add your own',
        'Analysis works with any images: photos, art, screenshots, logos',
      ],
    },
    minCost: 2,
    isPaid: true,
  },

  [ModeEnum.ImageUpscaler]: {
    name: { ru: '🔎 Увеличение качества', en: '🔎 Image Upscaler' },
    description: {
      ru: `Увеличение качества — технология улучшения разрешения изображений с помощью ИИ.

<b>Что делает:</b>
• Увеличивает разрешение изображения до 4 раз (например, 512x512 → 2048x2048)
• Восстанавливает детали, которых не было видно
• Убирает размытие и шум
• Улучшает чёткость текстур
• Сохраняет естественный вид

<b>Для чего подходит:</b>
• Улучшение старых или размытых фотографий
• Подготовка изображений для печати
• Улучшение сгенерированных картинок
• Восстановление качества скриншотов
• Увеличение маленьких изображений для использования на сайтах`,

      en: `Image Upscaler — AI technology for improving image resolution.

<b>What it does:</b>
• Increases image resolution up to 4 times (e.g., 512x512 → 2048x2048)
• Restores details that weren't visible
• Removes blur and noise
• Improves texture sharpness
• Maintains natural look

<b>What it's good for:</b>
• Improving old or blurry photos
• Preparing images for printing
• Improving generated images
• Restoring screenshot quality
• Enlarging small images for website use`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Отправьте изображение, качество которого хотите улучшить
<b>Шаг 2:</b> Дождитесь обработки (30-60 секунд)
<b>Шаг 3:</b> Получите улучшенное изображение в высоком разрешении`,

      en: `<b>Step 1:</b> Send the image you want to improve
<b>Step 2:</b> Wait for processing (30-60 seconds)
<b>Step 3:</b> Get the improved high-resolution image`,
    },
    tips: {
      ru: [
        'Лучший результат для изображений, где есть что улучшать (размытые, маленькие)',
        'На очень качественных фото эффект будет минимальный',
        'Работает с любыми форматами: JPEG, PNG, WebP',
      ],
      en: [
        'Best results for images that need improvement (blurry, small)',
        'Effect will be minimal on already high-quality photos',
        'Works with any format: JPEG, PNG, WebP',
      ],
    },
    minCost: 3,
    isPaid: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎥 ВИДЕО ФУНКЦИИ
  // ═══════════════════════════════════════════════════════════════════════════

  [ModeEnum.TextToVideo]: {
    name: { ru: '🎥 Видео из текста', en: '🎥 Text to Video' },
    description: {
      ru: `Видео из текста — создание видеороликов 5-10 секунд по текстовому описанию.

Вы описываете сцену словами — нейросеть создаёт полноценное видео с движением. Это как "оживить" вашу фантазию!

<b>Доступные модели:</b>
• <b>Haiper</b> — быстро и бюджетно (38⭐), хорошо для простых сцен
• <b>Kling</b> — баланс качества и цены (69⭐), универсальный выбор
• <b>Minimax</b> — премиум качество (390⭐), кинематографический уровень

<b>Для чего подходит:</b>
• Рекламные ролики и промо
• Контент для TikTok, Reels, Shorts
• Визуализация идей для проектов
• Творческие и художественные проекты
• Видео-открытки и поздравления`,

      en: `Text to Video — creating 5-10 second video clips from text descriptions.

You describe a scene in words — the neural network creates a full video with motion. It's like "bringing your imagination to life"!

<b>Available models:</b>
• <b>Haiper</b> — fast and budget-friendly (38⭐), good for simple scenes
• <b>Kling</b> — balance of quality and price (69⭐), universal choice
• <b>Minimax</b> — premium quality (390⭐), cinematic level

<b>What it's good for:</b>
• Advertising clips and promos
• Content for TikTok, Reels, Shorts
• Idea visualization for projects
• Creative and artistic projects
• Video greetings and cards`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Напишите подробное описание сцены для видео
<b>Шаг 2:</b> Выберите модель генерации (влияет на качество и цену)
<b>Шаг 3:</b> Выберите длительность (5 или 10 секунд)
<b>Шаг 4:</b> Дождитесь генерации (1-5 минут в зависимости от модели)
<b>Шаг 5:</b> Получите готовое видео и скачайте его`,

      en: `<b>Step 1:</b> Write a detailed description of the video scene
<b>Step 2:</b> Choose generation model (affects quality and price)
<b>Step 3:</b> Choose duration (5 or 10 seconds)
<b>Step 4:</b> Wait for generation (1-5 minutes depending on model)
<b>Step 5:</b> Get the finished video and download it`,
    },
    examples: {
      ru: [
        '«Золотистый ретривер бежит по пляжу на закате, волны накатывают на песок, камера следует за собакой»',
        '«Таймлапс расцветающего цветка розы, макросъёмка, студийное освещение, чёрный фон»',
        '«Дрон медленно пролетает над горным озером на рассвете, туман над водой, 4K качество»',
        '«Капли дождя падают в лужу в замедленной съёмке, отражение неоновых огней города»',
      ],
      en: [
        '"Golden retriever running on beach at sunset, waves rolling on sand, camera follows the dog"',
        '"Timelapse of rose flower blooming, macro shot, studio lighting, black background"',
        '"Drone slowly flying over mountain lake at dawn, fog over water, 4K quality"',
        '"Raindrops falling into puddle in slow motion, reflection of city neon lights"',
      ],
    },
    tips: {
      ru: [
        'Описывайте движение: «бежит», «летит», «вращается», «приближается»',
        'Указывайте тип съёмки: «замедленная съёмка», «таймлапс», «аэросъёмка»',
        'Добавляйте движение камеры: «камера следует за...», «плавный наезд»',
        'Для сложных сцен выбирайте Minimax — результат будет качественнее',
        'Начните с Haiper для экспериментов, затем используйте лучший промпт на Minimax',
      ],
      en: [
        'Describe motion: "running", "flying", "rotating", "approaching"',
        'Specify shot type: "slow motion", "timelapse", "aerial shot"',
        'Add camera movement: "camera follows...", "smooth zoom in"',
        'For complex scenes choose Minimax — the result will be better quality',
        'Start with Haiper for experiments, then use the best prompt on Minimax',
      ],
    },
    minCost: 38,
    maxCost: 390,
    isPaid: true,
  },

  [ModeEnum.ImageToVideo]: {
    name: { ru: '🎥 Видео из фото', en: '🎥 Photo to Video' },
    description: {
      ru: `Видео из фото — технология "оживления" статичных изображений.

Вы загружаете любую фотографию или картинку, описываете желаемое движение — и получаете видео, где изображение "оживает". Облака плывут, вода колышется, человек моргает и поворачивает голову.

<b>Это работает с:</b>
• Вашими фотографиями
• Сгенерированными изображениями
• Любыми картинками из интернета
• Художественными работами и артом

<b>Доступные модели:</b>
Такие же, как для "Видео из текста" — от бюджетного Haiper до премиум Minimax.`,

      en: `Photo to Video — technology for "bringing static images to life".

You upload any photo or picture, describe the desired movement — and get a video where the image "comes alive". Clouds move, water ripples, person blinks and turns head.

<b>This works with:</b>
• Your photos
• Generated images
• Any pictures from the internet
• Artwork and art

<b>Available models:</b>
Same as for "Text to Video" — from budget Haiper to premium Minimax.`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Отправьте фотографию или изображение боту
<b>Шаг 2:</b> Опишите, какое движение добавить (опционально)
<b>Шаг 3:</b> Выберите модель и длительность
<b>Шаг 4:</b> Дождитесь генерации (1-5 минут)
<b>Шаг 5:</b> Получите видео с "ожившим" изображением`,

      en: `<b>Step 1:</b> Send a photo or image to the bot
<b>Step 2:</b> Describe what movement to add (optional)
<b>Step 3:</b> Choose model and duration
<b>Step 4:</b> Wait for generation (1-5 minutes)
<b>Step 5:</b> Get the video with the "alive" image`,
    },
    examples: {
      ru: [
        'Портрет человека + «улыбается и медленно поворачивает голову вправо»',
        'Пейзаж с озером + «вода слегка колышется, облака медленно плывут»',
        'Фото города + «машины едут по улицам, люди идут по тротуарам»',
        'Арт с персонажем + «волосы развеваются на ветру, моргает»',
      ],
      en: [
        'Portrait + "smiles and slowly turns head to the right"',
        'Landscape with lake + "water gently ripples, clouds slowly move"',
        'City photo + "cars driving on streets, people walking on sidewalks"',
        'Character art + "hair flowing in wind, blinking"',
      ],
    },
    tips: {
      ru: [
        'Лучше работает с качественными изображениями высокого разрешения',
        'Для портретов указывайте конкретные движения лица: моргание, улыбка',
        'Для пейзажей описывайте природные движения: ветер, волны, облака',
        'Если не указать движение — ИИ добавит его автоматически',
      ],
      en: [
        'Works better with high-quality, high-resolution images',
        'For portraits specify specific facial movements: blinking, smiling',
        'For landscapes describe natural movements: wind, waves, clouds',
        'If you don\'t specify movement — AI will add it automatically',
      ],
    },
    minCost: 38,
    maxCost: 390,
    isPaid: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎙️ АУДИО ФУНКЦИИ
  // ═══════════════════════════════════════════════════════════════════════════

  [ModeEnum.TextToSpeech]: {
    name: { ru: '🎙️ Озвучка текста', en: '🎙️ Text to Speech' },
    description: {
      ru: `Озвучка текста — преобразование любого текста в естественную человеческую речь.

Вы пишете текст — получаете аудиофайл, где профессиональный голос читает ваш текст. Голоса звучат очень реалистично, с правильными интонациями и паузами.

<b>Доступно:</b>
• Мужские и женские голоса
• Разные языки и акценты
• Выбор тембра и скорости
• Эмоциональная окраска

<b>Для чего подходит:</b>
• Озвучка видео и презентаций
• Создание подкастов
• Аудиокниги и рассказы
• Голосовые сообщения и поздравления
• Обучающие материалы`,

      en: `Text to Speech — converting any text into natural human speech.

You write text — get an audio file where a professional voice reads your text. Voices sound very realistic, with proper intonation and pauses.

<b>Available:</b>
• Male and female voices
• Different languages and accents
• Voice tone and speed selection
• Emotional coloring

<b>What it's good for:</b>
• Video and presentation voiceovers
• Creating podcasts
• Audiobooks and stories
• Voice messages and greetings
• Educational materials`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Введите или вставьте текст для озвучки
<b>Шаг 2:</b> Выберите голос из библиотеки (можно прослушать примеры)
<b>Шаг 3:</b> Дождитесь генерации (зависит от длины текста)
<b>Шаг 4:</b> Получите аудиофайл и скачайте его`,

      en: `<b>Step 1:</b> Enter or paste text for voiceover
<b>Step 2:</b> Choose a voice from the library (you can listen to examples)
<b>Step 3:</b> Wait for generation (depends on text length)
<b>Step 4:</b> Get the audio file and download it`,
    },
    tips: {
      ru: [
        'Используйте знаки препинания для естественных пауз',
        'Длинные тексты разбивайте на абзацы',
        'Для эмоциональности добавляйте восклицания и вопросы',
        'Проверьте текст на опечатки — ИИ прочитает как написано',
      ],
      en: [
        'Use punctuation for natural pauses',
        'Break long texts into paragraphs',
        'Add exclamations and questions for emotion',
        'Check text for typos — AI will read as written',
      ],
    },
    minCost: 9,
    isPaid: true,
  },

  [ModeEnum.VoiceToText]: {
    name: { ru: '📝 Расшифровка аудио', en: '📝 Voice to Text' },
    description: {
      ru: `Расшифровка аудио — конвертация голосовых сообщений и аудиофайлов в текст.

Отправьте голосовое сообщение или аудиофайл — получите точную текстовую расшифровку. Работает с любым языком и акцентом.

<b>Для чего подходит:</b>
• Расшифровка голосовых сообщений
• Транскрибация интервью и подкастов
• Конспектирование лекций и вебинаров
• Создание субтитров
• Перевод аудио в текст для обработки`,

      en: `Voice to Text — converting voice messages and audio files to text.

Send a voice message or audio file — get an accurate text transcription. Works with any language and accent.

<b>What it's good for:</b>
• Transcribing voice messages
• Transcribing interviews and podcasts
• Note-taking from lectures and webinars
• Creating subtitles
• Converting audio to text for processing`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Отправьте голосовое сообщение или аудиофайл
<b>Шаг 2:</b> Дождитесь распознавания (зависит от длины)
<b>Шаг 3:</b> Получите текстовую расшифровку`,

      en: `<b>Step 1:</b> Send a voice message or audio file
<b>Step 2:</b> Wait for recognition (depends on length)
<b>Step 3:</b> Get the text transcription`,
    },
    tips: {
      ru: [
        'Чем чище аудио — тем точнее расшифровка',
        'Работает с длинными записями (до нескольких часов)',
        'Распознаёт речь даже с небольшим акцентом',
      ],
      en: [
        'The cleaner the audio — the more accurate the transcription',
        'Works with long recordings (up to several hours)',
        'Recognizes speech even with slight accent',
      ],
    },
    minCost: 6,
    isPaid: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎬 ПРОДВИНУТЫЕ ФУНКЦИИ
  // ═══════════════════════════════════════════════════════════════════════════

  [ModeEnum.LipSync]: {
    name: { ru: '👄 Синхронизация губ', en: '👄 Lip Sync' },
    description: {
      ru: `Синхронизация губ (LipSync) — технология, которая заставляет человека на видео "произносить" любой текст.

Вы загружаете видео с лицом человека и аудиодорожку — получаете видео, где губы идеально синхронизированы с речью. Выглядит так, будто человек действительно произносит этот текст!

<b>Для чего подходит:</b>
• Дубляж видео на другие языки
• Создание говорящих аватаров
• Перевод видеоконтента
• Озвучка видеоуроков и презентаций
• Создание контента для соцсетей`,

      en: `Lip Sync — technology that makes a person in video "speak" any text.

You upload a video with a person's face and an audio track — get a video where lips are perfectly synchronized with speech. It looks like the person is actually saying that text!

<b>What it's good for:</b>
• Dubbing videos to other languages
• Creating talking avatars
• Video content translation
• Voiceover for video tutorials and presentations
• Creating social media content`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Загрузите видео с чётко видимым лицом (фронтально)
<b>Шаг 2:</b> Загрузите аудиофайл с речью ИЛИ сгенерируйте голос из текста
<b>Шаг 3:</b> Дождитесь обработки (1-3 минуты)
<b>Шаг 4:</b> Получите видео с синхронизированными губами`,

      en: `<b>Step 1:</b> Upload video with clearly visible face (frontal)
<b>Step 2:</b> Upload audio file with speech OR generate voice from text
<b>Step 3:</b> Wait for processing (1-3 minutes)
<b>Step 4:</b> Get video with synchronized lips`,
    },
    tips: {
      ru: [
        'Лицо должно быть хорошо освещено и видно полностью',
        'Лучший результат — фронтальный ракурс (лицо смотрит в камеру)',
        'Аудио должно быть чистым, без фонового шума и музыки',
        'Длина аудио должна примерно совпадать с длиной видео',
        'Качественное исходное видео = качественный результат',
      ],
      en: [
        'Face should be well-lit and fully visible',
        'Best result — frontal angle (face looking at camera)',
        'Audio should be clean, without background noise or music',
        'Audio length should approximately match video length',
        'Quality source video = quality result',
      ],
    },
    minCost: 84,
    isPaid: true,
  },

  [ModeEnum.MorphingWizard]: {
    name: { ru: '🔄 Морфинг', en: '🔄 Morphing' },
    description: {
      ru: `Морфинг — создание плавного видеоперехода между двумя изображениями.

Одно изображение постепенно "перетекает" в другое с завораживающим эффектом трансформации. Отличный способ показать изменения, сравнения или просто создать эффектный визуальный контент.

<b>Классические примеры:</b>
• Ребёнок → взрослый человек (показать взросление)
• Эскиз → готовая картина (показать процесс создания)
• Лето → зима (показать смену сезонов)
• До → после (результаты макияжа, ремонта и т.д.)`,

      en: `Morphing — creating smooth video transition between two images.

One image gradually "flows" into another with a mesmerizing transformation effect. Great way to show changes, comparisons, or just create impressive visual content.

<b>Classic examples:</b>
• Child → adult (showing growing up)
• Sketch → finished painting (showing creation process)
• Summer → winter (showing season change)
• Before → after (makeup results, renovation, etc.)`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Загрузите первое изображение (начальное состояние)
<b>Шаг 2:</b> Загрузите второе изображение (конечное состояние)
<b>Шаг 3:</b> Дождитесь создания морфинга (1-2 минуты)
<b>Шаг 4:</b> Получите видео с плавной трансформацией`,

      en: `<b>Step 1:</b> Upload first image (initial state)
<b>Step 2:</b> Upload second image (final state)
<b>Step 3:</b> Wait for morphing creation (1-2 minutes)
<b>Step 4:</b> Get video with smooth transformation`,
    },
    examples: {
      ru: [
        'Детское фото → взрослое фото (одного человека)',
        'Нарисованный эскиз → готовый арт',
        'Пустая комната → обставленная комната',
        'Рассвет → закат (одно и то же место)',
      ],
      en: [
        'Child photo → adult photo (same person)',
        'Drawn sketch → finished art',
        'Empty room → furnished room',
        'Sunrise → sunset (same location)',
      ],
    },
    tips: {
      ru: [
        'Лучший результат когда изображения похожи по композиции',
        'Для лиц: лучше использовать похожие ракурсы',
        'Изображения должны быть примерно одинакового размера',
        'Чем качественнее исходники — тем лучше морфинг',
      ],
      en: [
        'Best result when images are similar in composition',
        'For faces: better to use similar angles',
        'Images should be approximately the same size',
        'Higher quality sources — better morphing',
      ],
    },
    minCost: 50,
    isPaid: true,
  },

  [ModeEnum.DigitalAvatarBody]: {
    name: { ru: '🤖 Цифровой аватар', en: '🤖 Digital Avatar' },
    description: {
      ru: `Цифровой аватар — обучение персональной ИИ-модели на ваших фотографиях.

Это ПЕРВЫЙ шаг для использования функции "Нейрофото". Вы загружаете свои фотографии — нейросеть обучается распознавать ваше лицо. После этого вы сможете генерировать неограниченное количество фотографий с собой в любых сценах!

<b>Как это работает:</b>
Нейросеть анализирует особенности вашего лица: форму, черты, текстуру кожи, цвет глаз и волос. После обучения она может "встраивать" ваше лицо в любые сгенерированные изображения.

<b>Обучение занимает 15-30 минут</b>, после чего аватар доступен навсегда.`,

      en: `Digital Avatar — training a personal AI model on your photos.

This is the FIRST step to use the "NeuroPhoto" feature. You upload your photos — the neural network learns to recognize your face. After that, you can generate unlimited photos with yourself in any scene!

<b>How it works:</b>
The neural network analyzes your facial features: shape, traits, skin texture, eye and hair color. After training, it can "embed" your face into any generated images.

<b>Training takes 15-30 minutes</b>, after which the avatar is available forever.`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Подготовьте 10-20 качественных фотографий своего лица
<b>Шаг 2:</b> Загрузите фотографии в бот
<b>Шаг 3:</b> Запустите обучение модели
<b>Шаг 4:</b> Дождитесь завершения (15-30 минут)
<b>Шаг 5:</b> Получите уведомление о готовности аватара

После этого переходите в "📸 Нейрофото" и создавайте фотографии!`,

      en: `<b>Step 1:</b> Prepare 10-20 quality photos of your face
<b>Step 2:</b> Upload photos to the bot
<b>Step 3:</b> Start model training
<b>Step 4:</b> Wait for completion (15-30 minutes)
<b>Step 5:</b> Get notification when avatar is ready

After that, go to "📸 NeuroPhoto" and create photos!`,
    },
    tips: {
      ru: [
        '📸 <b>Разные ракурсы:</b> фронтально, в профиль, 3/4 — чем больше разнообразия, тем лучше',
        '💡 <b>Разное освещение:</b> дневной свет, вечерний, искусственный',
        '😊 <b>Разные выражения:</b> улыбка, серьёзное лицо, нейтральное',
        '🚫 <b>Без очков и масок:</b> лицо должно быть полностью открыто',
        '📏 <b>Крупный план:</b> лицо должно занимать большую часть кадра',
        '✨ <b>Чёткие фото:</b> без размытия и низкого качества',
      ],
      en: [
        '📸 <b>Different angles:</b> frontal, profile, 3/4 — more variety is better',
        '💡 <b>Different lighting:</b> daylight, evening, artificial',
        '😊 <b>Different expressions:</b> smile, serious, neutral',
        '🚫 <b>No glasses or masks:</b> face should be fully visible',
        '📏 <b>Close-up:</b> face should take up most of the frame',
        '✨ <b>Clear photos:</b> no blur or low quality',
      ],
    },
    minCost: 220,
    maxCost: 500,
    isPaid: true,
  },

  [ModeEnum.AiPhotoshop]: {
    name: { ru: '✨ AI Фотошоп', en: '✨ AI Photoshop' },
    description: {
      ru: `AI Фотошоп — редактирование изображений с помощью текстовых команд.

Забудьте о сложных программах! Просто загрузите фото и напишите, что хотите изменить: "убери фон", "добавь шляпу", "измени цвет платья на красный" — ИИ выполнит это за вас.

<b>Что можно делать:</b>
• Менять фон на любой другой
• Удалять ненужные объекты и людей
• Добавлять новые объекты
• Менять цвета одежды и предметов
• Изменять время суток и погоду
• Добавлять эффекты и стилизацию`,

      en: `AI Photoshop — editing images using text commands.

Forget about complex software! Just upload a photo and write what you want to change: "remove background", "add hat", "change dress color to red" — AI will do it for you.

<b>What you can do:</b>
• Change background to any other
• Remove unwanted objects and people
• Add new objects
• Change clothing and object colors
• Change time of day and weather
• Add effects and stylization`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Загрузите фотографию для редактирования
<b>Шаг 2:</b> Напишите, что нужно изменить (на любом языке)
<b>Шаг 3:</b> Дождитесь обработки (20-40 секунд)
<b>Шаг 4:</b> Получите отредактированное изображение

Если результат не идеален — попробуйте переформулировать запрос!`,

      en: `<b>Step 1:</b> Upload photo for editing
<b>Step 2:</b> Write what needs to be changed (in any language)
<b>Step 3:</b> Wait for processing (20-40 seconds)
<b>Step 4:</b> Get the edited image

If result isn't perfect — try rephrasing your request!`,
    },
    examples: {
      ru: [
        '«Замени фон на закат на море»',
        '«Убери людей на заднем плане»',
        '«Измени цвет машины на чёрный»',
        '«Добавь снег и зимнюю атмосферу»',
        '«Сделай фото в стиле 80-х»',
      ],
      en: [
        '"Replace background with ocean sunset"',
        '"Remove people in background"',
        '"Change car color to black"',
        '"Add snow and winter atmosphere"',
        '"Make photo in 80s style"',
      ],
    },
    tips: {
      ru: [
        'Будьте конкретны: не "измени фон", а "замени фон на пляж Мальдив"',
        'Для удаления объектов: "убери/удали" + что именно',
        'Можно комбинировать: "убери фон и добавь горы на закате"',
      ],
      en: [
        'Be specific: not "change background" but "replace background with Maldives beach"',
        'For removing objects: "remove/delete" + what exactly',
        'Can combine: "remove background and add mountains at sunset"',
      ],
    },
    minCost: 6,
    isPaid: true,
  },

  [ModeEnum.FaceSwap]: {
    name: { ru: '🎭 Замена лица', en: '🎭 Face Swap' },
    description: {
      ru: `Замена лица — перенос лица с одного фото на другое с реалистичным результатом.

Хотите увидеть себя в роли знаменитости, в историческом костюме или просто поменяться лицами с другом? Эта функция для вас!

ИИ анализирует оба изображения и аккуратно "встраивает" лицо, учитывая освещение, угол поворота и другие детали.`,

      en: `Face Swap — transferring a face from one photo to another with realistic results.

Want to see yourself as a celebrity, in historical costume, or just swap faces with a friend? This feature is for you!

AI analyzes both images and carefully "embeds" the face, considering lighting, angle, and other details.`,
    },
    howItWorks: {
      ru: `<b>Шаг 1:</b> Загрузите целевое фото (куда нужно вставить лицо)
<b>Шаг 2:</b> Загрузите фото-источник (чьё лицо использовать)
<b>Шаг 3:</b> Дождитесь обработки (20-40 секунд)
<b>Шаг 4:</b> Получите результат с заменённым лицом`,

      en: `<b>Step 1:</b> Upload target photo (where to insert face)
<b>Step 2:</b> Upload source photo (whose face to use)
<b>Step 3:</b> Wait for processing (20-40 seconds)
<b>Step 4:</b> Get result with replaced face`,
    },
    tips: {
      ru: [
        'Лучший результат когда ракурсы лиц похожи',
        'Освещение на обоих фото должно быть похожим',
        'Качественные исходники = качественный результат',
        'Лицо на фото-источнике должно быть чётким и крупным',
      ],
      en: [
        'Best result when face angles are similar',
        'Lighting on both photos should be similar',
        'Quality sources = quality result',
        'Face on source photo should be clear and large',
      ],
    },
    minCost: 6,
    isPaid: true,
  },
}

/**
 * Форматирование справки для отправки пользователю
 */
export function formatFeatureHelp(info: FeatureInfo, isRu: boolean): string {
  const name = isRu ? info.name.ru : info.name.en
  const description = isRu ? info.description.ru : info.description.en

  let message = `<b>${name}</b>\n\n${description}`

  // Как это работает
  if (info.howItWorks) {
    const howItWorks = isRu ? info.howItWorks.ru : info.howItWorks.en
    const title = isRu ? '\n\n⚙️ <b>Как это работает:</b>\n' : '\n\n⚙️ <b>How it works:</b>\n'
    message += title + howItWorks
  }

  // Примеры
  if (info.examples) {
    const examples = isRu ? info.examples.ru : info.examples.en
    const title = isRu ? '\n\n💡 <b>Примеры запросов:</b>' : '\n\n💡 <b>Example prompts:</b>'
    message += title
    examples.forEach(ex => {
      message += `\n• ${ex}`
    })
  }

  // Советы
  if (info.tips) {
    const tips = isRu ? info.tips.ru : info.tips.en
    const title = isRu ? '\n\n✅ <b>Советы для лучшего результата:</b>' : '\n\n✅ <b>Tips for better results:</b>'
    message += title
    tips.forEach(tip => {
      message += `\n• ${tip}`
    })
  }

  // Стоимость
  const costTitle = isRu ? '\n\n💰 <b>Стоимость:</b> ' : '\n\n💰 <b>Cost:</b> '
  if (info.maxCost && info.maxCost !== info.minCost) {
    message += `${costTitle}${info.minCost}–${info.maxCost}⭐`
  } else {
    message += `${costTitle}${info.minCost}⭐`
  }

  return message
}

/**
 * Получить минимальную стоимость функции
 */
export function getFeatureMinCost(mode: ModeEnum): number {
  return FEATURE_INFO[mode]?.minCost ?? 0
}

/**
 * Проверить, является ли функция платной
 */
export function isFeaturePaid(mode: ModeEnum): boolean {
  return FEATURE_INFO[mode]?.isPaid ?? false
}

/**
 * Получить информацию о функции
 */
export function getFeatureInfo(mode: ModeEnum): FeatureInfo | undefined {
  return FEATURE_INFO[mode]
}
