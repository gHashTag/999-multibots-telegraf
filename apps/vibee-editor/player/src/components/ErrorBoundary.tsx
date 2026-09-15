import React, { Component, type ReactNode } from 'react'
import { postErrorToParent } from '@/lib/embed'

// Inline brand colors to avoid importing @vibee/atoms at top-level
// This prevents circular dependency issues with Jotai atoms
const BRAND_COLORS = {
  amber: '#00ff88',
  amberLight: '#4dffab',
  amberDark: '#00cc66',
} as const

const STATUS_COLORS = {
  error: '#ef4444',
  success: '#22c55e',
  warning: '#00ff88',
  info: '#3b82f6',
} as const

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

class ErrorBoundaryClass extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })

    // Inside the game's TRI frame the game hears that the screen is gone, so
    // it can offer a way out instead of waiting for `ready`. A boundary with
    // its own fallback guards one panel, and the page around it lives on.
    // Outside embed this posts nothing.
    if (!this.props.fallback) postErrorToParent('boundary')

    // Auto-reload on chunk load failure (happens after deploy when old chunks are gone)
    const isChunkLoadError =
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Loading chunk') ||
      error.message.includes('ChunkLoadError')

    if (isChunkLoadError) {
      console.log('Chunk load error detected, reloading page...')
      // Small delay to prevent reload loop
      const lastReload = sessionStorage.getItem('chunk-reload-time')
      const now = Date.now()
      if (!lastReload || now - parseInt(lastReload) > 10000) {
        sessionStorage.setItem('chunk-reload-time', now.toString())
        window.location.reload()
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleClearStorage = () => {
    localStorage.removeItem('vibee-editor-storage-v4')
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          onReload={this.handleReload}
          onClearStorage={this.handleClearStorage}
        />
      )
    }

    return this.props.children
  }
}

interface ErrorFallbackProps {
  error: Error | null
  errorInfo: React.ErrorInfo | null
  onReset: () => void
  onReload: () => void
  onClearStorage: () => void
}

function ErrorFallback({
  error,
  errorInfo,
  onReset,
  onReload,
  onClearStorage,
}: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = React.useState(false)

  // Inline styles as fallback when Tailwind CSS fails to load
  const styles = {
    container: {
      minHeight: '100vh',
      background:
        'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #0f0f0f 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    card: {
      maxWidth: '420px',
      width: '100%',
      background: 'rgba(26, 26, 46, 0.9)',
      borderRadius: '20px',
      padding: '32px',
      border: `1px solid ${BRAND_COLORS.amber}33`,
      boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${BRAND_COLORS.amber}1a`,
      backdropFilter: 'blur(10px)',
    },
    iconContainer: {
      width: '72px',
      height: '72px',
      borderRadius: '50%',
      background: `linear-gradient(135deg, ${BRAND_COLORS.amber}33, rgba(77, 255, 170, 0.1))`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 20px',
      border: `2px solid ${BRAND_COLORS.amber}4d`,
    },
    title: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#ffffff',
      textAlign: 'center' as const,
      marginBottom: '8px',
    },
    subtitle: {
      fontSize: '14px',
      color: '#9ca3af',
      textAlign: 'center' as const,
      marginBottom: '28px',
    },
    buttonPrimary: {
      width: '100%',
      padding: '14px 24px',
      background: `linear-gradient(135deg, ${BRAND_COLORS.amber}, #4dffab)`,
      color: '#000000',
      fontWeight: '600',
      fontSize: '15px',
      borderRadius: '12px',
      border: 'none',
      cursor: 'pointer',
      marginBottom: '12px',
      transition: 'all 0.2s ease',
      boxShadow: `0 4px 14px ${BRAND_COLORS.amber}4d`,
    },
    buttonSecondary: {
      width: '100%',
      padding: '14px 24px',
      background: 'rgba(55, 65, 81, 0.5)',
      color: '#ffffff',
      fontWeight: '500',
      fontSize: '15px',
      borderRadius: '12px',
      border: '1px solid rgba(75, 85, 99, 0.5)',
      cursor: 'pointer',
      marginBottom: '12px',
      transition: 'all 0.2s ease',
    },
    buttonDanger: {
      width: '100%',
      padding: '14px 24px',
      background: 'rgba(239, 68, 68, 0.1)',
      color: STATUS_COLORS.error,
      fontWeight: '500',
      fontSize: '15px',
      borderRadius: '12px',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      cursor: 'pointer',
      marginBottom: '16px',
      transition: 'all 0.2s ease',
    },
    detailsToggle: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      fontSize: '13px',
      color: '#6b7280',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: '8px',
      margin: '0 auto',
    },
    detailsBox: {
      marginTop: '16px',
      padding: '16px',
      background: 'rgba(0, 0, 0, 0.4)',
      borderRadius: '12px',
      fontSize: '12px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
      color: '#9ca3af',
      maxHeight: '200px',
      overflow: 'auto',
      border: '1px solid rgba(75, 85, 99, 0.3)',
    },
    errorName: {
      color: '#f87171',
      marginBottom: '8px',
      fontWeight: '600',
    },
    footer: {
      marginTop: '20px',
      fontSize: '12px',
      color: '#4b5563',
      textAlign: 'center' as const,
    },
    beeEmoji: {
      fontSize: '32px',
      marginBottom: '8px',
      display: 'block',
      textAlign: 'center' as const,
    },
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <span style={styles.beeEmoji}>🐝</span>
        </div>

        <h2 style={styles.title}>Oops! Something went wrong</h2>
        <p style={styles.subtitle}>Don't worry, our bees are working on it!</p>

        <button
          onClick={onReset}
          style={styles.buttonPrimary}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = `0 6px 20px ${BRAND_COLORS.amber}66`
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = `0 4px 14px ${BRAND_COLORS.amber}4d`
          }}
        >
          🔄 Try Again
        </button>

        <button
          onClick={onReload}
          style={styles.buttonSecondary}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(75, 85, 99, 0.5)'
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(55, 65, 81, 0.5)'
          }}
        >
          🔃 Reload Page
        </button>

        <button
          onClick={onClearStorage}
          style={styles.buttonDanger}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
          }}
        >
          🗑️ Clear Data & Reload
        </button>

        <button
          onClick={() => setShowDetails(!showDetails)}
          style={styles.detailsToggle}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: showDetails ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>

        {showDetails && (
          <div style={styles.detailsBox}>
            <div style={styles.errorName}>
              {error?.name}: {error?.message}
            </div>
            {errorInfo?.componentStack && (
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {errorInfo.componentStack}
              </pre>
            )}
          </div>
        )}

        <p style={styles.footer}>
          If the problem persists, contact us at{' '}
          <a
            href="https://telegram.me/vibee_super_agent"
            style={{ color: BRAND_COLORS.amber, textDecoration: 'none' }}
          >
            @vibee_super_agent
          </a>
        </p>
      </div>
    </div>
  )
}

export const ErrorBoundary = ErrorBoundaryClass
