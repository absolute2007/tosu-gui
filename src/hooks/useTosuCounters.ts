import { useCallback, useEffect, useState } from 'react'
import type { TosuCounter } from '../../electron/tosu-api'
import type { TosuStatus } from '../../electron/preload'

export function useTosuCounters(tosuStatus: TosuStatus | null) {
  const [counters, setCounters] = useState<TosuCounter[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.tosuGui.getCounters()
      setCounters(list)
    } catch {
      setCounters([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!tosuStatus?.running) return

    void reload()

    const timer = setInterval(() => {
      void reload()
    }, 8000)

    return () => clearInterval(timer)
  }, [tosuStatus?.running, tosuStatus?.pid, reload])

  return { counters, loading, reload }
}