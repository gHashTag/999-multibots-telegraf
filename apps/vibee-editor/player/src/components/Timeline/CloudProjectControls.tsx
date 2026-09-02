import { useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Cloud, Download, Loader2, Save, X } from 'lucide-react'
import {
  assetsAtom,
  captionStyleAtom,
  captionsAtom,
  projectAtom,
  showCaptionsAtom,
  tracksAtom,
} from '@/atoms'
import { useToast } from '@/hooks/useToast'
import {
  buildProjectDocument,
  hydrateCloudProject,
  listCloudProjects,
  loadCloudProject,
  saveCloudProject,
  type CloudProjectSummary,
} from '@/lib/projectSync'
import './CloudProjectControls.css'

const newProjectId = (): string => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`
  return `project-${random.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64)
}

export function CloudProjectControls() {
  const toast = useToast()
  const project = useAtomValue(projectAtom)
  const tracks = useAtomValue(tracksAtom)
  const assets = useAtomValue(assetsAtom)
  const captions = useAtomValue(captionsAtom)
  const captionStyle = useAtomValue(captionStyleAtom)
  const showCaptions = useAtomValue(showCaptionsAtom)
  const setProject = useSetAtom(projectAtom)
  const setTracks = useSetAtom(tracksAtom)
  const setAssets = useSetAtom(assetsAtom)
  const setCaptions = useSetAtom(captionsAtom)
  const setCaptionStyle = useSetAtom(captionStyleAtom)
  const setShowCaptions = useSetAtom(showCaptionsAtom)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [projects, setProjects] = useState<CloudProjectSummary[]>([])

  useEffect(() => {
    if (!open) return
    setBusy(true)
    void listCloudProjects()
      .then(setProjects)
      .catch(error =>
        toast.error(
          error instanceof Error ? error.message : 'Cloud projects unavailable'
        )
      )
      .finally(() => setBusy(false))
  }, [open, toast])

  const save = async () => {
    setBusy(true)
    try {
      const id = project.id || newProjectId()
      const nextProject = { ...project, id }
      const document = buildProjectDocument({
        project: nextProject,
        tracks,
        assets,
        captions,
        captionStyle,
        showCaptions,
      })
      const saved = await saveCloudProject(id, project.name, document)
      setProject(nextProject)
      setProjects(current => [
        saved,
        ...current.filter(item => item.id !== saved.id),
      ])
      toast.success('Project saved to your private cloud')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Project save failed'
      )
    } finally {
      setBusy(false)
    }
  }

  const load = async (id: string) => {
    setBusy(true)
    try {
      const remote = await loadCloudProject(id)
      const state = hydrateCloudProject(remote)
      // Hydration completes before any setter runs, so malformed remote data
      // cannot leave half of the local editor replaced.
      setProject(state.project)
      setTracks(state.tracks)
      setAssets(state.assets)
      setCaptions(state.captions)
      if (state.captionStyle) setCaptionStyle(state.captionStyle)
      setShowCaptions(state.showCaptions)
      setOpen(false)
      toast.success('Cloud project loaded')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Project load failed'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="transport-btn"
        onClick={() => setOpen(true)}
        title="Cloud projects"
        aria-label="Cloud projects"
      >
        <Cloud size={16} />
      </button>
      {open && (
        <div
          className="cloud-projects-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="cloud-projects-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Cloud projects"
            onMouseDown={event => event.stopPropagation()}
          >
            <header>
              <div>
                <strong>Private cloud projects</strong>
                <span>Shared by web, iPhone, and your agent</span>
              </div>
              <button
                className="transport-btn"
                onClick={() => setOpen(false)}
                aria-label="Close cloud projects"
              >
                <X size={16} />
              </button>
            </header>
            <button
              className="cloud-projects-save"
              onClick={save}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Save size={17} />
              )}
              Save current project
            </button>
            <div className="cloud-projects-list">
              {projects.map(item => (
                <button
                  key={item.id}
                  onClick={() => void load(item.id)}
                  disabled={busy}
                >
                  <span>
                    <strong>{item.name || 'Untitled project'}</strong>
                    <small>{new Date(item.updated_at).toLocaleString()}</small>
                  </span>
                  <Download size={17} />
                </button>
              ))}
              {!busy && projects.length === 0 && (
                <p>No cloud projects yet. Save this edit first.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
