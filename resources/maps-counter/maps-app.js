/**
 * Same-document Maps panel for tosu inject overlay.
 * Mount once, show/hide — keeps filters, results, login.
 * Close: console marker read by overlay-patch (no page reload).
 *
 * Features: audio mini-player, volume, language/status filters (custom dropdowns),
 * simple gameplay preview without downloading the full set (osu!preview-style).
 */
;(function (global) {
  var APP_VERSION = 32
  if (global.__TosuGuiMapsApp && global.__TosuGuiMapsAppVersion === APP_VERSION) return
  if (global.__TosuGuiMapsApp) {
    try {
      global.__TosuGuiMapsApp.hide && global.__TosuGuiMapsApp.hide()
    } catch (e) {
      /* ignore */
    }
    var oldRoot = document.getElementById('tosu-gui-maps-root')
    if (oldRoot) oldRoot.remove()
    var oldStyle = document.getElementById('tosu-gui-maps-style')
    if (oldStyle) oldStyle.remove()
    global.__TosuGuiMapsApp = null
  }

  var API = 'http://127.0.0.1:24777'
  var ROOT_ID = 'tosu-gui-maps-root'
  var VOL_KEY = 'tosu-gui-preview-volume'
  var UI_LANG_KEY = 'tosu_overlay_ui_lang'
  var uiLang = 'ru'
  try {
    var storedUiLang = localStorage.getItem(UI_LANG_KEY)
    if (storedUiLang === 'en' || storedUiLang === 'ru') uiLang = storedUiLang
  } catch (e) {}

  var I18N = {
    ru: {
      title: 'Карты',
      login: 'Войти',
      close: 'Закрыть',
      searchPlaceholder: 'Поиск…',
      clearSearch: 'Очистить поиск',
      anyLang: 'Любой язык',
      refresh: 'Обновить список',
      statusLabel: 'Статус',
      modeLabel: 'Режим',
      statusAny: 'Любой',
      statusMore: 'Ещё…',
      modeAll: 'Все',
      showMore: 'Показать ещё',
      noTrack: 'Нет трека',
      selectBeatmap: 'Выберите карту ▶',
      pause: 'Пауза',
      play: 'Играть',
      prevTrack: 'Предыдущая',
      nextTrack: 'Следующая',
      seek: 'Перемотка',
      volume: 'Громкость',
      muteOsuOn: 'Глушить osu!',
      muteOsuOff: 'Звук osu!',
      muteOsuTitle: 'Заглушать звук osu! во время превью',
      previewModalTitle: 'Превью',
      previewMapBtn: 'Предпросмотр карты',
      listen: 'Слушать',
      installed: 'Есть',
      download: 'Скачать',
      loading: 'Загрузка…',
      updatingList: 'Обновление списка…',
      emptyNoResults: 'Ничего нет',
      emptyLoginPrompt: 'Войдите, чтобы искать',
      emptyDiffs: 'Нет сложностей для превью',
      errBeatmapId: 'Ошибка: не найден ID сложности',
      errEngine: 'Движок превью не загружен',
      errSearch: 'Ошибка поиска',
      errGeneric: 'Ошибка',
      loginFirst: 'Сначала войдите',
      loginWindow: 'Окно входа…',
      noGuiConnection: 'Нет связи с tosu GUI',
      guiOffline: 'GUI offline',
      notLoggedIn: 'Не вошли',
      loggedInAs: 'Вы вошли как ',
      hintNoGui: 'Запусти tosu GUI — без него поиск не работает.',
      hintLogin: 'Войдите в osu!, затем ищите карты.',
      hintActive: 'Ввод активен · «{keybind}» / Esc / ✕ — закрыть',
      cardsCount: '{n} карт',
      diffSingular: '{n} сложность',
      diffFew: '{n} сложности',
      diffMany: '{n} сложностей',
      langOptions: [
        ['any', 'Любой язык'],
        ['english', 'English'],
        ['japanese', 'Japanese'],
        ['chinese', 'Chinese'],
        ['korean', 'Korean'],
        ['russian', 'Russian'],
        ['instrumental', 'Instrumental'],
        ['french', 'French'],
        ['german', 'German'],
        ['spanish', 'Spanish'],
        ['italian', 'Italian'],
        ['swedish', 'Swedish'],
        ['polish', 'Polish'],
        ['unspecified', 'Не указан'],
        ['other', 'Другой'],
      ],
      moreStatusOptions: [
        ['pending', 'На рассмотрении'],
        ['wip', 'В разработке'],
        ['graveyard', 'Graveyard'],
        ['favourites', 'Избранное'],
        ['mine', 'Мои карты'],
      ],
    },
    en: {
      title: 'Beatmaps',
      login: 'Log in',
      close: 'Close',
      searchPlaceholder: 'Search…',
      clearSearch: 'Clear search',
      anyLang: 'Any language',
      refresh: 'Refresh list',
      statusLabel: 'Status',
      modeLabel: 'Mode',
      statusAny: 'Any',
      statusMore: 'More…',
      modeAll: 'All',
      showMore: 'Show more',
      noTrack: 'No track',
      selectBeatmap: 'Select beatmap ▶',
      pause: 'Pause',
      play: 'Play',
      prevTrack: 'Previous',
      nextTrack: 'Next',
      seek: 'Seek',
      volume: 'Volume',
      muteOsuOn: 'Mute osu!',
      muteOsuOff: 'osu! audio',
      muteOsuTitle: 'Mute osu! sound during beatmap preview',
      previewModalTitle: 'Preview',
      previewMapBtn: 'Preview beatmap',
      listen: 'Listen',
      installed: 'Installed',
      download: 'Download',
      loading: 'Loading…',
      updatingList: 'Updating list…',
      emptyNoResults: 'No beatmaps found',
      emptyLoginPrompt: 'Log in to search',
      emptyDiffs: 'No difficulties for preview',
      errBeatmapId: 'Error: difficulty ID not found',
      errEngine: 'Preview engine not loaded',
      errSearch: 'Search error',
      errGeneric: 'Error',
      loginFirst: 'Log in first',
      loginWindow: 'Login window…',
      noGuiConnection: 'Cannot connect to tosu GUI',
      guiOffline: 'GUI offline',
      notLoggedIn: 'Not logged in',
      loggedInAs: 'Logged in as ',
      hintNoGui: 'Start tosu GUI — search does not work without it.',
      hintLogin: 'Log in to osu!, then search for beatmaps.',
      hintActive: 'Input active · «{keybind}» / Esc / ✕ — close',
      cardsCount: '{n} beatmaps',
      diffSingular: '{n} difficulty',
      diffFew: '{n} difficulties',
      diffMany: '{n} difficulties',
      langOptions: [
        ['any', 'Any language'],
        ['english', 'English'],
        ['japanese', 'Japanese'],
        ['chinese', 'Chinese'],
        ['korean', 'Korean'],
        ['russian', 'Russian'],
        ['instrumental', 'Instrumental'],
        ['french', 'French'],
        ['german', 'German'],
        ['spanish', 'Spanish'],
        ['italian', 'Italian'],
        ['swedish', 'Swedish'],
        ['polish', 'Polish'],
        ['unspecified', 'Unspecified'],
        ['other', 'Other'],
      ],
      moreStatusOptions: [
        ['pending', 'Pending'],
        ['wip', 'WIP'],
        ['graveyard', 'Graveyard'],
        ['favourites', 'Favorites'],
        ['mine', 'My beatmaps'],
      ],
    },
  }

  function t(key, params) {
    var dict = I18N[uiLang] || I18N.ru
    var val = dict[key] != null ? dict[key] : (I18N.ru[key] != null ? I18N.ru[key] : key)
    if (typeof val === 'string' && params) {
      for (var p in params) {
        if (Object.prototype.hasOwnProperty.call(params, p)) {
          val = val.replace(new RegExp('\\{' + p + '\\}', 'g'), String(params[p]))
        }
      }
    }
    return val
  }

  var mode = 'any'
  var statusFilter = 'ranked'
  var languageFilter = 'any'
  var MORE_STATUSES = {
    pending: 1,
    wip: 1,
    graveyard: 1,
    favourites: 1,
    mine: 1,
  }
  function getLangOptions() {
    return (I18N[uiLang] || I18N.ru).langOptions
  }
  function getMoreStatusOptions() {
    return (I18N[uiLang] || I18N.ru).moreStatusOptions
  }

  var page = 0
  var cursor = null
  var hasMore = false
  var loading = false
  var sets = []
  var localIds = new Set()
  var loggedIn = false
  var username = ''
  var MAPS_AUTH_KEY = 'tosu_maps_auth'
  try {
    var cachedAuth = localStorage.getItem(MAPS_AUTH_KEY)
    if (cachedAuth) {
      var parsedAuth = JSON.parse(cachedAuth)
      if (parsedAuth && parsedAuth.loggedIn) {
        loggedIn = true
        username = parsedAuth.username || ''
      }
    }
  } catch (e) {}
  var downloads = {}
  var debounceTimer = null
  var apiOk = false
  var mapsKeybind = 'Control + Shift + M'
  var mounted = false
  var visible = false
  var didInitialSearch = false
  var rootEl = null
  var els = {}
  var searchSeq = 0

  // Audio mini-player
  var previewId = null
  var previewAudio = null
  var previewVolume = loadVolume()
  var previewPaused = false
  var openMenu = null // 'lang' | 'more' | null

  // Gameplay preview modal
  var gp = {
    open: false,
    set: null,
    beatmapId: 0,
    loading: false,
    error: '',
    raf: 0,
    parsed: null,
    startPerf: 0,
    audio: null,
    runtime: null,
  }

  function loadVolume() {
    try {
      var v = parseFloat(localStorage.getItem(VOL_KEY) || '0.55')
      if (!Number.isFinite(v)) return 0.55
      return Math.min(1, Math.max(0, v))
    } catch (e) {
      return 0.55
    }
  }

  function saveVolume(v) {
    previewVolume = Math.min(1, Math.max(0, v))
    try {
      localStorage.setItem(VOL_KEY, String(previewVolume))
    } catch (e) {
      /* ignore */
    }
    if (previewAudio) previewAudio.volume = previewVolume
    if (gp.audio) gp.audio.volume = previewVolume
    if (gp.runtime) gp.runtime.volume = previewVolume
    syncPlayerUi()
  }

  var MUTE_OSU_KEY = 'tosu-gui-mute-osu-on-preview'
  var muteOsuOnPreview = loadMuteOsuPref()

  function loadMuteOsuPref() {
    try {
      var v = localStorage.getItem(MUTE_OSU_KEY)
      if (v === '0' || v === 'false') return false
      return true
    } catch (e) {
      return true
    }
  }

  function saveMuteOsuPref(val) {
    muteOsuOnPreview = !!val
    try {
      localStorage.setItem(MUTE_OSU_KEY, muteOsuOnPreview ? '1' : '0')
    } catch (e) {}
    void api('/api/maps/audio-mute', {
      method: 'POST',
      body: JSON.stringify({ autoMute: muteOsuOnPreview }),
    }).catch(function () {})
    syncMuteBtnUi()
  }

  function notifyPreviewState(active, key) {
    void api('/api/maps/audio-mute', {
      method: 'POST',
      body: JSON.stringify({ previewActive: !!active, previewKey: key || 'mini-player' }),
    }).catch(function () {})
  }

  function syncMuteBtnUi() {
    if (!els || !els.muteBtn) return
    els.muteBtn.classList.toggle('-on', muteOsuOnPreview)
    els.muteBtn.setAttribute('aria-pressed', muteOsuOnPreview ? 'true' : 'false')
    var ico = els.muteBtn.querySelector('.mg-mute-ico')
    if (ico) ico.textContent = muteOsuOnPreview ? '🔇' : '🔈'
    var label = els.muteBtn.querySelector('.mg-mute-label')
    if (label) label.textContent = muteOsuOnPreview ? t('muteOsuOn') : t('muteOsuOff')
    els.muteBtn.title = t('muteOsuTitle')
  }

  function esc(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function escapeHtml(t) {
    return esc(t)
  }

  function statusClass(st) {
    st = String(st || '').toLowerCase()
    if (st === 'ranked' || st === 'approved') return 'st-ranked'
    if (st === 'loved') return 'st-loved'
    if (st === 'qualified') return 'st-qualified'
    if (st === 'pending' || st === 'wip') return 'st-pending'
    if (st === 'graveyard') return 'st-graveyard'
    return 'st-other'
  }

  function stars(s) {
    if (!s.maxStars) return '—'
    if (Math.abs(s.maxStars - s.minStars) < 0.05) return s.maxStars.toFixed(2)
    return s.minStars.toFixed(1) + '–' + s.maxStars.toFixed(1)
  }

  var DIFF_DOMAIN = [0.1, 1.25, 2, 2.5, 3.3, 4.2, 4.9, 5.8, 6.7, 7.7, 9]
  var DIFF_RANGE = [
    '#4290FB',
    '#4FC0FF',
    '#4FFFD5',
    '#7CFF4F',
    '#F6F05C',
    '#FF8068',
    '#FF4E6F',
    '#C645B8',
    '#6563DE',
    '#18158E',
    '#000000',
  ]

  var MODE_PATHS = {
    osu: 'M500 740q106 0 197-53 88-52 140-140 53-91 53-197t-53-197q-52-88-140-140-91-53-197-53t-197 53q-88 52-140 140-53 91-53 197t53 197q52 88 140 140 91 53 197 53z m0 80q-97 0-182-36t-150-102q-64-62-101-148t-37-184 37-182 101-150q62-64 149-101t183-37 182 36 150 102q64 62 101 149t37 183-36 182-102 150q-62 64-148 101t-184 37v0z m0-232q-64 0-119-32t-87-87-32-119 32-119 87-87 119-32 119 32 87 87 32 119-32 119-87 87-119 32z',
    fruits:
      'M500 740q106 0 197-53 88-52 140-140 53-91 53-197t-53-197q-52-88-140-140-91-53-197-53t-197 53q-88 52-140 140-53 91-53 197t53 197q52 88 140 140 91 53 197 53z m0 80q-97 0-182-36t-150-102q-64-62-101-148t-37-184 37-182 101-150q62-64 149-101t183-37 182 36 150 102q64 62 101 149t37 183-36 182-102 150q-62 64-148 101t-184 37v0z m192-470q0 31-22 53t-53 22-53-22-22-53 22-53 53-22 53 22 22 53z m-174 152q0 31-22 53t-53 22-53-22-22-53 22-53 53-22 53 22 22 53z m0-304q0 31-22 53t-53 22-53-22-22-53 22-53 54-22 53 22 21 53z',
    mania:
      'M500 48q-21 0-35 15t-15 35v504q0 21 15 36t35 14 36-14 14-36v-504q0-21-14-35t-36-15z m-110 192v220q0 21-14 36t-36 14-35-14-15-36v-220q0-21 15-35t35-15 36 15 14 35z m320 0v220q0 21-14 36t-36 14-35-14-15-36v-220q0-21 15-35t35-15 36 15 14 35z m-210 500q-106 0-197-53-88-52-140-140-53-91-53-197t53-197q52-88 140-140 91-53 197-53t197 53q88 52 140 140 53 91 53 197t-53 197q-52 88-140 140-91 53-197 53z m0 80q97 0 182-36t150-102q64-62 101-148t37-184-36-182-102-150q-62-64-148-101t-184-37-182 36-150 102q-64 62-101 149t-37 183 37 182 101 150q62 64 149 101t183 37v0z',
    taiko:
      'M500 650q-82 0-152-41-67-40-107-107-41-70-41-152t41-152q40-67 107-107 70-41 152-41t152 41q67 40 107 107 41 70 41 152t-41 152q-40 67-107 107-70 41-152 41z m-200-300q0 69 43 123t107 71v-388q-65 17-107 71t-43 123z m250-194v388q65-17 108-71t42-123-42-123-108-71z m-50 584q106 0 197-53 88-52 140-140 53-91 53-197t-53-197q-52-88-140-140-91-53-197-53t-197 53q-88 52-140 140-53 91-53 197t53 197q52 88 140 140 91 53 197 53z m0 80q-97 0-182-36t-150-102q-64-62-101-148t-37-184 37-182 101-150q62-64 149-101t183-37 182 36 150 102q64 62 101 149t37 183-36 182-102 150q-62 64-148 101t-184 37v0z',
  }

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '')
    return [
      parseInt(h.slice(0, 2), 16) || 0,
      parseInt(h.slice(2, 4), 16) || 0,
      parseInt(h.slice(4, 6), 16) || 0,
    ]
  }

  function toLin(c) {
    return Math.pow(c / 255, 2.2)
  }

  function toSrgb(c) {
    return Math.round(Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2) * 255)
  }

  function rgbHex(r, g, b) {
    var h = function (n) { return n.toString(16).padStart(2, '0') }
    return '#' + h(r) + h(g) + h(b)
  }

  function getDiffColour(rating) {
    if (!(rating > 0) || rating < 0.1) return '#AAAAAA'
    if (rating >= 9) return '#000000'
    var i = 0
    while (i < DIFF_DOMAIN.length - 2 && rating > DIFF_DOMAIN[i + 1]) i++
    var a = DIFF_DOMAIN[i]
    var b = DIFF_DOMAIN[i + 1]
    var t = (rating - a) / (b - a || 1)
    var c1 = hexToRgb(DIFF_RANGE[i])
    var c2 = hexToRgb(DIFF_RANGE[i + 1])
    return rgbHex(
      toSrgb(toLin(c1[0]) + (toLin(c2[0]) - toLin(c1[0])) * t),
      toSrgb(toLin(c1[1]) + (toLin(c2[1]) - toLin(c1[1])) * t),
      toSrgb(toLin(c1[2]) + (toLin(c2[2]) - toLin(c1[2])) * t)
    )
  }

  function normalizeOsuMode(m) {
    var s = String(m == null ? 'osu' : m).toLowerCase()
    if (s === '1' || s === 'taiko') return 'taiko'
    if (s === '2' || s === 'fruits' || s === 'ctb' || s === 'catch') return 'fruits'
    if (s === '3' || s === 'mania') return 'mania'
    return 'osu'
  }

  function modePath(m) {
    return MODE_PATHS[normalizeOsuMode(m)] || MODE_PATHS.osu
  }

  function pluralizeDiffs(n) {
    if (uiLang === 'en') {
      return n === 1 ? t('diffSingular', { n: n }) : t('diffMany', { n: n })
    }
    var abs = Math.abs(n) % 100
    var rem = abs % 10
    if (abs > 10 && abs < 20) return t('diffMany', { n: n })
    if (rem > 1 && rem < 5) return t('diffFew', { n: n })
    if (rem === 1) return t('diffSingular', { n: n })
    return t('diffMany', { n: n })
  }

  function diffIconHtml(mode, stars, size, title) {
    var color = getDiffColour(stars || 0)
    var m = normalizeOsuMode(mode)
    var d = modePath(m)
    var tt = title ? ' title="' + title + '"' : ' title="' + (stars || 0).toFixed(2) + '★"'
    return '<span class="mg-diffico"' + tt + ' style="color:' + color + '"><svg viewBox="0 0 1000 1000" width="' + (size || 14) + '" height="' + (size || 14) + '"><g transform="translate(0,1000) scale(1,-1)"><path fill="currentColor" fill-rule="evenodd" d="' + d + '"/></g></svg></span>'
  }

  async function api(path, opts) {
    var timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : null
    var res = await fetch(API + path, {
      ...opts,
      signal: (opts && opts.signal) || timeoutSignal || undefined,
      headers: {
        Accept: 'application/json',
        ...(opts && opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts && opts.headers),
      },
    })
    var data = await res.json().catch(function () {
      return {}
    })
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status)
    return data
  }

  function setLine(t) {
    if (els.line) els.line.textContent = t || ''
  }

  function requestClose() {
    stopPreview()
    closeGameplayPreview()
    console.log('__TOSU_GUI_MAPS_CLOSE__')
  }

  function audioUrlsForSet(setId) {
    var id = Number(setId) || 0
    if (!id) return []
    return [
      'http://127.0.0.1:24777/api/maps/audio-preview?setId=' + id,
      'https://b.ppy.sh/preview/' + id + '.mp3',
      'https://catboy.best/preview/audio/' + id,
      'https://api.nerinyan.moe/preview/' + id + '.mp3',
    ]
  }

  var miniPlayerSession = 0

  function ensureAudio() {
    if (previewAudio) return previewAudio
    previewAudio = new Audio()
    previewAudio.preload = 'none'
    previewAudio.volume = previewVolume
    previewAudio.addEventListener('ended', function () {
      previewId = null
      previewPaused = false
      notifyPreviewState(false, 'mini-player')
      if (visible) {
        renderList()
        syncPlayerUi()
      }
    })
    previewAudio.addEventListener('error', function () {
      notifyPreviewState(false, 'mini-player')
    })
    previewAudio.addEventListener('timeupdate', function () {
      if (visible) syncPlayerProgress()
    })
    return previewAudio
  }

  function stopPreview() {
    miniPlayerSession++
    notifyPreviewState(false, 'mini-player')
    if (previewAudio) {
      try {
        previewAudio.pause()
        previewAudio.oncanplay = null
        previewAudio.onerror = null
        previewAudio.removeAttribute('src')
        previewAudio.load()
      } catch (e) {
        /* ignore */
      }
    }
    previewId = null
    previewPaused = false
    syncPlayerUi()
  }

  function playSetById(id) {
    var session = ++miniPlayerSession
    var audio = ensureAudio()
    try {
      audio.pause()
      audio.volume = previewVolume
      previewId = id
      previewPaused = false
      renderList()
      syncPlayerUi()

      var urls = audioUrlsForSet(id)
      var idx = 0
      function tryNext() {
        if (session !== miniPlayerSession) return
        if (idx >= urls.length) {
          previewId = null
          previewPaused = false
          notifyPreviewState(false, 'mini-player')
          setLine('Не удалось воспроизвести превью')
          renderList()
          syncPlayerUi()
          return
        }
        var u = urls[idx++]
        audio.onerror = function () {
          if (session === miniPlayerSession) {
            console.warn('[maps-audio] mini-player source error:', u)
            tryNext()
          }
        }
        audio.onplaying = function () {
          if (session === miniPlayerSession) {
            notifyPreviewState(true, 'mini-player')
          }
        }
        audio.src = u
        audio.load()
        var p = audio.play()
        if (p && p.catch) {
          p.catch(function (err) {
            if (session === miniPlayerSession && err && err.name !== 'AbortError') {
              tryNext()
            }
          })
        }
      }
      tryNext()
    } catch (e) {
      console.error('[maps-audio] playSetById error:', e)
    }
  }

  function togglePreview(id) {
    if (previewId === id) {
      var audio = ensureAudio()
      if (previewPaused || audio.paused) {
        previewPaused = false
        notifyPreviewState(true, 'mini-player')
        void audio.play().catch(function () {
          stopPreview()
        })
        syncPlayerUi()
        renderList()
      } else {
        audio.pause()
        previewPaused = true
        notifyPreviewState(false, 'mini-player')
        syncPlayerUi()
        renderList()
      }
      return
    }
    playSetById(id)
  }

  function playAdjacent(delta) {
    if (!sets.length) return
    var idx = sets.findIndex(function (s) {
      return s.id === previewId
    })
    if (idx < 0) idx = 0
    else idx = (idx + delta + sets.length) % sets.length
    playSetById(sets[idx].id)
  }

  function togglePlayPause() {
    if (!previewId) {
      if (sets.length) playSetById(sets[0].id)
      return
    }
    togglePreview(previewId)
  }

  function currentSet() {
    return (
      sets.find(function (s) {
        return s.id === previewId
      }) || null
    )
  }

  function syncPlayerProgress() {
    if (!els.playerProgress || !previewAudio) return
    var d = previewAudio.duration
    var t = previewAudio.currentTime
    if (!d || !Number.isFinite(d)) {
      els.playerProgress.style.width = '0%'
      return
    }
    els.playerProgress.style.width = Math.min(100, (t / d) * 100) + '%'
  }

  function syncPlayerUi() {
    if (!els || !els.player) return
    var set = currentSet()
    var active = !!previewId && !!set
    if (els.player.classList) {
      els.player.classList.toggle('-active', active)
      els.player.classList.toggle('-idle', !active)
    }
    if (els.playerCover) {
      var cover = set && (set.listCoverUrl || set.coverUrl)
      if (cover) {
        els.playerCover.innerHTML = '<img src="' + esc(cover) + '" alt="" draggable="false" />'
      } else {
        els.playerCover.innerHTML = ''
      }
    }
    if (els.playerTitle) {
      els.playerTitle.textContent = set ? set.artist + ' — ' + set.title : t('noTrack')
    }
    if (els.playerSub) {
      els.playerSub.textContent = set ? set.creator : t('selectBeatmap')
    }
    if (els.playerPlay) {
      var playing = active && previewAudio && !previewAudio.paused && !previewPaused
      els.playerPlay.textContent = playing ? '❚❚' : '▶'
      els.playerPlay.title = playing ? t('pause') : t('play')
    }
    if (els.volRange) {
      els.volRange.value = String(Math.round(previewVolume * 100))
    }
    if (els.volLabel) {
      els.volLabel.textContent = Math.round(previewVolume * 100) + '%'
    }
    syncPlayerProgress()
  }

  function updateHint() {
    if (!els.hint) return
    if (!apiOk) {
      els.hint.textContent = t('hintNoGui')
      return
    }
    if (!loggedIn) {
      els.hint.textContent = t('hintLogin')
      return
    }
    els.hint.textContent = t('hintActive', { keybind: mapsKeybind })
  }

  function updateAuthUi() {
    if (!els.authLabel || !els.login) return
    if (loggedIn) {
      els.authLabel.textContent = t('loggedInAs') + (username || 'osu!')
      els.login.hidden = true
    } else if (!apiOk) {
      els.authLabel.textContent = t('guiOffline')
      els.login.hidden = true
    } else {
      els.authLabel.textContent = t('notLoggedIn')
      els.login.hidden = false
    }
    updateHint()
  }

  function setLoadingUi(isLoading, message) {
    loading = isLoading
    if (els.list) els.list.classList.toggle('-loading', !!isLoading)
    if (els.refresh) {
      els.refresh.classList.toggle('-spin', !!isLoading)
      els.refresh.disabled = !!isLoading
    }
    if (els.more) els.more.disabled = !!isLoading
    if (isLoading) setLine(message || t('loading'))
  }

  function renderList() {
    if (!els.list) return
    if (!sets.length) {
      els.list.innerHTML =
        '<div class="mg-empty">' +
        (loading
          ? '<div class="mg-spinner"></div><div class="mg-empty-text">' + esc(t('loading')) + '</div>'
          : loggedIn
            ? esc(t('emptyNoResults'))
            : esc(t('emptyLoginPrompt'))) +
        '</div>'
      if (els.more) els.more.hidden = true
      return
    }

    var banner = loading
      ? '<div class="mg-loading-banner"><span class="mg-spinner"></span><span>' + esc(t('updatingList')) + '</span></div>'
      : ''

    els.list.innerHTML =
      banner +
      sets
        .map(function (s) {
          var owned = localIds.has(s.id)
          var dl = downloads[s.id]
          var busy =
            dl &&
            (dl.phase === 'downloading' || dl.phase === 'installing' || dl.phase === 'queued')
          var pct = dl && dl.progress != null ? Math.round(dl.progress) : 0
          var cover = s.listCoverUrl || s.coverUrl || ''
          var sc = statusClass(s.status)
          var btn
          if (owned) {
            btn = '<button type="button" class="mg-btn mg-owned" disabled>' + esc(t('installed')) + '</button>'
          } else if (busy) {
            btn =
              '<button type="button" class="mg-btn mg-busy" data-cancel="' +
              s.id +
              '">✕ ' +
              pct +
              '%</button>'
          } else {
            btn =
              '<button type="button" class="mg-btn mg-primary" data-dl="' +
              s.id +
              '">' + esc(t('download')) + '</button>'
          }
          var playing = previewId === s.id && !previewPaused
          var previewBtn =
            '<button type="button" class="mg-btn mg-preview' +
            (playing ? ' -playing' : '') +
            '" data-preview="' +
            s.id +
            '" title="' +
            (playing ? esc(t('pause')) : esc(t('listen'))) +
            '">' +
            (playing ? '❚❚' : '▶') +
            '</button>'
          var hasBm = s.beatmaps && s.beatmaps.length
          var gpBtn =
            '<button type="button" class="mg-btn mg-gp" data-gp="' +
            s.id +
            '" title="' + esc(t('previewMapBtn')) + '" ' +
            (hasBm ? '' : 'disabled') +
            '>◎</button>'
          var matchingBm = (s.beatmaps || []).filter(function (b) {
            return mode === 'any' || normalizeOsuMode(b.mode) === mode
          })
          var bmsToDisplay = matchingBm.length > 0 ? matchingBm : (s.beatmaps || [])
          var totalCount = s.beatmaps && s.beatmaps.length ? s.beatmaps.length : (s.modes && s.modes.length ? s.modes.length : 1)
          var countLabel = pluralizeDiffs(matchingBm.length > 0 && mode !== 'any' ? matchingBm.length : totalCount)
          var diffIconsHtml = bmsToDisplay.slice(0, 16).map(function (b) {
            return diffIconHtml(b.mode, b.stars || 0, 13, esc(b.version + ' (' + (b.stars || 0).toFixed(2) + '★)'))
          }).join('')
          if (bmsToDisplay.length > 16) {
            diffIconsHtml += '<span class="mg-diff-more">+' + (bmsToDisplay.length - 16) + '</span>'
          }

          return (
            '<div class="mg-row ' +
            sc +
            '">' +
            (cover
              ? '<img class="mg-cover" src="' + cover + '" alt="" loading="lazy" draggable="false" />'
              : '<div class="mg-cover"></div>') +
            '<div class="mg-meta"><div class="mg-title">' +
            esc(s.artist + ' — ' + s.title) +
            '</div><div class="mg-sub">' +
            esc(s.creator) +
            ' · <span class="mg-diff-count">' +
            countLabel +
            '</span> · <span class="mg-badge ' +
            sc +
            '">' +
            esc(s.status) +
            '</span></div>' +
            (diffIconsHtml ? '<div class="mg-diff-icons-row" title="' + countLabel + '">' + diffIconsHtml + '</div>' : '') +
            '</div>' +
            '<div class="mg-actions">' +
            previewBtn +
            gpBtn +
            btn +
            '</div></div>'
          )
        })
        .join('')

    if (els.more) els.more.hidden = !hasMore || loading
    if (els.list) els.list.classList.toggle('-loading', !!loading)
  }

  async function loadConfig() {
    try {
      var c = await api('/api/maps/config')
      if (c.mapsKeybind) mapsKeybind = String(c.mapsKeybind)
      if (c.language && (c.language === 'ru' || c.language === 'en')) {
        try {
          if (!localStorage.getItem(UI_LANG_KEY)) {
            uiLang = c.language
            applyLanguage(uiLang)
          }
        } catch (e) {}
      }
    } catch (e) {
      /* ignore */
    }
  }

  async function checkApi() {
    try {
      await api('/api/maps/ping')
      apiOk = true
      await loadConfig()
      return true
    } catch (e) {
      apiOk = false
      setLine(t('noGuiConnection'))
      return false
    }
  }

  async function refreshAuth() {
    if (!(await checkApi())) {
      updateAuthUi()
      return
    }
    try {
      var a = await api('/api/maps/auth')
      if (a && typeof a.loggedIn === 'boolean') {
        loggedIn = a.loggedIn
        username = a.username || ''
        try {
          if (loggedIn) {
            localStorage.setItem(MAPS_AUTH_KEY, JSON.stringify({ loggedIn: loggedIn, username: username }))
          } else {
            localStorage.removeItem(MAPS_AUTH_KEY)
          }
        } catch (e) {}
      }
    } catch (e) {
      // keep cached auth on fetch error
    }
    updateAuthUi()
  }

  async function refreshLocal() {
    try {
      var r = await api('/api/maps/local-sets')
      localIds = new Set(r.setIds || [])
    } catch (e) {
      localIds = new Set()
    }
  }

  async function search(append) {
    if (append && loading) return
    if (!apiOk && !(await checkApi())) return
    if (!loggedIn) {
      setLine(t('loginFirst'))
      return
    }

    var seq = ++searchSeq
    if (!append) {
      page = 0
      cursor = null
    }
    setLoadingUi(true, append ? t('loading') : t('loading'))
    renderList()

    try {
      var sp = new URLSearchParams()
      sp.set('q', els.q ? els.q.value.trim() : '')
      sp.set('mode', mode)
      sp.set('status', statusFilter)
      sp.set('language', languageFilter)
      sp.set('page', String(append ? page + 1 : 0))
      sp.set('limit', '24')
      if (append && cursor) sp.set('cursor', cursor)

      var r = await api('/api/maps/search?' + sp.toString())
      if (seq !== searchSeq) return

      var next = r.sets || []
      if (append) {
        var seen = new Set(
          sets.map(function (x) {
            return x.id
          })
        )
        var extra = next.filter(function (x) {
          return !seen.has(x.id)
        })
        if (!extra.length) {
          hasMore = false
        } else {
          sets = sets.concat(extra)
          page += 1
          cursor = r.cursor || null
          hasMore = !!r.hasMore
        }
      } else {
        sets = next
        page = 0
        cursor = r.cursor || null
        hasMore = !!r.hasMore
        didInitialSearch = true
      }
      setLine(sets.length ? t('cardsCount', { n: sets.length }) : t('emptyNoResults'))
    } catch (err) {
      if (seq !== searchSeq) return
      setLine(err.message || t('errSearch'))
      if (!append && !sets.length) sets = []
    } finally {
      if (seq === searchSeq) {
        setLoadingUi(false)
        renderList()
        syncPlayerUi()
      }
    }
  }

  function applyChipGroup(container, attr, value) {
    if (!container || typeof container.querySelectorAll !== 'function') return
    container.querySelectorAll('.mg-chip').forEach(function (b) {
      if (b && b.classList) {
        b.classList.toggle('-on', b.getAttribute(attr) === value)
      }
    })
  }

  function closeMenus() {
    openMenu = null
    if (els.langMenu) els.langMenu.hidden = true
    if (els.moreMenu) els.moreMenu.hidden = true
    if (els.langBtn) els.langBtn.classList.remove('-open')
    if (els.moreBtn) els.moreBtn.classList.remove('-open')
  }

  function toggleMenu(which) {
    if (openMenu === which) {
      closeMenus()
      return
    }
    closeMenus()
    openMenu = which
    if (which === 'lang' && els.langMenu) {
      els.langMenu.hidden = false
      if (els.langBtn) els.langBtn.classList.add('-open')
    }
    if (which === 'more' && els.moreMenu) {
      els.moreMenu.hidden = false
      if (els.moreBtn) els.moreBtn.classList.add('-open')
    }
  }

  function langLabel() {
    var opts = getLangOptions()
    for (var i = 0; i < opts.length; i++) {
      if (opts[i][0] === languageFilter) return opts[i][1]
    }
    return t('anyLang')
  }

  function moreStatusLabel() {
    if (!MORE_STATUSES[statusFilter]) return t('statusMore')
    var opts = getMoreStatusOptions()
    for (var i = 0; i < opts.length; i++) {
      if (opts[i][0] === statusFilter) return opts[i][1]
    }
    return statusFilter
  }

  function syncFilterUi() {
    if (els.statuses) applyChipGroup(els.statuses, 'data-status', statusFilter)
    if (els.modes) applyChipGroup(els.modes, 'data-mode', mode)
    if (els.langBtn && els.langBtn.classList) {
      els.langBtn.textContent = langLabel()
      els.langBtn.classList.toggle('-active', languageFilter !== 'any')
    }
    if (els.moreBtn && els.moreBtn.classList) {
      els.moreBtn.textContent = moreStatusLabel()
      els.moreBtn.classList.toggle('-active', !!MORE_STATUSES[statusFilter])
    }
    if (els.langMenu && typeof els.langMenu.querySelectorAll === 'function') {
      els.langMenu.querySelectorAll('[data-lang]').forEach(function (b) {
        if (b && b.classList) b.classList.toggle('-on', b.getAttribute('data-lang') === languageFilter)
      })
    }
    if (els.moreMenu && typeof els.moreMenu.querySelectorAll === 'function') {
      els.moreMenu.querySelectorAll('[data-more-status]').forEach(function (b) {
        if (b && b.classList) b.classList.toggle('-on', b.getAttribute('data-more-status') === statusFilter)
      })
    }
  }

  function setLanguage(v) {
    languageFilter = v || 'any'
    closeMenus()
    syncFilterUi()
    void search(false)
  }

  function setStatus(v) {
    statusFilter = v || 'ranked'
    closeMenus()
    syncFilterUi()
    void search(false)
  }

  function setMode(v) {
    mode = v || 'any'
    syncFilterUi()
    void search(false)
  }

  // --- Gameplay preview (circles + sliders via TosuOsuPreview engine) ---

  function engine() {
    return (
      (typeof window !== 'undefined' && window.TosuOsuPreview) ||
      (typeof globalThis !== 'undefined' && globalThis.TosuOsuPreview) ||
      global.TosuOsuPreview ||
      null
    )
  }

  var gpAudioSession = 0

  function stopGpAnimation() {
    if (gp.raf) {
      cancelAnimationFrame(gp.raf)
      gp.raf = 0
    }
    if (gp.timer) {
      clearInterval(gp.timer)
      gp.timer = null
    }
  }

  function stopGpAudio() {
    gpAudioSession++
    if (gp.audio) {
      try {
        gp.audio.pause()
        gp.audio.oncanplay = null
        gp.audio.onerror = null
        gp.audio.onplaying = null
        gp.audio.onended = null
        gp.audio.removeAttribute('src')
        gp.audio.load()
      } catch (e) {
        /* ignore */
      }
      gp.audio = null
    }
  }

  function startGpAudio(setId, onReady) {
    stopGpAudio()
    var session = ++gpAudioSession
    var id = Number(setId) || 0
    if (!id) {
      if (typeof onReady === 'function') onReady()
      return
    }

    var urls = audioUrlsForSet(id)
    var audio = new Audio()
    audio.volume = previewVolume
    audio.preload = 'auto'
    gp.audio = audio

    var readyFired = false
    function triggerReady() {
      if (readyFired || session !== gpAudioSession || !gp.open) return
      readyFired = true
      notifyPreviewState(true, 'gameplay')
      gp.startPerf = performance.now() - (audio.currentTime || 0) * 1000
      gp.audioStartPerf = gp.startPerf
      gp.lastAudioSec = audio.currentTime || 0
      if (typeof onReady === 'function') onReady()
    }

    // Safety fallback: if audio takes > 2500ms to start, launch replay anyway
    var fallbackTimer = setTimeout(triggerReady, 2500)

    var idx = 0
    function tryNext() {
      if (session !== gpAudioSession || !gp.open) {
        clearTimeout(fallbackTimer)
        try {
          audio.pause()
          audio.removeAttribute('src')
        } catch (e) {}
        return
      }
      if (idx >= urls.length) {
        console.warn('[maps-gp] all audio urls failed for setId:', id)
        triggerReady()
        return
      }
      var u = urls[idx++]
      audio.onerror = function () {
        if (session === gpAudioSession && gp.open) {
          console.warn('[maps-gp] audio source failed:', u)
          tryNext()
        }
      }
      audio.onplaying = function () {
        clearTimeout(fallbackTimer)
        triggerReady()
      }
      audio.src = u
      audio.load()
      var p = audio.play()
      if (p && p.catch) {
        p.catch(function (err) {
          if (session === gpAudioSession && gp.open && err && err.name !== 'AbortError') {
            console.warn('[maps-gp] audio play error:', err)
            tryNext()
          }
        })
      }
    }
    tryNext()
  }

  function stopGpLoop() {
    stopGpAnimation()
    stopGpAudio()
  }

  function startGpLoop() {
    stopGpAnimation()
    function tick(now) {
      if (!gp.open || !gp.parsed) return
      drawGameplay(now)
      gp.raf = requestAnimationFrame(tick)
    }
    gp.raf = requestAnimationFrame(tick)
    gp.timer = setInterval(function () {
      if (gp.open && gp.parsed) {
        drawGameplay(performance.now())
      }
    }, 16)
  }

  function closeGameplayPreview() {
    notifyPreviewState(false, 'gameplay')
    stopGpLoop()
    gp.open = false
    gp.set = null
    gp.beatmapId = 0
    gp.loading = false
    gp.error = ''
    gp.parsed = null
    if (gp.runtime && engine() && typeof engine().resetPreviewRuntime === 'function') {
      engine().resetPreviewRuntime(gp.runtime, previewVolume)
    } else if (gp.runtime) {
      gp.runtime.fired = new Set()
      gp.runtime.trail = []
      gp.runtime.lastT = -1
    }
    if (els.gpModal) els.gpModal.hidden = true
  }

  function ensureGpRuntime() {
    var eng = engine()
    if (!eng) return null
    if (!gp.runtime && typeof eng.createPreviewRuntime === 'function') {
      gp.runtime = eng.createPreviewRuntime(previewVolume)
    } else if (!gp.runtime) {
      gp.runtime = {
        fired: new Set(),
        cursor: { x: 256, y: 192 },
        trail: [],
        volume: previewVolume,
        audio: null,
        lastT: -1,
      }
    }
    gp.runtime.volume = previewVolume
    return gp.runtime
  }

  function drawGameplay(now) {
    var canvas = els.gpCanvas
    var eng = engine()
    if (!canvas || !gp.open || !eng || !gp.parsed) return
    var ctx = canvas.getContext('2d')
    if (!ctx) return
    var elapsed = 0
    if (gp.audio && !gp.audio.paused && !gp.audio.ended && Number.isFinite(gp.audio.currentTime) && gp.audio.currentTime > 0) {
      elapsed = Math.max(0, gp.audio.currentTime * 1000)
    } else {
      elapsed = Math.max(0, now - (gp.startPerf || now))
    }

    var t = (gp.parsed.previewTime || 0) + elapsed
    var rt = ensureGpRuntime()
    var cont = true
    try {
      cont = eng.drawPreviewFrame(
        ctx,
        gp.parsed,
        canvas.width || 640,
        canvas.height || 480,
        t,
        elapsed,
        rt
      )
    } catch (drawErr) {
      console.error('[maps-gp] drawPreviewFrame error:', drawErr)
    }
    if (!cont || (gp.audio && gp.audio.ended)) {
      closeGameplayPreview()
      return
    }
  }

  async function openGameplayPreview(setId) {
    console.log('[maps-gp] openGameplayPreview called for setId:', setId)
    var set = sets.find(function (s) {
      return s.id === setId
    })
    if (!set) {
      console.warn('[maps-gp] set not found for id:', setId)
      return
    }
    var bms = set.beatmaps || []
    if (!bms.length) {
      setLine(t('emptyDiffs'))
      return
    }
    // Prefer osu!standard with valid ID
    var pick =
      bms.find(function (b) {
        return (b.mode === 'osu' || b.mode === '0') && b.id
      }) || bms.find(function (b) { return b.id }) || bms[0]

    if (!pick || !pick.id) {
      setLine(t('errBeatmapId'))
      return
    }

    stopPreview()
    closeGameplayPreview()
    gp.open = true
    gp.set = set
    gp.beatmapId = pick.id
    gp.loading = true
    gp.error = ''

    if (els.gpModal) els.gpModal.hidden = false
    if (els.gpTitle) els.gpTitle.textContent = set.artist + ' — ' + set.title
    if (els.gpSub) els.gpSub.textContent = pick.version + ' · ' + (pick.stars || 0).toFixed(2) + '★ · ' + t('loading').toLowerCase()
    if (els.gpDiffs) {
      els.gpDiffs.innerHTML = bms
        .map(function (b) {
          return (
            '<button type="button" class="mg-chip' +
            (b.id === pick.id ? ' -on' : '') +
            '" data-gp-diff="' +
            b.id +
            '">' +
            '<span class="mg-diffico" style="color:' + getDiffColour(b.stars || 0) + '"><svg viewBox="0 0 1000 1000" width="18" height="18"><g transform="translate(0,1000) scale(1,-1)"><path fill="currentColor" fill-rule="evenodd" d="' + modePath(b.mode) + '"/></g></svg></span>' +
            esc(b.version) + '</button>'
          )
        })
        .join('')
    }

    await loadGameplayDiff(pick.id, set)
  }

  async function loadGameplayDiff(beatmapId, set) {
    console.log('[maps-gp] loadGameplayDiff started for beatmapId:', beatmapId)
    gp.loading = true
    gp.error = ''
    gp.beatmapId = beatmapId
    stopGpAnimation()
    if (els.gpSub) els.gpSub.textContent = t('loading')

    var bm = (set.beatmaps || []).find(function (b) {
      return b.id === beatmapId
    })
    if (els.gpDiffs) {
      els.gpDiffs.querySelectorAll('[data-gp-diff]').forEach(function (b) {
        b.classList.toggle('-on', Number(b.getAttribute('data-gp-diff')) === beatmapId)
      })
    }

    try {
      var eng = engine()
      if (!eng || typeof eng.parseOsu !== 'function') {
        console.error('[maps-gp] engine not loaded!', eng)
        throw new Error(t('errEngine'))
      }
      var r = null
      try {
        console.log('[maps-gp] fetching from /api/maps/osu-file...')
        r = await api('/api/maps/osu-file?beatmapId=' + beatmapId)
      } catch (e1) {
        console.warn('[maps-gp] local api failed, trying mirrors:', e1)
        // Fallback 1: direct osu.ppy.sh /osu/{id}
        try {
          var pRes = await fetch('https://osu.ppy.sh/osu/' + beatmapId)
          if (pRes.ok) {
            var pTxt = await pRes.text()
            if (pTxt && pTxt.includes('[HitObjects]')) {
              r = { beatmapId: beatmapId, content: pTxt }
            }
          }
        } catch (e2) {
          /* ignore */
        }
        // Fallback 2: catboy mirror
        if (!r) {
          try {
            var cRes = await fetch('https://catboy.best/osu/' + beatmapId)
            if (cRes.ok) {
              var cTxt = await cRes.text()
              if (cTxt && cTxt.includes('[HitObjects]')) {
                r = { beatmapId: beatmapId, content: cTxt }
              }
            }
          } catch (e3) {
            /* ignore */
          }
        }
        // Fallback 3: osu.direct mirror
        if (!r) {
          try {
            var dRes = await fetch('https://osu.direct/api/osu/' + beatmapId)
            if (dRes.ok) {
              var dTxt = await dRes.text()
              if (dTxt && dTxt.includes('[HitObjects]')) {
                r = { beatmapId: beatmapId, content: dTxt }
              }
            }
          } catch (e4) {
            /* ignore */
          }
        }
        // Fallback 4: nerinyan mirror
        if (!r) {
          try {
            var nRes = await fetch('https://api.nerinyan.moe/osu/' + beatmapId)
            if (nRes.ok) {
              var nTxt = await nRes.text()
              if (nTxt && nTxt.includes('[HitObjects]')) {
                r = { beatmapId: beatmapId, content: nTxt }
              }
            }
          } catch (e5) {
            /* ignore */
          }
        }
        if (!r) throw e1
      }
      var parsed = eng.parseOsu((r && r.content) || '')
      console.log('[maps-gp] parsed objects:', parsed.objects.length, 'previewTime:', parsed.previewTime)
      gp.parsed = parsed

      var rt = ensureGpRuntime()
      if (rt && typeof eng.resetPreviewRuntime === 'function') {
        eng.resetPreviewRuntime(rt, previewVolume)
      } else if (rt) {
        rt.fired = new Set()
        rt.trail = []
        rt.lastT = -1
        rt.volume = previewVolume
        rt.cursor = { x: 256, y: 192 }
      }
      if (rt && typeof eng.preloadHitSounds === 'function') {
        eng.preloadHitSounds(rt)
      }

      // Start audio and only start animation once audio actually plays
      startGpAudio(set.id, function () {
        if (!gp.open || gp.beatmapId !== beatmapId) return
        gp.loading = false
        if (els.gpSub) {
          els.gpSub.textContent = bm
            ? bm.version + ' · ' + (bm.stars || 0).toFixed(2) + '★'
            : t('previewModalTitle')
        }
        var curRt = ensureGpRuntime()
        if (curRt && typeof eng.resetPreviewRuntime === 'function') {
          eng.resetPreviewRuntime(curRt, previewVolume)
        }
        // Unlock Web Audio for hitsounds
        try {
          if (curRt && curRt.audio && curRt.audio.resume) void curRt.audio.resume()
        } catch (e) {
          /* ignore */
        }
        startGpLoop()
      })
    } catch (err) {
      console.error('[maps-gp] loadGameplayDiff failed:', err)
      gp.loading = false
      gp.error = err.message || t('errGeneric')
      if (els.gpSub) els.gpSub.textContent = gp.error
    }
  }

  function onChipPointer(container, attr, applyValue) {
    var lastAt = 0
    function handle(e) {
      var t = e.target
      if (!(t instanceof Element)) return
      var chip = t.closest ? t.closest('.mg-chip') : null
      if (!chip || !container.contains(chip)) return
      if (chip.hasAttribute('data-gp-diff')) return
      var now = Date.now()
      if (now - lastAt < 80) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      lastAt = now
      e.preventDefault()
      e.stopPropagation()
      var v = chip.getAttribute(attr)
      if (!v) return
      applyValue(v)
    }
    container.addEventListener('pointerup', handle, true)
    container.addEventListener('click', handle, true)
  }

  function applyLanguage(lang) {
    uiLang = lang === 'en' ? 'en' : 'ru'
    try {
      localStorage.setItem(UI_LANG_KEY, uiLang)
    } catch (e) {}

    if (!els || !rootEl) return

    if (els.topTitle) els.topTitle.textContent = t('title')
    if (els.uiLangBtn) els.uiLangBtn.textContent = uiLang.toUpperCase()
    if (els.login) els.login.textContent = t('login')
    if (els.close) {
      els.close.title = t('close')
      els.close.setAttribute('aria-label', t('close'))
    }
    if (els.q) els.q.placeholder = t('searchPlaceholder')
    if (els.qClear) {
      els.qClear.title = t('clearSearch')
      els.qClear.setAttribute('aria-label', t('clearSearch'))
    }
    if (els.refresh) els.refresh.title = t('refresh')
    if (els.lblStatus) els.lblStatus.textContent = t('statusLabel')
    if (els.lblMode) els.lblMode.textContent = t('modeLabel')
    if (els.more) els.more.textContent = t('showMore')

    // Update 'any' status chip and 'any' mode chip label
    if (els.statuses) {
      var anyStatusChip = els.statuses.querySelector('[data-status="any"]')
      if (anyStatusChip) anyStatusChip.textContent = t('statusAny')
    }
    if (els.modes) {
      var allModeChip = els.modes.querySelector('[data-mode="any"]')
      if (allModeChip) allModeChip.textContent = t('modeAll')
    }

    // Update menus innerHTML
    if (els.langMenu) {
      els.langMenu.innerHTML = menuItems(getLangOptions(), 'data-lang')
    }
    if (els.moreMenu) {
      els.moreMenu.innerHTML = menuItems(getMoreStatusOptions(), 'data-more-status')
    }

    // Mini-player and gameplay preview
    if (els.playerBar) els.playerBar.title = t('seek')
    if (els.playerPrev) els.playerPrev.title = t('prevTrack')
    if (els.playerNext) els.playerNext.title = t('nextTrack')
    if (els.gpClose) els.gpClose.title = t('close')
    if (els.gpTitle) els.gpTitle.textContent = t('previewModalTitle')

    updateAuthUi()
    syncFilterUi()
    syncPlayerUi()
    syncMuteBtnUi()
    renderList()
  }

  function bindUi() {
    if (els.uiLangBtn) {
      var lastLangToggle = 0
      var handleLangToggle = function (e) {
        if (e.button !== undefined && e.button !== 0) return
        var now = Date.now()
        if (now - lastLangToggle < 250) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        lastLangToggle = now
        e.preventDefault()
        e.stopPropagation()
        var nextLang = uiLang === 'ru' ? 'en' : 'ru'
        applyLanguage(nextLang)
        void api('/api/maps/ui-lang', {
          method: 'POST',
          body: JSON.stringify({ language: nextLang }),
        }).catch(function () {})
      }
      els.uiLangBtn.addEventListener('pointerup', handleLangToggle)
      els.uiLangBtn.addEventListener('click', handleLangToggle)
    }

    els.login.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      void (async function () {
        if (!apiOk && !(await checkApi())) return
        setLine(t('loginWindow'))
        await api('/api/maps/login', { method: 'POST', body: '{}' })
        await refreshAuth()
        if (loggedIn) {
          await refreshLocal()
          void search(false)
        }
      })()
    })

    els.close.addEventListener('pointerup', function (e) {
      e.preventDefault()
      e.stopPropagation()
      requestClose()
    })
    els.close.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      requestClose()
    })

    els.more.addEventListener('click', function () {
      void search(true)
    })

    els.refresh.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      void search(false)
    })

    function syncQClear() {
      if (!els.qClear) return
      var has = !!(els.q && els.q.value && els.q.value.length)
      els.qClear.hidden = !has
    }

    els.q.addEventListener('input', function () {
      syncQClear()
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(function () {
        void search(false)
      }, 500)
    })

    if (els.qClear) {
      els.qClear.addEventListener('pointerup', function (e) {
        e.preventDefault()
        e.stopPropagation()
        if (!els.q) return
        els.q.value = ''
        syncQClear()
        clearTimeout(debounceTimer)
        void search(false)
      })
    }
    syncQClear()

    onChipPointer(els.statuses, 'data-status', function (v) {
      setStatus(v)
    })
    onChipPointer(els.modes, 'data-mode', function (v) {
      setMode(v)
    })

    // Custom language dropdown (native <select> is unreliable in game overlay)
    if (els.langBtn) {
      els.langBtn.addEventListener('pointerup', function (e) {
        e.preventDefault()
        e.stopPropagation()
        toggleMenu('lang')
      })
    }
    if (els.langMenu) {
      els.langMenu.addEventListener('pointerup', function (e) {
        var t = e.target
        if (!(t instanceof Element)) return
        var btn = t.closest ? t.closest('[data-lang]') : null
        if (!btn) return
        e.preventDefault()
        e.stopPropagation()
        setLanguage(btn.getAttribute('data-lang') || 'any')
      })
    }
    if (els.moreBtn) {
      els.moreBtn.addEventListener('pointerup', function (e) {
        e.preventDefault()
        e.stopPropagation()
        toggleMenu('more')
      })
    }
    if (els.moreMenu) {
      els.moreMenu.addEventListener('pointerup', function (e) {
        var t = e.target
        if (!(t instanceof Element)) return
        var btn = t.closest ? t.closest('[data-more-status]') : null
        if (!btn) return
        e.preventDefault()
        e.stopPropagation()
        setStatus(btn.getAttribute('data-more-status') || 'ranked')
      })
    }

    // List actions
    els.list.addEventListener('pointerup', function (e) {
      handleListAction(e)
    })
    els.list.addEventListener('click', function (e) {
      handleListAction(e)
    })

    // Mini-player
    if (els.playerPrev) {
      els.playerPrev.addEventListener('click', function (e) {
        e.preventDefault()
        playAdjacent(-1)
      })
    }
    if (els.playerPlay) {
      els.playerPlay.addEventListener('click', function (e) {
        e.preventDefault()
        togglePlayPause()
      })
    }
    if (els.playerNext) {
      els.playerNext.addEventListener('click', function (e) {
        e.preventDefault()
        playAdjacent(1)
      })
    }
    if (els.volRange) {
      els.volRange.addEventListener('input', function () {
        saveVolume((parseInt(els.volRange.value, 10) || 0) / 100)
      })
      els.volRange.addEventListener('change', function () {
        saveVolume((parseInt(els.volRange.value, 10) || 0) / 100)
      })
    }
    if (els.muteBtn) {
      els.muteBtn.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        saveMuteOsuPref(!muteOsuOnPreview)
      })
    }
    if (els.playerBar) {
      els.playerBar.addEventListener('click', function (e) {
        if (!previewAudio || !previewAudio.duration) return
        var rect = els.playerBar.getBoundingClientRect()
        var ratio = (e.clientX - rect.left) / rect.width
        if (ratio >= 0 && ratio <= 1) {
          previewAudio.currentTime = ratio * previewAudio.duration
          syncPlayerProgress()
        }
      })
    }

    // Gameplay modal
    if (els.gpClose) {
      els.gpClose.addEventListener('click', function (e) {
        e.preventDefault()
        closeGameplayPreview()
      })
    }
    if (els.gpBackdrop) {
      els.gpBackdrop.addEventListener('click', function () {
        closeGameplayPreview()
      })
    }
    if (els.gpDiffs) {
      els.gpDiffs.addEventListener('click', function (e) {
        var t = e.target
        if (!(t instanceof Element)) return
        var btn = t.closest ? t.closest('[data-gp-diff]') : null
        if (!btn || !gp.set) return
        e.preventDefault()
        var id = Number(btn.getAttribute('data-gp-diff'))
        if (id) void loadGameplayDiff(id, gp.set)
      })
    }

    // Close menus when clicking panel background
    if (els.panel) {
      els.panel.addEventListener('pointerdown', function (e) {
        var t = e.target
        if (!(t instanceof Element)) return
        if (t.closest && (t.closest('.mg-dd') || t.closest('.mg-dd-menu'))) return
        closeMenus()
      })
    }

    try {
      var es = new EventSource(API + '/api/maps/progress')
      es.onmessage = function (ev) {
        try {
          var p = JSON.parse(ev.data)
          downloads[p.setId] = p
          if (p.phase === 'done') localIds.add(p.setId)
          if (visible) renderList()
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  var lastListActionAt = 0
  function handleListAction(e) {
    var t = e.target
    if (!(t instanceof Element)) return
    var now = Date.now()
    if (now - lastListActionAt < 60) {
      e.preventDefault()
      return
    }

    var previewBtn = t.closest ? t.closest('[data-preview]') : null
    var previewAttr =
      (previewBtn && previewBtn.getAttribute('data-preview')) || t.getAttribute('data-preview')
    if (previewAttr) {
      lastListActionAt = now
      e.preventDefault()
      e.stopPropagation()
      togglePreview(Number(previewAttr))
      return
    }

    var gpBtn = t.closest ? t.closest('[data-gp]') : null
    var gpAttr = (gpBtn && gpBtn.getAttribute('data-gp')) || t.getAttribute('data-gp')
    if (gpAttr) {
      lastListActionAt = now
      e.preventDefault()
      e.stopPropagation()
      void openGameplayPreview(Number(gpAttr))
      return
    }

    var cancelBtn = t.closest ? t.closest('[data-cancel]') : null
    var cancelId =
      (cancelBtn && cancelBtn.getAttribute('data-cancel')) || t.getAttribute('data-cancel')
    if (cancelId) {
      lastListActionAt = now
      e.preventDefault()
      void api('/api/maps/cancel', {
        method: 'POST',
        body: JSON.stringify({ setId: Number(cancelId) }),
      })
      return
    }

    var dlBtn = t.closest ? t.closest('[data-dl]') : null
    var dlId = (dlBtn && dlBtn.getAttribute('data-dl')) || t.getAttribute('data-dl')
    if (dlId) {
      lastListActionAt = now
      e.preventDefault()
      e.stopPropagation()
      var id = Number(dlId)
      var set = sets.find(function (s) {
        return s.id === id
      })
      if (!set) return
      downloads[id] = { setId: id, phase: 'queued', progress: 0 }
      renderList()
      void api('/api/maps/download', {
        method: 'POST',
        body: JSON.stringify({ setId: id, artist: set.artist, title: set.title }),
      })
        .then(function (r) {
          if (r.cancelled) downloads[id] = { setId: id, phase: 'cancelled', progress: 0 }
          else if (r.ok) {
            downloads[id] = { setId: id, phase: 'done', progress: 100 }
            localIds.add(id)
          } else {
            downloads[id] = { setId: id, phase: 'error', progress: 0 }
            setLine(r.error || 'Ошибка')
          }
          renderList()
        })
        .catch(function (err) {
          downloads[id] = { setId: id, phase: 'error', progress: 0 }
          setLine(err.message || 'Ошибка')
          renderList()
        })
    }
  }

  function chip(kind, value, label, on) {
    var attr = kind === 'status' ? 'data-status' : 'data-mode'
    return (
      '<button type="button" class="mg-chip' +
      (on ? ' -on' : '') +
      '" ' +
      attr +
      '="' +
      value +
      '">' +
      label +
      '</button>'
    )
  }

  function menuItems(options, attr) {
    return options
      .map(function (o) {
        return (
          '<button type="button" class="mg-dd-item" ' +
          attr +
          '="' +
          o[0] +
          '">' +
          esc(o[1]) +
          '</button>'
        )
      })
      .join('')
  }

  function mount() {
    if (mounted) return
    mounted = true

    var style = document.createElement('style')
    style.id = 'tosu-gui-maps-style'
    style.textContent = CSS_TEXT
    document.documentElement.appendChild(style)

    rootEl = document.createElement('div')
    rootEl.id = ROOT_ID
    rootEl.innerHTML =
      '<div class="mg-shade" data-mg-close="1"></div>' +
      '<div class="mg-panel" role="dialog">' +
      '<header class="mg-top">' +
      '<div class="mg-top-title" id="mg-top-title">' + esc(t('title')) + '</div>' +
      '<div class="mg-top-spacer"></div>' +
      '<button type="button" class="mg-btn mg-ui-lang-btn" id="mg-ui-lang-btn" title="Сменить язык / Switch language">' + uiLang.toUpperCase() + '</button>' +
      '<span class="mg-auth" id="mg-auth">…</span>' +
      '<button type="button" class="mg-btn mg-primary mg-login-btn" id="mg-login" hidden>' + esc(t('login')) + '</button>' +
      '<button type="button" class="mg-x" id="mg-close" title="' + esc(t('close')) + '" aria-label="' + esc(t('close')) + '">×</button>' +
      '</header>' +
      '<p class="mg-hint" id="mg-hint"></p>' +
      '<div class="mg-toolbar">' +
      '<div class="mg-search-wrap">' +
      '<input class="mg-input" id="mg-q" type="search" placeholder="' + esc(t('searchPlaceholder')) + '" autocomplete="off" spellcheck="false" />' +
      '<button type="button" class="mg-q-clear" id="mg-q-clear" title="' + esc(t('clearSearch')) + '" aria-label="' + esc(t('clearSearch')) + '" hidden>×</button>' +
      '</div>' +
      '<div class="mg-dd" id="mg-lang-wrap">' +
      '<button type="button" class="mg-dd-btn" id="mg-lang-btn" title="' + esc(t('anyLang')) + '">' + esc(langLabel()) + '</button>' +
      '<div class="mg-dd-menu" id="mg-lang-menu" hidden>' +
      menuItems(getLangOptions(), 'data-lang') +
      '</div></div>' +
      '<button type="button" class="mg-btn mg-refresh" id="mg-refresh" title="' + esc(t('refresh')) + '">↻</button>' +
      '</div>' +
      '<div class="mg-label" id="mg-lbl-status">' + esc(t('statusLabel')) + '</div>' +
      '<div class="mg-status-row">' +
      '<div class="mg-chips mg-chips-inline" id="mg-statuses">' +
      chip('status', 'ranked', 'Ranked', true) +
      chip('status', 'qualified', 'Qualified', false) +
      chip('status', 'loved', 'Loved', false) +
      chip('status', 'any', t('statusAny'), false) +
      '</div>' +
      '<div class="mg-dd" id="mg-more-wrap">' +
      '<button type="button" class="mg-dd-btn mg-dd-btn-sm" id="mg-more-btn" title="' + esc(t('statusMore')) + '">' + esc(moreStatusLabel()) + '</button>' +
      '<div class="mg-dd-menu" id="mg-more-menu" hidden>' +
      menuItems(getMoreStatusOptions(), 'data-more-status') +
      '</div></div>' +
      '</div>' +
      '<div class="mg-label" id="mg-lbl-mode">' + esc(t('modeLabel')) + '</div>' +
      '<div class="mg-chips" id="mg-modes">' +
      chip('mode', 'any', t('modeAll'), true) +
      chip('mode', 'osu', 'osu!', false) +
      chip('mode', 'taiko', 'Taiko', false) +
      chip('mode', 'fruits', 'Catch', false) +
      chip('mode', 'mania', 'Mania', false) +
      '</div>' +
      '<div class="mg-list" id="mg-list"></div>' +
      '<div class="mg-footer">' +
      '<button type="button" class="mg-btn" id="mg-more" hidden>' + esc(t('showMore')) + '</button>' +
      '<div class="mg-line" id="mg-line"></div>' +
      '</div>' +
      // Mini-player (osu website style)
      '<div class="mg-player" id="mg-player">' +
      '<div class="mg-player-bar" id="mg-player-bar" title="' + esc(t('seek')) + '"><div class="mg-player-progress" id="mg-player-progress"></div></div>' +
      '<div class="mg-player-body">' +
      '<div class="mg-player-cover" id="mg-player-cover"></div>' +
      '<div class="mg-player-meta">' +
      '<div class="mg-player-title" id="mg-player-title">' + esc(t('noTrack')) + '</div>' +
      '<div class="mg-player-sub" id="mg-player-sub">' + esc(t('selectBeatmap')) + '</div>' +
      '</div>' +
      '<div class="mg-player-controls">' +
      '<button type="button" class="mg-pbtn" id="mg-player-prev" title="' + esc(t('prevTrack')) + '">⏮</button>' +
      '<button type="button" class="mg-pbtn mg-pbtn-main" id="mg-player-play" title="' + esc(t('play')) + '">▶</button>' +
      '<button type="button" class="mg-pbtn" id="mg-player-next" title="' + esc(t('nextTrack')) + '">⏭</button>' +
      '</div>' +
      '<div class="mg-player-vol" title="' + esc(t('volume')) + '">' +
      '<span class="mg-vol-ico">♪</span>' +
      '<input type="range" class="mg-vol-range" id="mg-vol" min="0" max="100" value="55" />' +
      '<span class="mg-vol-label" id="mg-vol-label">55%</span>' +
      '</div>' +
      '<button type="button" class="mg-mute-btn' + (muteOsuOnPreview ? ' -on' : '') + '" id="mg-mute-osu" title="' + esc(t('muteOsuTitle')) + '" aria-pressed="' + (muteOsuOnPreview ? 'true' : 'false') + '">' +
      '<span class="mg-mute-ico">' + (muteOsuOnPreview ? '🔇' : '🔈') + '</span>' +
      '<span class="mg-mute-label">' + (muteOsuOnPreview ? esc(t('muteOsuOn')) : esc(t('muteOsuOff'))) + '</span>' +
      '</button>' +
      '</div></div>' +
      // Gameplay preview modal
      '<div class="mg-gp-modal" id="mg-gp-modal" hidden>' +
      '<div class="mg-gp-backdrop" id="mg-gp-backdrop"></div>' +
      '<div class="mg-gp-panel">' +
      '<div class="mg-gp-head">' +
      '<div class="mg-gp-head-text">' +
      '<div class="mg-gp-title" id="mg-gp-title">' + esc(t('previewModalTitle')) + '</div>' +
      '<div class="mg-gp-sub" id="mg-gp-sub"></div>' +
      '</div>' +
      '<button type="button" class="mg-x" id="mg-gp-close" title="' + esc(t('close')) + '">×</button>' +
      '</div>' +
      '<div class="mg-gp-diffs" id="mg-gp-diffs"></div>' +
      '<canvas class="mg-gp-canvas" id="mg-gp-canvas" width="640" height="480"></canvas>' +
      '</div></div>' +
      '</div>'

    var parent = document.body || document.documentElement
    if (parent && !parent.contains(rootEl)) {
      parent.appendChild(rootEl)
    }

    els = {
      topTitle: rootEl.querySelector('#mg-top-title'),
      uiLangBtn: rootEl.querySelector('#mg-ui-lang-btn'),
      authLabel: rootEl.querySelector('#mg-auth'),
      login: rootEl.querySelector('#mg-login'),
      close: rootEl.querySelector('#mg-close'),
      hint: rootEl.querySelector('#mg-hint'),
      q: rootEl.querySelector('#mg-q'),
      qClear: rootEl.querySelector('#mg-q-clear'),
      lblStatus: rootEl.querySelector('#mg-lbl-status'),
      statuses: rootEl.querySelector('#mg-statuses'),
      lblMode: rootEl.querySelector('#mg-lbl-mode'),
      modes: rootEl.querySelector('#mg-modes'),
      langBtn: rootEl.querySelector('#mg-lang-btn'),
      langMenu: rootEl.querySelector('#mg-lang-menu'),
      moreBtn: rootEl.querySelector('#mg-more-btn'),
      moreMenu: rootEl.querySelector('#mg-more-menu'),
      list: rootEl.querySelector('#mg-list'),
      more: rootEl.querySelector('#mg-more'),
      line: rootEl.querySelector('#mg-line'),
      refresh: rootEl.querySelector('#mg-refresh'),
      shade: rootEl.querySelector('.mg-shade'),
      panel: rootEl.querySelector('.mg-panel'),
      player: rootEl.querySelector('#mg-player'),
      playerCover: rootEl.querySelector('#mg-player-cover'),
      playerTitle: rootEl.querySelector('#mg-player-title'),
      playerSub: rootEl.querySelector('#mg-player-sub'),
      playerPrev: rootEl.querySelector('#mg-player-prev'),
      playerPlay: rootEl.querySelector('#mg-player-play'),
      playerNext: rootEl.querySelector('#mg-player-next'),
      playerBar: rootEl.querySelector('#mg-player-bar'),
      playerProgress: rootEl.querySelector('#mg-player-progress'),
      volRange: rootEl.querySelector('#mg-vol'),
      volLabel: rootEl.querySelector('#mg-vol-label'),
      muteBtn: rootEl.querySelector('#mg-mute-osu'),
      gpModal: rootEl.querySelector('#mg-gp-modal'),
      gpBackdrop: rootEl.querySelector('#mg-gp-backdrop'),
      gpClose: rootEl.querySelector('#mg-gp-close'),
      gpTitle: rootEl.querySelector('#mg-gp-title'),
      gpSub: rootEl.querySelector('#mg-gp-sub'),
      gpDiffs: rootEl.querySelector('#mg-gp-diffs'),
      gpCanvas: rootEl.querySelector('#mg-gp-canvas'),
    }

    if (els.volRange) els.volRange.value = String(Math.round(previewVolume * 100))
    if (els.volLabel) els.volLabel.textContent = Math.round(previewVolume * 100) + '%'
    syncMuteBtnUi()

    els.shade.addEventListener('pointerup', function (e) {
      e.preventDefault()
      requestClose()
    })
    els.shade.addEventListener('click', function (e) {
      e.preventDefault()
      requestClose()
    })

    bindUi()
    rootEl.style.setProperty('display', 'none', 'important')
    updateAuthUi()
    syncPlayerUi()
    syncMuteBtnUi()
  }

  function applyStyles() {
    var style = document.getElementById('tosu-gui-maps-style')
    if (!style) {
      style = document.createElement('style')
      style.id = 'tosu-gui-maps-style'
      var parent = document.head || document.documentElement || document.body
      if (parent) parent.appendChild(style)
    }
    style.textContent = CSS_TEXT
  }

  async function show() {
    try {
      mount()
      applyStyles()
      var parent = document.body || document.documentElement
      if (rootEl && parent && !parent.contains(rootEl)) {
        parent.appendChild(rootEl)
      }
      visible = true
      if (rootEl) {
        rootEl.style.setProperty('display', 'flex', 'important')
        rootEl.style.setProperty('pointer-events', 'auto', 'important')
        rootEl.removeAttribute('aria-hidden')
      }
      updateAuthUi()
      syncFilterUi()
      syncPlayerUi()
      syncMuteBtnUi()
      renderList()

      void api('/api/maps/audio-mute').then(function (res) {
        if (res && typeof res.autoMute === 'boolean') {
          muteOsuOnPreview = res.autoMute
          try {
            localStorage.setItem(MUTE_OSU_KEY, muteOsuOnPreview ? '1' : '0')
          } catch (e) {}
          syncMuteBtnUi()
        }
      }).catch(function () {})

      void refreshAuth().then(function () {
        if (loggedIn && !didInitialSearch) {
          void search(false)
        } else if (loggedIn && sets.length) {
          setLine(sets.length + ' карт')
        }
      }).catch(function () {})

      void refreshLocal().catch(function () {})

      setTimeout(function () {
        try {
          if (els.q) els.q.focus({ preventScroll: true })
        } catch (e) {
          try {
            els.q.focus()
          } catch (e2) {
            /* ignore */
          }
        }
      }, 30)
    } catch (err) {
      console.warn('[maps] show error:', err)
    }
  }

  function hide() {
    // Keep filters, sets, language, status, mode, query — only hide + stop audio
    visible = false
    stopPreview()
    closeGameplayPreview()
    closeMenus()
    if (rootEl) {
      rootEl.style.setProperty('display', 'none', 'important')
      rootEl.style.setProperty('pointer-events', 'none', 'important')
      rootEl.setAttribute('aria-hidden', 'true')
    }
  }

  var CSS_TEXT =
    '@font-face{font-family:"SF Pro Text";src:url("http://127.0.0.1:24777/fonts/sf-pro-text_regular.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}' +
    '@font-face{font-family:"SF Pro Text";src:url("http://127.0.0.1:24777/fonts/sf-pro-text_semibold.woff2") format("woff2");font-weight:600;font-style:normal;font-display:swap}' +
    '@font-face{font-family:"SF Pro Display";src:url("http://127.0.0.1:24777/fonts/sf-pro-display_regular.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}' +
    '@font-face{font-family:"SF Pro Display";src:url("http://127.0.0.1:24777/fonts/sf-pro-display_medium.woff2") format("woff2");font-weight:500;font-style:normal;font-display:swap}' +
    '@font-face{font-family:"SF Pro Display";src:url("http://127.0.0.1:24777/fonts/sf-pro-display_semibold.woff2") format("woff2");font-weight:600;font-style:normal;font-display:swap}' +
    '#' +
    ROOT_ID +
    ',#' +
    ROOT_ID +
    ' *{user-select:none;-webkit-user-select:none;font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",sans-serif!important;-webkit-font-smoothing:antialiased!important;-moz-osx-font-smoothing:grayscale!important;text-rendering:optimizeLegibility!important}' +
    '#' +
    ROOT_ID +
    ' .mg-input,.mg-vol-range{user-select:text;-webkit-user-select:text}' +
    '#' +
    ROOT_ID +
    '{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;display:none;align-items:stretch;justify-content:flex-end;padding:12px;box-sizing:border-box;font-size:13px;line-height:1.35;color:rgba(255,255,255,.92);pointer-events:auto}' +
    '#' +
    ROOT_ID +
    ' .mg-shade{position:absolute;inset:0;background:rgba(0,0,0,.65)}' +
    '#' +
    ROOT_ID +
    ' .mg-panel{position:relative;z-index:1;width:min(640px,100%);height:100%;max-height:100%;min-height:0;display:flex;flex-direction:column;background:#1c1c1e;border:1px solid rgba(255,255,255,.14);border-radius:12px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.6)}' +
    '#' +
    ROOT_ID +
    ' .mg-top{flex-shrink:0;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:10px;padding:16px 16px 8px 18px;min-height:52px;box-sizing:border-box}' +
    '#' +
    ROOT_ID +
    ' .mg-top-title{font-family:"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,sans-serif!important;font-size:18px;font-weight:600;letter-spacing:-.02em;line-height:38px;height:38px;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-top-spacer{flex:1;min-width:8px}' +
    '#' +
    ROOT_ID +
    ' .mg-auth{font-size:13px;color:rgba(255,255,255,.58);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;line-height:38px;height:38px;flex-shrink:1}' +
    '#' +
    ROOT_ID +
    ' .mg-ui-lang-btn{height:38px;padding:0 12px;border:none;border-radius:10px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.92);font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-ui-lang-btn:hover{background:rgba(255,255,255,.18);color:#fff}' +
    '#' +
    ROOT_ID +
    ' .mg-login-btn{height:38px;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-x{width:38px;height:38px;border:none;border-radius:10px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.92);padding:0;margin:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:22px;line-height:1;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-x:hover{background:rgba(255,69,58,.25);color:#ff453a}' +
    '#' +
    ROOT_ID +
    ' .mg-hint{flex-shrink:0;padding:0 18px 10px;margin:0;font-size:12px;line-height:1.4;color:rgba(255,255,255,.42)}' +
    '#' +
    ROOT_ID +
    ' .mg-toolbar{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 16px 10px}' +
    '#' +
    ROOT_ID +
    ' .mg-search-wrap{position:relative;flex:1;min-width:0;display:flex;align-items:center}' +
    '#' +
    ROOT_ID +
    ' .mg-input{flex:1;min-width:0;width:100%;height:40px;padding:0 36px 0 12px;border-radius:8px;border:.5px solid rgba(255,255,255,.14);background:rgba(0,0,0,.35);color:rgba(255,255,255,.94);outline:none;font-size:15px;box-sizing:border-box}' +
    '#' +
    ROOT_ID +
    ' .mg-input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;display:none}' +
    '#' +
    ROOT_ID +
    ' .mg-input:focus{border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.22)}' +
    '#' +
    ROOT_ID +
    ' .mg-q-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:none;border-radius:6px;background:transparent;color:rgba(255,255,255,.55);font-size:18px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;z-index:2}' +
    '#' +
    ROOT_ID +
    ' .mg-q-clear:hover{color:rgba(255,255,255,.95);background:rgba(255,255,255,.08)}' +
    '#' +
    ROOT_ID +
    ' .mg-q-clear[hidden]{display:none!important}' +
    '#' +
    ROOT_ID +
    ' .mg-dd{position:relative;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-dd-btn{height:40px;padding:0 12px;border-radius:8px;border:.5px solid rgba(255,255,255,.14);background:rgba(0,0,0,.35);color:rgba(255,255,255,.92);outline:none;font-size:13px;cursor:pointer;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#' +
    ROOT_ID +
    ' .mg-dd-btn-sm{height:32px;max-width:140px;font-size:12px}' +
    '#' +
    ROOT_ID +
    ' .mg-dd-btn.-active,.mg-dd-btn.-open{border-color:rgba(10,132,255,.55);color:#fff}' +
    '#' +
    ROOT_ID +
    ' .mg-dd-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:20;min-width:160px;max-height:240px;overflow:auto;padding:4px;border-radius:10px;background:#242428;border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 32px rgba(0,0,0,.55)}' +
    '#' +
    ROOT_ID +
    ' .mg-dd-item{display:block;width:100%;text-align:left;border:none;background:transparent;color:rgba(255,255,255,.88);padding:8px 10px;border-radius:6px;font-size:13px;cursor:pointer}' +
    '#' +
    ROOT_ID +
    ' .mg-dd-item:hover{background:rgba(255,255,255,.08)}' +
    '#' +
    ROOT_ID +
    ' .mg-dd-item.-on{background:rgba(10,132,255,.28);color:#fff}' +
    '#' +
    ROOT_ID +
    ' .mg-status-row{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 16px 10px;min-width:0}' +
    '#' +
    ROOT_ID +
    ' .mg-refresh{width:40px;height:40px;padding:0;flex-shrink:0;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center}' +
    '#' +
    ROOT_ID +
    ' .mg-label{flex-shrink:0;padding:0 16px 4px;font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:rgba(255,255,255,.38)}' +
    '#' +
    ROOT_ID +
    ' .mg-chips{flex-shrink:0;display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 10px}' +
    '#' +
    ROOT_ID +
    ' .mg-chips-inline{flex:1;min-width:0;padding:0;flex-wrap:wrap}' +
    '#' +
    ROOT_ID +
    ' .mg-chip{height:32px;padding:0 12px;border-radius:8px;border:none;background:rgba(255,255,255,.07);color:rgba(255,255,255,.58);cursor:pointer;font-size:13px}' +
    '#' +
    ROOT_ID +
    ' .mg-chip.-on{background:rgba(10,132,255,.32);color:#fff}' +
    '#' +
    ROOT_ID +
    ' .mg-list{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:0 12px 8px;position:relative}' +
    '#' +
    ROOT_ID +
    ' .mg-list.-loading{opacity:.72}' +
    '#' +
    ROOT_ID +
    ' .mg-loading-banner{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 12px;margin-bottom:8px;border-radius:10px;background:rgba(10,132,255,.16);border:1px solid rgba(10,132,255,.28);color:rgba(255,255,255,.88);font-size:13px;font-weight:500}' +
    '#' +
    ROOT_ID +
    ' .mg-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:#0a84ff;border-radius:50%;animation:mg-spin .7s linear infinite;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-refresh.-spin{animation:mg-spin .8s linear infinite;opacity:.85}' +
    '@keyframes mg-spin{to{transform:rotate(360deg)}}' +
    '#' +
    ROOT_ID +
    ' .mg-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:48px 16px;text-align:center;color:rgba(255,255,255,.42);font-size:15px}' +
    '#' +
    ROOT_ID +
    ' .mg-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;margin-bottom:6px;min-height:64px;background:rgba(255,255,255,.04);border-left:3px solid transparent}' +
    '#' +
    ROOT_ID +
    ' .mg-row.st-ranked{background:rgba(102,204,255,.08);border-left-color:#66ccff}' +
    '#' +
    ROOT_ID +
    ' .mg-row.st-loved{background:rgba(255,102,171,.1);border-left-color:#ff66ab}' +
    '#' +
    ROOT_ID +
    ' .mg-row.st-qualified{background:rgba(255,217,102,.1);border-left-color:#ffd966}' +
    '#' +
    ROOT_ID +
    ' .mg-row.st-pending{background:rgba(220,171,78,.08);border-left-color:#dcab4e}' +
    '#' +
    ROOT_ID +
    ' .mg-row.st-graveyard{background:rgba(255,255,255,.03);border-left-color:rgba(255,255,255,.2)}' +
    '#' +
    ROOT_ID +
    ' .mg-row:hover{filter:brightness(1.06)}' +
    '#' +
    ROOT_ID +
    ' .mg-cover{width:72px;height:50px;border-radius:7px;object-fit:cover;background:rgba(255,255,255,.06);flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-meta{flex:1;min-width:0}' +
    '#' +
    ROOT_ID +
    ' .mg-title{font-size:15px;font-weight:600;letter-spacing:-.015em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#' +
    ROOT_ID +
    ' .mg-sub{margin-top:4px;font-size:12px;line-height:1.3;color:rgba(255,255,255,.52);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#' +
    ROOT_ID +
    ' .mg-badge{display:inline-block;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;vertical-align:middle}' +
    '#' +
    ROOT_ID +
    ' .mg-badge.st-ranked{color:#66ccff;background:rgba(102,204,255,.16)}' +
    '#' +
    ROOT_ID +
    ' .mg-badge.st-loved{color:#ff66ab;background:rgba(255,102,171,.18)}' +
    '#' +
    ROOT_ID +
    ' .mg-badge.st-qualified{color:#ffd966;background:rgba(255,217,102,.16)}' +
    '#' +
    ROOT_ID +
    ' .mg-badge.st-pending{color:#dcab4e;background:rgba(220,171,78,.16)}' +
    '#' +
    ROOT_ID +
    ' .mg-badge.st-graveyard,.mg-badge.st-other{color:rgba(255,255,255,.5);background:rgba(255,255,255,.08)}' +
    '#' +
    ROOT_ID +
    ' .mg-diff-icons-row{display:flex;align-items:center;gap:3px;margin-top:4px;flex-wrap:wrap}' +
    '#' +
    ROOT_ID +
    ' .mg-diffico{display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:transform .12s ease;cursor:default}' +
    '#' +
    ROOT_ID +
    ' .mg-diffico:hover{transform:scale(1.22)}' +
    '#' +
    ROOT_ID +
    ' .mg-diff-count{color:rgba(255,255,255,.75);font-weight:500}' +
    '#' +
    ROOT_ID +
    ' .mg-diff-more{font-size:10px;color:rgba(255,255,255,.45);margin-left:2px}' +
    '#' +
    ROOT_ID +
    ' .mg-actions{flex-shrink:0;display:flex;align-items:center;gap:5px}' +
    '#' +
    ROOT_ID +
    ' .mg-btn{flex-shrink:0;height:34px;padding:0 12px;border-radius:8px;border:.5px solid rgba(255,255,255,.12);background:rgba(255,255,255,.09);color:rgba(255,255,255,.92);cursor:pointer;font-size:13px;white-space:nowrap}' +
    '#' +
    ROOT_ID +
    ' .mg-btn:disabled{opacity:.45;cursor:default}' +
    '#' +
    ROOT_ID +
    ' .mg-preview,.mg-gp{width:34px;min-width:34px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:12px}' +
    '#' +
    ROOT_ID +
    ' .mg-preview.-playing{color:#0a84ff;border-color:rgba(10,132,255,.4);background:rgba(10,132,255,.16)}' +
    '#' +
    ROOT_ID +
    ' .mg-gp{font-size:14px}' +
    '#' +
    ROOT_ID +
    ' .mg-primary{background:#0a84ff;border-color:transparent;color:#fff}' +
    '#' +
    ROOT_ID +
    ' .mg-owned{color:#32d74b;border-color:rgba(50,215,75,.3)}' +
    '#' +
    ROOT_ID +
    ' .mg-busy{color:#ff453a;border-color:rgba(255,69,58,.3);min-width:72px}' +
    '#' +
    ROOT_ID +
    ' .mg-footer{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 16px 4px;border-top:1px solid rgba(255,255,255,.08)}' +
    '#' +
    ROOT_ID +
    ' .mg-line{font-size:12px;color:rgba(255,255,255,.45);min-height:14px;text-align:center}' +
    // Mini-player
    '#' +
    ROOT_ID +
    ' .mg-player{flex-shrink:0;border-top:1px solid rgba(255,255,255,.1);background:#121214}' +
    '#' +
    ROOT_ID +
    ' .mg-player-bar{height:3px;background:rgba(255,255,255,.08);cursor:pointer}' +
    '#' +
    ROOT_ID +
    ' .mg-player-progress{height:100%;width:0;background:#0a84ff;transition:width .1s linear}' +
    '#' +
    ROOT_ID +
    ' .mg-player-body{display:flex;align-items:center;gap:10px;padding:8px 12px 10px}' +
    '#' +
    ROOT_ID +
    ' .mg-player-cover{width:42px;height:42px;border-radius:6px;overflow:hidden;background:rgba(255,255,255,.06);flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-player-cover img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#' +
    ROOT_ID +
    ' .mg-player-meta{flex:1;min-width:0}' +
    '#' +
    ROOT_ID +
    ' .mg-player-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#' +
    ROOT_ID +
    ' .mg-player-sub{font-size:11px;color:rgba(255,255,255,.48);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}' +
    '#' +
    ROOT_ID +
    ' .mg-player-controls{display:flex;align-items:center;gap:4px;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-pbtn{width:32px;height:32px;border:none;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;justify-content:center;padding:0}' +
    '#' +
    ROOT_ID +
    ' .mg-pbtn-main{width:36px;height:36px;background:#0a84ff;font-size:13px}' +
    '#' +
    ROOT_ID +
    ' .mg-player-vol{display:flex;align-items:center;gap:6px;flex-shrink:0;min-width:120px}' +
    '#' +
    ROOT_ID +
    ' .mg-vol-ico{font-size:12px;color:rgba(255,255,255,.5)}' +
    '#' +
    ROOT_ID +
    ' .mg-vol-range{width:72px;accent-color:#0a84ff;cursor:pointer}' +
    '#' +
    ROOT_ID +
    ' .mg-vol-label{font-size:11px;color:rgba(255,255,255,.5);min-width:32px}' +
    '#' +
    ROOT_ID +
    ' .mg-mute-btn{flex-shrink:0;height:26px;padding:0 8px;border-radius:6px;border:.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:rgba(255,255,255,.68);cursor:pointer;font-size:11px;font-weight:500;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;transition:all .15s ease}' +
    '#' +
    ROOT_ID +
    ' .mg-mute-btn:hover{background:rgba(255,255,255,.12);color:#fff}' +
    '#' +
    ROOT_ID +
    ' .mg-mute-btn.-on{background:rgba(10,132,255,.2);border-color:rgba(10,132,255,.45);color:#5ac8fa}' +
    '#' +
    ROOT_ID +
    ' .mg-mute-ico{font-size:12px;line-height:1}' +
    // Gameplay modal
    '#' +
    ROOT_ID +
    ' .mg-gp-modal{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-modal[hidden]{display:none!important}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.75)}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-panel{position:relative;z-index:1;width:min(680px,100%);background:#16161a;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:12px;box-shadow:0 20px 48px rgba(0,0,0,.65)}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-head-text{flex:1;min-width:0}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-title{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-sub{font-size:12px;color:rgba(255,255,255,.5);margin-top:2px}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-diffs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;max-height:72px;overflow:auto}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-canvas{width:100%;height:auto;aspect-ratio:4/3;border-radius:8px;background:#0b0b10;display:block}'

  global.__TosuGuiMapsAppVersion = APP_VERSION
  global.__TosuGuiMapsApp = {
    show: show,
    hide: hide,
    mount: mount,
    isVisible: function () {
      return visible
    },
  }
})(window)
