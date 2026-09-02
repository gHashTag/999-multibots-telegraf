import { useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Check, Layers3 } from 'lucide-react'

import { generatedResultsAtom } from '@/atoms/generateResults'
import { captionsAtom, projectAtom } from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { planAiAssembly } from '@/lib/aiAssembly'
import { mergeAssemblyTimedCaptions } from '@/lib/timedCaptions'
import { useEditorStore } from '@/store/editorStore'
import { DEFAULT_HEIGHT, DEFAULT_WIDTH } from '@vibee/atoms'
import './AiAssemblyBar.css'

export function AiAssemblyBar() {
  const { lang } = useLanguage()
  const generated = useAtomValue(generatedResultsAtom)
  const existingCaptions = useAtomValue(captionsAtom)
  const setCaptions = useSetAtom(captionsAtom)
  const project = useAtomValue(projectAtom)
  const tracks = useEditorStore(state => state.tracks)
  const addItem = useEditorStore(state => state.addItem)

  const results = useMemo(
    () => [
      ...generated.image,
      ...generated.video,
      ...generated.audio,
      ...generated.lipsync,
    ],
    [generated]
  )
  const plan = useMemo(() => planAiAssembly(results, tracks), [results, tracks])

  const assemble = () => {
    let nextCaptions = existingCaptions
    try {
      nextCaptions = mergeAssemblyTimedCaptions({
        existing: existingCaptions,
        fps: project.fps,
        results,
        placements: plan,
      })
    } catch {
      // The media remains useful, but untrusted timing never reaches the editor.
      nextCaptions = existingCaptions
    }
    for (const placement of plan) {
      addItem(placement.trackId, {
        type: placement.type,
        assetId: placement.assetId,
        startFrame: placement.startFrame,
        durationInFrames: placement.durationInFrames,
        x: 0,
        y: 0,
        width: DEFAULT_WIDTH,
        height: placement.type === 'video' ? DEFAULT_HEIGHT : DEFAULT_WIDTH,
        rotation: 0,
        opacity: 1,
        ...(placement.type === 'video' && { volume: 1, playbackRate: 1 }),
        ...(placement.type === 'audio' && { volume: 1 }),
      })
    }
    if (nextCaptions !== existingCaptions) setCaptions(nextCaptions)
  }

  const status =
    results.length === 0
      ? lang === 'ru'
        ? 'Пока нет материалов. Пройдите этапы слева направо.'
        : 'No assets yet. Complete the stages from left to right.'
      : plan.length === 0
        ? lang === 'ru'
          ? 'Все созданные материалы уже на дорожках.'
          : 'All generated assets are already on tracks.'
        : lang === 'ru'
          ? `Готово к добавлению: ${plan.length}. Существующие дорожки не заменяются.`
          : `Ready to add: ${plan.length}. Existing tracks are preserved.`

  return (
    <section className="ai-assembly" aria-label="AI assembly">
      <div className="ai-assembly__copy">
        <Layers3 size={18} aria-hidden="true" />
        <div>
          <strong>{lang === 'ru' ? 'Сборка из ИИ' : 'AI assembly'}</strong>
          <span>{status}</span>
        </div>
      </div>
      <button
        type="button"
        className="ai-assembly__button"
        onClick={assemble}
        disabled={plan.length === 0}
      >
        {plan.length === 0 ? <Check size={16} /> : <Layers3 size={16} />}
        {lang === 'ru' ? 'Добавить на дорожки' : 'Add to tracks'}
      </button>
    </section>
  )
}
