import { useEffect, useMemo, useRef, useState } from 'react'
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

export function CounterPreview({
  counter,
  baseUrl,
  variant = 'default',
  preferLive = true,
  sessionKey = 0,
  liveReady = true,
}: Props) {
  const [liveFailed, setLiveFailed] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [liveLoaded, setLiveLoaded] = useState(false)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const imageUrl = useMemo(() => getPreviewImage(counter), [counter])
  const liveUrl = useMemo(() => getLiveUrl(counter, baseUrl), [counter, baseUrl])
  const iframeKey = `${sessionKey}-${liveUrl ?? ''}`

  useEffect(() => {
    setLiveFailed(false)
    setImageFailed(false)
    setLiveLoaded(false)
  }, [liveUrl, imageUrl, iframeKey])

  useEffect(() => {
    if (!preferLive || !liveUrl || !liveReady || liveFailed) {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current)
        loadTimerRef.current = null
      }
      return
    }

    loadTimerRef.current = setTimeout(() => {
      if (!liveLoaded) setLiveFailed(true)
    }, LIVE_LOAD_TIMEOUT_MS)

    return () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current)
        loadTimerRef.current = null
      }
    }
  }, [preferLive, liveUrl, liveReady, liveFailed, liveLoaded, iframeKey])

  const className = variant === 'large' ? 'counter-preview -large' : 'counter-preview'
  const canShowLive = preferLive && liveUrl && liveReady && !liveFailed

  if (canShowLive) {
    return (
      <div className={className}>
        {!liveLoaded && (
          <div className="counter-preview-loading">
            <Loader2 size={16} className="spin" />
          </div>
        )}
        <iframe
          key={iframeKey}
          src={liveUrl}
          title={counter.name}
          sandbox="allow-scripts allow-same-origin"
          onLoad={() => setLiveLoaded(true)}
        />
      </div>
    )
  }

  if (preferLive && liveUrl && !liveReady && !liveFailed) {
    return (
      <div className={`${className} -loading`}>
        <Loader2 size={16} className="spin" />
      </div>
    )
  }

  if (imageUrl && !imageFailed) {
    return (
      <div className={className}>
        <img
          src={imageUrl}
          alt={counter.name}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </div>
    )
  }

  return (
    <div className={`${className} -empty`}>
      <ImageOff size={18} strokeWidth={1.5} />
    </div>
  )
}