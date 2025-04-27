export const checkFullAccess = (subscription: string): boolean => {
  const fullAccessSubscriptions = [
    'neurophoto',
    'neurobase',
    'neuromeeting',
    'neuroblogger',
    'neurotester',
  ]
  return fullAccessSubscriptions.includes(subscription)
}
