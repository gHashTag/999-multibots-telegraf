import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { FileText, Film, Image, Layers3, Mic, Smile } from 'lucide-react'

import { useLanguage } from '@/hooks/useLanguage'
import { AI_PIPELINE_STAGES, type AiPipelineStageId } from '@/lib/aiPipeline'
import './AiPipelineNav.css'

const ICONS: Record<AiPipelineStageId, typeof FileText> = {
  script: FileText,
  audio: Mic,
  image: Image,
  avatar: Smile,
  video: Film,
  editor: Layers3,
}

export function AiPipelineNav() {
  const { lang } = useLanguage()
  const location = useLocation()
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('.ai-pipeline__item.is-active')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [location.pathname])

  return (
    <nav
      ref={navRef}
      className="ai-pipeline"
      aria-label={
        lang === 'ru' ? 'Этапы создания ролика' : 'Reel creation stages'
      }
    >
      {AI_PIPELINE_STAGES.map(stage => {
        const Icon = ICONS[stage.id]
        return (
          <NavLink
            key={stage.id}
            to={stage.route}
            data-stage={stage.id}
            className={({ isActive }) =>
              `ai-pipeline__item${isActive ? ' is-active' : ''}`
            }
          >
            <Icon size={16} aria-hidden="true" />
            <span className="ai-pipeline__label">
              {lang === 'ru' ? stage.labelRu : stage.labelEn}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}
