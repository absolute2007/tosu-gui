const REPO = "absolute2007/tosu-gui";
const API = `https://api.github.com/repos/${REPO}/releases`;
const LANG_KEY = "tosu-gui-site-lang";

const versionSelect = document.getElementById("version");
const setupLink = document.getElementById("download-setup");
const zipLink = document.getElementById("download-zip");
const meta = document.getElementById("download-meta");

// Lightbox elements
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxTitle = document.getElementById("lightbox-title");
const lightboxDesc = document.getElementById("lightbox-desc");
const lightboxCounter = document.getElementById("lightbox-counter");
const lightboxPrev = document.getElementById("lightbox-prev");
const lightboxNext = document.getElementById("lightbox-next");

/** @type {{ tag: string, name: string, publishedAt: string, setup?: object, zip?: object }[]} */
let releases = [];

/** @type {"ru" | "en"} */
let lang = "ru";

let currentGalleryIndex = 0;
let lastFocusedElement = null;

const GALLERY = [
  {
    id: "main",
    src: "assets/screenshots/Main.png",
    titleKey: "shotMainTitle",
    descKey: "shotMainBody",
  },
  {
    id: "overlay",
    src: "assets/screenshots/Overlay.png",
    titleKey: "shotOverlayTitle",
    descKey: "shotOverlayBody",
  },
  {
    id: "panel",
    src: "assets/screenshots/OverlayPanel.png",
    titleKey: "shotPanelTitle",
    descKey: "shotPanelBody",
  },
  {
    id: "maps",
    src: "assets/screenshots/Maps.png",
    titleKey: "shotMapsTitle",
    descKey: "shotMapsBody",
  },
  {
    id: "preview",
    src: "assets/screenshots/Preview.png",
    titleKey: "shotPreviewTitle",
    descKey: "shotPreviewBody",
  },
  {
    id: "skins",
    src: "assets/screenshots/Skins.png",
    titleKey: "shotSkinsTitle",
    descKey: "shotSkinsBody",
  },
];

const I18N = {
  ru: {
    lead:
      'Десктопный GUI для <a href="https://github.com/tosuapp/tosu" rel="noopener noreferrer">tosu</a> — memory reader для osu! с in-game оверлеем. Статус, счётчики, карты, скины, оверлей и настройки в обычном окне. <code>tosu.exe</code> уже внутри сборки.',
    download: "Скачать",
    version: "Версия",
    loading: "Загрузка списка релизов…",
    allReleases: "Все релизы",
    noRelease: "Релиз не выбран.",
    noReleases: "Нет релизов",
    noFiles: "Релизы с файлами не найдены.",
    noAssets: "Нет файлов в этом релизе.",
    loadError: "Не удалось загрузить релизы. Откройте страницу releases на GitHub.",
    error: "Ошибка",
    latest: "latest",
    altMain: "Главное окно: статус tosu и подключение к osu!",
    altOverlay: "Настройки внутриигрового оверлея и PP-счётчиков",
    altMaps: "Браузер карт: поиск, фильтры и скачивание",
    altPreview: "Интерактивное превью нот, слайдеров и реплея",
    altSkins: "Каталог скинов: поиск, фильтры и установка",
    shotMainTitle: "Статус",
    shotMainBody:
      "Состояние tosu и osu! в одном окне: работает ли reader, найдена ли игра, версия и порт API. Перезапуск tosu и проверка обновлений — без браузера.",
    shotOverlayTitle: "Оверлей",
    shotOverlayBody:
      "Внутриигровой оверлей поверх osu!: быстрый вызов по Ctrl+Shift+M, поиск и скачивание карт прямо во время игры в любом режиме экрана. PP-счётчики настраиваются прямо в клиенте.",
    shotPanelTitle: "Внутриигровая панель",
    shotPanelBody:
      "Компактная панель прямо в игре: быстрый доступ к каталогу карт, загрузка в один клик и управление активным треком.",
    shotMapsTitle: "Карты",
    shotMapsBody:
      "Поиск и скачивание beatmap-сетов с osu.ppy.sh. Фильтры по статусу, режиму и языку, превью трека и установка в Songs — в GUI и во внутриигровой панели.",
    shotPreviewTitle: "Превью карт",
    shotPreviewBody:
      "Интерактивное превью нот, слайдеров и реплея со скином vv_idke_trail и хитсаундами. Точная синхронизация с аудиодорожкой.",
    shotSkinsTitle: "Скины",
    shotSkinsBody:
      "Каталог skins.osuck.net: поиск, фильтры по режиму, превью скриншотов и установка .osk в папку Skins. Быстрый поиск и индикаторы уже установленных скинов.",
  },
  en: {
    lead:
      'Desktop GUI for <a href="https://github.com/tosuapp/tosu" rel="noopener noreferrer">tosu</a> — an osu! memory reader with an in-game overlay. Status, counters, maps, skins, overlay, and settings in a normal window. <code>tosu.exe</code> is bundled.',
    download: "Download",
    version: "Version",
    loading: "Loading releases…",
    allReleases: "All releases",
    noRelease: "No release selected.",
    noReleases: "No releases",
    noFiles: "No releases with files found.",
    noAssets: "No files in this release.",
    loadError: "Could not load releases. Open the GitHub releases page.",
    error: "Error",
    latest: "latest",
    altMain: "Main window: tosu status and osu! connection",
    altOverlay: "In-game overlay inside osu!",
    altMaps: "Maps browser: search, filters, and download",
    altPreview: "Interactive map and replay preview",
    altSkins: "Skins catalog: search, filters, and install",
    shotMainTitle: "Status",
    shotMainBody:
      "tosu and osu! health in one place: reader running, game detected, API version and port. Restart tosu and check updates without opening a browser.",
    shotOverlayTitle: "Overlay",
    shotOverlayBody:
      "In-game overlay inside osu!: press Ctrl+Shift+M to search and download beatmaps directly during gameplay in any screen mode. PP counters can be moved in-game.",
    shotPanelTitle: "In-game Panel",
    shotPanelBody:
      "Compact overlay sidebar: quick beatmap catalog search, instant download, and current track controls directly inside osu!.",
    shotMapsTitle: "Maps",
    shotMapsBody:
      "Search and download beatmap sets from osu.ppy.sh. Status, mode, and language filters, track preview, and install into Songs — in the GUI and the in-game panel.",
    shotPreviewTitle: "Map Preview",
    shotPreviewBody:
      "Interactive replay preview with hit objects, sliders, vv_idke_trail skin, and hitsounds synchronized to the audio track.",
    shotSkinsTitle: "Skins",
    shotSkinsBody:
      "Browse skins.osuck.net: search, mode filters, screenshot previews, and install .osk directly into your Skins folder.",
  },
};

