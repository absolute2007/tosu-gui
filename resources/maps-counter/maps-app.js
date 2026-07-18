/**
 * Same-document Maps panel for tosu inject overlay.
 * Mount once, show/hide instantly — keeps filters, results, login.
 * Close: console marker read by overlay-patch (no page reload).
 */
;(function (global) {
  var APP_VERSION = 12
  // Hot-reload UI after updates without restarting osu
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
  var previewId = null
  var previewAudio = null

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
    // overlay-patch listens for this marker
    console.log('__TOSU_GUI_MAPS_CLOSE__')
  }

  function previewUrlFor(s) {
    if (s && s.previewUrl) return s.previewUrl
    if (s && s.id) return 'https://b.ppy.sh/preview/' + s.id + '.mp3'
    return ''
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
  }

  function togglePreview(id) {
    var set = sets.find(function (s) {
      return s.id === id
    })
    var url = previewUrlFor(set)
    if (!url) {
      setLine('Превью недоступно')
      return
    }
    if (previewId === id) {
      stopPreview()
      renderList()
      return
    }
    if (!previewAudio) {
      previewAudio = new Audio()
      previewAudio.preload = 'none'
      previewAudio.addEventListener('ended', function () {
        previewId = null
        if (visible) renderList()
      })
      previewAudio.addEventListener('error', function () {
        previewId = null
        setLine('Не удалось воспроизвести превью')
        if (visible) renderList()
      })
    }
    try {
      previewAudio.pause()
      previewAudio.src = url
      previewId = id
      renderList()
      void previewAudio.play().catch(function () {
        previewId = null
        setLine('Не удалось воспроизвести превью')
        renderList()
      })
    } catch (e) {
      previewId = null
      setLine('Не удалось воспроизвести превью')
      renderList()
    }
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
    els.hint.textContent = 'Ввод активен · «' + mapsKeybind + '» или ✕ — закрыть'
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
    if (els.list) {
      els.list.classList.toggle('-loading', !!isLoading)
    }
    if (els.refresh) {
      els.refresh.classList.toggle('-spin', !!isLoading)
      els.refresh.disabled = !!isLoading
    }
    if (els.more) {
      els.more.disabled = !!isLoading
    }
    if (isLoading) {
      setLine(message || 'Загрузка…')
    }
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
        var playing = previewId === s.id
        var previewBtn =
          '<button type="button" class="mg-btn mg-preview' +
          (playing ? ' -playing' : '') +
          '" data-preview="' +
          s.id +
          '" title="' +
          (playing ? 'Стоп' : 'Превью') +
          '">' +
          (playing ? '❚❚' : '▶') +
          '</button>'
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
    // Allow filter changes to supersede an in-flight search (first click must always win)
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
      }
    }
  }

  function applyChipGroup(container, attr, value) {
    if (!container) return
    container.querySelectorAll('.mg-chip').forEach(function (b) {
      b.classList.toggle('-on', b.getAttribute(attr) === value)
    })
  }

  function onChipPointer(container, attr, applyValue) {
    var lastAt = 0
    function handle(e) {
      var t = e.target
      if (!(t instanceof Element)) return
      var chip = t.closest ? t.closest('.mg-chip') : null
      if (!chip) {
        // fallback if closest missing
        chip = t.classList && t.classList.contains('mg-chip') ? t : null
      }
      if (!chip || !container.contains(chip)) return
      // debounce double pointerdown+click from overlay
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
      applyChipGroup(container, attr, v)
      void search(false)
    }
    container.addEventListener('pointerdown', handle, true)
    container.addEventListener('click', handle, true)
  }

  function bindUi() {
    els.login.addEventListener('click', function () {
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
      // Force full refresh of current filters (new ranked maps, etc.)
      didInitialSearch = false
      void search(false)
    })

    els.q.addEventListener('input', function () {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(function () {
        void search(false)
      }, 400)
    })

    onChipPointer(els.statuses, 'data-status', function (v) {
      statusFilter = v
      syncMoreStatusSelect()
    })
    onChipPointer(els.modes, 'data-mode', function (v) {
      mode = v
    })

    if (els.moreStatus) {
      els.moreStatus.addEventListener('change', function () {
        var v = els.moreStatus.value
        if (!v) return
        statusFilter = v
        applyChipGroup(els.statuses, 'data-status', statusFilter)
        syncMoreStatusSelect()
        void search(false)
      })
    }
    if (els.language) {
      els.language.addEventListener('change', function () {
        languageFilter = els.language.value || 'any'
        void search(false)
      })
    }

    els.list.addEventListener('click', function (e) {
      var t = e.target
      if (!(t instanceof HTMLElement)) return
      var previewBtn = t.closest ? t.closest('[data-preview]') : null
      var previewAttr =
        (previewBtn && previewBtn.getAttribute('data-preview')) || t.getAttribute('data-preview')
      if (previewAttr) {
        togglePreview(Number(previewAttr))
        return
      }
      var cancelId = t.getAttribute('data-cancel')
      var dlId = t.getAttribute('data-dl')
      if (cancelId) {
        void api('/api/maps/cancel', {
          method: 'POST',
          body: JSON.stringify({ setId: Number(cancelId) }),
        })
        return
      }
      if (dlId) {
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
    })

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
      '<select class="mg-select" id="mg-language" title="Язык" aria-label="Язык">' +
      langOpt('any', 'Любой язык', true) +
      langOpt('english', 'English', false) +
      langOpt('japanese', 'Japanese', false) +
      langOpt('chinese', 'Chinese', false) +
      langOpt('korean', 'Korean', false) +
      langOpt('russian', 'Russian', false) +
      langOpt('instrumental', 'Instrumental', false) +
      langOpt('french', 'French', false) +
      langOpt('german', 'German', false) +
      langOpt('spanish', 'Spanish', false) +
      langOpt('italian', 'Italian', false) +
      langOpt('swedish', 'Swedish', false) +
      langOpt('polish', 'Polish', false) +
      langOpt('unspecified', 'Не указан', false) +
      langOpt('other', 'Другой', false) +
      '</select>' +
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
      '<select class="mg-select mg-select-more" id="mg-more-status" title="Другие категории" aria-label="Другие категории">' +
      '<option value="">Ещё…</option>' +
      '<option value="pending">На рассмотрении</option>' +
      '<option value="wip">В разработке</option>' +
      '<option value="graveyard">Graveyard</option>' +
      '<option value="favourites">Избранное</option>' +
      '<option value="mine">Мои карты</option>' +
      '</select>' +
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
      '</div></div>'

    document.documentElement.appendChild(rootEl)

    els = {
      authLabel: rootEl.querySelector('#mg-auth'),
      login: rootEl.querySelector('#mg-login'),
      close: rootEl.querySelector('#mg-close'),
      hint: rootEl.querySelector('#mg-hint'),
      q: rootEl.querySelector('#mg-q'),
      statuses: rootEl.querySelector('#mg-statuses'),
      modes: rootEl.querySelector('#mg-modes'),
      language: rootEl.querySelector('#mg-language'),
      moreStatus: rootEl.querySelector('#mg-more-status'),
      list: rootEl.querySelector('#mg-list'),
      more: rootEl.querySelector('#mg-more'),
      line: rootEl.querySelector('#mg-line'),
      refresh: rootEl.querySelector('#mg-refresh'),
      shade: rootEl.querySelector('.mg-shade'),
    }

    els.shade.addEventListener('click', function () {
      requestClose()
    })

    bindUi()
    rootEl.style.display = 'none'
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

  function langOpt(value, label, selected) {
    return (
      '<option value="' +
      value +
      '"' +
      (selected ? ' selected' : '') +
      '>' +
      label +
      '</option>'
    )
  }

  function syncMoreStatusSelect() {
    if (!els.moreStatus) return
    var isMore = !!MORE_STATUSES[statusFilter]
    els.moreStatus.value = isMore ? statusFilter : ''
    els.moreStatus.classList.toggle('-active', isMore)
  }

  function syncFilterUi() {
    if (els.statuses) {
      applyChipGroup(els.statuses, 'data-status', statusFilter)
    }
    if (els.modes) {
      applyChipGroup(els.modes, 'data-mode', mode)
    }
    if (els.language) {
      els.language.value = languageFilter || 'any'
    }
    syncMoreStatusSelect()
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
    applyStyles() // always refresh CSS (fixes stale styles after updates)
    visible = true
    rootEl.style.display = 'flex'
    // restore chip / select UI state
    syncFilterUi()
    await refreshAuth()
    await refreshLocal()
    renderList()
    // Only auto-search first time when empty; keep results on reopen
    if (loggedIn && !didInitialSearch) {
      void search(false)
    } else if (loggedIn && sets.length) {
      setLine(sets.length + ' карт')
    }
    // Focus search for typing / layout
    setTimeout(function () {
      try {
        if (els.q) {
          els.q.focus({ preventScroll: true })
        }
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
    visible = false
    stopPreview()
    if (rootEl) rootEl.style.display = 'none'
  }

  var CSS_TEXT =
    '#' +
    ROOT_ID +
    ',#' +
    ROOT_ID +
    ' *{user-select:none;-webkit-user-select:none}' +
    '#' +
    ROOT_ID +
    ' .mg-input,.mg-select{user-select:text;-webkit-user-select:text}' +
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
    ' .mg-top{flex-shrink:0;display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:10px;padding:20px 16px 10px 18px;min-height:56px;box-sizing:border-box}' +
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
    ' .mg-hint{flex-shrink:0;padding:0 18px 12px;margin:0;font-size:12px;line-height:1.4;color:rgba(255,255,255,.42)}' +
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
    ' .mg-select{height:40px;padding:0 10px;border-radius:8px;border:.5px solid rgba(255,255,255,.14);background:rgba(0,0,0,.35);color:rgba(255,255,255,.92);outline:none;font-size:13px;box-sizing:border-box;cursor:pointer;max-width:150px;flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-select:focus{border-color:#0a84ff}' +
    '#' +
    ROOT_ID +
    ' .mg-select-more{height:32px;max-width:148px;font-size:12px}' +
    '#' +
    ROOT_ID +
    ' .mg-select-more.-active{border-color:rgba(10,132,255,.55);color:#fff}' +
    '#' +
    ROOT_ID +
    ' .mg-status-row{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 16px 10px;min-width:0}' +
    '#' +
    ROOT_ID +
    ' .mg-refresh{width:40px;height:40px;padding:0;flex-shrink:0;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center}' +
    '#' +
    ROOT_ID +
    ' .mg-refresh:active{transform:rotate(-30deg)}' +
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
    ' .mg-list{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:0 12px 12px;position:relative}' +
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
    ' .mg-empty-text{font-size:15px}' +
    '#' +
    ROOT_ID +
    ' .mg-row{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:10px;margin-bottom:8px;min-height:68px;background:rgba(255,255,255,.04);border-left:3px solid transparent}' +
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
    ' .mg-cover{width:80px;height:56px;border-radius:7px;object-fit:cover;background:rgba(255,255,255,.06);flex-shrink:0}' +
    '#' +
    ROOT_ID +
    ' .mg-meta{flex:1;min-width:0}' +
    '#' +
    ROOT_ID +
    ' .mg-title{font-size:16px;font-weight:600;letter-spacing:-.015em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#' +
    ROOT_ID +
    ' .mg-sub{margin-top:5px;font-size:13px;line-height:1.3;color:rgba(255,255,255,.52);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#' +
    ROOT_ID +
    ' .mg-badge{display:inline-block;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;vertical-align:middle}' +
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
    ' .mg-actions{flex-shrink:0;display:flex;align-items:center;gap:6px}' +
    '#' +
    ROOT_ID +
    ' .mg-btn{flex-shrink:0;height:36px;padding:0 14px;border-radius:8px;border:.5px solid rgba(255,255,255,.12);background:rgba(255,255,255,.09);color:rgba(255,255,255,.92);cursor:pointer;font-size:14px;white-space:nowrap}' +
    '#' +
    ROOT_ID +
    ' .mg-btn:disabled{opacity:.45;cursor:default}' +
    '#' +
    ROOT_ID +
    ' .mg-preview{width:36px;min-width:36px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:12px}' +
    '#' +
    ROOT_ID +
    ' .mg-preview.-playing{color:#0a84ff;border-color:rgba(10,132,255,.4);background:rgba(10,132,255,.16)}' +
    '#' +
    ROOT_ID +
    ' .mg-primary{background:#0a84ff;border-color:transparent;color:#fff}' +
    '#' +
    ROOT_ID +
    ' .mg-owned{color:#32d74b;border-color:rgba(50,215,75,.3)}' +
    '#' +
    ROOT_ID +
    ' .mg-busy{color:#ff453a;border-color:rgba(255,69,58,.3);min-width:80px}' +
    '#' +
    ROOT_ID +
    ' .mg-footer{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 16px 14px;border-top:1px solid rgba(255,255,255,.08)}' +
    '#' +
    ROOT_ID +
    ' .mg-line{font-size:13px;color:rgba(255,255,255,.45);min-height:16px;text-align:center}'

  // inject CSS once via style tag in mount — already in mount as style.textContent
  // Fix: mount() creates style with CSS_TEXT but I put CSS_TEXT after mount uses it - order in file: CSS_TEXT is defined before mount uses it... actually CSS_TEXT is after mount function. In JS function mount runs later so CSS_TEXT exists. Good.

  // Patch mount to use CSS_TEXT - I referenced CSS_TEXT inside mount before defining it in the source order. At runtime mount() is called after full parse, so CSS_TEXT is defined. OK.

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
