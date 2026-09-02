export interface BrollPromptQueueItem {
  index: number
  label: string
  prompt: string
}

/** Keep every usable shot from the script; generation remains owner-triggered. */
export function buildBrollPromptQueue(
  prompts: readonly string[] | null | undefined
): BrollPromptQueueItem[] {
  return (prompts ?? [])
    .map(prompt => prompt.trim())
    .filter(Boolean)
    .map((prompt, index) => ({
      index,
      label: `Кадр ${index + 1}`,
      prompt,
    }))
}

/** Advance once after success, but never wrap and silently repeat a paid shot. */
export function nextBrollPromptIndex(current: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.max(current, 0) + 1, total - 1)
}