function t(key) {
  return I18N[lang][key] || I18N.en[key] || key;
}

function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("ru") ? "ru" : "en";
}

function applyLang(next) {
  lang = next === "en" ? "en" : "ru";
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const value = t(key);
    if (key === "lead") el.innerHTML = value;
    else el.textContent = value;
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    const isOn = btn.getAttribute("data-lang") === lang;
    btn.setAttribute("aria-pressed", isOn ? "true" : "false");
  });

  const alts = [
    [".shot-main-img", "altMain"],
    [".shot-overlay-img", "altOverlay"],
    [".shot-maps-img", "altMaps"],
    [".shot-preview-img", "altPreview"],
    [".shot-skins-img", "altSkins"],
  ];
  for (const [sel, key] of alts) {
    const img = document.querySelector(sel);
    if (img) img.alt = t(key);
  }

  if (lightbox && lightbox.classList.contains("is-open")) {
    updateLightboxContent();
  }

  if (releases.length) updateDownloadUi();
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function pickAssets(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const setup =
    list.find((a) => /\.exe$/i.test(a.name) && /setup/i.test(a.name)) ||
    list.find((a) => /\.exe$/i.test(a.name));
  const zip =
    list.find((a) => /\.zip$/i.test(a.name) && /win/i.test(a.name)) ||
    list.find((a) => /\.zip$/i.test(a.name));
  return { setup, zip };
}

function setLink(el, asset) {
  if (asset?.browser_download_url) {
    el.href = asset.browser_download_url;
    el.removeAttribute("aria-disabled");
    el.title = asset.name;
  } else {
    el.href = "#";
    el.setAttribute("aria-disabled", "true");
    el.removeAttribute("title");
  }
}

function updateDownloadUi() {
  const tag = versionSelect.value;
  const release = releases.find((r) => r.tag === tag);
  if (!release) {
    setLink(setupLink, null);
    setLink(zipLink, null);
    meta.textContent = t("noRelease");
    return;
  }

  setLink(setupLink, release.setup);
  setLink(zipLink, release.zip);

  const parts = [];
  if (release.setup) parts.push(`Setup ${formatBytes(release.setup.size)}`);
  if (release.zip) parts.push(`ZIP ${formatBytes(release.zip.size)}`);
  if (release.publishedAt) parts.push(formatDate(release.publishedAt));
  meta.textContent = parts.join(" · ") || t("noAssets");
  meta.classList.remove("-error");
}

function normalizeReleases(data) {
  return (Array.isArray(data) ? data : [])
    .filter((r) => !r.draft)
    .map((r) => {
      const { setup, zip } = pickAssets(r.assets);
      return {
        tag: r.tag_name,
        name: r.name || r.tag_name,
        publishedAt: r.published_at,
        setup,
        zip,
      };
    })
    .filter((r) => r.setup || r.zip);
}

