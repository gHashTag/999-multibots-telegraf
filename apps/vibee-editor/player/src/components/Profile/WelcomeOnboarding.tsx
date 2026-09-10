/*
 * THE WELCOME ROAD ON THE PROFILE.
 *
 * Owner, 2026-09-09: value -> club -> Telegram -> SOUL.md -> ready. The six
 * steps and where the road starts live in welcomeSteps.ts as pure functions;
 * this file only draws them and talks to three atoms:
 *   - club (atoms/club.ts): price and membership from the server, one invoice;
 *   - agentTelegramConnectedAtom: flipped by <ConnectTelegram/> itself;
 *   - saveSoulAtom: the same tool the full editor uses.
 *
 * Every number on the paywall is read from /api/club/status. The screen does
 * not know the price; if the server changes it, the screen follows. What we
 * promise is only what the server does: N Stars per M days, K tokens back per
 * charge, cancel inside Telegram. No reach figures, no "first", no "best".
 *
 * No step has a "later" or a "skip" (owner, 2026-09-09, evening: "until paid
 * the profile does not open; every step is mandatory; we do not move on until
 * the step is done"). Each card has one button of ours, the step itself; the
 * only way out is Telegram's own back button. The profile opens on the last
 * card, when club, Telegram and SOUL are all in place.
 *
 * Look: the same language as the landing (components/landing/Hero.css,
 * Pricing.css): green glow on black, a pill badge, gradient title, a
 * highlighted price card, a glowing green CTA. Same tokens, no new colours.
 */
import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  MessageCircle,
  Smartphone,
  Sparkles,
  Star,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { agentTelegramConnectedAtom } from '@/atoms/agentTelegram'
import {
  clubBusyAtom,
  clubErrorAtom,
  clubStatusAtom,
  loadClubStatusAtom,
  joinClubAtom,
  type ClubBuyOutcome,
} from '@/atoms/club'
import { saveSoulAtom, soulErrorAtom, soulSavingAtom } from '@/atoms/soul'
import { ConnectTelegram } from './ConnectTelegram'
import {
  WELCOME_STEPS,
  composeSoul,
  soulHasSubstance,
  welcomeIndex,
  welcomeNext,
  welcomeStart,
  type WelcomeFacts,
  type WelcomeStep,
} from './welcomeSteps'
import './WelcomeOnboarding.css'

interface WelcomeOnboardingProps {
  facts: WelcomeFacts
  /** The last card was pressed: club, Telegram and SOUL are all in place. */
  onDone: () => void
}

