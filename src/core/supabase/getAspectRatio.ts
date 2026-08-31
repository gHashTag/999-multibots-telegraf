import { supabase } from '@/core/supabase'

export const getAspectRatio = async (telegram_id: number) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('aspect_ratio')
      .eq('telegram_id', telegram_id.toString())
      .single()

    if (error || !data) {
      console.error('Ошибка при получении aspect_ratio для telegram_id:', error)
      return null
    }

    return data.aspect_ratio
  } catch (err) {
    // Client-level rejection (network/connection blip) must NOT propagate.
    // Paid generators (generateTextToImageDirect, generateFluxKontextMax, etc.)
    // import this copy via the barrel and read aspect_ratio AFTER the charge
    // commits, under an outer catch that re-throws without refunding -- a throw
    // here would charge the user without delivering. Honor the null-on-failure
    // contract for ANY failure; every caller already defaults to '1:1' on null.
    // Mirrors the ai.ts getAspectRatio fix (#1415/#1414).
    console.error(
      'getAspectRatio failed (client rejection), returning null:',
      err
    )
    return null
  }
}
