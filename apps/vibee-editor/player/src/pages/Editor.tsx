import React, { useEffect, Suspense, useRef, useState } from 'react'
import { useSetAtom, useAtomValue, useAtom } from 'jotai'
import { useSearchParams } from 'react-router-dom'
import {
  loadCaptionsAtom,
  updateDurationFromLipSyncAtom,
  lipSyncVideoAtom,
  ensureAudioTrackAtom,
  ensureVoiceTrackAtom,
  ensureImageTrackAtom,
  selectedItemIdsAtom,
  sidebarTabAtom,
  clearSelectionAtom,
} from '@/atoms'
import {
  layoutPresetAtom,
  LAYOUT_PRESETS,
  publishModalOpenAtom,
} from '@/atoms/ui'
import {
  useAutoRecordHistory,
  useAutoSaveTemplateSettings,
} from '@/atoms/hooks'
import { AssetsPanel } from '@/components/Panels/AssetsPanel'
import { TemplatesPanel } from '@/components/Panels/TemplatesPanel'
import { Header } from '@/components/Header'
import { AiPipelineNav } from '@/components/AI/AiPipelineNav'
import { AiAssemblyBar } from '@/components/AI/AiAssemblyBar'
import { PropertiesPanel } from '@/components/Panels/PropertiesPanel'
import { InteractiveCanvas } from '@/components/Canvas/InteractiveCanvas'
import { Timeline } from '@/components/Timeline/Timeline'
import { ShortcutsModal } from '@/components/Modals/ShortcutsModal'
import { BottomSheet } from '@/components/BottomSheet/BottomSheet'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PanelError } from '@/components/Panels/PanelError'
import { useKeyboardShortcuts } from '@/hooks/useKeyboard'
import { useIsMobile, useIsTablet } from '@/hooks/useMediaQuery'
import { useWebSocket, setGlobalWsSend } from '@/lib/websocket'
import { useLanguage } from '@/hooks/useLanguage'

