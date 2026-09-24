import { useState } from 'react'
import { initialsOf } from '@/components/Chat/ChatThreads'
import './Avatar.css'

/**
 * A PERSON'S FACE, OR THEIR INITIALS.
 *
 * One component for every place the CRM shows a person (the list, the card,
 * the all-clients picker), so a face that loads in one place loads in all of
 * them, and a broken picture falls back to initials instead of an empty box.
 */
export function Avatar({
  name,
  url,
  size = 40,
  className = '',
}: {
  name: string
  url?: string | null
  size?: number
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  return (
    <span
      className={`crm-avatar ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {url && !broken ? (
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
