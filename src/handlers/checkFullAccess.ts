export const checkFullAccess = (subscription: string): boolean => {
  const fullAccessSubscriptions = ['neurophoto', 'neurovideo', 'neurotester']
  return fullAccessSubscriptions.includes(subscription)
}
