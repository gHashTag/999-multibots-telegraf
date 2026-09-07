import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { Header } from '@/components/Header'
import { useLanguage } from '@/hooks/useLanguage'
import {
  HIVE_TABS,
  loadComb,
  type Comb,
  type Module,
  isHiveTab,
  loadBoard,
  loadFactory,
  loadMarks,
  loadMission,
  loadSpecs,
  loadTree,
  type Fetched,
  type HiveTab,
} from '@/lib/hive'
import './Hive.css'

/*
 * BABYLON IS BEHIND `lazy`, AND THAT IS THE WHOLE POINT.
 *
 * `@babylonjs/core` is megabytes. This is a Telegram Mini App opened on
 * phones, often on mobile data, and four of its five tabs have nothing to do
 * with 3-D. A static import anywhere the main bundle can reach would make
 * every person pay for a scene most of them never open.
 *
 * Loaded only when somebody is looking at the comb.
 */
const CombScene = lazy(() => import('@/components/Hive/CombScene'))

/**
 * THE HIVE -- THE GAME, AS A TAB.
 *
 * Owner, 2026-09-07: "the game is https://t27.ai/#/queen", "add the game as
 * another tab with all its sub-tabs", and the mission: "t27 is the central
 * repo, trios is secondary; the point of the game is to rewrite code onto t27
 * so that files are generated rather than written by hand".
 *
 * The six sub-tabs are HER six, in her own menu order: comb, specs, kanban,
 * mission map, factory, technology tree. They are not invented here; renaming
 * or reordering them would mean two vocabularies for one board, and a person
 * moving between t27.ai and this app would have to translate.
 *
 * WHAT THIS IS NOT
 *
 * It is not a copy of her 3-D scene. That is a Babylon.js application, and a
 * second implementation would drift from the first the day either changes.
 * This is the same data, read live, laid out to be readable on a phone -- with
 * a link out to the 3-D board for anybody who wants it.
 *
 * EVERY STRING COMES FROM THE DICTIONARY
 *
 * Not for tidiness: the app opens in English by default (`getInitialLanguage`
 * returns 'en' unless the browser asks for Russian), and text baked into the
 * markup would show Russian to an English reader with no way to switch.
 *
 * EACH SUB-TAB LOADS ONLY WHEN OPENED
 *
 * The spec corpus alone is 759 KB. Fetching all six on mount would spend three
 * quarters of a megabyte of somebody's mobile data on panels they may never
 * open.
 */

/**
 * One loading state per panel, so "empty" and "did not answer" can never be
 * confused. A panel showing zeros while the Queen is unreachable is the single
 * worst thing a status screen can do.
 */
