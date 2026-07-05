import { useCallback, useEffect, useRef, useState } from 'react'
import type { TosuCounter } from '../../electron/tosu-api'

export type DownloadStatus = 'downloading' | 'success' | 'error'

export interface CounterDownloadState {
  key: string
  name: string
  progress: number
  status: DownloadStatus
  message?: string
}

export function counterKey(counter: { name: string; author: string }) {
  return `${counter.name}:${counter.author}`
}

export function useCounterDownloads(onToast: (msg: string, type: 'success' | 'error') => void) {
  const [downloads, setDownloads] = useState<Record<string, CounterDownloadState>>({})
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const clearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const inFlightRef = useRef<Set<string>>(new Set())

  const stopProgress = useCallback((key: string) => {
    const timer = timersRef.current.get(key)
    if (timer) {
      clearInterval(timer)
      timersRef.current.delete(key)
    }
  }, [])

  const scheduleClear = useCallback((key: string, delayMs: number) => {
    const existing = clearTimersRef.current.get(key)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      setDownloads((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      clearTimersRef.current.delete(key)
    }, delayMs)

    clearTimersRef.current.set(key, timer)
  }, [])

  const startProgress = useCallback((key: string, name: string) => {
    stopProgress(key)
    setDownloads((prev) => ({
      ...prev,
      [key]: { key, name, progress: 4, status: 'downloading' },
    }))

    const timer = setInterval(() => {
      setDownloads((prev) => {
        const entry = prev[key]
        if (!entry || entry.status !== 'downloading') return prev
        const bump = Math.max(0.8, (92 - entry.progress) * 0.07)
        return {
          ...prev,
          [key]: { ...entry, progress: Math.min(92, entry.progress + bump) },
        }
      })
    }, 120)

    timersRef.current.set(key, timer)
  }, [stopProgress])

  const download = useCallback(async (counter: TosuCounter, onComplete?: () => void) => {
    if (!counter.downloadLink) return

    const key = counterKey(counter)
    if (inFlightRef.current.has(key)) return

    const folderName = `${counter.name} by ${counter.author}`
    inFlightRef.current.add(key)
    startProgress(key, counter.name)

    try {
      await window.tosuGui.downloadCounter(counter.downloadLink, folderName, counter._downloaded)
      stopProgress(key)
      setDownloads((prev) => ({
        ...prev,
        [key]: { key, name: counter.name, progress: 100, status: 'success', message: 'Установлен' },
      }))
      onToast('Счётчик загружен', 'success')
      scheduleClear(key, 2500)
      await onComplete?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
      const isAlreadyInstalled = msg === 'Folder already exist'
      stopProgress(key)
      setDownloads((prev) => ({
        ...prev,
        [key]: {
          key,
          name: counter.name,
          progress: 100,
          status: isAlreadyInstalled ? 'success' : 'error',
          message: isAlreadyInstalled ? 'Уже установлен' : msg,
        },
      }))
      onToast(isAlreadyInstalled ? 'Счётчик уже установлен' : msg, isAlreadyInstalled ? 'success' : 'error')
      scheduleClear(key, isAlreadyInstalled ? 2500 : 5000)
      if (isAlreadyInstalled) await onComplete?.()
    } finally {
      inFlightRef.current.delete(key)
    }
  }, [onToast, scheduleClear, startProgress, stopProgress])

  useEffect(() => {
    const timers = timersRef.current
    const clears = clearTimersRef.current
    return () => {
      timers.forEach((timer) => clearInterval(timer))
      clears.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  return { downloads, download, isDownloading: (key: string) => downloads[key]?.status === 'downloading' }
}