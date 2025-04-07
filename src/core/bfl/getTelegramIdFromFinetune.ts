export function getTelegramIdFromFinetune(finetuneName: string): string {
  const parts = finetuneName.split('_')
  return parts[parts.length - 1]
}
