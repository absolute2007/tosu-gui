/* In-game Maps Browser — tosu inject overlay + localhost API from tosu GUI */
;(function () {
  const API = 'http://127.0.0.1:24777'

  const el = {
    authLabel: document.getElementById('auth-label'),
    login: document.getElementById('btn-login'),
    hint: document.getElementById('hint'),
    q: document.getElementById('q'),
    statuses: document.getElementById('statuses'),
    modes: document.getElementById('modes'),
    list: document.getElementById('list'),
    more: document.getElementById('btn-more'),
    line: document.getElementById('status-line'),
  }

  let mode = 'any'
  let statusFilter = 'ranked'
  let page = 0
  let cursor = null
  let hasMore = false
  let loading = false
  let sets = []
  let localIds = new Set()
  let loggedIn = false
  let username = ''
  let downloads = {}
  let debounceTimer = null
  let apiOk = false
  let overlayKeybind = ''

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
      el.hint.textContent = 'Запусти tosu GUI — без него поиск и скачивание не работают.'
      return
    }
    if (!loggedIn) {
      el.hint.textContent = 'Войдите в osu!, затем ищите и качайте. Закрыть: «' + mapsKeybind + '».'
      return
    }
    el.hint.textContent =
      'Ввод активен. Скачивай карты. Закрыть панель: «' + mapsKeybind + '».'
  }

  function updateAuthUi() {
    if (!apiOk) {
      el.authLabel.textContent = 'GUI offline'
      el.authLabel.hidden = false
      el.login.hidden = true
      return
    }
    if (loggedIn) {
      el.authLabel.textContent = 'Вы вошли как ' + (username || 'osu!')
      el.authLabel.hidden = false
      el.login.hidden = true
    } else {
      el.authLabel.textContent = 'Не вошли'
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
      const a = await api('/api/maps/auth')
      loggedIn = !!a.loggedIn
      username = a.username || ''
    } catch {
      loggedIn = false
      username = ''
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

  function stars(s) {
    if (!s.maxStars) return '—'
    if (Math.abs(s.maxStars - s.minStars) < 0.05) return s.maxStars.toFixed(2)
    return s.minStars.toFixed(1) + '–' + s.maxStars.toFixed(1)
  }

  function render() {
    if (!sets.length) {
      el.list.innerHTML =
        '<div class="empty">' +
        (loading ? 'Поиск…' : loggedIn ? 'Ничего нет' : 'Войдите, чтобы искать') +
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
          btn = '<button type="button" class="btn -owned" disabled>Есть</button>'
        } else if (busy) {
          btn =
            '<button type="button" class="btn -busy" data-cancel="' +
            s.id +
            '">✕ ' +
            pct +
            '%</button>'
        } else {
          btn =
            '<button type="button" class="btn -primary" data-dl="' + s.id + '">Скачать</button>'
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
          ' · ' +
          stars(s) +
          '★ · ' +
          escapeHtml(s.status) +
          '</div></div>' +
          btn +
          '</div>'
        )
      })
      .join('')

    el.more.hidden = !hasMore
  }

  async function search(append) {
    if (loading) return
    if (!apiOk && !(await checkApi())) return
    if (!loggedIn) {
      setLine('Сначала войдите')
      return
    }

    loading = true
    if (!append) {
      page = 0
      cursor = null
      sets = []
      render()
    }
    setLine(append ? 'Ещё…' : 'Поиск…')

    try {
      const sp = new URLSearchParams()
      sp.set('q', el.q.value.trim())
      sp.set('mode', mode)
      sp.set('status', statusFilter)
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
      setLine(sets.length ? sets.length + ' карт' : 'Пусто')
    } catch (err) {
      setLine(err.message || 'Ошибка поиска')
      if (!append) sets = []
    } finally {
      loading = false
      render()
    }
  }

  el.list.addEventListener('click', function (e) {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
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
            setLine(r.error || 'Ошибка')
          }
          render()
        })
        .catch(function (err) {
          downloads[id] = { setId: id, phase: 'error', progress: 0 }
          setLine(err.message || 'Ошибка')
          render()
        })
    }
  })

  el.login.addEventListener('click', function () {
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

  el.more.addEventListener('click', function () {
    void search(true)
  })

  el.q.addEventListener('input', function () {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(function () {
      void search(false)
    }, 400)
  })

  el.statuses.addEventListener('click', function (e) {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    const s = t.getAttribute('data-status')
    if (!s) return
    statusFilter = s
    el.statuses.querySelectorAll('.chip').forEach(function (b) {
      b.classList.toggle('-on', b.getAttribute('data-status') === statusFilter)
    })
    void search(false)
  })

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

  void (async function boot() {
    await refreshAuth()
    await refreshLocal()
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
