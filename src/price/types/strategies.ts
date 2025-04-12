/**
 * Стратегии ценообразования для различных режимов работы
 */
export enum PricingStrategy {
  FIXED = 'fixed', // Фиксированная цена
  FREE = 'free', // Бесплатно (цена = 0)
  MODEL_BASED = 'model_based', // Цена зависит от выбранной модели
  STEP_BASED = 'step_based', // Цена зависит от кол-ва шагов
}
