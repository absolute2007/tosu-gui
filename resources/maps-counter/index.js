/* In-game Maps Browser — tosu inject overlay + localhost API from tosu GUI */
;(function () {
  const API = 'http://127.0.0.1:24777'

  const el = {
    authLabel: document.getElementById('auth-label'),
    login: document.getElementById('btn-login'),
    hint: document.getElementById('hint'),
    q: document.getElementById('q'),
    language: document.getElementById('language'),
    statuses: document.getElementById('statuses'),
    moreStatus: document.getElementById('more-status'),
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
  let downloads = {}
  let debounceTimer = null
  let apiOk = false
  let overlayKeybind = ''
  let previewId = null
  let previewAudio = null

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
      setLine('Превью недоступно')
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
        render()
      })
      previewAudio.addEventListener('error', function () {
        previewId = null
        setLine('Не удалось воспроизвести превью')
        render()
      })
    }
    try {
      previewAudio.pause()
      previewAudio.src = url
      previewId = id
      render()
      void previewAudio.play().catch(function () {
        previewId = null
        setLine('Не удалось воспроизвести превью')
        render()
      })
    } catch {
      previewId = null
      setLine('Не удалось воспроизвести превью')
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
    var abs = Math.abs(n) % 100
    var rem = abs % 10
    if (abs > 10 && abs < 20) return n + ' сложностей'
    if (rem > 1 && rem < 5) return n + ' сложности'
    if (rem === 1) return n + ' сложность'
    return n + ' сложностей'
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
