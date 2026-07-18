const REPO = "absolute2007/tosu-gui";
const API = `https://api.github.com/repos/${REPO}/releases`;
const LANG_KEY = "tosu-gui-site-lang";

const versionSelect = document.getElementById("version");
const setupLink = document.getElementById("download-setup");
const zipLink = document.getElementById("download-zip");
const meta = document.getElementById("download-meta");

/** @type {{ tag: string, name: string, publishedAt: string, setup?: object, zip?: object }[]} */
let releases = [];

/** @type {"ru" | "en"} */
let lang = "ru";

const I18N = {
  ru: {
    lead:
      'Десктопный GUI для <a href="https://github.com/tosuapp/tosu" rel="noopener noreferrer">tosu</a> — memory reader для osu! с in-game оверлеем. Статус, счётчики, браузер карт, оверлей и настройки в обычном окне. <code>tosu.exe</code> уже внутри сборки.',
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
    shotMainTitle: "Статус",
    shotMainBody:
      "Состояние tosu и osu! в одном окне: работает ли reader, найдена ли игра, версия и порт API. Перезапуск tosu и проверка обновлений — без браузера.",
    shotOverlayTitle: "Оверлей",
    shotOverlayBody:
      "In-game оверлей поверх osu!: включение, горячая клавиша, FPS, сглаживание. PP-счётчики ставятся поверх игры, позиция настраивается прямо в клиенте.",
    shotMapsTitle: "Карты",
    shotMapsBody:
      "Поиск и скачивание beatmap-сетов с osu.ppy.sh. Фильтры по статусу, режиму и языку, превью трека и установка в Songs — в GUI и в in-game панели.",
  },
  en: {
    lead:
      'Desktop GUI for <a href="https://github.com/tosuapp/tosu" rel="noopener noreferrer">tosu</a> — an osu! memory reader with an in-game overlay. Status, counters, maps browser, overlay, and settings in a normal window. <code>tosu.exe</code> is bundled.',
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
    altOverlay: "In-game overlay settings and PP counters",
    altMaps: "Maps browser: search, filters, and download",
    shotMainTitle: "Status",
    shotMainBody:
      "tosu and osu! health in one place: reader running, game detected, API version and port. Restart tosu and check updates without opening a browser.",
    shotOverlayTitle: "Overlay",
    shotOverlayBody:
      "In-game overlay on top of osu!: enable toggle, hotkey, FPS cap, anti-aliasing. PP counters sit over the game and can be moved from inside the client.",
    shotMapsTitle: "Maps",
    shotMapsBody:
      "Search and download beatmap sets from osu.ppy.sh. Status, mode, and language filters, track preview, and install into Songs — in the GUI and the in-game panel.",
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
  ];
  for (const [sel, key] of alts) {
    const img = document.querySelector(sel);
    if (img) img.alt = t(key);
  }

  if (releases.length) updateDownloadUi();
  else if (meta && !meta.classList.contains("-error")) {
    // keep loading/error messages handled elsewhere
  }
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

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function loadReleases() {
  try {
    let data;
    try {
      data = await fetchJson(API);
    } catch {
      data = await fetchJson("releases.json");
    }
    applyReleases(normalizeReleases(data));
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

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyLang(btn.getAttribute("data-lang") || "en");
  });
});

versionSelect.addEventListener("change", updateDownloadUi);
applyLang(detectLang());
loadReleases();
