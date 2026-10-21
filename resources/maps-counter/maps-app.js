/**
 * Same-document Maps panel for tosu inject overlay.
 * Mount once, show/hide — keeps filters, results, login.
 * Close: console marker read by overlay-patch (no page reload).
 *
 * Features: audio mini-player, volume, language/status filters (custom dropdowns),
 * simple gameplay preview without downloading the full set (osu!preview-style).
 */
;(function (global) {
  var APP_VERSION = 34
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
      selectBeatmap: 'Выберите карту',
      pause: 'Пауза',
      play: 'Играть',
      prevTrack: 'Предыдущая',
      nextTrack: 'Следующая',
      seek: 'Перемотка',
      volume: 'Громкость',
      muteOsuOn: 'Глушить osu!',
      muteOsuOff: 'Глушить osu!',
      muteOsuTitle: 'Заглушать звук osu! во время превью',
      previewModalTitle: 'Превью',
      previewMapBtn: 'Предпросмотр карты',
      listen: 'Слушать',
      previewFailed: 'Не удалось воспроизвести превью',
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
      hintActive: 'Закрыть: «{keybind}» или кнопка ✕',
      cardsCount: '{n} карт',
      diffSingular: '{n} сложность',
      diffFew: '{n} сложности',
      diffMany: '{n} сложностей',
      back: 'Назад',
      mappedBy: 'автор карты',
      submitted: 'загружена',
      rankedOn: 'ранкнута',
      updated: 'Обновлена',
      length: 'Длина',
      circles: 'Ноты',
      sliders: 'Слайдеры',
      spinners: 'Спиннеры',
      maxCombo: 'Макс. комбо',
      plays: 'Игры',
      favourites: 'В избранном',
      passRate: 'Проходимость',
      source: 'Источник',
      tags: 'Теги',
      difficulties: 'Сложности',
      statsTitle: 'Статистика',
      infoTitle: 'Информация',
      attrsTitle: 'Параметры сложности',
      attrCs: 'Размер нот (CS)',
      attrHp: 'Потеря HP (HP)',
      attrOd: 'Точность (OD)',
      attrAr: 'Скорость (AR)',
      keys: 'Клавиши',
      stars: 'Звёзды',
      video: 'Видео',
      storyboard: 'Сториборд',
      queued: 'Очередь',
      noVideo: 'Без видео',
      withVideo: 'С видео',
      dlNoVideoTitle: 'Скачать без видео',
      dlWithVideoTitle: 'Скачать с видео',
      dlDefaultNoVideo: 'Без видео — как в настройках профиля osu!',
      dlDefaultVideo: 'С видео — как в настройках профиля osu!',
      installing: 'Установка',
      cancel: 'Отменить',
      retry: 'Повторить',
      errTimeout: 'Сервер не ответил вовремя — попробуйте ещё раз',
      errAborted: 'Запрос прерван',
      errServer: 'Сервер временно недоступен',
      status_ranked: 'Ranked',
      status_approved: 'Approved',
      status_qualified: 'Qualified',
      status_loved: 'Loved',
      status_pending: 'Pending',
      status_wip: 'WIP',
      status_graveyard: 'Graveyard',
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
      selectBeatmap: 'Select a beatmap',
      pause: 'Pause',
      play: 'Play',
      prevTrack: 'Previous',
      nextTrack: 'Next',
      seek: 'Seek',
      volume: 'Volume',
      muteOsuOn: 'Mute osu!',
      muteOsuOff: 'Mute osu!',
      muteOsuTitle: 'Mute osu! sound during beatmap preview',
      previewModalTitle: 'Preview',
      previewMapBtn: 'Preview beatmap',
      listen: 'Listen',
      previewFailed: 'Could not play the preview',
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
      hintActive: 'Close: «{keybind}» or the ✕ button',
      cardsCount: '{n} beatmaps',
      diffSingular: '{n} difficulty',
      diffFew: '{n} difficulties',
      diffMany: '{n} difficulties',
      back: 'Back',
      mappedBy: 'mapped by',
      submitted: 'submitted',
      rankedOn: 'ranked',
      updated: 'Updated',
      length: 'Length',
      circles: 'Circles',
      sliders: 'Sliders',
      spinners: 'Spinners',
      maxCombo: 'Max combo',
      plays: 'Plays',
      favourites: 'Favourites',
      passRate: 'Pass rate',
      source: 'Source',
      tags: 'Tags',
      difficulties: 'Difficulties',
      statsTitle: 'Statistics',
      infoTitle: 'Info',
      attrsTitle: 'Difficulty attributes',
      attrCs: 'Circle Size',
      attrHp: 'HP Drain',
      attrOd: 'Accuracy',
      attrAr: 'Approach Rate',
      keys: 'Key Count',
      stars: 'Star Rating',
      video: 'Video',
      storyboard: 'Storyboard',
      queued: 'Queued',
      noVideo: 'No video',
      withVideo: 'With video',
      dlNoVideoTitle: 'Download without video',
      dlWithVideoTitle: 'Download with video',
      dlDefaultNoVideo: 'Without video — per your osu! profile setting',
      dlDefaultVideo: 'With video — per your osu! profile setting',
      installing: 'Installing',
      cancel: 'Cancel',
      retry: 'Retry',
      errTimeout: 'The server took too long to respond — try again',
      errAborted: 'Request was interrupted',
      errServer: 'The server is temporarily unavailable',
      status_ranked: 'Ranked',
      status_approved: 'Approved',
      status_qualified: 'Qualified',
      status_loved: 'Loved',
      status_pending: 'Pending',
      status_wip: 'WIP',
      status_graveyard: 'Graveyard',
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
  /** osu! profile "download without video" preference (from /api/maps/auth) */
  var prefersNoVideo = false
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
    /** Web Audio track: { src, gain, endCtx, clock } — shares its clock with hitsounds */
    music: null,
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
    if (gp.music) gp.music.gain.gain.value = previewVolume
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
    if (ico) ico.innerHTML = icon(muteOsuOnPreview ? 'volX' : 'vol', 14)
    var label = els.muteBtn.querySelector('.mg-mute-label')
    if (label) label.textContent = muteOsuOnPreview ? t('muteOsuOn') : t('muteOsuOff')
    els.muteBtn.title = t('muteOsuTitle')
  }

  var ICONS = {
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    prev: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>',
    vol: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    volX: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    videoOff: '<path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    plays: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    slider: '<path d="M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7z"/>',
    spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    combo: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  }

  function icon(name, size) {
    var sz = size || 14
    return (
      '<svg class="mg-ico" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') +
      '</svg>'
    )
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
    return '<span class="mg-diffico"' + tt + ' style="color:' + color + '"><svg viewBox="0 0 1000 1000" width="' + (size || 14) + '" height="' + (size || 14) + '"><g transform="translate(0,850) scale(1,-1)"><path fill="currentColor" fill-rule="evenodd" d="' + d + '"/></g></svg></span>'
  }

  var DEFAULT_API_TIMEOUT_MS = 10000

  /** `opts.timeout` in ms; 0 disables it (long operations: download, login window). */
  async function api(path, opts) {
    opts = opts || {}
    var timeoutMs = opts.timeout == null ? DEFAULT_API_TIMEOUT_MS : opts.timeout
    var signal = opts.signal
    if (!signal && timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signal = AbortSignal.timeout(timeoutMs)
    }
    var res = await fetch(API + path, {
      method: opts.method,
      body: opts.body,
      signal: signal,
      headers: Object.assign(
        { Accept: 'application/json' },
        opts.body ? { 'Content-Type': 'application/json' } : {},
        opts.headers || {}
      ),
    })
    var data = await res.json().catch(function () {
      return {}
    })
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status)
    return data
  }

  /** Human-readable text for fetch/network failures instead of raw "Failed to fetch" etc. */
  function friendlyError(err) {
    var msg = err && err.message ? String(err.message) : String(err || '')
    var name = err && err.name ? String(err.name) : ''
    if (name === 'TimeoutError' || /timed? ?out|timeout/i.test(msg)) return t('errTimeout')
    if (name === 'AbortError' || /aborted/i.test(msg)) return t('errAborted')
    if (/failed to fetch|networkerror|load failed|fetch failed|ERR_CONNECTION|ECONNREFUSED/i.test(msg)) return t('noGuiConnection')
    if (/^HTTP 5\d\d/.test(msg)) return t('errServer')
    if (/^HTTP \d{3}/.test(msg) || !msg) return t('errGeneric')
    return msg
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
      var endedId = previewId
      previewId = null
      previewPaused = false
      notifyPreviewState(false, 'mini-player')
      if (visible) {
        patchSet(endedId)
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
    var stoppedId = previewId
    previewId = null
    previewPaused = false
    if (stoppedId && visible) patchSet(stoppedId)
    syncPlayerUi()
  }

  function playSetById(id) {
    var session = ++miniPlayerSession
    var audio = ensureAudio()
    try {
      audio.pause()
      audio.volume = previewVolume
      var prevId = previewId
      previewId = id
      previewPaused = false
      syncPreviewMarks(prevId)
      syncPlayerUi()

      var urls = audioUrlsForSet(id)
      var idx = 0
      function tryNext() {
        if (session !== miniPlayerSession) return
        if (idx >= urls.length) {
          previewId = null
          previewPaused = false
          notifyPreviewState(false, 'mini-player')
          setLine(t('previewFailed'))
          patchSet(id)
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
        patchSet(id)
      } else {
        audio.pause()
        previewPaused = true
        notifyPreviewState(false, 'mini-player')
        syncPlayerUi()
        patchSet(id)
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
      els.playerPlay.innerHTML = icon(playing ? 'pause' : 'play', 15)
      els.playerPlay.title = playing ? t('pause') : t('play')
    }
    if (els.volRange) {
      els.volRange.value = String(Math.round(previewVolume * 100))
    }
    if (els.volLabel) {
      els.volLabel.textContent = Math.round(previewVolume * 100) + '%'
    }
    if (els.volIco) els.volIco.innerHTML = icon(previewVolume <= 0 ? 'volX' : 'vol', 14)
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

  function isBusy(dl) {
    return !!dl && (dl.phase === 'downloading' || dl.phase === 'installing' || dl.phase === 'queued')
  }

  function fmtNum(n) {
    n = Number(n) || 0
    try {
      return n.toLocaleString(uiLang === 'en' ? 'en-US' : 'ru-RU')
    } catch (e) {
      return String(n)
    }
  }

  function fmtShort(n) {
    n = Number(n) || 0
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K'
    return String(n)
  }

  function fmtLength(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0))
    var m = Math.floor(sec / 60)
    var s = sec % 60
    return m + ':' + (s < 10 ? '0' : '') + s
  }

  function fmtDate(iso) {
    if (!iso) return ''
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    try {
      return d.toLocaleDateString(uiLang === 'en' ? 'en-US' : 'ru-RU', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch (e) {
      return d.toISOString().slice(0, 10)
    }
  }

  function statusLabel(st) {
    var key = 'status_' + String(st || '').toLowerCase()
    var v = t(key)
    return v === key ? String(st || '') : v
  }

  function findSet(id) {
    for (var i = 0; i < sets.length; i++) if (sets[i].id === id) return sets[i]
    return detail.set && detail.set.id === id ? detail.set : null
  }

  function visibleBeatmaps(s) {
    var all = s.beatmaps || []
    var matching = all.filter(function (b) {
      return mode === 'any' || normalizeOsuMode(b.mode) === mode
    })
    return matching.length ? matching : all
  }

  /** Download / installed / progress control shared by cards and the detail view. */
  function downloadControlHtml(s, big) {
    var cls = big ? ' mg-btn-lg' : ''
    if (localIds.has(s.id)) {
      return '<button type="button" class="mg-btn mg-owned' + cls + '" disabled>' + icon('check') + esc(t('installed')) + '</button>'
    }
    var dl = downloads[s.id]
    if (isBusy(dl)) {
      var pct = dl.progress != null ? Math.round(dl.progress) : 0
      var label = dl.phase === 'queued' ? t('queued') : dl.phase === 'installing' ? t('installing') : pct + '%'
      return (
        '<button type="button" class="mg-btn mg-busy' + cls + '" data-cancel="' + s.id + '" title="' + esc(t('cancel')) + '">' +
        '<span class="mg-busy-fill" style="width:' + pct + '%"></span><span class="mg-busy-label">' + icon('x', 13) + esc(label) + '</span></button>'
      )
    }
    var failed = dl && dl.phase === 'error'
    var title = failed && dl.error ? dl.error : s.hasVideo ? t(prefersNoVideo ? 'dlDefaultNoVideo' : 'dlDefaultVideo') : ''
    return (
      '<button type="button" class="mg-btn mg-primary' + cls + '" data-dl="' + s.id + '"' +
      (title ? ' title="' + esc(title) + '"' : '') + '>' +
      (failed ? icon('refresh', 13) + esc(t('retry')) : icon('download', 14) + esc(t('download'))) + '</button>'
    )
  }

  /** Alternative to the profile default: "without video" (or "with video" if the profile says no video). */
  function altVideoButtonHtml(s, big) {
    if (!s.hasVideo || localIds.has(s.id) || isBusy(downloads[s.id])) return ''
    var alt = !prefersNoVideo
    return (
      '<button type="button" class="mg-btn' + (big ? ' mg-btn-lg' : ' mg-icon-btn') + '" data-dl="' + s.id + '" data-novideo="' + (alt ? '1' : '0') + '" title="' +
      esc(t(alt ? 'dlNoVideoTitle' : 'dlWithVideoTitle')) + '">' +
      icon(alt ? 'videoOff' : 'video', 14) + (big ? esc(t(alt ? 'noVideo' : 'withVideo')) : '') + '</button>'
    )
  }

  function cardHtml(s) {
    var sc = statusClass(s.status)
    var cover = s.listCoverUrl || s.coverUrl || ''
    var bg = s.cardCoverUrl || s.coverUrl || ''
    var playing = previewId === s.id && !previewPaused
    var bms = visibleBeatmaps(s)
    var icons = bms.slice(0, 14).map(function (b) {
      return diffIconHtml(b.mode, b.stars || 0, 14, esc(b.version + ' · ' + (b.stars || 0).toFixed(2) + '★'))
    }).join('')
    if (bms.length > 14) icons += '<span class="mg-diff-more">+' + (bms.length - 14) + '</span>'
    var dl = downloads[s.id]
    var pct = isBusy(dl) && dl.progress != null ? Math.round(dl.progress) : 0
    return (
      '<div class="mg-card ' + sc + '" data-set="' + s.id + '">' +
      (bg ? '<div class="mg-card-bg" style="background-image:url(&quot;' + esc(bg) + '&quot;)"></div>' : '') +
      '<button type="button" class="mg-card-thumb' + (playing ? ' -playing' : '') + '" data-preview="' + s.id + '" title="' + esc(playing ? t('pause') : t('listen')) + '">' +
      (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy" decoding="async" draggable="false" />' : '') +
      '<span class="mg-thumb-play">' + icon(playing ? 'pause' : 'play', 22) + '</span></button>' +
      '<div class="mg-card-body" data-open="' + s.id + '">' +
      '<div class="mg-card-title">' + esc(s.title) + '</div>' +
      '<div class="mg-card-artist">' + esc(s.artist) + '</div>' +
      '<div class="mg-card-mapper">' + esc(t('mappedBy')) + ' <b>' + esc(s.creator) + '</b></div>' +
      '<div class="mg-card-foot">' +
      '<span class="mg-badge ' + sc + '">' + esc(statusLabel(s.status)) + '</span>' +
      '<span class="mg-stat" title="' + esc(t('favourites')) + '">' + icon('heart', 11) + fmtShort(s.favouriteCount) + '</span>' +
      '<span class="mg-stat" title="' + esc(t('plays')) + '">' + icon('plays', 11) + fmtShort(s.playCount) + '</span>' +
      '<span class="mg-diff-icons">' + icons + '</span>' +
      '</div></div>' +
      '<div class="mg-card-actions" data-actions="' + s.id + '">' +
      '<div class="mg-card-actions-row" data-alt-row="1">' +
      '<button type="button" class="mg-btn mg-icon-btn" data-gp="' + s.id + '" title="' + esc(t('previewMapBtn')) + '"' +
      ((s.beatmaps || []).length ? '' : ' disabled') + '>' + icon('eye', 15) + '</button>' +
      altVideoButtonHtml(s, false) +
      '</div>' +
      downloadControlHtml(s, false) +
      '</div>' +
      '<div class="mg-card-progress" style="width:' + pct + '%"></div>' +
      '</div>'
    )
  }

  var cardEls = new Map()

  function renderList() {
    if (!els.list) return
    cardEls.clear()
    if (!sets.length) {
      els.list.innerHTML =
        '<div class="mg-empty">' +
        (loading
          ? '<div class="mg-spinner"></div><div class="mg-empty-text">' + esc(t('loading')) + '</div>'
          : esc(loggedIn ? t('emptyNoResults') : t('emptyLoginPrompt'))) +
        '</div>'
      if (els.more) els.more.hidden = true
      return
    }
    els.list.innerHTML =
      (loading
        ? '<div class="mg-loading-banner"><span class="mg-spinner"></span><span>' + esc(t('updatingList')) + '</span></div>'
        : '') +
      '<div class="mg-grid">' + sets.map(cardHtml).join('') + '</div>'
    var nodes = els.list.querySelectorAll('[data-set]')
    for (var i = 0; i < nodes.length; i++) cardEls.set(Number(nodes[i].getAttribute('data-set')), nodes[i])
    if (els.more) els.more.hidden = !hasMore || loading
    els.list.classList.toggle('-loading', !!loading)
  }

  /** Update one set's controls in place (progress ticks, preview state) without rebuilding the list. */
  function patchSet(id) {
    var s = findSet(id)
    if (!s) return
    var card = cardEls.get(id)
    if (card && card.isConnected) {
      var actions = card.querySelector('[data-actions]')
      var dlBtn = actions && actions.lastElementChild
      if (dlBtn) dlBtn.outerHTML = downloadControlHtml(s, false)
      var altRow = actions && actions.querySelector('[data-alt-row]')
      if (altRow) {
        var oldAlt = altRow.querySelector('[data-novideo]')
        if (oldAlt) oldAlt.remove()
        altRow.insertAdjacentHTML('beforeend', altVideoButtonHtml(s, false))
      }
      var dl = downloads[id]
      var bar = card.querySelector('.mg-card-progress')
      if (bar) bar.style.width = (isBusy(dl) && dl.progress != null ? Math.round(dl.progress) : 0) + '%'
      var thumb = card.querySelector('.mg-card-thumb')
      if (thumb) {
        var playing = previewId === id && !previewPaused
        thumb.classList.toggle('-playing', playing)
        thumb.title = playing ? t('pause') : t('listen')
        var ico = thumb.querySelector('.mg-thumb-play')
        if (ico) ico.innerHTML = icon(playing ? 'pause' : 'play', 22)
      }
    }
    if (detail.set && detail.set.id === id) patchDetailActions()
  }

  function syncPreviewMarks(prevId) {
    if (prevId && prevId !== previewId) patchSet(prevId)
    if (previewId) patchSet(previewId)
  }

  // --- Beatmap detail view (osu! website / lazer overlay style) ---

  var detail = { set: null, beatmapId: 0 }

  function openDetail(id) {
    var s = findSet(id)
    if (!s || !els.detail) return
    detail.set = s
    var bms = visibleBeatmaps(s)
    var pick = bms.length ? bms[bms.length - 1] : null
    detail.beatmapId = pick ? pick.id : 0
    closeMenus()
    renderDetail()
    els.detail.hidden = false
    if (els.detailScroll) els.detailScroll.scrollTop = 0
  }

  function closeDetail() {
    detail.set = null
    detail.beatmapId = 0
    if (els.detail) {
      els.detail.hidden = true
      els.detail.innerHTML = ''
    }
    els.detailScroll = null
  }

  function attrBar(label, value, max, accent) {
    var v = Number(value) || 0
    var pct = Math.max(0, Math.min(100, (v / max) * 100))
    return (
      '<div class="mg-attr"><span class="mg-attr-k">' + esc(label) + '</span>' +
      '<span class="mg-attr-track"><span class="mg-attr-fill" style="width:' + pct.toFixed(1) + '%' + (accent ? ';background:' + accent : '') + '"></span></span>' +
      '<span class="mg-attr-v">' + (Math.round(v * 100) / 100) + '</span></div>'
    )
  }

  function infoRow(label, value) {
    if (value == null || value === '') return ''
    return '<div class="mg-info-row"><span class="mg-info-k">' + esc(label) + '</span><span class="mg-info-v">' + value + '</span></div>'
  }

  function detailActionsHtml(s) {
    var playing = previewId === s.id && !previewPaused
    return (
      '<button type="button" class="mg-btn mg-btn-lg' + (playing ? ' -active' : '') + '" data-preview="' + s.id + '">' +
      (playing ? icon('pause') + esc(t('pause')) : icon('play') + esc(t('listen'))) + '</button>' +
      '<button type="button" class="mg-btn mg-btn-lg" data-gp="' + s.id + '" data-gp-beatmap="' + detail.beatmapId + '"' +
      ((s.beatmaps || []).length ? '' : ' disabled') + '>' + icon('eye') + esc(t('previewMapBtn')) + '</button>' +
      downloadControlHtml(s, true) +
      altVideoButtonHtml(s, true)
    )
  }

  function patchDetailActions() {
    if (!els.detail || !detail.set) return
    var box = els.detail.querySelector('[data-detail-actions]')
    if (box) box.innerHTML = detailActionsHtml(detail.set)
  }

  function renderDetail() {
    var s = detail.set
    if (!s || !els.detail) return
    var sc = statusClass(s.status)
    var bms = s.beatmaps || []
    var bm = bms.find(function (b) { return b.id === detail.beatmapId }) || bms[bms.length - 1] || null
    var hero = s.headerCoverUrl || s.cardCoverUrl || s.coverUrl || ''
    var m = bm ? normalizeOsuMode(bm.mode) : 'osu'
    var starColor = bm ? getDiffColour(bm.stars || 0) : '#aaa'

    var picker = bms.map(function (b) {
      return (
        '<button type="button" class="mg-diff-pick' + (bm && b.id === bm.id ? ' -on' : '') + '" data-diff-select="' + b.id + '" title="' +
        esc(b.version + ' · ' + (b.stars || 0).toFixed(2) + '★') + '">' + diffIconHtml(b.mode, b.stars || 0, 22, '') + '</button>'
      )
    }).join('')

    var tags = String(s.tags || '').split(/\s+/).filter(Boolean).slice(0, 40)
    var tagsHtml = tags.map(function (tag) {
      return '<button type="button" class="mg-tag" data-search="' + esc(tag) + '">' + esc(tag) + '</button>'
    }).join('')

    var passRate = bm && bm.playCount ? Math.round(((bm.passCount || 0) / bm.playCount) * 1000) / 10 : null
    var attrs = ''
    if (bm) {
      attrs +=
        (m === 'mania' ? attrBar(t('keys'), bm.cs, 10) : attrBar(t('attrCs'), bm.cs, 10)) +
        attrBar(t('attrHp'), bm.hp, 10) +
        attrBar(t('attrOd'), bm.od, 10) +
        (m === 'osu' || m === 'fruits' ? attrBar(t('attrAr'), bm.ar, 10) : '') +
        attrBar(t('stars'), bm.stars, 10, starColor)
    }

    els.detail.innerHTML =
      '<div class="mg-detail-scroll" id="mg-detail-scroll">' +
      '<div class="mg-hero">' +
      (hero ? '<div class="mg-hero-bg" style="background-image:url(&quot;' + esc(hero) + '&quot;)"></div>' : '') +
      '<div class="mg-hero-shade"></div>' +
      '<div class="mg-hero-inner">' +
      '<div class="mg-hero-top">' +
      '<button type="button" class="mg-btn mg-back" data-detail-back="1">' + icon('prev') + esc(t('back')) + '</button>' +
      '<span class="mg-badge ' + sc + '">' + esc(statusLabel(s.status)) + '</span>' +
      (s.hasVideo ? '<span class="mg-flag">' + esc(t('video')) + '</span>' : '') +
      (s.hasStoryboard ? '<span class="mg-flag">' + esc(t('storyboard')) + '</span>' : '') +
      (s.nsfw ? '<span class="mg-flag -warn">NSFW</span>' : '') +
      '</div>' +
      '<div class="mg-diff-picker">' + picker + '</div>' +
      (bm
        ? '<div class="mg-hero-diff"><span class="mg-hero-diffname">' + esc(bm.version) + '</span>' +
          '<span class="mg-star-pill" style="background:' + starColor + '">★ ' + (bm.stars || 0).toFixed(2) + '</span></div>'
        : '') +
      '<div class="mg-hero-title">' + esc(s.title) + '</div>' +
      '<div class="mg-hero-artist">' + esc(s.artist) + '</div>' +
      '<div class="mg-hero-mapper">' + esc(t('mappedBy')) + ' <button type="button" class="mg-link" data-search="' + esc(s.creator) + '">' + esc(s.creator) + '</button>' +
      (s.submittedDate ? ' · ' + esc(t('submitted')) + ' ' + esc(fmtDate(s.submittedDate)) : '') +
      (s.rankedDate ? ' · ' + esc(t('rankedOn')) + ' ' + esc(fmtDate(s.rankedDate)) : '') +
      '</div>' +
      '<div class="mg-hero-actions" data-detail-actions="1">' + detailActionsHtml(s) + '</div>' +
      '</div></div>' +
      '<div class="mg-detail-grid">' +
      '<div class="mg-detail-col">' +
      '<div class="mg-group">' +
      '<div class="mg-group-head">' + esc(t('statsTitle')) + '</div>' +
      '<div class="mg-stats-grid">' +
      statTile('clock', t('length'), bm ? fmtLength(bm.totalLength) : '—') +
      statTile('music', 'BPM', bm && bm.bpm ? String(Math.round(bm.bpm * 10) / 10) : s.bpm ? String(s.bpm) : '—') +
      statTile('circle', t('circles'), bm ? fmtNum(bm.circles) : '—') +
      statTile('slider', t('sliders'), bm ? fmtNum(bm.sliders) : '—') +
      statTile('spinner', t('spinners'), bm ? fmtNum(bm.spinners) : '—') +
      statTile('combo', t('maxCombo'), bm && bm.maxCombo ? fmtNum(bm.maxCombo) : '—') +
      '</div></div>' +
      '<div class="mg-group">' +
      '<div class="mg-group-head">' + esc(t('infoTitle')) + '</div>' +
      '<div class="mg-group-body">' +
      infoRow(t('source'), s.source ? '<button type="button" class="mg-link" data-search="' + esc(s.source) + '">' + esc(s.source) + '</button>' : '') +
      infoRow(t('difficulties'), esc(pluralizeDiffs(bms.length))) +
      infoRow(t('updated'), esc(fmtDate(s.lastUpdated))) +
      (tagsHtml ? '<div class="mg-info-row -col"><span class="mg-info-k">' + esc(t('tags')) + '</span><div class="mg-tags">' + tagsHtml + '</div></div>' : '') +
      '</div></div>' +
      '</div>' +
      '<div class="mg-detail-col -side">' +
      '<div class="mg-group">' +
      '<div class="mg-group-body">' +
      infoRow(t('plays'), fmtNum(bm && bm.playCount ? bm.playCount : s.playCount)) +
      infoRow(t('favourites'), fmtNum(s.favouriteCount)) +
      (passRate != null ? infoRow(t('passRate'), passRate + '%') : '') +
      '</div></div>' +
      (attrs ? '<div class="mg-group"><div class="mg-group-head">' + esc(t('attrsTitle')) + '</div><div class="mg-group-body">' + attrs + '</div></div>' : '') +
      '</div>' +
      '</div>' +
      '</div>'
    els.detailScroll = els.detail.querySelector('#mg-detail-scroll')
  }

  function statTile(iconName, label, value) {
    return (
      '<div class="mg-stat-tile"><span class="mg-stat-ico">' + icon(iconName, 14) + '</span>' +
      '<span class="mg-stat-v">' + esc(value) + '</span><span class="mg-stat-k">' + esc(label) + '</span></div>'
    )
  }

  function searchFor(text) {
    if (!els.q) return
    closeDetail()
    els.q.value = String(text || '')
    if (els.qClear) els.qClear.hidden = !els.q.value
    clearTimeout(debounceTimer)
    void search(false)
  }

  function onProgress(p) {
    if (!p || !p.setId) return
    var prev = downloads[p.setId]
    downloads[p.setId] = p
    var becameOwned = p.phase === 'done' && !localIds.has(p.setId)
    if (p.phase === 'done') localIds.add(p.setId)
    if (p.phase === 'error' && p.error && (!prev || prev.phase !== 'error')) setLine(friendlyError(p.error))
    if (!visible) return
    if (becameOwned || !prev || prev.phase !== p.phase || Math.round(prev.progress || 0) !== Math.round(p.progress || 0)) {
      patchSet(p.setId)
    }
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
        prefersNoVideo = a.beatmapDownload === 'no_video'
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
      setLine(friendlyError(err) || t('errSearch'))
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
    closeDetail()
    languageFilter = v || 'any'
    closeMenus()
    syncFilterUi()
    void search(false)
  }

  function setStatus(v) {
    closeDetail()
    statusFilter = v || 'ranked'
    closeMenus()
    syncFilterUi()
    void search(false)
  }

  function setMode(v) {
    closeDetail()
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
    if (gp.music) {
      try {
        gp.music.src.stop()
        gp.music.src.disconnect()
        gp.music.gain.disconnect()
      } catch (e) {
        /* ignore */
      }
      gp.music = null
    }
    if (gp.runtime) gp.runtime.music = null
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
    startGpWebAudio(urls, session, function (ok) {
      if (session !== gpAudioSession || !gp.open) return
      if (ok) {
        notifyPreviewState(true, 'gameplay')
        if (typeof onReady === 'function') onReady()
      } else {
        startGpHtmlAudio(urls, session, onReady)
      }
    })
  }

  /**
   * Decode the preview clip and play it through the engine's AudioContext, so
   * hitsounds are scheduled on the same clock as the music and cannot drift.
   */
  function startGpWebAudio(urls, session, done) {
    var eng = engine()
    var rt = ensureGpRuntime()
    var ctx = eng && rt && typeof eng.ensureAudio === 'function' ? eng.ensureAudio(rt) : null
    if (!ctx || typeof eng.musicMapTime !== 'function') {
      done(false)
      return
    }
    var hitsReady =
      typeof eng.preloadHitSounds === 'function' ? Promise.resolve(eng.preloadHitSounds(rt)).catch(function () {}) : Promise.resolve()
    ;(async function () {
      var buffer = null
      for (var i = 0; i < urls.length && !buffer; i++) {
        if (session !== gpAudioSession || !gp.open) return
        try {
          var res = await fetch(urls[i])
          if (!res.ok) continue
          var bytes = await res.arrayBuffer()
          if (bytes.byteLength < 1024) continue
          buffer = await ctx.decodeAudioData(bytes)
        } catch (e) {
          buffer = null
        }
      }
      await hitsReady
      if (session !== gpAudioSession || !gp.open) return
      if (!buffer) {
        done(false)
        return
      }
      try {
        await ctx.resume()
      } catch (e) {
        /* ignore */
      }
      if (session !== gpAudioSession || !gp.open) return
      var gain = ctx.createGain()
      gain.gain.value = previewVolume
      gain.connect(ctx.destination)
      var src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(gain)
      // Small lead-in so the first frames and hitsounds can be queued in time
      var startAt = ctx.currentTime + 0.12
      src.start(startAt)
      var lead = eng.PREVIEW_CLIP_LEAD_MS || 117
      gp.music = {
        src: src,
        gain: gain,
        endCtx: startAt + buffer.duration,
        clock: { ctxStart: startAt, mapStartMs: (gp.parsed ? gp.parsed.previewTime || 0 : 0) - lead },
      }
      done(true)
    })()
  }

  function startGpHtmlAudio(urls, session, onReady) {
    var id = gp.set ? gp.set.id : 0
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

    // Safety fallback: only start without music if the track never arrives
    var fallbackTimer = setTimeout(triggerReady, 12000)

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
    var lastDraw = 0
    function tick(now) {
      if (!gp.open || !gp.parsed) return
      lastDraw = performance.now()
      drawGameplay(now)
      gp.raf = requestAnimationFrame(tick)
    }
    gp.raf = requestAnimationFrame(tick)
    // Offscreen overlay windows can throttle rAF; draw from the timer only when frames stop arriving.
    gp.timer = setInterval(function () {
      if (!gp.open || !gp.parsed) return
      var now = performance.now()
      if (now - lastDraw > 40) {
        lastDraw = now
        drawGameplay(now)
      }
    }, 20)
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
    // Render at the displayed size x DPR so sprites stay sharp
    var dpr = window.devicePixelRatio || 1
    var cw = Math.round(canvas.clientWidth * dpr)
    var ch = Math.round(canvas.clientHeight * dpr)
    if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
      canvas.width = cw
      canvas.height = ch
    }
    var rt = ensureGpRuntime()
    var lead = (eng && eng.PREVIEW_CLIP_LEAD_MS) || 117
    var musicT = gp.music && rt && typeof eng.musicMapTime === 'function' ? eng.musicMapTime(rt) : null
    var elapsed = 0
    if (musicT != null) {
      elapsed = musicT - ((gp.parsed.previewTime || 0) - lead)
    } else if (gp.audio && !gp.audio.paused && !gp.audio.ended && Number.isFinite(gp.audio.currentTime) && gp.audio.currentTime > 0) {
      elapsed = Math.max(0, gp.audio.currentTime * 1000)
    } else {
      elapsed = Math.max(0, now - (gp.startPerf || now))
    }

    // b.ppy.sh preview clips start ~117 ms before PreviewTime (see PREVIEW_CLIP_LEAD_MS)
    var t = (gp.parsed.previewTime || 0) - lead + elapsed
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
    var musicEnded = gp.music && rt && rt.audio && rt.audio.currentTime >= gp.music.endCtx
    if (!cont || musicEnded || (gp.audio && gp.audio.ended)) {
      closeGameplayPreview()
      return
    }
  }

  async function openGameplayPreview(setId, preferredBeatmapId) {
    var set = findSet(setId)
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
      (preferredBeatmapId &&
        bms.find(function (b) {
          return b.id === preferredBeatmapId
        })) ||
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
            '<span class="mg-diffico" style="color:' + getDiffColour(b.stars || 0) + '"><svg viewBox="0 0 1000 1000" width="18" height="18"><g transform="translate(0,850) scale(1,-1)"><path fill="currentColor" fill-rule="evenodd" d="' + modePath(b.mode) + '"/></g></svg></span>' +
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
        if (curRt && gp.music) curRt.music = gp.music.clock
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
      gp.error = friendlyError(err)
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
    if (detail.set) renderDetail()
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
        try {
          await api('/api/maps/login', { method: 'POST', body: '{}', timeout: 0 })
        } catch (err) {
          setLine(friendlyError(err))
        }
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
    if (els.detail) {
      els.detail.addEventListener('pointerup', handleListAction)
      els.detail.addEventListener('click', handleListAction)
    }

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
          onProgress(JSON.parse(ev.data))
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  var lastListActionAt = 0
  function attrOf(target, name) {
    var node = target.closest ? target.closest('[' + name + ']') : null
    return node ? node.getAttribute(name) : null
  }

  /** Delegated handler for the card grid and the detail view (pointerup + click, de-duplicated). */
  function handleListAction(e) {
    var tgt = e.target
    if (!(tgt instanceof Element)) return
    var now = Date.now()
    if (now - lastListActionAt < 60) {
      e.preventDefault()
      return
    }
    var hit = function () {
      lastListActionAt = now
      e.preventDefault()
      e.stopPropagation()
    }

    if (attrOf(tgt, 'data-detail-back')) {
      hit()
      closeDetail()
      return
    }

    var diffSel = attrOf(tgt, 'data-diff-select')
    if (diffSel) {
      hit()
      detail.beatmapId = Number(diffSel)
      renderDetail()
      return
    }

    var searchText = attrOf(tgt, 'data-search')
    if (searchText) {
      hit()
      searchFor(searchText)
      return
    }

    var previewAttr = attrOf(tgt, 'data-preview')
    if (previewAttr) {
      hit()
      togglePreview(Number(previewAttr))
      return
    }

    var gpAttr = attrOf(tgt, 'data-gp')
    if (gpAttr) {
      hit()
      void openGameplayPreview(Number(gpAttr), Number(attrOf(tgt, 'data-gp-beatmap')) || 0)
      return
    }

    var cancelId = attrOf(tgt, 'data-cancel')
    if (cancelId) {
      hit()
      void api('/api/maps/cancel', {
        method: 'POST',
        body: JSON.stringify({ setId: Number(cancelId) }),
      }).catch(function (err) {
        setLine(friendlyError(err))
      })
      return
    }

    var dlId = attrOf(tgt, 'data-dl')
    if (dlId) {
      hit()
      var nv = attrOf(tgt, 'data-novideo')
      startDownload(Number(dlId), nv == null ? undefined : nv === '1')
      return
    }

    var openId = attrOf(tgt, 'data-open')
    if (openId) {
      hit()
      openDetail(Number(openId))
    }
  }

  function startDownload(id, noVideo) {
    var set = findSet(id)
    if (!set || isBusy(downloads[id])) return
    onProgress({ setId: id, phase: 'queued', progress: 0 })
    // No client timeout: the server streams progress over SSE and answers when the file is in Songs.
    void api('/api/maps/download', {
      method: 'POST',
      timeout: 0,
      body: JSON.stringify({ setId: id, artist: set.artist, title: set.title, noVideo: noVideo }),
    })
      .then(function (r) {
        if (r.cancelled) onProgress({ setId: id, phase: 'cancelled', progress: 0 })
        else if (r.ok) onProgress({ setId: id, phase: 'done', progress: 100 })
      })
      .catch(function (err) {
        onProgress({ setId: id, phase: 'error', progress: 0, error: friendlyError(err) })
      })
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

    applyStyles()

    rootEl = document.createElement('div')
    rootEl.id = ROOT_ID
    rootEl.innerHTML =
      '<div class="mg-shade" data-mg-close="1"></div>' +
      '<div class="mg-panel" role="dialog">' +
      '<header class="mg-top">' +
      '<div class="mg-brand">' +
      '<div class="mg-top-title" id="mg-top-title">' + esc(t('title')) + '</div>' +
      '<p class="mg-hint" id="mg-hint"></p>' +
      '</div>' +
      '<div class="mg-top-spacer"></div>' +
      '<span class="mg-auth" id="mg-auth">…</span>' +
      '<button type="button" class="mg-btn mg-primary" id="mg-login" hidden>' + esc(t('login')) + '</button>' +
      '<button type="button" class="mg-btn" id="mg-ui-lang-btn" title="Сменить язык / Switch language">' + uiLang.toUpperCase() + '</button>' +
      '<button type="button" class="mg-x" id="mg-close" title="' + esc(t('close')) + '" aria-label="' + esc(t('close')) + '">' + icon('x', 16) + '</button>' +
      '</header>' +
      '<div class="mg-filters">' +
      '<div class="mg-toolbar">' +
      '<div class="mg-search-wrap">' +
      '<span class="mg-search-ico">' + icon('search', 15) + '</span>' +
      '<input class="mg-input" id="mg-q" type="search" placeholder="' + esc(t('searchPlaceholder')) + '" autocomplete="off" spellcheck="false" />' +
      '<button type="button" class="mg-q-clear" id="mg-q-clear" title="' + esc(t('clearSearch')) + '" aria-label="' + esc(t('clearSearch')) + '" hidden>' + icon('x', 13) + '</button>' +
      '</div>' +
      '<div class="mg-dd" id="mg-lang-wrap">' +
      '<button type="button" class="mg-dd-btn" id="mg-lang-btn" title="' + esc(t('anyLang')) + '">' + esc(langLabel()) + '</button>' +
      '<div class="mg-dd-menu" id="mg-lang-menu" hidden>' + menuItems(getLangOptions(), 'data-lang') + '</div>' +
      '</div>' +
      '<button type="button" class="mg-btn mg-icon-btn mg-refresh" id="mg-refresh" title="' + esc(t('refresh')) + '">' + icon('refresh', 15) + '</button>' +
      '</div>' +
      '<div class="mg-filter-row">' +
      '<span class="mg-label" id="mg-lbl-status">' + esc(t('statusLabel')) + '</span>' +
      '<div class="mg-seg" id="mg-statuses">' +
      chip('status', 'ranked', 'Ranked', true) +
      chip('status', 'qualified', 'Qualified', false) +
      chip('status', 'loved', 'Loved', false) +
      chip('status', 'any', t('statusAny'), false) +
      '</div>' +
      '<div class="mg-dd" id="mg-more-wrap">' +
      '<button type="button" class="mg-dd-btn mg-dd-btn-sm" id="mg-more-btn" title="' + esc(t('statusMore')) + '">' + esc(moreStatusLabel()) + '</button>' +
      '<div class="mg-dd-menu" id="mg-more-menu" hidden>' + menuItems(getMoreStatusOptions(), 'data-more-status') + '</div>' +
      '</div>' +
      '<span class="mg-filter-gap"></span>' +
      '<span class="mg-label" id="mg-lbl-mode">' + esc(t('modeLabel')) + '</span>' +
      '<div class="mg-seg" id="mg-modes">' +
      chip('mode', 'any', t('modeAll'), true) +
      chip('mode', 'osu', 'osu!', false) +
      chip('mode', 'taiko', 'Taiko', false) +
      chip('mode', 'fruits', 'Catch', false) +
      chip('mode', 'mania', 'Mania', false) +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="mg-content">' +
      '<div class="mg-list" id="mg-list"></div>' +
      '<div class="mg-detail" id="mg-detail" hidden></div>' +
      '</div>' +
      '<div class="mg-footer">' +
      '<div class="mg-line" id="mg-line"></div>' +
      '<button type="button" class="mg-btn" id="mg-more" hidden>' + esc(t('showMore')) + '</button>' +
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
      '<button type="button" class="mg-pbtn" id="mg-player-prev" title="' + esc(t('prevTrack')) + '">' + icon('prev', 16) + '</button>' +
      '<button type="button" class="mg-pbtn mg-pbtn-main" id="mg-player-play" title="' + esc(t('play')) + '">' + icon('play', 15) + '</button>' +
      '<button type="button" class="mg-pbtn" id="mg-player-next" title="' + esc(t('nextTrack')) + '">' + icon('next', 16) + '</button>' +
      '</div>' +
      '<div class="mg-player-vol" title="' + esc(t('volume')) + '">' +
      '<span class="mg-vol-ico" id="mg-vol-ico">' + icon('vol', 14) + '</span>' +
      '<input type="range" class="mg-vol-range" id="mg-vol" min="0" max="100" value="55" />' +
      '<span class="mg-vol-label" id="mg-vol-label">55%</span>' +
      '</div>' +
      '<button type="button" class="mg-mute-btn' + (muteOsuOnPreview ? ' -on' : '') + '" id="mg-mute-osu" title="' + esc(t('muteOsuTitle')) + '" aria-pressed="' + (muteOsuOnPreview ? 'true' : 'false') + '">' +
      '<span class="mg-mute-ico">' + icon(muteOsuOnPreview ? 'volX' : 'vol', 14) + '</span>' +
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
      '<button type="button" class="mg-x" id="mg-gp-close" title="' + esc(t('close')) + '">' + icon('x', 16) + '</button>' +
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
      detail: rootEl.querySelector('#mg-detail'),
      detailScroll: null,
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
      volIco: rootEl.querySelector('#mg-vol-ico'),
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

    els.shade.addEventListener('pointerup', function (e) {
      e.preventDefault()
      requestClose()
    })
    els.shade.addEventListener('click', function (e) {
      e.preventDefault()
      requestClose()
    })

    if (global.__TOSU_MAPS_EMBEDDED) rootEl.classList.add('-embedded')

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
          setLine(t('cardsCount', { n: sets.length }))
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

  // Styles mirror the tosu GUI design tokens (src/styles/global.css) so the in-game panel matches the app.
  var CSS_TEXT = [
    '@font-face{font-family:"SF Pro Text";src:url("' + API + '/fonts/sf-pro-text_regular.woff2") format("woff2");font-weight:400;font-display:swap}',
    '@font-face{font-family:"SF Pro Text";src:url("' + API + '/fonts/sf-pro-text_semibold.woff2") format("woff2");font-weight:600;font-display:swap}',
    '@font-face{font-family:"SF Pro Display";src:url("' + API + '/fonts/sf-pro-display_regular.woff2") format("woff2");font-weight:400;font-display:swap}',
    '@font-face{font-family:"SF Pro Display";src:url("' + API + '/fonts/sf-pro-display_medium.woff2") format("woff2");font-weight:500;font-display:swap}',
    '@font-face{font-family:"SF Pro Display";src:url("' + API + '/fonts/sf-pro-display_semibold.woff2") format("woff2");font-weight:600;font-display:swap}',
    '@font-face{font-family:"SF Pro Display";src:url("' + API + '/fonts/sf-pro-display_bold.woff2") format("woff2");font-weight:700;font-display:swap}',
    '#R{--bg:#1e1e1e;--bar:#242424;--group:#2c2c2e;--group-hover:#363638;--input:rgba(0,0,0,.28);--fill:rgba(255,255,255,.09);--fill-strong:rgba(255,255,255,.14);--sep:rgba(255,255,255,.1);--hair:rgba(255,255,255,.12);--t1:rgba(255,255,255,.92);--t2:rgba(255,255,255,.58);--t3:rgba(255,255,255,.38);--accent:#0a84ff;--accent-hover:#409cff;--success:#32d74b;--danger:#ff453a;--r-group:10px;--r-ctl:7px}',
    '#R,#R *{box-sizing:border-box;user-select:none;-webkit-user-select:none;font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;-webkit-font-smoothing:antialiased}',
    '#R .mg-input{user-select:text;-webkit-user-select:text}',
    '#R{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important;display:none;align-items:center;justify-content:center;padding:28px;font-size:13px;line-height:1.35;color:var(--t1);pointer-events:auto}',
    '#R button{font:inherit;color:inherit}',
    '#R [hidden]{display:none!important}',
    '#R ::-webkit-scrollbar{width:10px;height:10px}',
    '#R ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px;border:3px solid transparent;background-clip:padding-box}',
    '#R ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.24);background-clip:padding-box}',
    '#R ::-webkit-scrollbar-track{background:transparent}',
    '#R .mg-shade{position:absolute;inset:0;background:rgba(0,0,0,.62)}',
    '#R .mg-panel{position:relative;z-index:1;width:min(1280px,100%);height:min(900px,100%);display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--hair);border-radius:12px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.6)}',
    // Header
    '#R .mg-top{flex-shrink:0;display:flex;align-items:center;gap:10px;min-height:68px;padding:12px 16px 12px 20px;background:var(--bar);border-bottom:1px solid var(--sep)}',
    '#R .mg-ico{display:block;flex-shrink:0}',
    '#R .mg-brand{display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:0;flex:1}',
    '#R .mg-top-title{font-family:"SF Pro Display","SF Pro Text",sans-serif!important;font-size:20px;font-weight:600;letter-spacing:-.02em;line-height:1.2}',
    '#R .mg-hint{margin:0;font-size:12px;line-height:1.35;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .mg-top-spacer{display:none}',
    '#R .mg-auth{flex-shrink:0;font-size:13px;line-height:1.3;color:var(--t2);white-space:nowrap}',
    '#R .mg-top .mg-btn{height:34px}',
    '#R .mg-x{width:34px;height:34px;border:none;border-radius:8px;background:var(--fill);padding:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:20px;line-height:1;flex-shrink:0}',
    '#R .mg-x:hover{background:rgba(255,69,58,.22);color:var(--danger)}',
    // Filters
    '#R .mg-filters{flex-shrink:0;padding:12px 20px 10px;border-bottom:1px solid var(--sep)}',
    '#R .mg-toolbar{display:flex;align-items:center;gap:8px}',
    '#R .mg-search-wrap{position:relative;flex:1;min-width:0;display:flex;align-items:center}',
    '#R .mg-search-ico{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--t3);pointer-events:none}',
    '#R .mg-input{width:100%;height:34px;padding:0 34px 0 32px;border-radius:var(--r-ctl);border:.5px solid #424244;background:var(--input);color:var(--t1);outline:none;font-size:14px}',
    '#R .mg-input::-webkit-search-cancel-button{-webkit-appearance:none;display:none}',
    '#R .mg-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(10,132,255,.28)}',
    '#R .mg-q-clear{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:24px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--t3);font-size:16px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
    '#R .mg-q-clear:hover{color:var(--t1);background:var(--fill)}',
    '#R .mg-q-clear[hidden]{display:none!important}',
    '#R .mg-filter-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '#R .mg-filter-gap{width:10px}',
    '#R .mg-label{font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--t3)}',
    '#R .mg-seg{display:flex;gap:2px;padding:3px;background:rgba(0,0,0,.22);border:.5px solid var(--hair);border-radius:9px}',
    '#R .mg-chip{height:26px;padding:0 12px;border:none;border-radius:7px;background:transparent;color:var(--t2);font-size:13px;cursor:pointer;white-space:nowrap}',
    '#R .mg-chip:hover{color:var(--t1)}',
    '#R .mg-chip.-on{background:var(--fill-strong);color:var(--t1);font-weight:600;box-shadow:0 .5px 1px rgba(0,0,0,.2)}',
    '#R .mg-dd{position:relative;flex-shrink:0}',
    '#R .mg-dd-btn{height:34px;padding:0 26px 0 12px;border-radius:var(--r-ctl);border:.5px solid #424244;background:var(--input);color:var(--t1);font-size:13px;cursor:pointer;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative}',
    '#R .mg-dd-btn:after{content:"";position:absolute;right:11px;top:50%;width:6px;height:6px;border-right:1.5px solid var(--t2);border-bottom:1.5px solid var(--t2);transform:translateY(-70%) rotate(45deg)}',
    '#R .mg-dd-btn-sm{height:32px;max-width:170px}',
    '#R .mg-dd-btn.-active,#R .mg-dd-btn.-open{border-color:rgba(10,132,255,.55)}',
    '#R .mg-dd-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:40;min-width:180px;max-height:300px;overflow:auto;padding:4px;border-radius:var(--r-group);background:#2a2a2c;border:1px solid var(--hair);box-shadow:0 12px 32px rgba(0,0,0,.55)}',
    '#R .mg-dd-menu[hidden]{display:none!important}',
    '#R #mg-lang-menu{left:auto;right:0}',
    '#R .mg-dd-item{display:block;width:100%;text-align:left;border:none;background:transparent;color:var(--t1);padding:7px 10px;border-radius:6px;font-size:13px;cursor:pointer}',
    '#R .mg-dd-item:hover{background:var(--fill)}',
    '#R .mg-dd-item.-on{background:var(--accent);color:#fff}',
    // Buttons
    '#R .mg-btn{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--r-ctl);border:.5px solid var(--hair);background:var(--fill);color:var(--t1);cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;position:relative;overflow:hidden}',
    '#R .mg-btn:hover:not(:disabled){background:var(--fill-strong)}',
    '#R .mg-btn:disabled{opacity:.45;cursor:default}',
    '#R .mg-btn.-active{color:var(--accent);border-color:rgba(10,132,255,.4);background:rgba(10,132,255,.14)}',
    '#R .mg-btn-lg{height:36px;padding:0 16px;font-size:14px}',
    '#R .mg-icon-btn{width:30px;padding:0;font-size:15px}',
    '#R .mg-refresh{width:34px;height:34px;font-size:17px}',
    '#R .mg-refresh.-spin .mg-ico{animation:mg-spin .8s linear infinite;transform-origin:50% 50%;will-change:transform}',
    '#R .mg-primary{background:var(--accent);border-color:transparent;color:#fff;box-shadow:0 1px 2px rgba(10,132,255,.25)}',
    '#R .mg-primary:hover:not(:disabled){background:var(--accent-hover)}',
    '#R .mg-owned{color:var(--success);border-color:rgba(50,215,75,.3);background:rgba(50,215,75,.08)}',
    '#R .mg-owned:disabled{opacity:1}',
    '#R .mg-busy{color:var(--t1);border-color:rgba(10,132,255,.4);background:rgba(10,132,255,.1);min-width:86px}',
    '#R .mg-busy:hover:not(:disabled){border-color:rgba(255,69,58,.45);background:rgba(255,69,58,.12)}',
    '#R .mg-busy-fill{position:absolute;left:0;top:0;bottom:0;background:rgba(10,132,255,.32);transition:width .2s linear}',
    '#R .mg-busy-label{position:relative;font-variant-numeric:tabular-nums}',
    // Content
    '#R .mg-content{position:relative;flex:1;min-height:0;display:flex}',
    '#R .mg-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:14px 20px 16px;overscroll-behavior:contain}',
    '#R .mg-list.-loading .mg-grid{opacity:.6}',
    '#R .mg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:8px;transition:opacity .15s}',
    '#R .mg-loading-banner{display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 12px;margin-bottom:10px;border-radius:var(--r-group);background:rgba(10,132,255,.12);border:1px solid rgba(10,132,255,.25);font-size:13px}',
    '#R .mg-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:var(--accent);border-radius:50%;animation:mg-spin .7s linear infinite;flex-shrink:0}',
    '@keyframes mg-spin{to{transform:rotate(360deg)}}',
    '#R .mg-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:72px 16px;text-align:center;color:var(--t3);font-size:15px}',
    // Card
    '#R .mg-card{position:relative;display:flex;align-items:stretch;height:96px;border-radius:var(--r-group);background:var(--group);border:1px solid var(--hair);overflow:hidden;content-visibility:auto;contain-intrinsic-size:auto 96px}',
    '#R .mg-card:hover{background:var(--group-hover);border-color:rgba(255,255,255,.18)}',
    '#R .mg-card-bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.2;pointer-events:none}',
    '#R .mg-card:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(30,30,30,.2) 0,rgba(30,30,30,.86) 60%);pointer-events:none}',
    '#R .mg-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;z-index:2;background:transparent}',
    '#R .mg-card.st-ranked:before{background:#66ccff}',
    '#R .mg-card.st-loved:before{background:#ff66ab}',
    '#R .mg-card.st-qualified:before{background:#ffd966}',
    '#R .mg-card.st-pending:before{background:#dcab4e}',
    '#R .mg-card-thumb{position:relative;z-index:1;width:96px;height:100%;flex-shrink:0;padding:0;border:none;background:rgba(255,255,255,.05);cursor:pointer;overflow:hidden}',
    '#R .mg-card-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
    '#R .mg-thumb-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(0,0,0,.45);opacity:0;transition:opacity .12s}',
    '#R .mg-card-thumb:hover .mg-thumb-play,#R .mg-card-thumb.-playing .mg-thumb-play{opacity:1}',
    '#R .mg-card-thumb.-playing .mg-thumb-play{background:rgba(10,132,255,.45)}',
    '#R .mg-card-body{position:relative;z-index:1;flex:1;min-width:0;padding:9px 12px;display:flex;flex-direction:column;cursor:pointer}',
    '#R .mg-card-title{font-family:"SF Pro Display","SF Pro Text",sans-serif!important;font-size:15px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .mg-card-artist{font-size:12px;color:var(--t1);opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .mg-card-mapper{margin-top:1px;font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .mg-card-mapper b{color:var(--t2);font-weight:600}',
    '#R .mg-card-foot{margin-top:auto;display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden}',
    '#R .mg-stat{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--t2);white-space:nowrap;font-variant-numeric:tabular-nums}',
    '#R .mg-diff-icons{display:flex;align-items:center;gap:2px;min-width:0;overflow:hidden}',
    '#R .mg-diffico{display:inline-flex;align-items:center;justify-content:center;line-height:1}',
    '#R .mg-diff-more{font-size:10px;color:var(--t3);margin-left:2px}',
    '#R .mg-card-actions{position:relative;z-index:1;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:6px;padding:0 12px}',
    '#R .mg-card-actions-row{display:flex;gap:6px}',
    '#R .mg-card-actions .mg-primary,#R .mg-card-actions .mg-owned,#R .mg-card-actions .mg-busy{min-width:104px}',
    '#R .mg-card-progress{position:absolute;left:0;bottom:0;height:2px;z-index:3;background:var(--accent);transition:width .2s linear;pointer-events:none}',
    '#R .mg-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;color:var(--t2);background:var(--fill)}',
    '#R .mg-badge.st-ranked{color:#66ccff;background:rgba(102,204,255,.14)}',
    '#R .mg-badge.st-loved{color:#ff66ab;background:rgba(255,102,171,.14)}',
    '#R .mg-badge.st-qualified{color:#ffd966;background:rgba(255,217,102,.14)}',
    '#R .mg-badge.st-pending{color:#dcab4e;background:rgba(220,171,78,.14)}',
    // Detail view
    '#R .mg-detail{position:absolute;inset:0;z-index:5;background:var(--bg);display:flex;flex-direction:column}',
    '#R .mg-detail[hidden]{display:none!important}',
    '#R .mg-detail-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}',
    '#R .mg-hero{position:relative;min-height:300px;display:flex;overflow:hidden;border-bottom:1px solid var(--sep)}',
    '#R .mg-hero-bg{position:absolute;inset:0;background-size:cover;background-position:center}',
    '#R .mg-hero-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(30,30,30,.35) 0,rgba(30,30,30,.7) 55%,var(--bg) 100%)}',
    '#R .mg-hero-inner{position:relative;flex:1;display:flex;flex-direction:column;padding:16px 24px 20px;min-width:0}',
    '#R .mg-hero-top{display:flex;align-items:center;gap:8px}',
    '#R .mg-back{background:rgba(0,0,0,.4);border-color:rgba(255,255,255,.16)}',
    '#R .mg-flag{padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--t1);background:rgba(0,0,0,.45);border:.5px solid var(--hair)}',
    '#R .mg-flag.-warn{color:var(--danger)}',
    '#R .mg-diff-picker{display:flex;flex-wrap:wrap;gap:4px;margin-top:16px;padding:4px;border-radius:var(--r-group);background:rgba(0,0,0,.45);width:fit-content;max-width:100%}',
    '#R .mg-diff-pick{width:34px;height:34px;border:1px solid transparent;border-radius:7px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
    '#R .mg-diff-pick:hover{background:var(--fill)}',
    '#R .mg-diff-pick.-on{background:var(--fill-strong);border-color:rgba(255,255,255,.3)}',
    '#R .mg-hero-diff{display:flex;align-items:center;gap:8px;margin-top:10px}',
    '#R .mg-hero-diffname{font-size:14px;font-weight:600}',
    '#R .mg-star-pill{padding:1px 8px;border-radius:999px;font-size:12px;font-weight:700;color:#111;font-variant-numeric:tabular-nums}',
    '#R .mg-hero-title{margin-top:auto;padding-top:14px;font-family:"SF Pro Display","SF Pro Text",sans-serif!important;font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.15;text-shadow:0 2px 12px rgba(0,0,0,.5)}',
    '#R .mg-hero-artist{font-size:17px;color:var(--t1);opacity:.85;margin-top:2px}',
    '#R .mg-hero-mapper{font-size:12px;color:var(--t2);margin-top:6px}',
    '#R .mg-link{border:none;background:none;padding:0;color:var(--accent-hover)!important;font-weight:600;cursor:pointer}',
    '#R .mg-link:hover{text-decoration:underline}',
    '#R .mg-hero-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
    '#R .mg-hero-actions .mg-btn:not(.mg-primary):not(.mg-owned):not(.mg-busy):not(.-active){background:rgba(0,0,0,.4);border-color:rgba(255,255,255,.16)}',
    '#R .mg-hero-actions .mg-primary,#R .mg-hero-actions .mg-owned,#R .mg-hero-actions .mg-busy{min-width:140px}',
    '#R .mg-detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;padding:16px 24px 24px}',
    '#R .mg-detail-col{display:flex;flex-direction:column;gap:16px;min-width:0}',
    '#R .mg-group{border-radius:var(--r-group);background:var(--group);border:1px solid var(--hair);overflow:hidden}',
    '#R .mg-group-head{padding:10px 14px 0;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--t3)}',
    '#R .mg-group-body{padding:6px 14px 10px}',
    '#R .mg-stats-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin-top:10px;background:var(--sep);border-top:1px solid var(--sep)}',
    '#R .mg-stat-tile{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:10px 14px;background:var(--group)}',
    '#R .mg-stat-ico{display:inline-flex;color:var(--t3)}',
    '#R .mg-stat-v{font-family:"SF Pro Display","SF Pro Text",sans-serif!important;font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}',
    '#R .mg-stat-k{font-size:11px;color:var(--t2)}',
    '#R .mg-info-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--sep)}',
    '#R .mg-info-row:last-child{border-bottom:none}',
    '#R .mg-info-row.-col{flex-direction:column;align-items:stretch;gap:8px}',
    '#R .mg-info-k{font-size:12px;color:var(--t2);flex-shrink:0}',
    '#R .mg-info-v{font-size:13px;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}',
    '#R .mg-tags{display:flex;flex-wrap:wrap;gap:4px}',
    '#R .mg-tag{height:22px;padding:0 8px;border:.5px solid var(--hair);border-radius:6px;background:var(--fill);font-size:11px;color:var(--t2);cursor:pointer}',
    '#R .mg-tag:hover{color:var(--t1);background:var(--fill-strong)}',
    '#R .mg-attr{display:grid;grid-template-columns:110px 1fr 40px;align-items:center;gap:10px;padding:6px 0}',
    '#R .mg-attr-k{font-size:12px;color:var(--t2)}',
    '#R .mg-attr-track{height:6px;border-radius:3px;background:var(--fill);overflow:hidden}',
    '#R .mg-attr-fill{display:block;height:100%;border-radius:3px;background:var(--t1)}',
    '#R .mg-attr-v{font-size:12px;text-align:right;font-variant-numeric:tabular-nums}',
    // Footer
    '#R .mg-footer{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px;padding:5px 20px;border-top:1px solid var(--sep);background:var(--bar)}',
    '#R .mg-footer .mg-btn[hidden]{display:none}',
    '#R .mg-line{font-size:12px;color:var(--t2);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    // Mini-player
    '#R .mg-player{flex-shrink:0;border-top:1px solid var(--sep);background:#181818}',
    '#R .mg-player-bar{height:3px;background:var(--fill);cursor:pointer}',
    '#R .mg-player-progress{height:100%;width:0;background:var(--accent)}',
    '#R .mg-player-body{display:flex;align-items:center;gap:12px;padding:8px 20px 10px}',
    '#R .mg-player-cover{width:40px;height:40px;border-radius:6px;overflow:hidden;background:var(--fill);flex-shrink:0}',
    '#R .mg-player-cover img{width:100%;height:100%;object-fit:cover;display:block}',
    '#R .mg-player-meta{flex:1;min-width:0}',
    '#R .mg-player-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .mg-player-sub{font-size:11px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}',
    '#R .mg-player-controls{display:flex;align-items:center;gap:6px;flex-shrink:0}',
    '#R .mg-pbtn{width:32px;height:30px;border:.5px solid var(--hair);border-radius:var(--r-ctl);background:var(--fill);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
    '#R .mg-pbtn:hover{background:var(--fill-strong)}',
    '#R .mg-pbtn-main{width:36px;background:var(--accent);border-color:transparent;color:#fff;box-shadow:0 1px 2px rgba(10,132,255,.25)}',
    '#R .mg-pbtn-main:hover{background:var(--accent-hover)}',
    '#R .mg-player-vol{display:flex;align-items:center;gap:6px;flex-shrink:0}',
    '#R .mg-vol-ico{display:inline-flex;color:var(--t2)}',
    '#R .mg-vol-range{width:96px;accent-color:var(--accent);cursor:pointer}',
    '#R .mg-vol-label{font-size:11px;color:var(--t2);min-width:32px;font-variant-numeric:tabular-nums}',
    '#R .mg-mute-btn{flex-shrink:0;height:30px;padding:0 10px;border-radius:var(--r-ctl);border:1px solid rgba(255,255,255,.1);background:var(--fill);color:var(--t2);cursor:pointer;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:background .15s,color .15s,border-color .15s}',
    '#R .mg-mute-btn:hover{background:var(--fill-strong);color:var(--t1);border-color:rgba(255,255,255,.2)}',
    '#R .mg-mute-btn.-on{background:rgba(10,132,255,.18);border-color:rgba(10,132,255,.45);color:#5ac8fa}',
    '#R .mg-mute-btn.-on:hover{background:rgba(10,132,255,.28);border-color:rgba(10,132,255,.65)}',
    '#R .mg-mute-ico{display:inline-flex}',
    // Gameplay modal
    '#R .mg-gp-modal{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:24px}',
    '#R .mg-gp-modal[hidden]{display:none!important}',
    '#R .mg-gp-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.7)}',
    '#R .mg-gp-panel{position:relative;z-index:1;width:min(920px,100%);max-height:100%;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--hair);border-radius:12px;padding:14px;box-shadow:0 20px 48px rgba(0,0,0,.65)}',
    '#R .mg-gp-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}',
    '#R .mg-gp-head-text{flex:1;min-width:0}',
    '#R .mg-gp-title{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .mg-gp-sub{font-size:12px;color:var(--t2);margin-top:2px}',
    '#R .mg-gp-diffs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;max-height:76px;overflow:auto}',
    '#R .mg-gp-diffs .mg-chip{display:inline-flex;align-items:center;gap:6px;background:var(--fill);height:28px}',
    '#R .mg-gp-diffs .mg-chip.-on{background:var(--fill-strong);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}',
    '#R .mg-gp-canvas{width:100%;height:auto;aspect-ratio:4/3;max-height:calc(100vh - 220px);object-fit:contain;border-radius:8px;background:#0b0b10;display:block}',
    '#R.-embedded{padding:0;position:fixed!important}',
    '#R.-embedded .mg-shade,#R.-embedded #mg-close,#R.-embedded .mg-hint{display:none!important}',
    '#R.-embedded .mg-panel{width:100%;height:100%;border:none;border-radius:0;box-shadow:none}',
    '@media (max-width:1100px){#R .mg-detail-grid{grid-template-columns:1fr}#R .mg-grid{grid-template-columns:1fr}}',
  ]
    .join('')
    .replace(/#R/g, '#' + ROOT_ID)

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
