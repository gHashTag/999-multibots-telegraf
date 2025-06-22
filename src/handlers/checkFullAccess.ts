export const checkFullAccess = (subscription: string): boolean => {
  const fullAccessSubscriptions = [
    'neurophoto',
    'neurovideo',
    'neurotester',
    'NEUROPHOTO',
    'NEUROVIDEO',
    'NEUROTESTER',
  ]
  return fullAccessSubscriptions.includes(subscription)
}