function applyReleases(list) {
  releases = list;
  if (!releases.length) {
    versionSelect.innerHTML = `<option value="">${t("noReleases")}</option>`;
    meta.textContent = t("noFiles");
    meta.classList.add("-error");
    return;
  }

  versionSelect.innerHTML = releases
    .map((r, i) => {
      const label = i === 0 ? `${r.tag} (${t("latest")})` : r.tag;
      return `<option value="${r.tag}">${label}</option>`;
    })
    .join("");
  versionSelect.disabled = false;
  versionSelect.value = releases[0].tag;
  updateDownloadUi();
}

async function fetchJson(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (/api\.github\.com/i.test(url)) {
    headers.Accept = "application/vnd.github+json";
  } else if (!headers.Accept) {
    headers.Accept = "application/json";
  }
  const res = await fetch(url, { cache: "no-store", ...opts, headers });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function versionKey(tag) {
  const m = String(tag || "")
    .replace(/^v/i, "")
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => parseInt(n, 10) || 0);
  while (m.length < 4) m.push(0);
  return m;
}

function compareTagsDesc(a, b) {
  const aa = versionKey(a);
  const bb = versionKey(b);
  for (let i = 0; i < aa.length; i++) {
    if (bb[i] !== aa[i]) return bb[i] - aa[i];
  }
  return 0;
}

function mergeReleaseLists(...lists) {
  /** @type {Map<string, any>} */
  const byTag = new Map();
  for (const list of lists) {
    for (const r of Array.isArray(list) ? list : []) {
      if (!r || r.draft || !r.tag_name) continue;
      const prev = byTag.get(r.tag_name);
      if (!prev) {
        byTag.set(r.tag_name, r);
        continue;
      }
      const prevN = Array.isArray(prev.assets) ? prev.assets.length : 0;
      const nextN = Array.isArray(r.assets) ? r.assets.length : 0;
      if (nextN > prevN) byTag.set(r.tag_name, r);
      else if (nextN === prevN) {
        const pt = Date.parse(prev.published_at || 0) || 0;
        const nt = Date.parse(r.published_at || 0) || 0;
        if (nt >= pt) byTag.set(r.tag_name, r);
      }
    }
  }
  return [...byTag.values()].sort((a, b) => {
    const byVer = compareTagsDesc(a.tag_name, b.tag_name);
    if (byVer) return byVer;
    return (Date.parse(b.published_at || 0) || 0) - (Date.parse(a.published_at || 0) || 0);
  });
}

async function loadReleases() {
  try {
    const apiP = fetchJson(API).catch((err) => {
      console.warn("[releases] GitHub API:", err);
      return null;
    });
    const localP = fetchJson(`releases.json?v=${Date.now()}`).catch((err) => {
      console.warn("[releases] local fallback:", err);
      return null;
    });
    const [apiData, localData] = await Promise.all([apiP, localP]);
    const merged = mergeReleaseLists(apiData, localData);
    const list = normalizeReleases(merged);
    if (!list.length) throw new Error("empty release list");
    applyReleases(list);
  } catch (err) {
    console.error(err);
    versionSelect.innerHTML = `<option value="">${t("error")}</option>`;
    meta.textContent = t("loadError");
    meta.classList.add("-error");
    setupLink.href = `https://github.com/${REPO}/releases/latest`;
    setupLink.removeAttribute("aria-disabled");
    zipLink.href = `https://github.com/${REPO}/releases`;
    zipLink.removeAttribute("aria-disabled");
  }
}

/* ==========================================================================
   LIGHTBOX / IMAGE VIEWER
   ========================================================================== */

function updateLightboxContent() {
  const item = GALLERY[currentGalleryIndex];
  if (!item) return;

  lightboxImg.classList.add("is-loading");
  lightboxImg.src = item.src;
  lightboxImg.alt = t(item.titleKey);
  lightboxImg.onload = () => {
    lightboxImg.classList.remove("is-loading");
  };

  lightboxTitle.textContent = t(item.titleKey);
  lightboxDesc.textContent = t(item.descKey);
  lightboxCounter.textContent = `${currentGalleryIndex + 1} / ${GALLERY.length}`;
}

function openLightbox(indexOrId) {
  let index = 0;
  if (typeof indexOrId === "number") {
    index = indexOrId;
  } else {
    index = GALLERY.findIndex((item) => item.id === indexOrId);
    if (index === -1) index = 0;
  }

  currentGalleryIndex = index;
  lastFocusedElement = document.activeElement;

  updateLightboxContent();

  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (lightboxPrev) lightboxPrev.focus();
}

