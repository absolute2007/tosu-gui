import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import type { TosuCounter } from '../../electron/tosu-api'

interface Props {
  counter: TosuCounter
  baseUrl: string
  variant?: 'default' | 'large'
  preferLive?: boolean
  /** Remount live preview when tosu restarts or tab becomes visible */
  sessionKey?: string | number | null
  /** Wait for tosu before loading iframe (avoids blank previews after restart) */
  liveReady?: boolean
}

function getPreviewImage(counter: TosuCounter): string | null {
  const image = counter.assets?.find((a) => a.type === 'image')
  return image?.url ?? null
}

function getLiveUrl(counter: TosuCounter, baseUrl: string): string | null {
  if (!baseUrl || !counter.folderName) return null
  return `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(counter.folderName)}/`
}

const LIVE_LOAD_TIMEOUT_MS = 12_000
/** Buffer so scrolling stays smooth without mounting every off-screen iframe */
const VIEW_ROOT_MARGIN = '160px 0px'

export function CounterPreview({
  counter,
  baseUrl,
  variant = 'default',
  preferLive = true,
  sessionKey = 0,
  liveReady = true,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [liveFailed, setLiveFailed] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [liveLoaded, setLiveLoaded] = useState(false)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const imageUrl = useMemo(() => getPreviewImage(counter), [counter])
  const liveUrl = useMemo(() => getLiveUrl(counter, baseUrl), [counter, baseUrl])
  const iframeKey = `${sessionKey}-${liveUrl ?? ''}`

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
      },
      { root: null, rootMargin: VIEW_ROOT_MARGIN, threshold: 0.01 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setLiveFailed(false)
    setImageFailed(false)
    setLiveLoaded(false)
  }, [liveUrl, imageUrl, iframeKey])

  useEffect(() => {
    if (!preferLive || !liveUrl || !liveReady || liveFailed || !inView) {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current)
        loadTimerRef.current = null
      }
      return
    }

    loadTimerRef.current = setTimeout(() => {
      setLiveLoaded((loaded) => {
        if (!loaded) setLiveFailed(true)
        return loaded
      })
    }, LIVE_LOAD_TIMEOUT_MS)

    return () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current)
        loadTimerRef.current = null
      }
    }
  }, [preferLive, liveUrl, liveReady, liveFailed, iframeKey, inView])

  const className = variant === 'large' ? 'counter-preview -large' : 'counter-preview'
  const canShowLive = preferLive && Boolean(liveUrl) && liveReady && !liveFailed && inView

  let body: ReactNode
  let modifier = ''

  if (canShowLive && liveUrl) {
    body = (
      <>
        {!liveLoaded && (
          <div className="counter-preview-loading">
            {imageUrl && !imageFailed ? (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <Loader2 size={16} className="spin" />
            )}
          </div>
        )}
        <iframe
          key={iframeKey}
          src={liveUrl}
          title={counter.name}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          onLoad={() => setLiveLoaded(true)}
        />
      </>
    )
  } else if (preferLive && liveUrl && liveReady && !liveFailed && !inView) {
    // Off-screen: static image only — no iframe cost while scrolling
    if (imageUrl && !imageFailed) {
      body = (
        <img
          src={imageUrl}
          alt={counter.name}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      )
    } else {
      modifier = ' -loading'
      body = <Loader2 size={14} className="spin" style={{ opacity: 0.45 }} />
    }
  } else if (preferLive && liveUrl && !liveReady && !liveFailed) {
    modifier = ' -loading'
    body = <Loader2 size={16} className="spin" />
  } else if (imageUrl && !imageFailed) {
    body = (
      <img
        src={imageUrl}
        alt={counter.name}
        loading="lazy"
        decoding="async"
        onError={() => setImageFailed(true)}
      />
    )
  } else {
    modifier = ' -empty'
    body = <ImageOff size={18} strokeWidth={1.5} />
  }

  return (
    <div ref={rootRef} className={`${className}${modifier}`}>
      {body}
    </div>
  )
}
