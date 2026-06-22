import { SYSTEM_CONFIG } from '../constants'

export function calculateFinalImageCostInStars(baseCost: number): number {
  const finalCostInDollars = baseCost * SYSTEM_CONFIG.interestRate
  return Math.ceil(finalCostInDollars / SYSTEM_CONFIG.starCost)
}

interface ModelInfo {
  shortName: string
  description_en: string
  description_ru: string
  costPerImage: number
  previewImage: string
  inputType: ('text' | 'image' | 'dev')[]
}

export const IMAGES_MODELS: Record<string, ModelInfo> = {
  'black-forest-labs/flux-1.1-pro': {
    shortName: 'FLUX1.1 [pro]',
    description_en: `FLUX1.1 [pro] generates images six times faster than its predecessor, with improved quality and diversity. It offers a balance between speed and image quality.`,
    description_ru: `FLUX1.1 [pro] генерирует изображения в шесть раз быстрее, чем его предшественник, с улучшенным качеством и разнообразием. Предлагает баланс между скоростью и качеством изображения.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.055),
    inputType: ['text', 'image'],
  },
  'black-forest-labs/flux-1.1-pro-ultra': {
    shortName: 'FLUX1.1 [pro] Ultra',
    description_en: `FLUX1.1 [pro] Ultra supports 4x higher resolutions (up to 4MP) with fast generation times of 10 seconds per image. It offers high resolution without speed compromise and includes a raw mode for more natural aesthetics`,
    description_ru: `FLUX1.1 [pro] Ultra поддерживает разрешение в 4 раза выше (до 4 МП) с быстрым временем генерации 10 секунд на изображение. Высокое разрешение без потери скорости, режим raw для более естественной эстетики`,
    previewImage:
      'https://replicate.delivery/czjl/jqtNvxYHcnLELpszvkVf0APhMkBnwzrdo205RaVB7MttqU6JA/tmppokfymld.jpg',
    costPerImage: calculateFinalImageCostInStars(0.06),
    inputType: ['text', 'image'],
  },
  'black-forest-labs/flux-canny-pro': {
    shortName: 'FLUX1.1 [pro] Canny',
    description_en: `Edge-guided image generation that preserves structure and composition. Perfect for retexturing images or turning sketches into detailed art.\nFLUX.1 Canny [pro] leads the field in structural conditioning. It uses Canny edge detection to maintain precise control during image transformations. Feed it an edge map and text prompt to generate images that follow exact structural guidance while adding rich detail.\nParticularly effective for: - Converting sketches to finished art - Retexturing while preserving composition - Controlled style transfer - Architectural visualization`,
    description_ru: `Эффективное руководство по краям, которое сохраняет структуру и состав. Идеально подходит для ретекстурирования изображений или преобразования эскизов в детализированные произведения искусства.\nFLUX.1 Canny [pro] превосходит все модели в области структурного руководства. Он использует метод обнаружения краев Canny для точного контроля во время трансформаций изображений. Подайте ему карту краев и текст, и он создаст изображения, следуя точному структурному руководству, добавляя богатый детализированный стиль.\nОсобенно эффективно для: - Преобразования эскизов в завершенные произведения искусства - Ретекстурирования при сохранении состава - Контролируемого стиля - Визуализации архитектуры`,
    previewImage:
      'https://replicate.delivery/czjl/yRS3V6IYC877GF3DnejR0WJvcz5eg6LTlbE3cJPC6CJQqMzTA/tmp8gs0wfw3.jpg',
    costPerImage: calculateFinalImageCostInStars(0.05),
    inputType: ['text', 'image'],
  },
  'black-forest-labs/flux-depth-pro': {
    shortName: 'FLUX1.1 [pro] Depth',
    description_en: `Depth-guided image generation that preserves structure and composition. Perfect for retexturing images or turning sketches into detailed art.\nFLUX.1 Depth [pro] leads the field in depth conditioning. It uses depth maps to maintain precise control during image transformations. Feed it an image and its depth map to generate images that follow exact depth guidance while adding rich detail.\nParticularly effective for: - Retexturing while preserving composition - Architectural visualization - Controlled style transfer - 3D scene reconstruction`,
    description_ru: `Эффективное руководство по глубине, которое сохраняет структуру и состав. Идеально подходит для ретекстурирования изображений или преобразования эскизов в детализированные произведения искусства.\nFLUX.1 Depth [pro] превосходит все модели в области глубинного руководства. Он использует карты глубины для точного контроля во время трансформаций изображений. Подайте ему изображение и его карту глубины, и он создаст изображения, следуя точному руководству по глубине, добавляя богатый детализированный стиль.\nОсобенно эффективно для: - Ретекстурирования при сохранении состава - Визуализации архитектуры - Контролируемого стиля - Восстановления 3D сцены`,
    previewImage:
      'https://replicate.delivery/czjl/YmnJr3uJFwaLHpyE2YQZEsGD6DsN3h6opElksQJ4UUzUJz8E/tmp_zp5p3b2.jpg',
    costPerImage: calculateFinalImageCostInStars(0.05),
    inputType: ['text', 'image', 'dev'],
  },
  'black-forest-labs/flux-dev': {
    shortName: 'FLUX1.1 [dev]',
    description_en: `Depth-aware image generation that preserves 3D relationships. Transform images while maintaining realistic spatial structure.\nFLUX.1 Depth [pro] outperforms proprietary solutions like Midjourney ReTexture in depth-aware tasks. It uses depth maps to maintain precise control during image transformations, letting you edit images while preserving spatial relationships and perspective.\nThe model excels at: - Architectural visualization - Product placement in scenes - Style transfer with depth preservation - Scene composition with accurate scaling\nOffers higher output diversity than other depth-guided models while maintaining spatial accuracy.`,
    description_ru: `Глубинно-ориентированное создание изображений, которое сохраняет 3D отношения. Трансформируйте изображения, сохраняя реалистичную пространственную структуру.\nFLUX.1 Depth [pro] превосходит все модели в области глубинного руководства. Он использует карты глубины для точного контроля во время трансформаций изображений, позволяя вам редактировать изображения, сохраняя пространственные отношения и перспективу.\nМодель превосходит: - Визуализация архитектуры - Размещение продуктов в сценах - Стиль передачи с сохранением глубины - Состав с точной шкалой\nОбеспечивает более высокую разнообразие выходных данных, чем другие модели, сохраняя пространственную точность.`,
    previewImage:
      'https://replicate.delivery/yhqm/xU3wLlAQcGpZLVQipTVxaZMaL4omk9n7d1suU0byMnngfQvJA/out-0.webp',
    costPerImage: calculateFinalImageCostInStars(0.025),
    inputType: ['text', 'image'],
  },
  'black-forest-labs/flux-dev-lora': {
    shortName: 'FLUX1.1 [dev] Lora',
    description_en: `FLUX-dev-lora is a model based on a hybrid architecture of multimodal and parallel blocks of diffusion transformer, optimized for image generation from text descriptions. It offers improved performance and efficiency, including rotational positional embeddings and parallel attention layers. FLUX-dev-lora is available for non-commercial use and supports open weights for scientific research and creative projects.`,
    description_ru: `FLUX-dev-lora — это модель, основанная на гибридной архитектуре мультимодальных и параллельных блоков диффузионного трансформатора, оптимизированная для генерации изображений из текстовых описаний. Она предлагает улучшенную производительность и эффективность, включая вращательные позиционные вложения и параллельные слои внимания. FLUX-dev-lora доступна для использования в некоммерческих целях и поддерживает открытые веса для научных исследований и творческих проектов.`,
    previewImage:
      'https://replicate.delivery/xezq/a43wloJrIDpoJpCH81EfhI00PbQrmhpfpUWqCvZPtWEsOvwTA/out-0.webp',
    costPerImage: calculateFinalImageCostInStars(0.032),
    inputType: ['text', 'image'],
  },
  'black-forest-labs/flux-fill-pro': {
    shortName: 'FLUX1.1 [pro] Fill',
    description_en: `FLUX.1 Fill [pro] is a model based on a hybrid architecture of multimodal and parallel blocks of diffusion transformer, optimized for image generation from text descriptions. It offers improved performance and efficiency, including rotational positional embeddings and parallel attention layers. FLUX.1 Fill [pro] is available for non-commercial use and supports open weights for scientific research and creative projects.`,
    description_ru: `FLUX.1 Fill [pro] — это модель, основанная на гибридной архитектуре мультимодальных и параллельных блоков диффузионного трансформатора, оптимизированная для генерации изображений из текстовых описаний. Она предлагает улучшенную производительность и эффективность, включая вращательные позиционные вложения и параллельные слои внимания. FLUX.1 Fill [pro] доступна для использования в некоммерческих целях и поддерживает открытые веса для научных исследований и творческих проектов.`,
    previewImage:
      'https://replicate.delivery/xezq/XAOCdYKsGYZ9FNTeeEQPbl8DM9eoDf050jLfSAZMuWVYJdZeE/out-0.webp',
    costPerImage: calculateFinalImageCostInStars(0.05),
    inputType: ['text', 'image', 'dev'],
  },
  'black-forest-labs/flux-schnell': {
    shortName: 'FLUX1.1 [dev] Schnell',
    description_en: `Schnell model`,
    description_ru: `Schnell model`,
    previewImage:
      'https://replicate.delivery/yhqm/hcDDSNf633zeDUz9sWkKfaftcfJLWIvuhn9vfCFWmufxelmemA/out-0.webp',
    costPerImage: calculateFinalImageCostInStars(0.003),
    inputType: ['text'],
  },
  'black-forest-labs/flux-schnell-lora': {
    shortName: 'FLUX1.1 [dev] Schnell lora',
    description_en: `FLUX.1 [schnell] is a 12 billion parameter rectified flow transformer capable of generating images from text descriptions.`,
    description_ru: `FLUX.1 [schnell] — это 12 миллиард параметров, исправленный поток трансформатор, способный генерировать изображения из текстовых описаний.`,
    previewImage:
      'https://replicate.delivery/xezq/T7gLEVc07aqvBdrWweJanOmMebAX97jUTfQrsLmXPQOvsahnA/out-0.webp',
    costPerImage: calculateFinalImageCostInStars(0.02),
    inputType: ['text'],
  },
  'ideogram-ai/ideogram-v2': {
    shortName: 'Ideogram',
    description_en: `Ideogram (pronounced “eye-dee-oh-gram”) is a AI tool that turns your ideas into stunning images, in a matter of seconds. Ideogram excels at creating captivating designs, realistic images, innovative logos and posters. With unique capabilities like text rendering in images, we aim to inspire creativity and help every user bring their imagination to life.`,
    description_ru: `Ideogram (произносится как "ай-ди-о-грам") — это AI-инструмент, который превращает ваши идеи в потрясающие изображения за несколько секунд. Ideogram превосходит в создании захватывающих дизайнов, реалистичных изображений, инновационных логотипов и постеров. С уникальными возможностями, такими как рендеринг текста в изображениях, мы стремимся вдохновить творчество и помочь каждому пользователю воплотить свою фантазию в жизнь.`,
    previewImage:
      'https://replicate.delivery/czjl/wPuHfFHPOGxqbC3r1rJbEomny4eprgwRVpjIP7pN7oKf6pSnA/R8_ideogram.png',
    costPerImage: calculateFinalImageCostInStars(0.08),
    inputType: ['text', 'image'],
  },
  'ideogram-ai/ideogram-v2-turbo': {
    shortName: 'Ideogram Turbo',
    description_en: `Turbo generates images quickly and is best used for ideation when you want a quick look at the composition. Sometimes useful for achieving a sketchy look (~7 to ~12 sec)`,
    description_ru: `Turbo генерирует изображения быстро и лучше всего используется для идеации, когда вы хотите быстро увидеть композицию. Иногда полезно для достижения набросочного вида (~7 до ~12 секунд)`,
    previewImage:
      'https://replicate.delivery/czjl/9aabtkgKeV2HS6bASFV9uEvkufPMZlE2MelytHKnUs4yeTlOB/R8_ideogram.png',
    costPerImage: calculateFinalImageCostInStars(0.05),
    inputType: ['text', 'image'],
  },
  'luma/photon': {
    shortName: 'Luma Photon',
    description_en: `Luma Photon is a cutting-edge AI image generation model that offers ultra-high quality and 10x higher cost efficiency. It is designed for creative professionals, providing a new benchmark in visual intelligence with the ability to understand natural language instructions and generate consistent characters from a single input image.`,
    description_ru: `Luma Photon — это передовая модель генерации изображений с использованием ИИ, обеспечивающая ультравысокое качество и в 10 раз более высокую экономичность. Она разработана для креативных профессионалов, устанавливая новый стандарт в области визуального интеллекта с возможностью понимать инструкции на естественном языке и создавать последовательные персонажи из одного входного изображения.`,
    previewImage:
      'https://replicate.delivery/czjl/ZtBmm4Yw98KoJBz3Z7PnpFmgga42Skq8pL3ILGjnmDfAl87JA/tmpjbj2iy5z.jpg',
    costPerImage: calculateFinalImageCostInStars(0.03),
    inputType: ['text', 'image'],
  },
  'luma/photon-flash': {
    shortName: 'Luma Photon Flash',
    description_en: `Luma Photon Flash is a cutting-edge AI image generation model that offers ultra-high quality and 10x higher cost efficiency. It is designed for creative professionals, providing a new benchmark in visual intelligence with the ability to understand natural language instructions and generate consistent characters from a single input image.`,
    description_ru: `Luma Photon Flash — это передовая модель генерации изображений с использованием ИИ, обеспечивающая ультравысокое качество и в 10 раз более высокую экономичность. Она разработана для креативных профессионалов, устанавливая новый стандарт в области визуального интеллекта с возможностью понимать инструкции на естественном языке и создавать последовательные персонажи из одного входного изображения.`,
    previewImage:
      'https://replicate.delivery/czjl/6iZ89qakg74mCVjFYeDk0GljoYQReoV0k7WwSjxXmCLcV53TA/tmpyf9dx02r.jpg',
    costPerImage: calculateFinalImageCostInStars(0.01),
    inputType: ['text', 'image'],
  },
  'recraft-ai/recraft-20b': {
    shortName: 'Recraft 20b',
    description_en: `Recraft 20b model`,
    description_ru: `Recraft 20b model`,
    previewImage:
      'https://replicate.delivery/czjl/ktMwWoliJ6K2Bx8IVQO0xAEujmdERpkAdid7ZAHCbFZqoieJA/tmpe5t63bfy.webp',
    costPerImage: calculateFinalImageCostInStars(0.022),
    inputType: ['text'],
  },
  'recraft-ai/recraft-20b-svg': {
    shortName: 'Recraft 20b SVG',
    description_en: `Recraft 20b SVG is an affordable and fast model for generating vector images. It is designed to efficiently create high-quality SVG graphics from text inputs, making it ideal for both personal and commercial projects.`,
    description_ru: `Recraft 20b SVG — это доступная и быстрая модель для генерации векторных изображений. Она предназначена для эффективного создания высококачественной SVG-графики из текстовых данных, что делает её идеальной для личных и коммерческих проектов.`,
    previewImage:
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/bot/Screenshot%202568-01-08%20at%2015.23.03.png',
    costPerImage: calculateFinalImageCostInStars(0.044),
    inputType: ['text', 'dev'],
  },
  'recraft-ai/recraft-v3': {
    shortName: 'Recraft V3',
    description_en: `Recraft version 3`,
    description_ru: `Recraft version 3`,
    previewImage:
      'https://replicate.delivery/czjl/eTxDZunLeFulD0734CMCIuhP6llmZbgtbxfjzyfi4hxAAOwOB/output.webp',
    costPerImage: calculateFinalImageCostInStars(0.04),
    inputType: ['text'],
  },
  'recraft-ai/recraft-v3-svg': {
    shortName: 'Recraft V3 SVG',
    description_en: `Recraft V3 SVG is a cutting-edge text-to-image model that generates high-quality SVG images, including logos and icons. It excels in prompt understanding, allowing for accurate visual representations and seamless integration of text and image elements. The model supports brand style customization and offers both raster and vector image generation.`,
    description_ru: `Recraft V3 SVG — это передовая модель преобразования текста в изображение, создающая высококачественные SVG-изображения, включая логотипы и иконки. Она превосходит в понимании промптов, обеспечивая точные визуальные представления и бесшовную интеграцию текстовых и графических элементов. Модель поддерживает настройку стиля бренда и предлагает генерацию как растровых, так и векторных изображений.`,
    previewImage:
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/bot/Screenshot%202568-01-08%20at%2015.24.41.png',
    costPerImage: calculateFinalImageCostInStars(0.08),
    inputType: ['text', 'dev'],
  },
  'stability-ai/stable-diffusion-3.5-large': {
    shortName: 'Stable Diffusion 3.5 Large',
    description_en: `Stable Diffusion 3.5 Large is a Multimodal Diffusion Transformer (MMDiT) text-to-image model that features improved performance in image quality, typography, complex prompt understanding, and resource-efficiency.`,
    description_ru: `Stable Diffusion 3.5 Large — это Multimodal Diffusion Transformer (MMDiT) текстово-изображённая модель, которая превосходит в качестве изображений, типографике, сложных промптов и ресурсоэффективности.`,
    previewImage:
      'https://replicate.delivery/yhqm/x5swvMgXyDr5JxhAqWf7Sty3YdzweRHHgG6EZA5ndfN0WwSnA/R8_sd3.5L_00001_.webp',
    costPerImage: calculateFinalImageCostInStars(0.065),
    inputType: ['text', 'image'],
  },
  'stability-ai/stable-diffusion-3.5-large-turbo': {
    shortName: 'Stable Diffusion 3.5 Large Turbo',
    description_en: `Stable Diffusion 3.5 Large Turbo is a high-resolution text-to-image model that excels in generating detailed images with various artistic styles. It uses Adversarial Diffusion Distillation for improved image quality and efficiency, supporting both text and image inputs.`,
    description_ru: `Stable Diffusion 3.5 Large Turbo — это модель преобразования текста в изображение с высоким разрешением, которая превосходно генерирует детализированные изображения в различных художественных стилях. Она использует Adversarial Diffusion Distillation для улучшения качества изображений и эффективности, поддерживая как текстовые, так и визуальные входные данные.`,
    previewImage:
      'https://replicate.delivery/yhqm/qPajhUQ3G3qLAtsMA1MMH7z7Z7kwLKy7WsIOgf0ijcjNpr0JA/R8_sd3.5L_00001_.webp',
    costPerImage: calculateFinalImageCostInStars(0.04),
    inputType: ['text', 'image'],
  },
  // AI Photoshop & Image Editing Models
  'black-forest-labs/flux-kontext-pro': {
    shortName: 'FLUX Kontext [pro]',
    description_en: `FLUX.1 Kontext [pro] is the state-of-the-art model for high-quality, consistent, and natural language-guided image transformations. It's 8x faster than GPT-Image-1 with integrated support in Adobe Photoshop Beta.\n\nKey capabilities:\n- Text-to-edit: Edit images using natural language instructions\n- Character consistency: Maintain subject identity across transformations\n- Local editing: Make targeted modifications without affecting the rest\n- High precision: Excellent prompt following and consistent results\n\nIntegrated into Adobe Photoshop Beta for professional workflows.`,
    description_ru: `FLUX.1 Kontext [pro] — это передовая модель для высококачественных, последовательных и управляемых естественным языком трансформаций изображений. В 8 раз быстрее GPT-Image-1 с интеграцией в Adobe Photoshop Beta.\n\nОсновные возможности:\n- Редактирование текстом: Изменяйте изображения с помощью инструкций на естественном языке\n- Постоянство персонажей: Сохраняйте идентичность объектов при трансформациях\n- Локальное редактирование: Целевые изменения без влияния на остальное\n- Высокая точность: Отличное следование промптам и стабильные результаты\n\nИнтегрирован в Adobe Photoshop Beta для профессиональных рабочих процессов.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.05),
    inputType: ['text', 'image'],
  },
  'black-forest-labs/flux-kontext-max': {
    shortName: 'FLUX Kontext [max]',
    description_en: `FLUX Kontext Max — highest quality AI image editing with multi-image support and maximum creativity. The most powerful model in the Kontext family, delivering superior results for complex edits, character consistency, and creative transformations.\n\nKey capabilities:\n- Multi-image input support for complex compositions\n- Maximum quality and creativity in transformations\n- Superior character consistency across edits\n- Best-in-class prompt following\n- Ideal for professional and demanding creative workflows`,
    description_ru: `FLUX Kontext Max — максимальное качество ИИ-редактирования с поддержкой нескольких изображений. Самая мощная модель семейства Kontext, обеспечивающая превосходные результаты для сложных правок, постоянства персонажей и творческих трансформаций.\n\nОсновные возможности:\n- Поддержка нескольких изображений для сложных композиций\n- Максимальное качество и креативность трансформаций\n- Превосходное постоянство персонажей в правках\n- Лучшее в классе следование промптам\n- Идеально для профессиональных и требовательных творческих процессов`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.08),
    inputType: ['text', 'image'],
  },
  'bytedance/seededit-3.0': {
    shortName: 'SeedEdit 3.0',
    description_en: `SeedEdit 3.0 achieves industry-leading usability rate of 56.1% and processes 4K images with exceptional detail preservation. Built on Seedream 3.0, it excels at portrait retouching, background changes, perspective shifts, and lighting adjustments.\n\nKey strengths:\n- 4K image support with natural, precise editing\n- Superior detail preservation in non-edited areas\n- Outperforms GPT-4o (37.1%) and Gemini 2.0 (30.3%) in usability\n- Specialized reward models for quality assurance\n\nIdeal for professional image editing requiring high fidelity and consistency.`,
    description_ru: `SeedEdit 3.0 достигает лидирующего в отрасли показателя удобства использования 56.1% и обрабатывает изображения 4K с исключительной сохранностью деталей. Построен на Seedream 3.0, превосходит в ретуши портретов, смене фона, изменении перспективы и настройке освещения.\n\nОсновные преимущества:\n- Поддержка 4K с естественным, точным редактированием\n- Превосходное сохранение деталей в нередактируемых областях\n- Превосходит GPT-4o (37.1%) и Gemini 2.0 (30.3%) по удобству использования\n- Специализированные модели вознаграждения для контроля качества\n\nИдеально для профессионального редактирования, требующего высокой точности и стабильности.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.05),
    inputType: ['text', 'image'],
  },
  'bytedance/seedream-4': {
    shortName: 'Seedream 4.0',
    description_en: `Seedream 4.0 ranks #1 on the Artificial Analysis Image Editing Leaderboard with ELO score of 1,205, surpassing Google's Gemini 2.5 Flash. It combines text-to-image generation and image editing into a single architecture.\n\nPerformance highlights:\n- Ultra-fast: 2K high-resolution generation in 1.8 seconds\n- Top-tier quality: Leads in visual quality benchmarks\n- Comprehensive editing: Background replacement, object manipulation, style transfer, lighting modification\n- Natural language understanding: Simply describe changes in plain English\n\nBest for fast, high-quality image generation and professional editing workflows.`,
    description_ru: `Seedream 4.0 занимает 1-е место в таблице лидеров Artificial Analysis Image Editing с ELO 1,205, превосходя Google Gemini 2.5 Flash. Объединяет генерацию текста в изображение и редактирование изображений в единую архитектуру.\n\nОсновные показатели производительности:\n- Сверхбыстрая: Генерация 2K высокого разрешения за 1.8 секунды\n- Высшее качество: Лидирует в бенчмарках визуального качества\n- Комплексное редактирование: Замена фона, манипуляция объектами, передача стиля, модификация освещения\n- Понимание естественного языка: Просто опишите изменения на обычном английском\n\nЛучший для быстрой, высококачественной генерации изображений и профессиональных рабочих процессов редактирования.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.04),
    inputType: ['text', 'image'],
  },
  'bytedance/seedream-4.5': {
    shortName: 'Seedream 4.5',
    description_en: `Seedream 4.5 is ByteDance's latest flagship image generation model, representing the cutting edge of their Seedream family. Built on Seedream 4.0's award-winning foundation with significant quality and consistency improvements.\n\nKey improvements over 4.0:\n- Enhanced visual quality and detail preservation\n- Better text rendering and typography\n- Improved instruction following and prompt adherence\n- More consistent style transfer\n- Optimized for portrait and character generation\n- State-of-the-art results across multiple benchmarks\n\nRecommended for professional image generation requiring highest quality output.`,
    description_ru: `Seedream 4.5 — флагманская модель генерации изображений ByteDance, представляющая передний край семейства Seedream. Построена на отмеченной наградами основе Seedream 4.0 со значительными улучшениями качества и стабильности.\n\nКлючевые улучшения по сравнению с 4.0:\n- Улучшенное визуальное качество и сохранение деталей\n- Лучший рендеринг текста и типографики\n- Улучшенное следование инструкциям и точность промптов\n- Более стабильная передача стиля\n- Оптимизирована для портретов и генерации персонажей\n- Передовые результаты по множеству бенчмарков\n\nРекомендуется для профессиональной генерации изображений, требующей наивысшего качества.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.04),
    inputType: ['text', 'image'],
  },
  'qwen/qwen-image-edit': {
    shortName: 'Qwen Image Edit',
    description_en: `Qwen-Image-Edit from Alibaba achieves state-of-the-art (SOTA) performance in image editing tasks. Built on the 20B Qwen-Image backbone, it supports bilingual (Chinese and English) text editing.\n\nUnique capabilities:\n- Dual editing modes: Low-level visual appearance + high-level semantic editing\n- Bilingual text editing: Add, delete, modify text while preserving original font, size, and style\n- Explicit mask inputs for inpainting/outpainting\n- Region-aware prompts: Apply changes only within specified bounding boxes\n- Multi-turn chained edits: Iteratively refine outputs\n- Ultra-fast: Edits in less than 3 seconds\n\nOpen-source with commercial use allowed. Perfect for precise, controllable image editing.`,
    description_ru: `Qwen-Image-Edit от Alibaba достигает передового (SOTA) уровня производительности в задачах редактирования изображений. Построен на основе 20B Qwen-Image, поддерживает двуязычное редактирование текста (китайский и английский).\n\nУникальные возможности:\n- Двойные режимы редактирования: Низкоуровневый визуальный вид + высокоуровневое семантическое редактирование\n- Двуязычное редактирование текста: Добавляйте, удаляйте, изменяйте текст, сохраняя оригинальный шрифт, размер и стиль\n- Явные входы масок для inpainting/outpainting\n- Промпты с учетом регионов: Применяйте изменения только в указанных ограничивающих рамках\n- Многоходовые цепные правки: Итеративное уточнение выходов\n- Сверхбыстрая: Редактирование менее чем за 3 секунды\n\nОткрытый исходный код с разрешением на коммерческое использование. Идеально для точного, контролируемого редактирования изображений.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.025),
    inputType: ['text', 'image'],
  },
  'qwen/qwen-image-edit-plus': {
    shortName: 'Qwen Image Edit Plus',
    description_en: `Improved version of Qwen-Image-Edit with enhanced multi-image editing capabilities and superior single-image consistency. Maintains all SOTA features of the base model with additional refinements.\n\nEnhancements:\n- Better multi-image editing coordination\n- Improved single-image consistency across edits\n- Enhanced semantic understanding\n- Faster processing with maintained quality\n\nBuilds upon the proven Qwen-Image-Edit foundation with performance optimizations for professional workflows.`,
    description_ru: `Улучшенная версия Qwen-Image-Edit с расширенными возможностями редактирования множественных изображений и превосходной постоянством одиночных изображений. Сохраняет все SOTA функции базовой модели с дополнительными улучшениями.\n\nУлучшения:\n- Лучшая координация редактирования множественных изображений\n- Улучшенная постоянство одиночных изображений в правках\n- Расширенное семантическое понимание\n- Более быстрая обработка с сохранением качества\n\nОснована на проверенном фундаменте Qwen-Image-Edit с оптимизациями производительности для профессиональных рабочих процессов.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.03),
    inputType: ['text', 'image'],
  },
  'bria/genfill': {
    shortName: 'Bria GenFill',
    description_en: `High-quality object addition and visual transformation model from Bria AI. Specializes in seamlessly adding new objects to images or transforming existing elements while maintaining photorealistic quality.\n\nKey features:\n- Precise object addition with context awareness\n- Visual element transformation\n- Natural integration with existing scene\n- High-quality results for commercial use\n\nIdeal for product placement, scene enhancement, and creative visual modifications.`,
    description_ru: `Модель высококачественного добавления объектов и визуальной трансформации от Bria AI. Специализируется на бесшовном добавлении новых объектов к изображениям или трансформации существующих элементов с сохранением фотореалистичного качества.\n\nОсновные функции:\n- Точное добавление объектов с учетом контекста\n- Трансформация визуальных элементов\n- Естественная интеграция с существующей сценой\n- Высококачественные результаты для коммерческого использования\n\nИдеально для размещения продуктов, улучшения сцен и творческих визуальных модификаций.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.04),
    inputType: ['text', 'image'],
  },
  'bria/eraser': {
    shortName: 'Bria Eraser',
    description_en: `Precise removal of unwanted objects from images with intelligent background reconstruction. Professional-grade eraser tool for clean, natural results.\n\nCapabilities:\n- One-click object removal\n- Intelligent background inpainting\n- Natural seamless results\n- No artifacts or visible edits\n\nPerfect for product photography cleanup, unwanted element removal, and professional image refinement.`,
    description_ru: `Точное удаление нежелательных объектов с изображений с интеллектуальной реконструкцией фона. Профессиональный инструмент для чистых, естественных результатов.\n\nВозможности:\n- Удаление объектов одним щелчком\n- Интеллектуальное inpainting фона\n- Естественные бесшовные результаты\n- Без артефактов или видимых правок\n\nИдеально для очистки фотографий продуктов, удаления нежелательных элементов и профессионального улучшения изображений.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.035),
    inputType: ['image'],
  },
  'bria/expand-image': {
    shortName: 'Bria Expand',
    description_en: `Expand images beyond their borders in high quality using intelligent outpainting. Extends images naturally while maintaining style, lighting, and composition consistency.\n\nFeatures:\n- High-quality border expansion\n- Style-consistent outpainting\n- Natural edge blending\n- Maintains original composition integrity\n\nIdeal for resizing images, changing aspect ratios, and creative composition expansion.`,
    description_ru: `Расширяйте изображения за их границы в высоком качестве с помощью интеллектуального outpainting. Расширяет изображения естественно, сохраняя постоянство стиля, освещения и композиции.\n\nФункции:\n- Высококачественное расширение границ\n- Outpainting с сохранением стиля\n- Естественное смешивание краев\n- Сохранение целостности оригинальной композиции\n\nИдеально для изменения размера изображений, изменения соотношений сторон и творческого расширения композиции.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.04),
    inputType: ['image'],
  },
  'bria/generate-background': {
    shortName: 'Bria Background',
    description_en: `Efficiently swap backgrounds in images via text prompts. Professional background replacement that maintains subject integrity and lighting consistency.\n\nCapabilities:\n- Text-based background generation\n- Automatic subject detection and preservation\n- Lighting and color matching\n- Natural integration of new backgrounds\n\nPerfect for product photography, portrait enhancement, and creative scene composition.`,
    description_ru: `Эффективно меняйте фоны на изображениях через текстовые промпты. Профессиональная замена фона, сохраняющая целостность объекта и постоянство освещения.\n\nВозможности:\n- Генерация фона на основе текста\n- Автоматическое обнаружение и сохранение объекта\n- Согласование освещения и цвета\n- Естественная интеграция новых фонов\n\nИдеально для фотографии продуктов, улучшения портретов и творческой композиции сцен.`,
    previewImage:
      'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    costPerImage: calculateFinalImageCostInStars(0.035),
    inputType: ['text', 'image'],
  },
  // google/imagen-4 and grok/aurora — removed: no provider API integration yet
  // TODO: add when Google Vertex AI and xAI API wrappers are implemented
  // Midjourney v7 - FLUX-based Midjourney-style generation (adminconteudosflix/midjourney-allcraft)
  'midjourney-v7': {
    shortName: 'Midjourney v7 (FLUX)',
    description_en: `FLUX-based Midjourney-style image generation via midjourney-allcraft. Advanced FLUX model with Midjourney aesthetic, delivering exceptional artistic styles and high-quality output. Supports fast mode (fp8 quantized) for faster generation. Perfect for creative projects, artistic visions, and imaginative compositions. Via adminconteudosflix/midjourney-allcraft on Replicate.`,
    description_ru: `Генерация изображений в стиле Midjourney на основе FLUX через midjourney-allcraft. Продвинутая модель FLUX с эстетикой Midjourney, обеспечивающая исключительные художественные стили и высококачественный результат. Поддерживает быстрый режим (fp8 квантизация) для ускоренной генерации. Идеально подходит для творческих проектов, художественных видений и воображаемых композиций. Через adminconteudosflix/midjourney-allcraft на Replicate.`,
    previewImage:
      'https://replicate.delivery/xezq/98efrLgtDWnGfoNVAJrmfF7A8vAXyIeZmejGQ2TYdFfFSsTPKA/out-0.webp',
    costPerImage: calculateFinalImageCostInStars(0.035), // FLUX-based model pricing
    inputType: ['text'], // Supports text-to-image and image-to-image
  },
}
