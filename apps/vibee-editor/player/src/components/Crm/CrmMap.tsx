import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { myProfileAtom } from '@/atoms/profile'
import { userAtom } from '@/atoms/user'
import { initialsOf } from '@/components/Chat/ChatThreads'
import {
  ensureAvatars,
  loadAutopilotLeads,
  loadCrmMap,
  pickForAutopilot,
} from '@/lib/crm'
import {
  layoutMap,
  neighboursOf,
  type MapEdgeData,
  type MapNodeData,
  type PlacedNode,
} from '@/lib/crmMap'
import './CrmMap.css'

/**
 * THE OWNER'S PEOPLE AS A MAP.
 *
 * Owner, 2026-09-25: every contact a round avatar, placed by sphere of
 * interest, the owner in the centre, links between people drawn as a graph;
 * a tap on an avatar opens every action for that contact.
 *
 * What is drawn is what the memory can prove (render crm-map.ts): the sphere
 * comes from a person's own words, a line between two people means both
 * wrote in the same group, and the spoke to the centre is as thick as our
 * conversation. Nothing on this screen writes to anybody: the actions open
 * the agent's chat, the card, or Telegram, and AUTO is the same switch the
 * card has.
 */
type Loaded =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; nodes: MapNodeData[]; edges: MapEdgeData[] }

