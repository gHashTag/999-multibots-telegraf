export const checkFullAccess = (subscription: string): boolean => {
  const fullAccessSubscriptions = [
    // ✅ NEUROVIDEO и NEUROTESTER имеют ПОЛНЫЙ доступ ко всем функциям
    'neurovideo',
    'neurotester',
    'NEUROVIDEO',
    'NEUROTESTER',
  ]
  return fullAccessSubscriptions.includes(subscription)
}
