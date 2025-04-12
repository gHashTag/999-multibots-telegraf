import {
  ModeEnum,
  CostCalculationParams,
  CostCalculationResult,
} from '../helpers/modelsCost'

export { ModeEnum }

export type Mode = ModeEnum | string

export type BaseCosts = {
  [key in ModeEnum | 'neuro_photo_2']?: number
}

export { CostCalculationParams, CostCalculationResult }