function closeLightbox() {
  if (!lightbox.classList.contains("is-open")) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function nextLightbox() {
  currentGalleryIndex = (currentGalleryIndex + 1) % GALLERY.length;
  updateLightboxContent();
}

function prevLightbox() {
  currentGalleryIndex = (currentGalleryIndex - 1 + GALLERY.length) % GALLERY.length;
  updateLightboxContent();
}

function initLightbox() {
  document.querySelectorAll("[data-gallery-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const id = el.getAttribute("data-gallery-id");
      openLightbox(id);
    });
  });

  document.querySelectorAll("[data-close-lightbox]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeLightbox();
    });
  });

  if (lightboxPrev) lightboxPrev.addEventListener("click", prevLightbox);
  if (lightboxNext) lightboxNext.addEventListener("click", nextLightbox);

  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("is-open")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextLightbox();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevLightbox();
    }
  });
}

/* ==========================================================================
   DYNAMIC WINDING CONNECTOR LINE
   ========================================================================== */

function drawConnectorPath() {
  const shotsSection = document.querySelector(".shots");
  const svg = document.querySelector(".shots-connector-svg");
  const linePath = document.querySelector(".connector-path");
  const dotsGroup = document.querySelector(".connector-dots");

  if (!shotsSection || !svg || !linePath) return;

  const rows = Array.from(shotsSection.querySelectorAll(".shot-row"));
  if (rows.length < 2) return;

  const sectionRect = shotsSection.getBoundingClientRect();
  if (sectionRect.width === 0 || sectionRect.height === 0) return;

  const isWide = window.innerWidth > 768;
  const anchors = [];

  rows.forEach((row, i) => {
    const media = row.querySelector(".shot-media");
    if (!media) return;
    const mRect = media.getBoundingClientRect();

    const relLeft = mRect.left - sectionRect.left;
    const relRight = mRect.right - sectionRect.left;
    const relTop = mRect.top - sectionRect.top;
    const relBottom = mRect.bottom - sectionRect.top;
    const relCx = (relLeft + relRight) / 2;
    const relCy = (relTop + relBottom) / 2;

    const isFlip = row.classList.contains("-flip");

    if (isWide) {
      // Desktop: alternating anchors linking the cards
      if (!isFlip) {
        // Left column media: start anchor near bottom-right
        anchors.push({
          x: relRight - 16,
          y: relBottom - 24,
          side: "left",
          cx: relCx,
          cy: relCy,
          top: relTop,
          bottom: relBottom,
        });
      } else {
        // Right column media: anchor near top-left or bottom-left
        anchors.push({
          x: relLeft + 16,
          y: relTop + 24,
          side: "right",
          cx: relCx,
          cy: relCy,
          top: relTop,
          bottom: relBottom,
        });
      }
    } else {
      // Mobile: vertically stacked, subtle wave
      const waveOffset = (i % 2 === 0 ? 1 : -1) * (mRect.width * 0.28);
      anchors.push({
        x: Math.max(20, Math.min(sectionRect.width - 20, relCx + waveOffset)),
        y: relCy,
        side: "center",
        cx: relCx,
        cy: relCy,
        top: relTop,
        bottom: relBottom,
      });
    }
  });

  if (anchors.length < 2) return;

  let d = `M ${anchors[0].x.toFixed(1)} ${anchors[0].y.toFixed(1)}`;
  let dotsSvg = "";

  // Render anchor node circles
  anchors.forEach((pt) => {
    dotsSvg += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="5" class="connector-node-outer" />`;
    dotsSvg += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="2" class="connector-node-inner" />`;
  });

  for (let i = 0; i < anchors.length - 1; i++) {
    const p1 = anchors[i];
    const p2 = anchors[i + 1];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    if (isWide) {
      // S-curve winding around the text between rows
      const cp1x = p1.x + dx * 0.45;
      const cp1y = p1.y + dy * 0.15;
      const cp2x = p2.x - dx * 0.45;
      const cp2y = p2.y - dy * 0.15;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    } else {
      // Mobile curve
      const cp1x = p1.x;
      const cp1y = p1.y + dy * 0.5;
      const cp2x = p2.x;
      const cp2y = p2.y - dy * 0.5;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
  }

  linePath.setAttribute("d", d);
  if (dotsGroup) dotsGroup.innerHTML = dotsSvg;
}

function initConnector() {
  const shotsSection = document.querySelector(".shots");
  if (!shotsSection) return;

  drawConnectorPath();

  // Redraw when images finish loading
  document.querySelectorAll(".shots img").forEach((img) => {
    if (img.complete) {
      drawConnectorPath();
    } else {
      img.addEventListener("load", drawConnectorPath, { once: true });
    }
  });

  // Redraw on resize
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawConnectorPath, 50);
  });

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      drawConnectorPath();
    });
    observer.observe(shotsSection);
  }
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyLang(btn.getAttribute("data-lang") || "en");
    drawConnectorPath();
  });
});

versionSelect.addEventListener("change", updateDownloadUi);

applyLang(detectLang());
loadReleases();
initLightbox();
initConnector();

