import { ModeEnum } from '../helpers/modelsCost'

/**
 * Результат расчета стоимости
 */
export interface CostCalculationResult {
  stars: number // Количество звезд (внутренняя валюта)
  dollars: number // Стоимость в долларах
  rubles: number // Стоимость в рублях
}

/**
 * Параметры для расчета стоимости
 */
export interface CostCalculationParams {
  mode: ModeEnum | string // Режим работы
  steps?: number // Количество шагов (для STEP_BASED стратегии)
  numImages?: number // Количество изображений
  modelId?: string // ID модели (для MODEL_BASED стратегии)
}
