import { useState } from 'react'

/**
 * An agent's face: its avatar when one was made, its icon otherwise -- and
 * the icon again if the picture fails to load (a broken image is the one
 * thing never to draw).
 */
export function AgentFace({
  icon,
  url,
  className,
}: {
  icon: string
  url?: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  if (!url || broken)
    return (
      <span className={className} aria-hidden="true">
        {icon}
      </span>
    )
  return (
    <img
      className={`${className ?? ''} agent-face-img`}
      src={url}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      data-testid="agent-face-img"
    />
  )
}
