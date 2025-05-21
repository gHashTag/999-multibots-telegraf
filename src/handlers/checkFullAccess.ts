export const checkFullAccess = (subscription: string): boolean => {
  const fullAccessSubscriptions = [
    'neurophoto',
    'neurovideo',
    'neuromeeting',
    'neuroblogger',
    'neurotester',
  ]
  return fullAccessSubscriptions.includes(subscription)
}
