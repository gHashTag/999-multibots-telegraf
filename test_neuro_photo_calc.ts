import { starCost, interestRate } from './src/price/constants'

const baseCostInDollars = 0.08
const numImages = 1
const stars = (baseCostInDollars / starCost) * numImages * interestRate

console.log('🧮 РАСЧЕТ ЦЕНЫ NEURO_PHOTO:')
console.log('baseCostInDollars:', baseCostInDollars)
console.log('starCost:', starCost)
console.log('interestRate:', interestRate)
console.log('numImages:', numImages)
console.log(
  'Расчет: (',
  baseCostInDollars,
  '/',
  starCost,
  ') *',
  numImages,
  '*',
  interestRate,
  '=',
  stars
)
console.log('parseFloat(stars.toFixed(2)):', parseFloat(stars.toFixed(2)))

// Проверим calculateModeCost
import { calculateModeCost } from './src/price/helpers/modelsCost'
import { ModeEnum } from './src/interfaces/modes'
const modeCostResult = calculateModeCost({ mode: ModeEnum.NeuroPhoto })
console.log('calculateModeCost NeuroPhoto:', modeCostResult)