export function CrmMap() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const profile = useAtomValue(myProfileAtom)
  const user = useAtomValue(userAtom)
  const [data, setData] = useState<Loaded>({ state: 'loading' })
  const [auto, setAuto] = useState<Set<string> | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [focusLinks, setFocusLinks] = useState(false)
  const [sphere, setSphere] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [m, a] = await Promise.all([loadCrmMap(), loadAutopilotLeads()])
      if (!alive) return
      setData(
        m.reachable && m.data
          ? { state: 'ready', nodes: m.data.nodes, edges: m.data.edges }
          : { state: 'failed' }
      )
      setAuto(a.data ? new Set(a.data) : null)
      // Faces the CRM has not fetched yet arrive on the next visit.
      void ensureAvatars()
    })()
    return () => {
      alive = false
    }
  }, [])

  const nodes = useMemo(
    () => (data.state === 'ready' ? data.nodes : []),
    [data]
  )
  const edges = useMemo(
    () => (data.state === 'ready' ? data.edges : []),
    [data]
  )
  const layout = useMemo(() => layoutMap(nodes), [nodes])
  const byId = useMemo(
    () => new Map(layout.nodes.map(n => [n.id, n])),
    [layout]
  )
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const n of nodes) c.set(n.sphere, (c.get(n.sphere) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [nodes])
  const near = useMemo(
    () => (picked && focusLinks ? neighboursOf(picked, edges) : null),
    [picked, focusLinks, edges]
  )

  const dim = (n: PlacedNode) =>
    (sphere !== null && n.sphere !== sphere) ||
    (near !== null && n.id !== picked && !near.has(n.id))

  if (data.state === 'loading')
    return <p className="crm-map__note">{t('crm.map.loading')}</p>
  if (data.state === 'failed')
    return <p className="crm-map__note">{t('crm.map.failed')}</p>
  if (!nodes.length)
    return <p className="crm-map__note">{t('crm.map.empty')}</p>

  const ownerName = profile?.display_name || user?.first_name || ''
  const ownerFace = profile?.avatar_url || user?.photo_url || null
  const c = layout.center
  const sel = picked ? byId.get(picked) : undefined
  const selName = sel
    ? sel.name || (sel.username ? `@${sel.username}` : sel.id)
    : ''
  const isAuto = sel && auto ? auto.has(sel.id) : null

  const toggleAuto = async () => {
    if (!sel || isAuto === null) return
    const r = await pickForAutopilot(sel.id, !isAuto)
    if (!r.reachable) return
    const next = new Set(auto)
    if (isAuto) next.delete(sel.id)
    else next.add(sel.id)
    setAuto(next)
  }

  return (
    <section className="crm-map" aria-label={t('crm.map.title')}>
      <div className="crm-map__bar">
        <button
          type="button"
          className={`crm-map__chip${sphere === null ? ' is-on' : ''}`}
          onClick={() => setSphere(null)}
        >
          {t('crm.map.all')} · {nodes.length}
        </button>
        {counts.map(([s, n]) => (
          <button
            key={s}
            type="button"
            className={`crm-map__chip${sphere === s ? ' is-on' : ''}`}
            data-sphere={s}
            onClick={() => setSphere(sphere === s ? null : s)}
          >
            {t(`crm.map.sphere.${s}`)} · {n}
          </button>
        ))}
        <span className="crm-map__zoom">
          <button
            type="button"
            aria-label={t('crm.map.zoomOut')}
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
          >
            −
          </button>
          <button
            type="button"
            aria-label={t('crm.map.zoomIn')}
            onClick={() => setZoom(z => Math.min(3, z + 0.25))}
          >
            +
          </button>
        </span>
      </div>

      <div className="crm-map__stage">
        <svg
          className="crm-map__svg"
          viewBox={`0 0 ${layout.size} ${layout.size}`}
          style={{ width: `${zoom * 100}%` }}
          onClick={() => setPicked(null)}
          role="img"
          aria-label={t('crm.map.title')}
        >
          <defs>
            <clipPath id="crm-map-circle" clipPathUnits="objectBoundingBox">
              <circle cx="0.5" cy="0.5" r="0.5" />
            </clipPath>
          </defs>

          {layout.nodes.map(n => (
            <line
              key={`s-${n.id}`}
              className="crm-map__spoke"
              x1={c}
              y1={c}
              x2={n.x}
              y2={n.y}
              strokeWidth={Math.min(4, 0.5 + Math.log2(1 + n.talk) * 0.4)}
              opacity={dim(n) ? 0.04 : 0.18}
            />
          ))}
          {edges.map(e => {
            const a = byId.get(e.a)
            const b = byId.get(e.b)
            if (!a || !b) return null
            const lit = picked !== null && (e.a === picked || e.b === picked)
            const faded = dim(a) && dim(b)
            return (
              <line
                key={`e-${e.a}-${e.b}`}
                className={`crm-map__edge${lit ? ' is-lit' : ''}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={Math.min(5, e.shared)}
                opacity={faded ? 0.05 : lit ? 0.9 : 0.35}
              />
            )
          })}

          {layout.nodes.map(n => (
            <g
              key={n.id}
              className={`crm-map__node${picked === n.id ? ' is-picked' : ''}`}
              data-sphere={n.sphere}
              transform={`translate(${n.x - n.r} ${n.y - n.r})`}
              opacity={dim(n) ? 0.18 : 1}
              onClick={ev => {
                ev.stopPropagation()
                setPicked(picked === n.id ? null : n.id)
              }}
              role="button"
              tabIndex={0}
              aria-label={n.name || n.username || n.id}
              onKeyDown={ev => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  setPicked(n.id)
                }
              }}
            >
              <circle className="crm-map__ring" cx={n.r} cy={n.r} r={n.r + 2} />
              <circle className="crm-map__disc" cx={n.r} cy={n.r} r={n.r} />
              <text
                className="crm-map__initials"
                x={n.r}
                y={n.r}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.round(n.r * 0.7)}
              >
                {initialsOf(n.name || n.username || n.id)}
              </text>
              {n.avatarUrl ? (
                <image
                  href={n.avatarUrl}
                  width={n.r * 2}
                  height={n.r * 2}
                  clipPath="url(#crm-map-circle)"
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : null}
              {auto?.has(n.id) ? (
                <circle
                  className="crm-map__auto"
                  cx={n.r * 1.7}
                  cy={n.r * 0.3}
                  r={5}
                />
              ) : null}
            </g>
          ))}

          {layout.labels.map(l => (
            <text
              key={`l-${l.sphere}`}
              className="crm-map__label"
              x={l.x}
              y={l.y}
              textAnchor="middle"
              opacity={sphere !== null && sphere !== l.sphere ? 0.2 : 0.9}
            >
              {t(`crm.map.sphere.${l.sphere}`)}
            </text>
          ))}

          <g
            className="crm-map__owner"
            transform={`translate(${c - layout.ownerR} ${c - layout.ownerR})`}
          >
            <circle
              className="crm-map__ring"
              cx={layout.ownerR}
              cy={layout.ownerR}
              r={layout.ownerR + 3}
            />
            <circle
              className="crm-map__disc"
              cx={layout.ownerR}
              cy={layout.ownerR}
              r={layout.ownerR}
            />
            <text
              className="crm-map__initials"
              x={layout.ownerR}
              y={layout.ownerR}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={30}
            >
              {initialsOf(ownerName || t('crm.map.you'))}
            </text>
            {ownerFace ? (
              <image
                href={ownerFace}
                width={layout.ownerR * 2}
                height={layout.ownerR * 2}
                clipPath="url(#crm-map-circle)"
                preserveAspectRatio="xMidYMid slice"
              />
            ) : null}
          </g>
        </svg>
      </div>

      {sel ? (
        <div className="crm-map__menu" role="dialog" aria-label={selName}>
          <header>
            <strong>{selName}</strong>
            <span>
              {t(`crm.map.sphere.${sel.sphere}`)} ·{' '}
              {t('crm.map.talk', { n: sel.talk })}
            </span>
            <button
              type="button"
              className="crm-map__close"
              aria-label={t('crm.map.close')}
              onClick={() => setPicked(null)}
            >
              ×
            </button>
          </header>
          <div className="crm-map__actions">
            <button
              type="button"
              onClick={() =>
                navigate(`/crm/${encodeURIComponent(sel.id)}/chat`)
              }
            >
              {t('crm.map.action.chat')}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/crm/${encodeURIComponent(sel.id)}`)}
            >
              {t('crm.map.action.card')}
            </button>
            <button
              type="button"
              className={focusLinks ? 'is-on' : ''}
              onClick={() => setFocusLinks(v => !v)}
            >
              {t('crm.map.action.links', {
                n: neighboursOf(sel.id, edges).size,
              })}
            </button>
            {isAuto !== null ? (
              <button type="button" onClick={() => void toggleAuto()}>
                {t(isAuto ? 'crm.map.action.autoOff' : 'crm.map.action.autoOn')}
              </button>
            ) : null}
            {sel.username ? (
              <a
                href={`https://t.me/${encodeURIComponent(sel.username)}`}
                target="_blank"
                rel="noreferrer"
              >
                {t('crm.map.action.telegram')}
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="crm-map__hint">{t('crm.map.hint')}</p>
      )}
    </section>
  )
}
