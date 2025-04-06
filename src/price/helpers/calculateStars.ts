export function calculateStars({
  amount,
  starCost,
}: {
  amount: number
  starCost?: number
}) {
  if (!starCost) {
    throw new Error('Star cost is not defined')
  }
  return Math.floor(amount / starCost)
}