function EditorContent() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [sidebarTab, setSidebarTab] = useAtom(sidebarTabAtom)
  const setPublishModalOpen = useSetAtom(publishModalOpenAtom)
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()

  // Use atoms directly instead of bridge
  const updateDurationFromLipSync = useSetAtom(updateDurationFromLipSyncAtom)
  const loadCaptions = useSetAtom(loadCaptionsAtom)
  const lipSyncVideo = useAtomValue(lipSyncVideoAtom)
  const ensureAudioTrack = useSetAtom(ensureAudioTrackAtom)
  const ensureVoiceTrack = useSetAtom(ensureVoiceTrackAtom)
  const ensureImageTrack = useSetAtom(ensureImageTrackAtom)
  const selectedItemIds = useAtomValue(selectedItemIdsAtom)
  const clearSelection = useSetAtom(clearSelectionAtom)
  const layoutPreset = useAtomValue(layoutPresetAtom)
  const prevLipSyncRef = useRef<string | null>(null)

  // Get layout config
  const layoutConfig = LAYOUT_PRESETS[layoutPreset] || LAYOUT_PRESETS.classic
  const showAssets = layoutConfig.showAssets

  // Enable keyboard shortcuts
  useKeyboardShortcuts()

  // Auto-record history on state changes (for undo/redo)
  useAutoRecordHistory()

  // Auto-save template settings when they change (debounced)
  useAutoSaveTemplateSettings()

  // Run migrations and load initial data on mount
  useEffect(() => {
    // Clear stale lipsync video from localStorage (was persisted by old atomWithStorage)
    localStorage.removeItem('vibee-lipsync-video')
    ensureAudioTrack() // Migration: ensure audio/music track exists + rename Audio→Music
    ensureVoiceTrack() // Migration: ensure voice track exists for old users
    ensureImageTrack() // Migration: ensure image track exists for old users
    updateDurationFromLipSync()
    loadCaptions()
  }, [
    ensureAudioTrack,
    ensureVoiceTrack,
    ensureImageTrack,
    updateDurationFromLipSync,
    loadCaptions,
  ])

  // Set default sidebar tab to 'templates' when entering Editor (run once)
  // Valid tabs: templates, lipsync, video, image, voice, music
  useEffect(() => {
    if (
      !['templates', 'lipsync', 'video', 'image', 'voice', 'music'].includes(
        sidebarTab
      )
    ) {
      setSidebarTab('templates')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle openShare URL parameter (from Instagram callback)
  useEffect(() => {
    if (searchParams.get('openShare') === 'true') {
      // Open publish modal after short delay to let page render
      setTimeout(() => {
        setPublishModalOpen(true)
      }, 500)
      // Remove the param from URL to prevent re-opening on refresh
      searchParams.delete('openShare')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, setPublishModalOpen])

  // Auto-transcribe when lipSyncVideo changes (not on mount)
  useEffect(() => {
    // Skip on initial mount
    if (prevLipSyncRef.current === null) {
      prevLipSyncRef.current = lipSyncVideo
      return
    }

    // Skip if same video
    if (prevLipSyncRef.current === lipSyncVideo) {
      return
    }

    prevLipSyncRef.current = lipSyncVideo

    // For default video - just load existing captions
    if (lipSyncVideo === '/lipsync/lipsync.mp4') {
      console.log('[Editor] LipSync reset to default, loading captions')
      loadCaptions()
      return
    }

    // Generated voice already carries alignment from the same provider
    // response. Never call the historical /transcribe route: it does not
    // exist and estimating from a script would produce incorrect subtitles.
  }, [lipSyncVideo, loadCaptions])

  // Initialize WebSocket for real-time sync (optional - works without render server)
  const { send } = useWebSocket({})

  // Set global send function for use in other components
  useEffect(() => {
    setGlobalWsSend(send)
  }, [send])

  // Handle '?' key for shortcuts modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }
      if ((e.shiftKey && e.code === 'Slash') || e.code === 'F1') {
        e.preventDefault()
        setShowShortcuts(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      className={`editor layout-${layoutPreset} ${showAssets ? 'has-assets' : 'no-assets'}`}
      style={
        {
          '--assets-width': `${layoutConfig.assetsWidth}px`,
          '--timeline-height': `${layoutConfig.timelineHeight}px`,
        } as React.CSSProperties
      }
    >
      <Header />
      <AiPipelineNav />
      <AiAssemblyBar />

      <main id="main-content" className="editor-main" role="main">
        {/* Left sidebar: Tabs for each content group */}
        {showAssets && (
          <aside className="sidebar sidebar-left">
            <ErrorBoundary fallback={<PanelError />}>
              {/* Content tabs - synced with AI menu via sidebarTabAtom */}
              {/* Order: Templates, Avatar, Video, Photo, Voice, Music */}
              <div className="sidebar-content-tabs">
                <button
                  className={`content-tab ${sidebarTab === 'templates' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('templates')}
                >
                  <span>📋</span>
                  <span>{t('tabs.templates')}</span>
                </button>
                <button
                  className={`content-tab ${sidebarTab === 'lipsync' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('lipsync')}
                >
                  <span>👄</span>
                  <span>{t('tabs.avatar')}</span>
                </button>
                <button
                  className={`content-tab ${sidebarTab === 'video' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('video')}
                >
                  <span>🎬</span>
                  <span>{t('generate.video')}</span>
                </button>
                <button
                  className={`content-tab ${sidebarTab === 'image' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('image')}
                >
                  <span>📷</span>
                  <span>{t('generate.image')}</span>
                </button>
                <button
                  className={`content-tab ${sidebarTab === 'voice' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('voice')}
                >
                  <span>🎤</span>
                  <span>{t('generate.voice')}</span>
                </button>
                <button
                  className={`content-tab ${sidebarTab === 'music' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('music')}
                >
                  <span>🎵</span>
                  <span>{t('generate.music')}</span>
                </button>
              </div>
              {/* Tab content */}
              <div className="sidebar-tab-content">
                {sidebarTab === 'templates' && <TemplatesPanel />}
                {sidebarTab === 'lipsync' && (
                  <AssetsPanel filterType="lipsync" />
                )}
                {(sidebarTab === 'video' ||
                  sidebarTab === 'image' ||
                  sidebarTab === 'voice' ||
                  sidebarTab === 'music') && (
                  <AssetsPanel filterType={sidebarTab} />
                )}
              </div>
            </ErrorBoundary>
          </aside>
        )}

        {/* Canvas */}
        <section className="canvas-area">
          <ErrorBoundary fallback={<PanelError />}>
            <InteractiveCanvas />
          </ErrorBoundary>
        </section>

        {/* Right sidebar: Properties (when items selected) */}
        {selectedItemIds.length > 0 && (
          <aside className="sidebar sidebar-right">
            <ErrorBoundary fallback={<PanelError />}>
              <PropertiesPanel />
            </ErrorBoundary>
          </aside>
        )}
      </main>

      {/* Timeline */}
      <footer className="timeline-area">
        <ErrorBoundary fallback={<PanelError />}>
          {/* hideBrowser по умолчанию true, и никто не передавал false — вместе
              с тем, что отдельный AssetBrowser не импортировался нигде, это
              означало, что браузера ассетов в интерфейсе НЕ БЫЛО вовсе: ни
              встроенного, ни отдельного. Взять ассет в монтаж было неоткуда. */}
          <Timeline hideBrowser={false} />
        </ErrorBoundary>
      </footer>

      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Mobile BottomSheet for properties */}
      {isMobile && !isTablet && selectedItemIds.length > 0 && (
        <BottomSheet
          isOpen={selectedItemIds.length > 0}
          // Закрытие снимает выделение. Пустая заглушка здесь означала, что
          // ни крестик, ни свайп, ни Escape, ни тап по подложке не закрывают
          // лист: подложка остаётся поверх редактора с pointer-events, скролл
          // остаётся заблокирован, и Play с Export становятся физически
          // недоступны. Любой тап по клипу убивал сессию до перезагрузки.
          onClose={clearSelection}
          title={t('panels.properties')}
          height="half"
        >
          <ErrorBoundary fallback={<PanelError />}>
            <PropertiesPanel />
          </ErrorBoundary>
        </BottomSheet>
      )}
    </div>
  )
}

function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
          Loading Editor...
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  )
}

export default EditorPage
