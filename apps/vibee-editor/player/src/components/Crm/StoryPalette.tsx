import { useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { checkStoryPalette, keepStoryPalette, type StoryReady } from '@/lib/crm'
import {
  END_CARD_COLOURS,
  cardKey,
  fieldSource,
  panelKeepOffered,
  toColourInput,
  type StoryEndCard,
} from '@/lib/storyPalette'

/**
 * HER PALETTE ON THE CLIENT'S CARD (crm-story-reel.t27 v11).
 *
 * What the next reel ends on, field by field, and where each field comes
 * from: the palette kept for her, her profile, or the default. "Check" is
 * the tool's read without start -- free -- and the verdict is the server's
 * words; this screen computes no contrast. "Keep" is offered only for the
 * card the last check passed, so an edit after the check is checked again.
 * Nothing here starts a reel or sends anything to the client.
 */
export function StoryPalette({
  clientId,
  ready,
  onChanged,
}: {
  clientId: string
  ready: StoryReady
  /** The card was kept or taken off: the panel reads the tool again. */
  onChanged: () => void
}) {
  const { t } = useLanguage()
  const card = ready.endCard
  const kept = ready.endCardKept
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<StoryEndCard>({})
  const [busy, setBusy] = useState(false)
  // The key of the card the last check was about, and what it said.
  const [checked, setChecked] = useState<{ key: string; why: string } | null>(
    null
  )
  const [note, setNote] = useState<string | null>(null)

  const edit = (next: StoryEndCard) => {
    setDraft(next)
    setNote(null)
  }
  const edited = checked !== null && checked.key !== cardKey(draft)
  const offered = panelKeepOffered(
    checked !== null,
    edited,
    checked?.why === ''
  )

  const onOpen = () => {
    setDraft({ ...(card ?? {}) })
    setChecked(null)
    setNote(null)
    setOpen(true)
  }

  const onCheck = async () => {
    setBusy(true)
    const r = await checkStoryPalette(clientId, draft)
    setBusy(false)
    const why = r.data ? (r.data.endCardWhy ?? '') : (r.error ?? '?')
    setChecked({ key: cardKey(draft), why })
  }

  const onKeep = async (next: StoryEndCard | null) => {
    setBusy(true)
    const r = await keepStoryPalette(clientId, next)
    setBusy(false)
    setNote(r.data?.note ?? r.error ?? null)
    if (r.data?.saved) {
      setOpen(false)
      onChanged()
    }
  }

  return (
    <div className="crm-client__story-palette" data-testid="story-palette">
      <p className="crm__counts">{t('crm.client.story.palette')}</p>
      {card ? (
        <ul className="crm-client__swatches">
          {END_CARD_COLOURS.map(k => (
            <li key={k} data-field={k} data-from={fieldSource(k, kept, card)}>
              <i
                className="crm-client__swatch"
                style={card[k] ? { background: card[k] } : undefined}
                aria-hidden="true"
              />
              <span>{t(`crm.client.story.field.${k}`)}</span>
              <code>{card[k] ?? '—'}</code>
              <small>
                {t(`crm.client.story.from.${fieldSource(k, kept, card)}`)}
              </small>
            </li>
          ))}
          {card.button ? (
            <li
              data-field="button"
              data-from={fieldSource('button', kept, card)}
            >
              <span>{t('crm.client.story.field.button')}</span>
              <code>{card.button}</code>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="crm__empty">{t('crm.client.story.palette.none')}</p>
      )}
      {kept ? (
        <p className="crm__counts" data-testid="story-palette-kept">
          {t('crm.client.story.kept')}
        </p>
      ) : null}
      {ready.endCardWhy ? <p className="crm__why">{ready.endCardWhy}</p> : null}
      {!open ? (
        <button
          type="button"
          className="crm-client__palette-go"
          onClick={onOpen}
        >
          {t('crm.client.story.edit')}
        </button>
      ) : (
        <div className="crm-client__palette-edit">
          {END_CARD_COLOURS.map(k => (
            <label key={k}>
              <span>{t(`crm.client.story.field.${k}`)}</span>
              <input
                type="color"
                data-field={k}
                value={toColourInput(draft[k])}
                disabled={busy}
                onChange={e => edit({ ...draft, [k]: e.target.value })}
              />
              {/* An unset field is not black: the reel takes the default. */}
              <code>{draft[k] ?? t('crm.client.story.from.default')}</code>
            </label>
          ))}
          <label>
            <span>{t('crm.client.story.field.button')}</span>
            <input
              type="text"
              data-field="button"
              value={draft.button ?? ''}
              disabled={busy}
              onChange={e => edit({ ...draft, button: e.target.value })}
            />
          </label>
          <div className="crm-client__palette-actions">
            <button
              type="button"
              className="crm-client__palette-go"
              data-action="check"
              onClick={() => void onCheck()}
              disabled={busy}
            >
              {busy
                ? t('crm.client.story.checking')
                : t('crm.client.story.check')}
            </button>
            <button
              type="button"
              data-action="keep"
              className="crm-client__palette-go"
              onClick={() => void onKeep(draft)}
              disabled={busy || !offered}
              title={offered ? undefined : t('crm.client.story.checkFirst')}
            >
              {t('crm.client.story.keep')}
            </button>
            {kept ? (
              <button
                type="button"
                className="crm-client__palette-go"
                data-action="clear"
                onClick={() => void onKeep(null)}
                disabled={busy}
              >
                {t('crm.client.story.clear')}
              </button>
            ) : null}
          </div>
          {checked && !edited ? (
            <p
              className={checked.why ? 'crm__why' : 'crm__counts'}
              role="status"
              data-testid="story-palette-verdict"
            >
              {checked.why || t('crm.client.story.readable')}
            </p>
          ) : null}
        </div>
      )}
      {note ? (
        <p className="crm__counts" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}
