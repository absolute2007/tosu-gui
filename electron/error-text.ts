/**
 * Turns raw technical errors (fetch failures, Node errno codes, Chromium net::ERR_*,
 * HTTP status lines, IPC wrappers) into short user-facing messages.
 * Pure module — shared by the main process and the renderer.
 */

export type ErrorLang = 'ru' | 'en'

type Rule = { test: RegExp; ru: string; en: string }

const RULES: Rule[] = [
  {
    test: /\b(429|too many requests)\b|rate.?limit/i,
    ru: 'Слишком много запросов — подождите немного',
    en: 'Too many requests — please wait a bit',
  },
  {
    test: /timed?\s?out|timeout|ETIMEDOUT|ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT/i,
    ru: 'Сервер не ответил вовремя — попробуйте ещё раз',
    en: 'The server took too long to respond — try again',
  },
  {
    test: /ERR_CERT|certificate|SSL|TLS/i,
    ru: 'Ошибка защищённого соединения',
    en: 'Secure connection failed',
  },
  {
    test: /failed to fetch|fetch failed|networkerror|load failed|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_(?:REFUSED|RESET|CLOSED|FAILED|ABORTED)|ERR_PROXY|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|socket hang up|network error/i,
    ru: 'Нет соединения с сервером — проверьте интернет',
    en: 'Could not reach the server — check your connection',
  },
  {
    test: /AbortError|ERR_ABORTED|aborted/i,
    ru: 'Запрос прерван',
    en: 'Request was interrupted',
  },
  {
    test: /^HTTP 5\d\d\b|\b(502|503|504)\b|bad gateway|service unavailable/i,
    ru: 'Сервер временно недоступен — попробуйте позже',
    en: 'The server is temporarily unavailable — try later',
  },
  {
    test: /^HTTP 40[13]\b|unauthorized|forbidden/i,
    ru: 'Нет доступа — войдите в аккаунт заново',
    en: 'Access denied — please sign in again',
  },
  {
    test: /^HTTP 404\b/i,
    ru: 'Не найдено',
    en: 'Not found',
  },
  {
    test: /^HTTP \d{3}\b/i,
    ru: 'Сервер ответил ошибкой',
    en: 'The server returned an error',
  },
  {
    test: /ENOSPC/,
    ru: 'Недостаточно места на диске',
    en: 'Not enough disk space',
  },
  {
    test: /EACCES|EPERM/,
    ru: 'Нет доступа к файлу или папке — проверьте права',
    en: 'No access to the file or folder — check permissions',
  },
  {
    test: /EBUSY|EMFILE/,
    ru: 'Файл занят другим процессом — закройте osu! и повторите',
    en: 'The file is in use by another program — close osu! and retry',
  },
  {
    test: /ENOENT/,
    ru: 'Файл или папка не найдены',
    en: 'File or folder not found',
  },
  {
    test: /Unexpected token|Unexpected end of JSON|is not valid JSON|JSON\.parse/i,
    ru: 'Некорректный ответ сервера',
    en: 'Invalid response from the server',
  },
]

/** Messages already written for users (Cyrillic, or plain prose without code-like tokens). */
function looksHumanWritten(msg: string): boolean {
  if (/[а-яё]/i.test(msg)) return true
  if (/cannot read propert|is not a function|is not defined|is not iterable|\bundefined\b|\bnull\b/i.test(msg)) return false
  return !/[A-Z_]{4,}|\bat\s+\S+\s*\(|\w+Error\b|::|\{|\}/.test(msg)
}

function rawMessage(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause
    const causeMsg = cause instanceof Error ? ` ${cause.message} ${(cause as { code?: string }).code || ''}` : ''
    return `${err.name === 'Error' ? '' : err.name + ': '}${err.message}${causeMsg}`
  }
  if (typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

function stripWrappers(msg: string): string {
  return msg
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^(?:Uncaught\s+)?(?:Error|TypeError):\s*/i, '')
    .replace(/^(?:Error|TypeError):\s*/i, '')
    .trim()
}

/**
 * Friendly message for any thrown value. `fallback` is used when nothing better is known.
 */
export function humanizeError(err: unknown, lang: ErrorLang = 'ru', fallback?: string): string {
  const raw = stripWrappers(rawMessage(err))
  const defaultFallback = fallback || (lang === 'en' ? 'Something went wrong' : 'Что-то пошло не так')
  if (!raw) return defaultFallback

  for (const rule of RULES) {
    if (rule.test.test(raw)) {
      // Keep domain messages that already explain a rate limit / timeout in human words
      if (/[а-яё]/i.test(raw) && lang === 'ru') return raw
      return rule[lang]
    }
  }

  if (looksHumanWritten(raw) && raw.length <= 220) return raw
  return defaultFallback
}