function useHive<T>(load: () => Promise<Fetched<T>>, key: string) {
  const [state, setState] = useState<{ loading: boolean; result?: Fetched<T> }>(
    {
      loading: true,
    }
  )

  useEffect(() => {
    let alive = true
    setState({ loading: true })
    load().then(r => {
      if (alive) setState({ loading: false, result: r })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

function Panel<T>({
  state,
  children,
}: {
  state: { loading: boolean; result?: Fetched<T> }
  children: (data: T) => ReactNode
}) {
  const { t } = useLanguage()
  if (state.loading) return <p className="hive-note">{t('hive.asking')}</p>
  const r = state.result
  if (!r?.reachable || !r.data) {
    return (
      <div className="hive-down">
        <p className="hive-down__title">{t('hive.down')}</p>
        {/* Spelled out, not left to be inferred from a zero: an unreachable
            hive and a quiet hive look identical. */}
        <p className="hive-note">
          {t('hive.down.note')}
          {r?.why ? ` (${r.why})` : ''}
        </p>
      </div>
    )
  }
  return <>{children(r.data)}</>
}

/**
 * The flat map. Not a placeholder -- it is what a phone without WebGL gets,
 * and WebGL is missing or blocked inside a Mini App webview more often than
 * people expect.
 */
function FlatComb({
  modules,
  onPick,
}: {
  modules: Module[]
  onPick: (m: Module) => void
}) {
  const maxLines = Math.max(...modules.map(m => m.lines), 1)
  return (
    <div className="comb-flat">
      {modules.map(m => (
        <button
          key={m.path}
          className={`comb-flat__cell${m.busy ? ' comb-flat__cell--busy' : ''}`}
          style={{
            // Log scale: linear left everything but the largest three
            // invisible beside a 23 880-line neighbour.
            opacity:
              0.3 +
              0.7 *
                Math.min(
                  Math.max(
                    Math.log(Math.max(m.lines, 1)) / Math.log(maxLines),
                    0
                  ),
                  1
                ),
          }}
          onClick={() => onPick(m)}
          title={m.path}
          aria-label={m.path}
        />
      ))}
    </div>
  )
}

function ModuleCard({ module: m }: { module: Module }) {
  const { t } = useLanguage()
  return (
    <div className="hive-layer">
      <h3>{m.path || '.'}</h3>
      <p className="hive-note">
        {t('hive.moduleStats', {
          lang: m.language,
          lines: m.lines,
          files: m.files,
          fn: m.functions,
        })}
      </p>
      {m.busy && (
        <p className="hive-note">
          {t('hive.moduleIssues', {
            list: m.openIssues
              .slice(0, 6)
              .map(n => `#${n}`)
              .join(' '),
          })}
        </p>
      )}
    </div>
  )
}

function Comb() {
  const { t } = useLanguage()
  const comb = useHive(loadComb, 'comb')
  const marks = useHive(loadMarks, 'marks')
  const [picked, setPicked] = useState<Module | null>(null)
  const [flat, setFlat] = useState(false)

  return (
    <>
      <Panel state={comb}>
        {(c: Comb) => (
          <>
            {flat ? (
              <FlatComb modules={c.modules} onPick={setPicked} />
            ) : (
              <Suspense
                fallback={<p className="hive-note">{t('hive.building')}</p>}
              >
                <CombScene
                  modules={c.modules}
                  onPick={setPicked}
                  onFallback={() => setFlat(true)}
                />
              </Suspense>
            )}

            {/* Without a legend, amber and green are two colours and the
                reader invents a meaning for them. */}
            <div className="comb-legend">
              <span className="comb-legend__dot comb-legend__dot--busy" />
              {t('hive.legend.busy')}
              <span className="comb-legend__dot comb-legend__dot--quiet" />
              {t('hive.legend.quiet')}
            </div>

            {picked ? (
              <ModuleCard module={picked} />
            ) : (
              <p className="hive-note">
                {t('hive.combCounts', {
                  total: c.modules.length,
                  busy: c.busyCount,
                  quiet: c.modules.length - c.busyCount,
                })}
                {flat ? t('hive.noWebgl') : ''}
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel state={marks}>
        {list => (
          <ol className="hive-marks">
            {list.slice(0, 12).map((m, i) => (
              <li
                key={`${m.issue}-${i}`}
                className={`hive-mark hive-mark--${m.state}`}
              >
                <span className="hive-mark__kind">{m.kind}</span>
                <span className="hive-mark__title">{m.title}</span>
                {m.issue !== null && (
                  <span className="hive-mark__id">#{m.issue}</span>
                )}
              </li>
            ))}
            {list.length === 0 && (
              <p className="hive-note">{t('hive.noMarks')}</p>
            )}
          </ol>
        )}
      </Panel>
    </>
  )
}
function Kanban() {
  const { t } = useLanguage()
  const board = useHive(loadBoard, 'board')
  return (
    <Panel state={board}>
      {b => (
        <>
          <p className="hive-note">{b.repo}</p>
          <div className="hive-columns">
            {b.columns.map(c => (
              <section key={c.key} className="hive-column">
                <h3>
                  {c.title} <span className="hive-count">{c.count}</span>
                </h3>
                <p className="hive-note">{c.blurb}</p>
                <ul>
                  {b.cards
                    .filter(x => x.column === c.key)
                    .slice(0, 8)
                    .map(x => (
                      <li key={x.issue}>
                        <span className="hive-mark__id">#{x.issue}</span>{' '}
                        {x.title}
                      </li>
                    ))}
                </ul>
                {c.count > 8 && (
                  <p className="hive-note">
                    {t('hive.andMore', { n: c.count - 8 })}
                  </p>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

function Factory() {
  const { t } = useLanguage()
  const f = useHive(loadFactory, 'factory')
  return (
    <Panel state={f}>
      {d => (
        <>
          <div className="hive-stats">
            <div className="hive-stat">
              <b>
                {d.bees.active}/{d.bees.capacity}
              </b>
              <span>{t('hive.bees')}</span>
            </div>
            <div className="hive-stat">
              <b>{d.swarmState}</b>
              <span>{t('hive.swarm')}</span>
            </div>
            {d.tickEverySeconds && (
              <div className="hive-stat">
                <b>{d.tickEverySeconds}s</b>
                <span>{t('hive.tick')}</span>
              </div>
            )}
            <div className="hive-stat">
              <b>{d.skippedLastTick}</b>
              <span>{t('hive.skipped')}</span>
            </div>
          </div>
          <p className="hive-note">
            {d.signed
              ? t('hive.foundrySigned', {
                  alg: d.signed.algorithm,
                  key: d.signed.keyId,
                })
              : t('hive.foundrySilent')}
          </p>
          {d.lastTickAt && (
            <p className="hive-note">
              {t('hive.lastRound', { at: d.lastTickAt })}
            </p>
          )}
        </>
      )}
    </Panel>
  )
}

function Tree() {
  const { t } = useLanguage()
  const tree = useHive(loadTree, 'tree')
  return (
    <Panel state={tree}>
      {d => (
        <>
          <div className="hive-stats">
            <div className="hive-stat">
              <b>{d.summary.percentage}%</b>
              <span>{t('hive.studied')}</span>
            </div>
            <div className="hive-stat">
              <b>{d.summary.researched}</b>
              <span>{t('hive.done')}</span>
            </div>
            <div className="hive-stat">
              <b>{d.summary.researching}</b>
              <span>{t('hive.inWork')}</span>
            </div>
            <div className="hive-stat">
              <b>{d.summary.locked}</b>
              <span>{t('hive.locked')}</span>
            </div>
          </div>
          {d.layers.map(layer => {
            const nodes = d.nodes.filter(n => n.layer === layer)
            if (!nodes.length) return null
            return (
              <section key={layer} className="hive-layer">
                <h3>
                  {layer} <span className="hive-count">{nodes.length}</span>
                </h3>
                <ul>
                  {nodes.map(n => (
                    <li
                      key={n.id}
                      className={`hive-node hive-node--${n.state}`}
                    >
                      <span className="hive-node__state">{n.state}</span>
                      {n.label}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </Panel>
  )
}

function Mission() {
  const { t } = useLanguage()
  const m = useHive(loadMission, 'mission')
  return (
    <Panel state={m}>
      {d => (
        <>
          <p className="hive-note">
            {t('hive.closedIssues', { repo: d.repo, n: d.closedIssues })}
          </p>
          {d.rule && <blockquote className="hive-rule">{d.rule}</blockquote>}
          {d.releases.length > 0 && (
            <section className="hive-layer">
              <h3>{t('hive.releases')}</h3>
              <ul>
                {d.releases.map((r, i) => (
                  <li key={`${r.name}-${i}`}>
                    {r.name} <span className="hive-note">{r.at}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="hive-layer">
            <h3>
              {t('hive.epics')}{' '}
              <span className="hive-count">{d.epics.length}</span>
            </h3>
            <ul>
              {d.epics.map((e, i) => (
                <li key={`${e.title}-${i}`}>
                  {e.ring && <span className="hive-node__state">{e.ring}</span>}
                  {e.title}
                </li>
              ))}
            </ul>
            {/* The cap is stated rather than silently applied: a list that
                quietly stops at forty reads as "that is all there is". */}
            <p className="hive-note">{t('hive.firstN', { n: 40 })}</p>
          </section>
        </>
      )}
    </Panel>
  )
}

function Specs() {
  const { t } = useLanguage()
  const s = useHive(loadSpecs, 'specs')
  return (
    <Panel state={s}>
      {d => (
        <>
          {/* The mission, stated where the numbers are. */}
          <p className="hive-rule">{t('hive.mission')}</p>
          <div className="hive-stats">
            <div className="hive-stat">
              <b>{d.specCount}</b>
              <span>{t('hive.specCount')}</span>
            </div>
            <div className="hive-stat">
              <b>{d.totalLines.toLocaleString()}</b>
              <span>{t('hive.lines')}</span>
            </div>
            <div className="hive-stat">
              <b>{d.health.ok}</b>
              <span>{t('hive.healthOk')}</span>
            </div>
            <div className="hive-stat">
              <b>{d.health.warn}</b>
              <span>{t('hive.healthWarn')}</span>
            </div>
            <div className="hive-stat">
              <b>{d.health.fail}</b>
              <span>{t('hive.healthFail')}</span>
            </div>
          </div>
          {d.repos.length > 0 && (
            <section className="hive-layer">
              <h3>{t('hive.engines')}</h3>
              <ul>
                {d.repos.map(r => (
                  <li key={r.repo}>
                    {r.repo} <span className="hive-count">{r.specs}</span>
                  </li>
                ))}
              </ul>
              {/* Said plainly rather than shown as a made-up percentage. */}
              <p className="hive-note">{t('hive.coverageNote')}</p>
            </section>
          )}
          {d.categories.length > 0 && (
            <section className="hive-layer">
              <h3>{t('hive.sections')}</h3>
              <ul>
                {d.categories.map(c => (
                  <li key={c.name}>
                    {c.name} <span className="hive-count">{c.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {d.featured.length > 0 && (
            <section className="hive-layer">
              <h3>{t('hive.featured')}</h3>
              <ul>
                {d.featured.map((f, i) => (
                  <li key={`${f.title}-${i}`}>
                    {f.category && (
                      <span className="hive-node__state">{f.category}</span>
                    )}
                    {f.title}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Panel>
  )
}

/*
 * `ReactElement`, not `JSX.Element`.
 *
 * React 19 removed the global `JSX` namespace, and the player's own stricter
 * tsconfig catches it while the workspace one does not -- so the first version
 * typechecked locally and was refused by the gate.
 */
const PANELS: Record<HiveTab, () => ReactElement> = {
  comb: Comb,
  specs: Specs,
  kanban: Kanban,
  mission: Mission,
  factory: Factory,
  tree: Tree,
}

export default function HivePage() {
  const { t } = useLanguage()
  const { tab } = useParams<{ tab: string }>()
  if (!isHiveTab(tab)) return <Navigate to="/hive/comb" replace />
  const Body = PANELS[tab]

  return (
    <div className="hive-page">
      <Header />

      <nav className="hive-tabs" aria-label="hive sections">
        {HIVE_TABS.map(x => (
          <Link
            key={x}
            to={`/hive/${x}`}
            className={`hive-tab${x === tab ? ' hive-tab--active' : ''}`}
            aria-current={x === tab ? 'page' : undefined}
          >
            {t(`hive.tab.${x}`)}
          </Link>
        ))}
      </nav>

      <main className="hive-main">
        <p className="hive-blurb">{t(`hive.blurb.${tab}`)}</p>
        <Body />
        {/* The 3-D board is not reimplemented here; it is one tap away. */}
        <a
          className="hive-out"
          href="https://t27.ai/#/queen"
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('hive.open3d')}
        </a>
      </main>
    </div>
  )
}
