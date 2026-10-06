import { useLanguage } from '@/hooks/useLanguage'
import { templateKey, type StoryTemplate } from '@/lib/crm'
import type { StoryEndCard } from '@/lib/storyPalette'

/**
 * THE TEMPLATE GALLERY of the story-reel panel (crm-story-reel v20,
 * TEMPLATES_FROM_SERVER): one card per script the server listed -- its name,
 * language, every line, and a still mock of the end card in the card's own
 * colours. Nothing here is rendered or paid: the preview is text and CSS.
 *
 * The price of each script stands on its card BEFORE the tap
 * (PRICE_BEFORE_PRESS): the server's figure for that many scenes, or none --
 * never a figure computed here.
 */
export function StoryTemplateGallery({
  templates,
  card,
  priceOf,
  chosen,
  disabled,
  onPick,
}: {
  templates: readonly StoryTemplate[]
  card: StoryEndCard | null
  priceOf: (scenes: number) => number | null | undefined
  /** The key (`id:language`) of the chosen template, or null. */
  chosen: string | null
  disabled?: boolean
  onPick: (t: StoryTemplate | null) => void
}) {
  const { t } = useLanguage()
  if (!templates.length) return null
  const nameOf = (id: string) => {
    const key = `crm.client.story.gallery.name.${id.replace(/-/g, '_')}`
    const said = t(key)
    return said && said !== key ? said : id
  }
  return (
    <section
      className="story-reel__gallery"
      aria-label={t('crm.client.story.gallery')}
      data-testid="story-reel-gallery"
    >
      <span className="story-reel__label">{t('crm.client.story.gallery')}</span>
      <p className="story-reel__hint">{t('crm.client.story.gallery.hint')}</p>
      <ul className="story-reel__templates">
        {templates.map(tpl => {
          const key = templateKey(tpl)
          const on = chosen === key
          const price = priceOf(tpl.scenes)
          return (
            <li key={key}>
              <button
                type="button"
                className="story-reel__template"
                aria-pressed={on}
                disabled={disabled}
                data-testid={`story-reel-template-${key}`}
                onClick={() => onPick(on ? null : tpl)}
              >
                <span className="story-reel__template-head">
                  <strong>{nameOf(tpl.id)}</strong>
                  <span className="story-reel__template-lang">
                    {t(`crm.client.story.gallery.lang.${tpl.language}`)}
                  </span>
                </span>
                <ol className="story-reel__template-lines">
                  {tpl.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
                <span
                  className="story-reel__template-card"
                  aria-hidden
                  style={{
                    background: card?.bg ?? '#000000',
                    color: card?.text ?? '#ffffff',
                  }}
                >
                  <span style={{ color: card?.title ?? '#ffd700' }}>
                    {tpl.call || '—'}
                  </span>
                  {tpl.button ? (
                    <span
                      className="story-reel__template-btn"
                      style={{
                        background: card?.accent ?? '#00ff88',
                        color: card?.bg ?? '#000000',
                      }}
                    >
                      {tpl.button}
                    </span>
                  ) : null}
                </span>
                <span
                  className="story-reel__template-price"
                  data-testid={`story-reel-template-price-${key}`}
                >
                  {on ? `${t('crm.client.story.gallery.chosen')} · ` : ''}
                  {t('crm.client.story.framesShort', { n: tpl.scenes })} ·{' '}
                  {price != null
                    ? t('crm.client.story.gallery.price', { n: price })
                    : t('crm.client.story.gallery.noPrice')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
