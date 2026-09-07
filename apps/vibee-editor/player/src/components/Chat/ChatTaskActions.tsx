import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import {
  MINI_APP_TASK_ROUTES,
  miniAppTaskDestination,
} from '@/lib/miniAppRoutes'
import './ChatTaskActions.css'

export function ChatTaskActions({ destinations }: { destinations?: string[] }) {
  const { t } = useLanguage()
  const known = [...new Set(destinations || [])]
    .filter(destination =>
      miniAppTaskDestination({ type: 'open_mini_app', destination })
    )
    .slice(0, 2)
  if (!known.length) return null
  return (
    <div className="chat-task-actions">
      {known.map(destination => (
        <Link key={destination} to={MINI_APP_TASK_ROUTES[destination]}>
          {t('chat.openTask', { task: t(`chat.action.${destination}`) })}
        </Link>
      ))}
    </div>
  )
}
