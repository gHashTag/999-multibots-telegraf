import { Smartphone } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { ConnectTelegram } from './ConnectTelegram'

/**
 * THE PROFILE'S FRONT DOOR: CONNECT YOUR TELEGRAM FIRST.
 *
 * Shown instead of the profile while `agentTelegramConnectedAtom` is false on
 * the person's own profile (see profileGate.ts). It reuses the ConnectTelegram
 * flow unchanged — consent, phone, code, two-factor password — and adds only
 * the sentence that explains why the profile is not behind it yet.
 */
export function ProfileConnectGate() {
  const { t } = useLanguage()
  return (
    <section className="profile-gate" data-testid="profile-gate">
      <div className="profile-gate__why">
        <Smartphone size={28} aria-hidden="true" />
        <h2>{t('profile.gate.title')}</h2>
        <p>{t('profile.gate.body')}</p>
      </div>
      <ConnectTelegram />
    </section>
  )
}