export function WelcomeOnboarding({ facts, onDone }: WelcomeOnboardingProps) {
  const { t } = useLanguage()
  const [step, setStep] = useState<WelcomeStep>(() => welcomeStart(facts))
  const connected = useAtomValue(agentTelegramConnectedAtom)

  // The connect step ends itself: ConnectTelegram flips the shared atom when
  // the code (and password) went through; the road moves on without a
  // second "next" button that would only repeat what the person just saw.
  // Derived state set during render, the React-sanctioned shape.
  if (step === 'connect' && connected === true) {
    setStep(facts.soul ? 'done' : 'soul')
  }

  const total = WELCOME_STEPS.length
  const n = welcomeIndex(step)

  return (
    <section className="welcome" data-testid="welcome-onboarding">
      <div className="welcome__bg" aria-hidden="true">
        <div className="welcome__glow" />
        <div className="welcome__grid" />
      </div>
      <header className="welcome__top">
        <span className="welcome__step">{t('welcome.step', { n, total })}</span>
        <ol className="welcome__dots" aria-hidden="true">
          {WELCOME_STEPS.map((s, i) => (
            <li
              key={s}
              className={
                i + 1 < n
                  ? 'welcome__dot welcome__dot--past'
                  : i + 1 === n
                    ? 'welcome__dot welcome__dot--now'
                    : 'welcome__dot'
              }
            />
          ))}
        </ol>
      </header>

      {step === 'value' && (
        <StoryStep
          icon={<Bot size={32} aria-hidden="true" />}
          title={t('welcome.value.title')}
          lead={t('welcome.value.lead')}
          bullets={[
            t('welcome.value.dm'),
            t('welcome.value.reels'),
            t('welcome.value.plan'),
            t('welcome.value.blog'),
          ]}
          note={t('welcome.value.note')}
          onNext={() => setStep(welcomeNext(step))}
          nextLabel={t('welcome.next')}
        />
      )}

      {step === 'how' && (
        <StoryStep
          icon={<Sparkles size={32} aria-hidden="true" />}
          title={t('welcome.how.title')}
          lead={t('welcome.how.lead')}
          bullets={[
            t('welcome.how.soul'),
            t('welcome.how.telegram'),
            t('welcome.how.tokens'),
          ]}
          note={t('welcome.how.note')}
          onNext={() => setStep(welcomeNext(step))}
          nextLabel={t('welcome.next')}
        />
      )}

      {step === 'club' && (
        <ClubStep
          onJoined={() =>
            setStep(
              connected === true ? (facts.soul ? 'done' : 'soul') : 'connect'
            )
          }
        />
      )}

      {step === 'connect' && (
        <div className="welcome__card">
          <div className="welcome__why">
            <Smartphone size={28} aria-hidden="true" />
            <h2>{t('welcome.connect.title')}</h2>
            <p>{t('welcome.connect.body')}</p>
          </div>
          <ul className="welcome__consent">
            <li>{t('welcome.connect.who')}</li>
            <li>{t('welcome.connect.what')}</li>
            <li>{t('welcome.connect.why')}</li>
            <li>{t('welcome.connect.howlong')}</li>
            <li>{t('welcome.connect.off')}</li>
          </ul>
          <p className="welcome__warn">{t('welcome.connect.warn')}</p>
          <ConnectTelegram />
        </div>
      )}

      {step === 'soul' && <SoulStep onSaved={() => setStep('done')} />}

      {step === 'done' && (
        <div className="welcome__card welcome__card--center">
          <CheckCircle2
            size={40}
            aria-hidden="true"
            className="welcome__done-icon"
          />
          <h2>{t('welcome.done.title')}</h2>
          <p className="welcome__lead">{t('welcome.done.body')}</p>
          <ul className="welcome__bullets">
            <li>
              <MessageCircle size={18} aria-hidden="true" />
              <span>{t('welcome.done.first')}</span>
            </li>
            <li>
              <FileText size={18} aria-hidden="true" />
              <span>{t('welcome.done.soul')}</span>
            </li>
          </ul>
          <button
            type="button"
            className="welcome__btn welcome__btn--primary"
            onClick={onDone}
          >
            {t('welcome.done.go')}
          </button>
        </div>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

function StoryStep(props: {
  icon: ReactNode
  title: string
  lead: string
  bullets: string[]
  note: string
  nextLabel: string
  onNext: () => void
}) {
  return (
    <div className="welcome__card">
      <div className="welcome__why">
        {props.icon}
        <h2>{props.title}</h2>
        <p>{props.lead}</p>
      </div>
      <ul className="welcome__bullets">
        {props.bullets.map(b => (
          <li key={b}>
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <p className="welcome__note">{props.note}</p>
      <div className="welcome__actions">
        <button
          type="button"
          className="welcome__btn welcome__btn--primary"
          onClick={props.onNext}
        >
          {props.nextLabel}
        </button>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

function ClubStep(props: { onJoined: () => void }) {
  const { t } = useLanguage()
  const status = useAtomValue(clubStatusAtom)
  const busy = useAtomValue(clubBusyAtom)
  const error = useAtomValue(clubErrorAtom)
  const join = useSetAtom(joinClubAtom)
  const reloadStatus = useSetAtom(loadClubStatusAtom)
  const [outcome, setOutcome] = useState<ClubBuyOutcome | null>(null)

  const buy = async () => {
    setOutcome(null)
    const r = await join()
    setOutcome(r)
    if (r === 'joined' || r === 'already_active') props.onJoined()
  }

  const stars = status?.stars ?? 0
  const days = status?.period_days ?? 0
  const tokens = status?.tokens_per_period ?? 0
  const share = stars > 0 && tokens > 0 ? t('welcome.club.share') : ''

  return (
    <div className="welcome__card">
      <div className="welcome__why">
        <Star size={28} aria-hidden="true" />
        <h2>{t('welcome.club.title')}</h2>
        <p>{t('welcome.club.lead')}</p>
      </div>

      {status ? (
        <div className="welcome__price" data-testid="welcome-price">
          <span className="welcome__price-badge">
            {t('welcome.club.badge')}
          </span>
          <div className="welcome__price-main">
            <span className="welcome__price-stars">
              {stars.toLocaleString('ru-RU')}
            </span>
            <Star size={22} aria-hidden="true" />
            <span className="welcome__price-period">
              {t('welcome.club.per', { days })}
            </span>
          </div>
          <ul className="welcome__bullets">
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                {t('welcome.club.tokens', {
                  tokens: tokens.toLocaleString('ru-RU'),
                })}{' '}
                {share}
              </span>
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{t('welcome.club.renew')}</span>
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{t('welcome.club.topup')}</span>
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{t('welcome.club.cancel')}</span>
            </li>
          </ul>
        </div>
      ) : (
        <div className="welcome__price welcome__price--loading">
          <Loader2 size={20} className="welcome__spin" aria-hidden="true" />
          <span>{t('welcome.club.loading')}</span>
        </div>
      )}

      {error && <p className="welcome__error">{error}</p>}
      {error && !status && (
        // The price request failed: say so and let the person ask again
        // instead of leaving a spinner and a disabled "0 Stars" button.
        <div className="welcome__actions">
          <button
            type="button"
            className="welcome__btn welcome__btn--secondary"
            onClick={() => void reloadStatus()}
          >
            {t('welcome.club.retry')}
          </button>
        </div>
      )}
      {outcome === 'pending' && (
        <p className="welcome__note">{t('welcome.club.pending')}</p>
      )}
      {outcome === 'unsupported' && (
        <p className="welcome__error">{t('welcome.club.unsupported')}</p>
      )}
      {outcome === 'cancelled' && (
        <p className="welcome__note">{t('welcome.club.cancelled')}</p>
      )}
      {outcome === 'failed' && !error && (
        <p className="welcome__error">{t('welcome.club.failed')}</p>
      )}

      <div className="welcome__actions">
        <button
          type="button"
          className="welcome__btn welcome__btn--primary"
          onClick={buy}
          disabled={busy || !status}
        >
          {busy ? (
            <>
              <Loader2 size={18} className="welcome__spin" aria-hidden="true" />
              {t('welcome.club.going')}
            </>
          ) : (
            t('welcome.club.join', { stars: stars.toLocaleString('ru-RU') })
          )}
        </button>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

function SoulStep(props: { onSaved: () => void }) {
  const { t } = useLanguage()
  const save = useSetAtom(saveSoulAtom)
  const saving = useAtomValue(soulSavingAtom)
  const error = useAtomValue(soulErrorAtom)
  const [answers, setAnswers] = useState({
    who: '',
    sell: '',
    voice: '',
    forbidden: '',
  })
  const set =
    (k: keyof typeof answers) => (e: ChangeEvent<HTMLTextAreaElement>) =>
      setAnswers(a => ({ ...a, [k]: e.target.value }))

  const submit = async () => {
    const ok = await save(composeSoul(answers))
    if (ok) props.onSaved()
  }

  const fields: Array<{
    k: keyof typeof answers
    label: string
    hint: string
  }> = [
    {
      k: 'who',
      label: t('welcome.soul.who'),
      hint: t('welcome.soul.who.hint'),
    },
    {
      k: 'sell',
      label: t('welcome.soul.sell'),
      hint: t('welcome.soul.sell.hint'),
    },
    {
      k: 'voice',
      label: t('welcome.soul.voice'),
      hint: t('welcome.soul.voice.hint'),
    },
    {
      k: 'forbidden',
      label: t('welcome.soul.forbidden'),
      hint: t('welcome.soul.forbidden.hint'),
    },
  ]

  return (
    <div className="welcome__card">
      <div className="welcome__why">
        <FileText size={28} aria-hidden="true" />
        <h2>{t('welcome.soul.title')}</h2>
        <p>{t('welcome.soul.lead')}</p>
      </div>
      {fields.map(f => (
        <label key={f.k} className="welcome__field">
          <span>{f.label}</span>
          <textarea
            rows={2}
            value={answers[f.k]}
            onChange={set(f.k)}
            placeholder={f.hint}
          />
        </label>
      ))}
      {error && <p className="welcome__error">{error}</p>}
      <div className="welcome__actions">
        <button
          type="button"
          className="welcome__btn welcome__btn--primary"
          onClick={submit}
          disabled={saving || !soulHasSubstance(answers)}
        >
          {saving ? (
            <>
              <Loader2 size={18} className="welcome__spin" aria-hidden="true" />
              {t('welcome.soul.saving')}
            </>
          ) : (
            t('welcome.soul.save')
          )}
        </button>
      </div>
    </div>
  )
}

export default WelcomeOnboarding
