import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { translations, type Language, type TranslationKey } from './translations'

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const STORAGE_KEY = 'tosu_gui_lang'

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  children,
  initialLang,
  onLangChange,
}: {
  children: React.ReactNode
  initialLang?: Language
  onLangChange?: (lang: Language) => void
}) {
  const [lang, setLangState] = useState<Language>(() => {
    if (initialLang) return initialLang
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'ru' || stored === 'en') return stored
    } catch {
      /* ignore */
    }
    return 'ru'
  })

  useEffect(() => {
    if (initialLang && (initialLang === 'ru' || initialLang === 'en') && initialLang !== lang) {
      setLangState(initialLang)
    }
  }, [initialLang])

  const setLang = useCallback(
    (newLang: Language) => {
      setLangState(newLang)
      try {
        localStorage.setItem(STORAGE_KEY, newLang)
      } catch {
        /* ignore */
      }
      onLangChange?.(newLang)
    },
    [onLangChange]
  )

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const parts = key.split('.')
      const langDict = translations[lang] as any
      const fallbackDict = translations.ru as any

      let curr: any = langDict
      for (const p of parts) {
        curr = curr?.[p]
        if (curr === undefined) break
      }

      if (curr === undefined || typeof curr !== 'string') {
        curr = fallbackDict
        for (const p of parts) {
          curr = curr?.[p]
          if (curr === undefined) break
        }
      }

      let template = typeof curr === 'string' ? curr : key

      if (params) {
        for (const [k, v] of Object.entries(params)) {
          template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }

      return template
    },
    [lang]
  )

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return ctx
}
