export const checkFullAccess = (subscription: string): boolean => {
  const fullAccessSubscriptions = ['neurophoto', 'neurovideo']
  return fullAccessSubscriptions.includes(subscription)
}
