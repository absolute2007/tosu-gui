/**
 * Same-document Maps panel for tosu inject overlay.
 * Mount once, show/hide — keeps filters, results, login.
 * Close: console marker read by overlay-patch (no page reload).
 *
 * Features: audio mini-player, volume, language/status filters (custom dropdowns),
 * simple gameplay preview without downloading the full set (osu!preview-style).
 */
;(function (global) {
  var APP_VERSION = 19
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
  var LANG_OPTIONS = [
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
  ]
  var MORE_STATUS_OPTIONS = [
    ['pending', 'На рассмотрении'],
    ['wip', 'В разработке'],
    ['graveyard', 'Graveyard'],
    ['favourites', 'Избранное'],
    ['mine', 'Мои карты'],
  ]

  var page = 0
  var cursor = null
  var hasMore = false
  var loading = false
  var sets = []
  var localIds = new Set()
  var loggedIn = false
  var username = ''
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

  function esc(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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

  async function api(path, opts) {
    var res = await fetch(API + path, {
      ...opts,
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

  function previewUrlFor(s) {
    if (s && s.previewUrl) return s.previewUrl
    if (s && s.id) return 'https://b.ppy.sh/preview/' + s.id + '.mp3'
    return ''
  }

  function ensureAudio() {
    if (previewAudio) return previewAudio
    previewAudio = new Audio()
    previewAudio.preload = 'none'
    previewAudio.volume = previewVolume
    previewAudio.addEventListener('ended', function () {
      previewId = null
      previewPaused = false
      if (visible) {
        renderList()
        syncPlayerUi()
      }
    })
    previewAudio.addEventListener('error', function () {
      previewId = null
      previewPaused = false
      setLine('Не удалось воспроизвести превью')
      if (visible) {
        renderList()
        syncPlayerUi()
      }
    })
    previewAudio.addEventListener('timeupdate', function () {
      if (visible) syncPlayerProgress()
    })
    return previewAudio
  }

  function stopPreview() {
    if (previewAudio) {
      try {
        previewAudio.pause()
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
    var set = sets.find(function (s) {
      return s.id === id
    })
    var url = previewUrlFor(set)
    if (!url) {
      setLine('Превью недоступно')
      return
    }
    var audio = ensureAudio()
    try {
      audio.pause()
      audio.volume = previewVolume
      audio.src = url
      previewId = id
      previewPaused = false
      renderList()
      syncPlayerUi()
      void audio.play().catch(function () {
        previewId = null
        previewPaused = false
        setLine('Не удалось воспроизвести превью')
        renderList()
        syncPlayerUi()
      })
    } catch (e) {
      previewId = null
      setLine('Не удалось воспроизвести превью')
      renderList()
      syncPlayerUi()
    }
  }

  function togglePreview(id) {
    if (previewId === id) {
      var audio = ensureAudio()
      if (previewPaused || audio.paused) {
        previewPaused = false
        void audio.play().catch(function () {
          stopPreview()
        })
        syncPlayerUi()
        renderList()
      } else {
        audio.pause()
        previewPaused = true
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
    if (!els.player) return
    var set = currentSet()
    var active = !!previewId && !!set
    els.player.classList.toggle('-active', active)
    els.player.classList.toggle('-idle', !active)
    if (els.playerCover) {
      var cover = set && (set.listCoverUrl || set.coverUrl)
      if (cover) {
        els.playerCover.innerHTML = '<img src="' + esc(cover) + '" alt="" draggable="false" />'
      } else {
        els.playerCover.innerHTML = ''
      }
    }
    if (els.playerTitle) {
      els.playerTitle.textContent = set ? set.artist + ' — ' + set.title : 'Нет трека'
    }
    if (els.playerSub) {
      els.playerSub.textContent = set ? set.creator : 'Выберите карту ▶'
    }
    if (els.playerPlay) {
      var playing = active && previewAudio && !previewAudio.paused && !previewPaused
      els.playerPlay.textContent = playing ? '❚❚' : '▶'
      els.playerPlay.title = playing ? 'Пауза' : 'Играть'
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
      els.hint.textContent = 'Запусти tosu GUI — без него поиск не работает.'
      return
    }
    if (!loggedIn) {
      els.hint.textContent = 'Войдите в osu!, затем ищите карты.'
      return
    }
    els.hint.textContent = 'Ввод активен · «' + mapsKeybind + '» / Esc / ✕ — закрыть'
  }

  function updateAuthUi() {
    if (!els.authLabel || !els.login) return
    if (!apiOk) {
      els.authLabel.textContent = 'GUI offline'
      els.login.hidden = true
      return
    }
    if (loggedIn) {
      els.authLabel.textContent = 'Вы вошли как ' + (username || 'osu!')
      els.login.hidden = true
    } else {
      els.authLabel.textContent = 'Не вошли'
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
    if (isLoading) setLine(message || 'Загрузка…')
  }

  function renderList() {
    if (!els.list) return
    if (!sets.length) {
      els.list.innerHTML =
        '<div class="mg-empty">' +
        (loading
          ? '<div class="mg-spinner"></div><div class="mg-empty-text">Загрузка…</div>'
          : loggedIn
            ? 'Ничего нет'
            : 'Войдите, чтобы искать') +
        '</div>'
      if (els.more) els.more.hidden = true
      return
    }

    var banner = loading
      ? '<div class="mg-loading-banner"><span class="mg-spinner"></span><span>Обновление списка…</span></div>'
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
            btn = '<button type="button" class="mg-btn mg-owned" disabled>Есть</button>'
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
              '">Скачать</button>'
          }
          var playing = previewId === s.id && !previewPaused
          var previewBtn =
            '<button type="button" class="mg-btn mg-preview' +
            (playing ? ' -playing' : '') +
            '" data-preview="' +
            s.id +
            '" title="' +
            (playing ? 'Пауза' : 'Слушать') +
            '">' +
            (playing ? '❚❚' : '▶') +
            '</button>'
          var hasBm = s.beatmaps && s.beatmaps.length
          var gpBtn =
            '<button type="button" class="mg-btn mg-gp" data-gp="' +
            s.id +
            '" title="Предпросмотр карты" ' +
            (hasBm ? '' : 'disabled') +
            '>◎</button>'
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
            ' · ' +
            stars(s) +
            '★ · <span class="mg-badge ' +
            sc +
            '">' +
            esc(s.status) +
            '</span></div></div>' +
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
      setLine('Нет связи с tosu GUI')
      return false
    }
  }

  async function refreshAuth() {
    if (!(await checkApi())) {
      loggedIn = false
      username = ''
      updateAuthUi()
      return
    }
    try {
      var a = await api('/api/maps/auth')
      loggedIn = !!a.loggedIn
      username = a.username || ''
    } catch (e) {
      loggedIn = false
      username = ''
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
      setLine('Сначала войдите')
      return
    }

    var seq = ++searchSeq
    if (!append) {
      page = 0
      cursor = null
    }
    setLoadingUi(true, append ? 'Загрузка ещё…' : 'Обновление…')
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
      setLine(sets.length ? sets.length + ' карт' : 'Пусто')
    } catch (err) {
      if (seq !== searchSeq) return
      setLine(err.message || 'Ошибка поиска')
      if (!append) sets = []
    } finally {
      if (seq === searchSeq) {
        setLoadingUi(false)
        renderList()
        syncPlayerUi()
      }
    }
  }

  function applyChipGroup(container, attr, value) {
    if (!container) return
    container.querySelectorAll('.mg-chip').forEach(function (b) {
      b.classList.toggle('-on', b.getAttribute(attr) === value)
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
    for (var i = 0; i < LANG_OPTIONS.length; i++) {
      if (LANG_OPTIONS[i][0] === languageFilter) return LANG_OPTIONS[i][1]
    }
    return 'Язык'
  }

  function moreStatusLabel() {
    if (!MORE_STATUSES[statusFilter]) return 'Ещё…'
    for (var i = 0; i < MORE_STATUS_OPTIONS.length; i++) {
      if (MORE_STATUS_OPTIONS[i][0] === statusFilter) return MORE_STATUS_OPTIONS[i][1]
    }
    return statusFilter
  }

  function syncFilterUi() {
    if (els.statuses) applyChipGroup(els.statuses, 'data-status', statusFilter)
    if (els.modes) applyChipGroup(els.modes, 'data-mode', mode)
    if (els.langBtn) {
      els.langBtn.textContent = langLabel()
      els.langBtn.classList.toggle('-active', languageFilter !== 'any')
    }
    if (els.moreBtn) {
      els.moreBtn.textContent = moreStatusLabel()
      els.moreBtn.classList.toggle('-active', !!MORE_STATUSES[statusFilter])
    }
    if (els.langMenu) {
      els.langMenu.querySelectorAll('[data-lang]').forEach(function (b) {
        b.classList.toggle('-on', b.getAttribute('data-lang') === languageFilter)
      })
    }
    if (els.moreMenu) {
      els.moreMenu.querySelectorAll('[data-more-status]').forEach(function (b) {
        b.classList.toggle('-on', b.getAttribute('data-more-status') === statusFilter)
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
    return global.TosuOsuPreview || null
  }

  function stopGpLoop() {
    if (gp.raf) {
      cancelAnimationFrame(gp.raf)
      gp.raf = 0
    }
    if (gp.audio) {
      try {
        gp.audio.pause()
        gp.audio.removeAttribute('src')
        gp.audio.load()
      } catch (e) {
        /* ignore */
      }
      gp.audio = null
    }
  }

  function closeGameplayPreview() {
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
    var elapsed = now - gp.startPerf
    var t = gp.parsed.previewTime + elapsed
    var rt = ensureGpRuntime()
    var cont = eng.drawPreviewFrame(
      ctx,
      gp.parsed,
      canvas.width,
      canvas.height,
      t,
      elapsed,
      rt
    )
    if (!cont) {
      closeGameplayPreview()
      return
    }
    gp.raf = requestAnimationFrame(drawGameplay)
  }

  async function openGameplayPreview(setId) {
    var set = sets.find(function (s) {
      return s.id === setId
    })
    if (!set) return
    var bms = set.beatmaps || []
    if (!bms.length) {
      setLine('Нет сложностей для превью')
      return
    }
    // Prefer osu!standard, else first
    var pick =
      bms.find(function (b) {
        return b.mode === 'osu' || b.mode === '0'
      }) || bms[Math.floor(bms.length / 2)] || bms[0]

    stopPreview()
    closeGameplayPreview()
    gp.open = true
    gp.set = set
    gp.beatmapId = pick.id
    gp.loading = true
    gp.error = ''
    if (els.gpModal) els.gpModal.hidden = false
    if (els.gpTitle) els.gpTitle.textContent = set.artist + ' — ' + set.title
    if (els.gpSub) els.gpSub.textContent = pick.version + ' · ' + (pick.stars || 0).toFixed(2) + '★ · загрузка…'
    if (els.gpDiffs) {
      els.gpDiffs.innerHTML = bms
        .map(function (b) {
          return (
            '<button type="button" class="mg-chip' +
            (b.id === pick.id ? ' -on' : '') +
            '" data-gp-diff="' +
            b.id +
            '">' +
            esc(b.version) +
            ' ' +
            (b.stars || 0).toFixed(1) +
            '★</button>'
          )
        })
        .join('')
    }

    await loadGameplayDiff(pick.id, set)
  }

  async function loadGameplayDiff(beatmapId, set) {
    gp.loading = true
    gp.error = ''
    gp.beatmapId = beatmapId
    stopGpLoop()
    if (els.gpSub) els.gpSub.textContent = 'Загрузка…'
    try {
      var eng = engine()
      if (!eng || typeof eng.parseOsu !== 'function') {
        throw new Error('Движок превью не загружен')
      }
      var r = await api('/api/maps/osu-file?beatmapId=' + beatmapId)
      var parsed = eng.parseOsu(r.content || '')
      gp.parsed = parsed
      gp.loading = false
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

      var bm = (set.beatmaps || []).find(function (b) {
        return b.id === beatmapId
      })
      if (els.gpSub) {
        els.gpSub.textContent = bm
          ? bm.version + ' · ' + (bm.stars || 0).toFixed(2) + '★'
          : 'Предпросмотр'
      }
      if (els.gpDiffs) {
        els.gpDiffs.querySelectorAll('[data-gp-diff]').forEach(function (b) {
          b.classList.toggle('-on', Number(b.getAttribute('data-gp-diff')) === beatmapId)
        })
      }

      var url = previewUrlFor(set)
      gp.audio = new Audio()
      gp.audio.volume = previewVolume
      gp.audio.preload = 'auto'
      if (url) gp.audio.src = url
      gp.startPerf = performance.now()
      void gp.audio.play().catch(function () {
        /* visual still works */
      })
      // Unlock Web Audio for hitsounds (user gesture chain)
      try {
        if (rt && rt.audio && rt.audio.resume) void rt.audio.resume()
      } catch (e) {
        /* ignore */
      }
      gp.raf = requestAnimationFrame(drawGameplay)
    } catch (err) {
      gp.loading = false
      gp.error = err.message || 'Ошибка'
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

  function bindUi() {
    els.login.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      void (async function () {
        if (!apiOk && !(await checkApi())) return
        setLine('Окно входа…')
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

    els.q.addEventListener('input', function () {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(function () {
        void search(false)
      }, 400)
    })

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
      els.gpDiffs.addEventListener('pointerup', function (e) {
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
      '<div class="mg-top-title">Карты</div>' +
      '<div class="mg-top-spacer"></div>' +
      '<span class="mg-auth" id="mg-auth">…</span>' +
      '<button type="button" class="mg-btn mg-primary mg-login-btn" id="mg-login" hidden>Войти</button>' +
      '<button type="button" class="mg-x" id="mg-close" title="Закрыть" aria-label="Закрыть">×</button>' +
      '</header>' +
      '<p class="mg-hint" id="mg-hint"></p>' +
      '<div class="mg-toolbar">' +
      '<input class="mg-input" id="mg-q" type="search" placeholder="Поиск…" autocomplete="off" spellcheck="false" />' +
      '<div class="mg-dd" id="mg-lang-wrap">' +
      '<button type="button" class="mg-dd-btn" id="mg-lang-btn" title="Язык">Любой язык</button>' +
      '<div class="mg-dd-menu" id="mg-lang-menu" hidden>' +
      menuItems(LANG_OPTIONS, 'data-lang') +
      '</div></div>' +
      '<button type="button" class="mg-btn mg-refresh" id="mg-refresh" title="Обновить список">↻</button>' +
      '</div>' +
      '<div class="mg-label">Статус</div>' +
      '<div class="mg-status-row">' +
      '<div class="mg-chips mg-chips-inline" id="mg-statuses">' +
      chip('status', 'ranked', 'Ranked', true) +
      chip('status', 'qualified', 'Qualified', false) +
      chip('status', 'loved', 'Loved', false) +
      chip('status', 'any', 'Любой', false) +
      '</div>' +
      '<div class="mg-dd" id="mg-more-wrap">' +
      '<button type="button" class="mg-dd-btn mg-dd-btn-sm" id="mg-more-btn" title="Другие категории">Ещё…</button>' +
      '<div class="mg-dd-menu" id="mg-more-menu" hidden>' +
      menuItems(MORE_STATUS_OPTIONS, 'data-more-status') +
      '</div></div>' +
      '</div>' +
      '<div class="mg-label">Режим</div>' +
      '<div class="mg-chips" id="mg-modes">' +
      chip('mode', 'any', 'Все', true) +
      chip('mode', 'osu', 'osu!', false) +
      chip('mode', 'taiko', 'Taiko', false) +
      chip('mode', 'fruits', 'Catch', false) +
      chip('mode', 'mania', 'Mania', false) +
      '</div>' +
      '<div class="mg-list" id="mg-list"></div>' +
      '<div class="mg-footer">' +
      '<button type="button" class="mg-btn" id="mg-more" hidden>Показать ещё</button>' +
      '<div class="mg-line" id="mg-line"></div>' +
      '</div>' +
      // Mini-player (osu website style)
      '<div class="mg-player" id="mg-player">' +
      '<div class="mg-player-bar" id="mg-player-bar" title="Перемотка"><div class="mg-player-progress" id="mg-player-progress"></div></div>' +
      '<div class="mg-player-body">' +
      '<div class="mg-player-cover" id="mg-player-cover"></div>' +
      '<div class="mg-player-meta">' +
      '<div class="mg-player-title" id="mg-player-title">Нет трека</div>' +
      '<div class="mg-player-sub" id="mg-player-sub">Выберите карту ▶</div>' +
      '</div>' +
      '<div class="mg-player-controls">' +
      '<button type="button" class="mg-pbtn" id="mg-player-prev" title="Предыдущая">⏮</button>' +
      '<button type="button" class="mg-pbtn mg-pbtn-main" id="mg-player-play" title="Играть">▶</button>' +
      '<button type="button" class="mg-pbtn" id="mg-player-next" title="Следующая">⏭</button>' +
      '</div>' +
      '<div class="mg-player-vol" title="Громкость">' +
      '<span class="mg-vol-ico">♪</span>' +
      '<input type="range" class="mg-vol-range" id="mg-vol" min="0" max="100" value="55" />' +
      '<span class="mg-vol-label" id="mg-vol-label">55%</span>' +
      '</div>' +
      '</div></div>' +
      // Gameplay preview modal
      '<div class="mg-gp-modal" id="mg-gp-modal" hidden>' +
      '<div class="mg-gp-backdrop" id="mg-gp-backdrop"></div>' +
      '<div class="mg-gp-panel">' +
      '<div class="mg-gp-head">' +
      '<div class="mg-gp-head-text">' +
      '<div class="mg-gp-title" id="mg-gp-title">Превью</div>' +
      '<div class="mg-gp-sub" id="mg-gp-sub"></div>' +
      '</div>' +
      '<button type="button" class="mg-x" id="mg-gp-close" title="Закрыть">×</button>' +
      '</div>' +
      '<div class="mg-gp-diffs" id="mg-gp-diffs"></div>' +
      '<canvas class="mg-gp-canvas" id="mg-gp-canvas" width="640" height="480"></canvas>' +
      '</div></div>' +
      '</div>'

    document.documentElement.appendChild(rootEl)

    els = {
      authLabel: rootEl.querySelector('#mg-auth'),
      login: rootEl.querySelector('#mg-login'),
      close: rootEl.querySelector('#mg-close'),
      hint: rootEl.querySelector('#mg-hint'),
      q: rootEl.querySelector('#mg-q'),
      statuses: rootEl.querySelector('#mg-statuses'),
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

    bindUi()
    rootEl.style.display = 'none'
    syncPlayerUi()
  }

  function applyStyles() {
    var style = document.getElementById('tosu-gui-maps-style')
    if (!style) {
      style = document.createElement('style')
      style.id = 'tosu-gui-maps-style'
      document.documentElement.appendChild(style)
    }
    style.textContent = CSS_TEXT
  }

  async function show() {
    mount()
    applyStyles()
    visible = true
    if (rootEl) {
      rootEl.style.display = 'flex'
      rootEl.style.pointerEvents = 'auto'
      rootEl.removeAttribute('aria-hidden')
    }
    // restore filter UI — do NOT reset filter values
    syncFilterUi()
    syncPlayerUi()
    await refreshAuth()
    await refreshLocal()
    renderList()
    if (loggedIn && !didInitialSearch) {
      void search(false)
    } else if (loggedIn && sets.length) {
      setLine(sets.length + ' карт')
    }
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
  }

  function hide() {
    // Keep filters, sets, language, status, mode, query — only hide + stop audio
    visible = false
    stopPreview()
    closeGameplayPreview()
    closeMenus()
    if (rootEl) {
      rootEl.style.display = 'none'
      rootEl.style.pointerEvents = 'none'
      rootEl.setAttribute('aria-hidden', 'true')
    }
  }

  var CSS_TEXT =
    '#' +
    ROOT_ID +
    ',#' +
    ROOT_ID +
    ' *{user-select:none;-webkit-user-select:none}' +
    '#' +
    ROOT_ID +
    ' .mg-input,.mg-vol-range{user-select:text;-webkit-user-select:text}' +
    '#' +
    ROOT_ID +
    '{position:fixed;inset:0;z-index:2147483646;display:none;align-items:stretch;justify-content:flex-end;padding:12px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;color:rgba(255,255,255,.92);pointer-events:auto}' +
    '#' +
    ROOT_ID +
    ' .mg-shade{position:absolute;inset:0;background:rgba(0,0,0,.22)}' +
    '#' +
    ROOT_ID +
    ' .mg-panel{position:relative;z-index:1;width:min(640px,100%);height:100%;max-height:100%;min-height:0;display:flex;flex-direction:column;background:rgba(28,28,30,.97);border:1px solid rgba(255,255,255,.12);border-radius:12px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.5)}' +
    '#' +
    ROOT_ID +
    ' .mg-top{flex-shrink:0;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:10px;padding:16px 16px 8px 18px;min-height:52px;box-sizing:border-box}' +
    '#' +
    ROOT_ID +
    ' .mg-top-title{font-size:18px;font-weight:600;letter-spacing:-.02em;line-height:38px;height:38px;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-top-spacer{flex:1;min-width:8px}' +
    '#' +
    ROOT_ID +
    ' .mg-auth{font-size:13px;color:rgba(255,255,255,.58);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;line-height:38px;height:38px;flex-shrink:1}' +
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
    ' .mg-input{flex:1;min-width:0;height:40px;padding:0 12px;border-radius:8px;border:.5px solid rgba(255,255,255,.14);background:rgba(0,0,0,.35);color:rgba(255,255,255,.94);outline:none;font-size:15px;box-sizing:border-box}' +
    '#' +
    ROOT_ID +
    ' .mg-input:focus{border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.22)}' +
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
    ' .mg-dd-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:20;min-width:160px;max-height:240px;overflow:auto;padding:4px;border-radius:10px;background:rgba(36,36,40,.98);border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 32px rgba(0,0,0,.45)}' +
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
    ' .mg-player{flex-shrink:0;border-top:1px solid rgba(255,255,255,.1);background:rgba(18,18,20,.98)}' +
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
    // Gameplay modal
    '#' +
    ROOT_ID +
    ' .mg-gp-modal{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-modal[hidden]{display:none!important}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}' +
    '#' +
    ROOT_ID +
    ' .mg-gp-panel{position:relative;z-index:1;width:min(680px,100%);background:rgba(22,22,26,.98);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px;box-shadow:0 20px 48px rgba(0,0,0,.55)}' +
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
