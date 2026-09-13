/* In-game Maps Browser — tosu inject overlay + localhost API from tosu GUI */
;(function () {
  const API = 'http://127.0.0.1:24777'

  const UI_LANG_KEY = 'tosu_overlay_ui_lang'
  let uiLang = 'ru'
  try {
    const storedUiLang = localStorage.getItem(UI_LANG_KEY)
    if (storedUiLang === 'en' || storedUiLang === 'ru') uiLang = storedUiLang
  } catch {}

  const I18N = {
    ru: {
      title: 'Карты',
      login: 'Войти',
      searchPlaceholder: 'Поиск…',
      anyLang: 'Любой язык',
      statusLabel: 'Статус',
      modeLabel: 'Режим',
      statusAny: 'Любой',
      statusMore: 'Ещё…',
      modeAll: 'Все',
      showMore: 'Показать ещё',
      installed: 'Есть',
      download: 'Скачать',
      loading: 'Поиск…',
      moreLoading: 'Ещё…',
      emptyNoResults: 'Ничего нет',
      emptyLoginPrompt: 'Войдите, чтобы искать',
      previewUnavailable: 'Превью недоступно',
      previewFailed: 'Не удалось воспроизвести превью',
      searchError: 'Ошибка поиска',
      loginFirst: 'Сначала войдите',
      loginWindow: 'Окно входа…',
      noGuiConnection: 'Нет связи с tosu GUI',
      guiOffline: 'GUI offline',
      notLoggedIn: 'Не вошли',
      loggedInAs: 'Вы вошли как ',
      cardsCount: '{n} карт',
      diffSingular: '{n} сложность',
      diffFew: '{n} сложности',
      diffMany: '{n} сложностей',
      muteOsuOn: '🔇 Глушить osu!',
      muteOsuOff: '🔈 Звук osu!',
      muteOsuTitle: 'Заглушать звук osu! во время превью',
      hintNoGui: 'Запусти tosu GUI — без него поиск и скачивание не работают.',
      hintLogin: 'Войдите в osu!, затем ищите и качайте. Закрыть: «{keybind}».',
      hintActive: 'Ввод активен. Скачивай карты. Закрыть панель: «{keybind}».',
      moreStatusOptions: {
        pending: 'На рассмотрении',
        wip: 'В разработке',
        graveyard: 'Graveyard',
        favourites: 'Избранное',
        mine: 'Мои карты',
      },
      langOptions: {
        any: 'Любой язык',
        english: 'English',
        japanese: 'Japanese',
        chinese: 'Chinese',
        korean: 'Korean',
        russian: 'Russian',
        instrumental: 'Instrumental',
        french: 'French',
        german: 'German',
        spanish: 'Spanish',
        italian: 'Italian',
        swedish: 'Swedish',
        polish: 'Polish',
        unspecified: 'Не указан',
        other: 'Другой',
      },
    },
    en: {
      title: 'Beatmaps',
      login: 'Log in',
      searchPlaceholder: 'Search…',
      anyLang: 'Any language',
      statusLabel: 'Status',
      modeLabel: 'Mode',
      statusAny: 'Any',
      statusMore: 'More…',
      modeAll: 'All',
      showMore: 'Show more',
      installed: 'Installed',
      download: 'Download',
      loading: 'Searching…',
      moreLoading: 'More…',
      emptyNoResults: 'No beatmaps found',
      emptyLoginPrompt: 'Log in to search',
      previewUnavailable: 'Preview unavailable',
      previewFailed: 'Failed to play preview',
      searchError: 'Search error',
      loginFirst: 'Log in first',
      loginWindow: 'Login window…',
      noGuiConnection: 'Cannot connect to tosu GUI',
      guiOffline: 'GUI offline',
      notLoggedIn: 'Not logged in',
      loggedInAs: 'Logged in as ',
      cardsCount: '{n} beatmaps',
      diffSingular: '{n} difficulty',
      diffFew: '{n} difficulties',
      diffMany: '{n} difficulties',
      muteOsuOn: '🔇 Mute osu!',
      muteOsuOff: '🔈 osu! audio',
      muteOsuTitle: 'Mute osu! sound during beatmap preview',
      hintNoGui: 'Start tosu GUI — search and downloads require it.',
      hintLogin: 'Log in to osu!, then search and download. Close: «{keybind}».',
      hintActive: 'Input active. Download beatmaps. Close panel: «{keybind}».',
      moreStatusOptions: {
        pending: 'Pending',
        wip: 'WIP',
        graveyard: 'Graveyard',
        favourites: 'Favorites',
        mine: 'My beatmaps',
      },
      langOptions: {
        any: 'Any language',
        english: 'English',
        japanese: 'Japanese',
        chinese: 'Chinese',
        korean: 'Korean',
        russian: 'Russian',
        instrumental: 'Instrumental',
        french: 'French',
        german: 'German',
        spanish: 'Spanish',
        italian: 'Italian',
        swedish: 'Swedish',
        polish: 'Polish',
        unspecified: 'Unspecified',
        other: 'Other',
      },
    },
  }

  function t(key, params) {
    const dict = I18N[uiLang] || I18N.ru
    let val = dict[key] != null ? dict[key] : (I18N.ru[key] != null ? I18N.ru[key] : key)
    if (typeof val === 'string' && params) {
      for (const p in params) {
        if (Object.prototype.hasOwnProperty.call(params, p)) {
          val = val.replace(new RegExp('\\{' + p + '\\}', 'g'), String(params[p]))
        }
      }
    }
    return val
  }

  const el = {
    topTitle: document.getElementById('top-title'),
    uiLangBtn: document.getElementById('btn-ui-lang'),
    btnMute: document.getElementById('btn-mute-osu'),
    authLabel: document.getElementById('auth-label'),
    login: document.getElementById('btn-login'),
    hint: document.getElementById('hint'),
    q: document.getElementById('q'),
    language: document.getElementById('language'),
    lblStatus: document.getElementById('lbl-status'),
    statuses: document.getElementById('statuses'),
    moreStatus: document.getElementById('more-status'),
    lblMode: document.getElementById('lbl-mode'),
    modes: document.getElementById('modes'),
    list: document.getElementById('list'),
    more: document.getElementById('btn-more'),
    line: document.getElementById('status-line'),
  }

  const MORE_STATUSES = {
    pending: 1,
    wip: 1,
    graveyard: 1,
    favourites: 1,
    mine: 1,
  }

  let mode = 'any'
  let statusFilter = 'ranked'
  let languageFilter = 'any'
  let page = 0
  let cursor = null
  let hasMore = false
  let loading = false
  let sets = []
  let localIds = new Set()
  let loggedIn = false
  let username = ''
  const MAPS_AUTH_KEY = 'tosu_maps_auth'
  try {
    const cachedAuth = localStorage.getItem(MAPS_AUTH_KEY)
    if (cachedAuth) {
      const parsedAuth = JSON.parse(cachedAuth)
      if (parsedAuth && parsedAuth.loggedIn) {
        loggedIn = true
        username = parsedAuth.username || ''
      }
    }
  } catch {}
  let downloads = {}
  let debounceTimer = null
  let apiOk = false
  let overlayKeybind = ''
  let previewId = null
  let previewAudio = null

  const MUTE_OSU_KEY = 'tosu-gui-mute-osu-on-preview'
  let muteOsuOnPreview = loadMuteOsuPref()

  function loadMuteOsuPref() {
    try {
      const v = localStorage.getItem(MUTE_OSU_KEY)
      if (v === '0' || v === 'false') return false
      return true
    } catch {
      return true
    }
  }

  function saveMuteOsuPref(val) {
    muteOsuOnPreview = Boolean(val)
    try {
      localStorage.setItem(MUTE_OSU_KEY, muteOsuOnPreview ? '1' : '0')
    } catch {}
    void api('/api/maps/audio-mute', {
      method: 'POST',
      body: JSON.stringify({ autoMute: muteOsuOnPreview }),
    }).catch(() => {})
    syncMuteBtnUi()
  }

  function notifyPreviewState(active) {
    void api('/api/maps/audio-mute', {
      method: 'POST',
      body: JSON.stringify({ previewActive: Boolean(active), previewKey: 'web-browser' }),
    }).catch(() => {})
  }

  function applyLanguage(lang) {
    uiLang = lang === 'en' ? 'en' : 'ru'
    try {
      localStorage.setItem(UI_LANG_KEY, uiLang)
    } catch {}

    if (el.topTitle) el.topTitle.textContent = t('title')
    if (el.uiLangBtn) el.uiLangBtn.textContent = uiLang.toUpperCase()
    if (el.login) el.login.textContent = t('login')
    if (el.q) el.q.placeholder = t('searchPlaceholder')
    if (el.lblStatus) el.lblStatus.textContent = t('statusLabel')
    if (el.lblMode) el.lblMode.textContent = t('modeLabel')
    if (el.more) el.more.textContent = t('showMore')

    if (el.statuses) {
      const anyStatusChip = el.statuses.querySelector('[data-status="any"]')
      if (anyStatusChip) anyStatusChip.textContent = t('statusAny')
    }
    if (el.modes) {
      const allModeChip = el.modes.querySelector('[data-mode="any"]')
      if (allModeChip) allModeChip.textContent = t('modeAll')
    }

    if (el.moreStatus) {
      const opts = t('moreStatusOptions')
      const currentVal = el.moreStatus.value
      el.moreStatus.innerHTML =
        '<option value="">' + escapeHtml(t('statusMore')) + '</option>' +
        Object.keys(opts).map(function (k) {
          return '<option value="' + k + '">' + escapeHtml(opts[k]) + '</option>'
        }).join('')
      el.moreStatus.value = currentVal
    }

    if (el.language) {
      const langOpts = t('langOptions')
      const currentLang = el.language.value
      el.language.innerHTML = Object.keys(langOpts).map(function (k) {
        return '<option value="' + k + '">' + escapeHtml(langOpts[k]) + '</option>'
      }).join('')
      el.language.value = currentLang
    }

    syncMuteBtnUi()
    updateAuthUi()
    render()
  }

  function syncMuteBtnUi() {
    const btn = document.getElementById('btn-mute-osu')
    if (!btn) return
    btn.classList.toggle('-on', muteOsuOnPreview)
    btn.setAttribute('aria-pressed', muteOsuOnPreview ? 'true' : 'false')
    btn.textContent = muteOsuOnPreview ? t('muteOsuOn') : t('muteOsuOff')
    btn.title = t('muteOsuTitle')
  }

  function previewUrlFor(s) {
    if (s && s.previewUrl) return s.previewUrl
    if (s && s.id) return 'https://b.ppy.sh/preview/' + s.id + '.mp3'
    return ''
  }

  function stopPreview() {
    notifyPreviewState(false)
    if (previewAudio) {
      try {
        previewAudio.pause()
        previewAudio.removeAttribute('src')
        previewAudio.load()
      } catch {
        /* ignore */
      }
    }
    previewId = null
  }

  function togglePreview(id) {
    const set = sets.find(function (s) {
      return s.id === id
    })
    const url = previewUrlFor(set)
    if (!url) {
      setLine(t('previewUnavailable'))
      return
    }
    if (previewId === id) {
      stopPreview()
      render()
      return
    }
    if (!previewAudio) {
      previewAudio = new Audio()
      previewAudio.preload = 'none'
      previewAudio.addEventListener('ended', function () {
        previewId = null
        notifyPreviewState(false)
        render()
      })
      previewAudio.addEventListener('error', function () {
        previewId = null
        notifyPreviewState(false)
        setLine(t('previewFailed'))
        render()
      })
    }
    try {
      previewAudio.pause()
      previewAudio.src = url
      previewId = id
      render()
      notifyPreviewState(true)
      void previewAudio.play().catch(function () {
        previewId = null
        notifyPreviewState(false)
        setLine(t('previewFailed'))
        render()
      })
    } catch {
      previewId = null
      notifyPreviewState(false)
      setLine(t('previewFailed'))
      render()
    }
  }

  function setLine(t) {
    el.line.textContent = t || ''
  }

  function escapeHtml(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  async function api(path, opts) {
    const res = await fetch(API + path, {
      ...opts,
      headers: {
        Accept: 'application/json',
        ...(opts && opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts && opts.headers),
      },
    })
    const data = await res.json().catch(function () {
      return {}
    })
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status)
    return data
  }

  let mapsKeybind = 'Control + Shift + M'

  function updateHint() {
    if (!apiOk) {
      el.hint.textContent = t('hintNoGui')
      return
    }
    if (!loggedIn) {
      el.hint.textContent = t('hintLogin', { keybind: mapsKeybind })
      return
    }
    el.hint.textContent = t('hintActive', { keybind: mapsKeybind })
  }

  function updateAuthUi() {
    if (loggedIn) {
      el.authLabel.textContent = t('loggedInAs') + (username || 'osu!')
      el.authLabel.hidden = false
      el.login.hidden = true
    } else if (!apiOk) {
      el.authLabel.textContent = t('guiOffline')
      el.authLabel.hidden = false
      el.login.hidden = true
    } else {
      el.authLabel.textContent = t('notLoggedIn')
      el.authLabel.hidden = false
      el.login.hidden = false
    }
    updateHint()
  }

  async function loadConfig() {
    try {
      const c = await api('/api/maps/config')
      if (c.mapsKeybind) mapsKeybind = String(c.mapsKeybind)
      if (c.overlayKeybind) overlayKeybind = String(c.overlayKeybind)
      if (c.language && (c.language === 'ru' || c.language === 'en')) {
        try {
          if (!localStorage.getItem(UI_LANG_KEY)) {
            uiLang = c.language
            applyLanguage(uiLang)
          }
        } catch {}
      }
    } catch {
      /* ignore */
    }
  }

  async function checkApi() {
    try {
      await api('/api/maps/ping')
      apiOk = true
      await loadConfig()
      return true
    } catch {
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
      const a = await api('/api/maps/auth')
      if (a && typeof a.loggedIn === 'boolean') {
        loggedIn = a.loggedIn
        username = a.username || ''
        try {
          if (loggedIn) {
            localStorage.setItem(MAPS_AUTH_KEY, JSON.stringify({ loggedIn, username }))
          } else {
            localStorage.removeItem(MAPS_AUTH_KEY)
          }
        } catch {}
      }
    } catch {
      // keep cached auth on fetch error
    }
    updateAuthUi()
  }

  async function refreshLocal() {
    try {
      const r = await api('/api/maps/local-sets')
      localIds = new Set(r.setIds || [])
    } catch {
      localIds = new Set()
    }
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
      return n === 1 ? t('diffSingular', { n }) : t('diffMany', { n })
    }
    var abs = Math.abs(n) % 100
    var rem = abs % 10
    if (abs > 10 && abs < 20) return t('diffMany', { n })
    if (rem > 1 && rem < 5) return t('diffFew', { n })
    if (rem === 1) return t('diffSingular', { n })
    return t('diffMany', { n })
  }

  function diffIconHtml(mode, stars, size, title) {
    var color = getDiffColour(stars || 0)
    var m = normalizeOsuMode(mode)
    var d = modePath(m)
    var tt = title ? ' title="' + title + '"' : ' title="' + (stars || 0).toFixed(2) + '★"'
    return '<span class="diffico"' + tt + ' style="color:' + color + '"><svg viewBox="0 0 1000 1000" width="' + (size || 14) + '" height="' + (size || 14) + '"><g transform="translate(0,1000) scale(1,-1)"><path fill="currentColor" fill-rule="evenodd" d="' + d + '"/></g></svg></span>'
  }

  function render() {
    if (!sets.length) {
      el.list.innerHTML =
        '<div class="empty">' +
        (loading ? escapeHtml(t('loading')) : loggedIn ? escapeHtml(t('emptyNoResults')) : escapeHtml(t('emptyLoginPrompt'))) +
        '</div>'
      el.more.hidden = true
      return
    }

    el.list.innerHTML = sets
      .map(function (s) {
        const owned = localIds.has(s.id)
        const dl = downloads[s.id]
        const busy =
          dl &&
          (dl.phase === 'downloading' || dl.phase === 'installing' || dl.phase === 'queued')
        const pct = dl && dl.progress != null ? Math.round(dl.progress) : 0
        const cover = s.listCoverUrl || s.coverUrl || ''
        let btn
        if (owned) {
          btn = '<button type="button" class="btn -owned" disabled>' + escapeHtml(t('installed')) + '</button>'
        } else if (busy) {
          btn =
            '<button type="button" class="btn -busy" data-cancel="' +
            s.id +
            '">✕ ' +
            pct +
            '%</button>'
        } else {
          btn =
            '<button type="button" class="btn -primary" data-dl="' + s.id + '">' + escapeHtml(t('download')) + '</button>'
        }
        const playing = previewId === s.id
        const previewBtn =
          '<button type="button" class="btn btn-preview' +
          (playing ? ' -playing' : '') +
          '" data-preview="' +
          s.id +
          '" title="' +
          (playing ? 'Стоп' : 'Превью') +
          '">' +
          (playing ? '❚❚' : '▶') +
          '</button>'

        const matchingBm = (s.beatmaps || []).filter(function (b) {
          return mode === 'any' || normalizeOsuMode(b.mode) === mode
        })
        const bmsToDisplay = matchingBm.length > 0 ? matchingBm : (s.beatmaps || [])
        const totalCount = s.beatmaps && s.beatmaps.length ? s.beatmaps.length : (s.modes && s.modes.length ? s.modes.length : 1)
        const countLabel = pluralizeDiffs(matchingBm.length > 0 && mode !== 'any' ? matchingBm.length : totalCount)
        let diffIconsHtml = bmsToDisplay.slice(0, 16).map(function (b) {
          return diffIconHtml(b.mode, b.stars || 0, 13, escapeHtml(b.version + ' (' + (b.stars || 0).toFixed(2) + '★)'))
        }).join('')
        if (bmsToDisplay.length > 16) {
          diffIconsHtml += '<span class="diff-more">+' + (bmsToDisplay.length - 16) + '</span>'
        }

        return (
          '<div class="row">' +
          (cover
            ? '<img class="cover" src="' +
              cover +
              '" alt="" loading="lazy" draggable="false" />'
            : '<div class="cover"></div>') +
          '<div class="meta"><div class="title">' +
          escapeHtml(s.artist + ' — ' + s.title) +
          '</div><div class="sub">' +
          escapeHtml(s.creator) +
          ' · <span class="diff-count">' +
          countLabel +
          '</span> · ' +
          escapeHtml(s.status) +
          '</div>' +
          (diffIconsHtml ? '<div class="diff-icons-row" title="' + countLabel + '">' + diffIconsHtml + '</div>' : '') +
          '</div>' +
          '<div class="row-actions">' +
          previewBtn +
          btn +
          '</div></div>'
        )
      })
      .join('')

    el.more.hidden = !hasMore
  }

  async function search(append) {
    if (loading) return
    if (!apiOk && !(await checkApi())) return
    if (!loggedIn) {
      setLine(t('loginFirst'))
      return
    }

    loading = true
    if (!append) {
      page = 0
      cursor = null
      sets = []
      render()
    }
    setLine(append ? t('moreLoading') : t('loading'))

    try {
      const sp = new URLSearchParams()
      sp.set('q', el.q.value.trim())
      sp.set('mode', mode)
      sp.set('status', statusFilter)
      sp.set('language', languageFilter)
      sp.set('page', String(append ? page + 1 : 0))
      sp.set('limit', '24')
      if (append && cursor) sp.set('cursor', cursor)

      const r = await api('/api/maps/search?' + sp.toString())
      const next = r.sets || []
      if (append) {
        const seen = new Set(
          sets.map(function (x) {
            return x.id
          })
        )
        const extra = next.filter(function (x) {
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
      }
      setLine(sets.length ? t('cardsCount', { n: sets.length }) : t('emptyNoResults'))
    } catch (err) {
      setLine(err.message || t('searchError'))
      if (!append) sets = []
    } finally {
      loading = false
      render()
    }
  }

  el.list.addEventListener('click', function (e) {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    const previewBtn = t.closest ? t.closest('[data-preview]') : null
    const previewAttr =
      (previewBtn && previewBtn.getAttribute('data-preview')) || t.getAttribute('data-preview')
    if (previewAttr) {
      togglePreview(Number(previewAttr))
      return
    }
    const cancelId = t.getAttribute('data-cancel')
    const dlId = t.getAttribute('data-dl')
    if (cancelId) {
      void api('/api/maps/cancel', {
        method: 'POST',
        body: JSON.stringify({ setId: Number(cancelId) }),
      })
      return
    }
    if (dlId) {
      const id = Number(dlId)
      const set = sets.find(function (s) {
        return s.id === id
      })
      if (!set) return
      downloads[id] = { setId: id, phase: 'queued', progress: 0 }
      render()
      void api('/api/maps/download', {
        method: 'POST',
        body: JSON.stringify({ setId: id, artist: set.artist, title: set.title }),
      })
        .then(function (r) {
          if (r.cancelled) {
            downloads[id] = { setId: id, phase: 'cancelled', progress: 0 }
          } else if (r.ok) {
            downloads[id] = { setId: id, phase: 'done', progress: 100 }
            localIds.add(id)
          } else {
            downloads[id] = { setId: id, phase: 'error', progress: 0 }
            setLine(r.error || t('searchError'))
          }
          render()
        })
        .catch(function (err) {
          downloads[id] = { setId: id, phase: 'error', progress: 0 }
          setLine(err.message || t('searchError'))
          render()
        })
    }
  })

  if (el.uiLangBtn) {
    el.uiLangBtn.addEventListener('click', function (e) {
      if (e.button !== undefined && e.button !== 0) return
      e.preventDefault()
      const nextLang = uiLang === 'ru' ? 'en' : 'ru'
      applyLanguage(nextLang)
      void api('/api/maps/ui-lang', {
        method: 'POST',
        body: JSON.stringify({ language: nextLang }),
      }).catch(() => {})
    })
  }

  el.login.addEventListener('click', function () {
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

  el.more.addEventListener('click', function () {
    void search(true)
  })

  el.q.addEventListener('input', function () {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(function () {
      void search(false)
    }, 400)
  })

  function syncMoreStatusSelect() {
    if (!el.moreStatus) return
    const isMore = !!MORE_STATUSES[statusFilter]
    el.moreStatus.value = isMore ? statusFilter : ''
    el.moreStatus.classList.toggle('-active', isMore)
  }

  el.statuses.addEventListener('click', function (e) {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    const s = t.getAttribute('data-status')
    if (!s) return
    statusFilter = s
    el.statuses.querySelectorAll('.chip').forEach(function (b) {
      b.classList.toggle('-on', b.getAttribute('data-status') === statusFilter)
    })
    syncMoreStatusSelect()
    void search(false)
  })

  if (el.moreStatus) {
    el.moreStatus.addEventListener('change', function () {
      const v = el.moreStatus.value
      if (!v) return
      statusFilter = v
      el.statuses.querySelectorAll('.chip').forEach(function (b) {
        b.classList.toggle('-on', b.getAttribute('data-status') === statusFilter)
      })
      syncMoreStatusSelect()
      void search(false)
    })
  }

  if (el.language) {
    el.language.addEventListener('change', function () {
      languageFilter = el.language.value || 'any'
      void search(false)
    })
  }

  el.modes.addEventListener('click', function (e) {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    const m = t.getAttribute('data-mode')
    if (!m) return
    mode = m
    el.modes.querySelectorAll('.chip').forEach(function (b) {
      b.classList.toggle('-on', b.getAttribute('data-mode') === mode)
    })
    void search(false)
  })

  try {
    const es = new EventSource(API + '/api/maps/progress')
    es.onmessage = function (ev) {
      try {
        const p = JSON.parse(ev.data)
        downloads[p.setId] = p
        if (p.phase === 'done') localIds.add(p.setId)
        render()
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  const btnMute = document.getElementById('btn-mute-osu')
  if (btnMute) {
    btnMute.addEventListener('click', function () {
      saveMuteOsuPref(!muteOsuOnPreview)
    })
  }
  syncMuteBtnUi()
  updateAuthUi()

  void (async function boot() {
    void api('/api/maps/audio-mute')
      .then(function (res) {
        if (res && typeof res.autoMute === 'boolean') {
          muteOsuOnPreview = res.autoMute
          try {
            localStorage.setItem(MUTE_OSU_KEY, muteOsuOnPreview ? '1' : '0')
          } catch {}
          syncMuteBtnUi()
        }
      })
      .catch(() => {})

    await refreshAuth()
    await refreshLocal()
    applyLanguage(uiLang)
    if (loggedIn) void search(false)
    else {
      setLine('')
      render()
    }
  })()

  // Refresh keybind / auth when overlay reloads
  setInterval(function () {
    void loadConfig().then(updateHint)
  }, 15000)
})()
