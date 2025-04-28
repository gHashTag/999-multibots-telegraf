export const calculateStars = (
  paymentAmount: number,
  starCost: number
): number => {
  return Math.floor(paymentAmount / starCost)
}
