import { Link } from 'react-router-dom'
import { KeyRound, ArrowRight } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import '@/pages/HiveAccount.css'

/** Contribution controls remain available before the profile's club onboarding. */
export function HiveAccountLink({ isOwn }: { isOwn: boolean }) {
  const { t } = useLanguage()
  if (!isOwn) return null
  return (
    <Link className="hive-account-entry" to="/game/account">
      <KeyRound size={20} aria-hidden="true" />
      <span>{t('hiveAccount.title')}</span>
      <ArrowRight size={18} aria-hidden="true" />
    </Link>
  )
}
