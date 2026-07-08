const REPO = "absolute2007/tosu-gui";
const API = `https://api.github.com/repos/${REPO}/releases`;

const versionSelect = document.getElementById("version");
const setupLink = document.getElementById("download-setup");
const zipLink = document.getElementById("download-zip");
const meta = document.getElementById("download-meta");

/** @type {{ tag: string, name: string, publishedAt: string, setup?: object, zip?: object }[]} */
let releases = [];

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
    return new Intl.DateTimeFormat("ru-RU", {
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
    meta.textContent = "Релиз не выбран.";
    return;
  }

  setLink(setupLink, release.setup);
  setLink(zipLink, release.zip);

  const parts = [];
  if (release.setup) parts.push(`Setup ${formatBytes(release.setup.size)}`);
  if (release.zip) parts.push(`ZIP ${formatBytes(release.zip.size)}`);
  if (release.publishedAt) parts.push(formatDate(release.publishedAt));
  meta.textContent = parts.join(" · ") || "Нет файлов в этом релизе.";
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
    versionSelect.innerHTML = '<option value="">Нет релизов</option>';
    meta.textContent = "Релизы с файлами не найдены.";
    meta.classList.add("-error");
    return;
  }

  versionSelect.innerHTML = releases
    .map((r, i) => {
      const label = i === 0 ? `${r.tag} (latest)` : r.tag;
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
    versionSelect.innerHTML = '<option value="">Ошибка</option>';
    meta.textContent = "Не удалось загрузить релизы. Откройте страницу releases на GitHub.";
    meta.classList.add("-error");
    setupLink.href = `https://github.com/${REPO}/releases/latest`;
    setupLink.removeAttribute("aria-disabled");
    zipLink.href = `https://github.com/${REPO}/releases`;
    zipLink.removeAttribute("aria-disabled");
  }
}

versionSelect.addEventListener("change", updateDownloadUi);
loadReleases();
