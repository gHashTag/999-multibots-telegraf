/**
 * Утилиты для генерации GQ Portrait промптов
 */

/**
 * Типы/категории GQ портретов
 */
export type GQPortraitCategory = 'business' | 'fashion' | 'casual' | 'artistic'

/**
 * Создает промпт для портрета в стиле GQ для указанной категории
 * Все промпты настроены на генерацию лысого мужчины
 *
 * @param category Категория портрета
 * @returns Промпт для генерации
 */
export function createGQPortraitPrompt(category: GQPortraitCategory): string {
  switch (category) {
    case 'business':
      return 'NEUROCODER professional portrait photograph of a confident bald businessman with no hair, clean shaven head, strong features, in luxury tailored suit, high fashion GQ magazine style editorial, perfect studio lighting, sharp facial features, strong jaw, executive look, portrait orientation, 8k, high resolution, perfect details, elegant masculine fashion photography, professional retouching, cinematic dramatic lighting, corporate excellence, professional DSLR, luxury watch detail'

    case 'fashion':
      return 'NEUROCODER professional portrait photograph of a bald male fashion model, no hair, masculine features, wearing stylish high-fashion outfit, high fashion GQ magazine editorial style, perfect professional studio lighting, sharp facial features, fashion week aesthetic, portrait orientation with dramatic composition, 8k, high resolution, perfect details, haute couture, professional retouching, cinematic lighting with artistic shadows, luxury fashion photography, professional styling, designer clothing, minimalist background'

    case 'casual':
      return 'NEUROCODER professional portrait photograph of a bald man with masculine features, no hair, clean shaven head, relaxed casual style, wearing designer casual outfit, GQ magazine weekend style, natural outdoor lighting at golden hour, portrait orientation, 8k, high resolution, perfect details, lifestyle photography, professional retouching, urban setting, authentic expression, masculine aesthetic, premium casual fashion, detailed skin texture'

    case 'artistic':
      return 'NEUROCODER artistic portrait photograph of a bald man with confident expression, masculine features, no hair, strong jawline, in GQ magazine style editorial, dramatic chiaroscuro lighting, moody atmosphere, artistic composition, high fashion aesthetic, strong contrast, film grain, captured on medium format, cinematic color grading, professional retouching, fashion photography, creative expression, portrait orientation, 8k, high resolution, perfect details'

    default:
      return 'NEUROCODER professional portrait photograph of a bald man with masculine features, no hair, clean shaven head, strong jawline, in GQ magazine style, high fashion editorial, perfect studio lighting, sharp facial features, strong masculine look, portrait orientation, 8k, high resolution, perfect details, elegant fashion photography, professional retouching, cinematic lighting, detailed skin texture, professional DSLR quality'
  }
}
