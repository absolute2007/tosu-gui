"use strict";
/**
 * Tray-free tosu ingame-overlay + Maps mode (tosu-gui).
 *
 * Maps opens as a same-document panel over counters (show/hide, no navigation).
 * That keeps filters/results and feels closer to tosu (no full page reload lag).
 * Layout editor uses inputCaptureStart; maps mode does NOT (separate capture).
 */
const { app, BrowserWindow, Menu, protocol, session } = require("electron");
const { on } = require("node:events");
const EventEmitter = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { Overlay, defaultDllDir, length } = require("@asdf-overlay/core");
const { mapKeycode } = require("@asdf-overlay/electron/input/conv");
const { ElectronOverlayInput } = require("@asdf-overlay/electron/input");
const { ElectronOverlaySurface } = require("@asdf-overlay/electron/surface");

const MAPS_APP_URL = "http://127.0.0.1:24777/maps-app.js";
const MAPS_ENGINE_URL = "http://127.0.0.1:24777/osu-preview-engine.js";
const MAPS_KEYBIND_FILES = [
  path.join(path.dirname(process.execPath), "maps-overlay-keybind.txt"),
  path.join(path.dirname(process.execPath), "..", "maps-overlay-keybind.txt"),
  path.join(process.cwd(), "maps-overlay-keybind.txt"),
];

class Keybind {
  constructor(keys) {
    if (keys.length > 32) throw new Error("Keybind keys cannot be more than 32 keys");
    this.keys = keys;
    this.state = 0xffffffff;
  }

  update(key, state) {
    const index = this.keys.findIndex((keybindKey) => mapKeycode(key.code) === keybindKey);
    if (index === -1) return false;
    if (state === "Pressed") {
      this.state &= ~(1 << index);
      return !(this.state << (32 - this.keys.length));
    }
    this.state |= 1 << index;
    return false;
  }

  reset() {
    this.state = 0xffffffff;
  }
}

function parseKeybindString(str) {
  return String(str || "")
    .split(/\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function readMapsKeybindKeys() {
  for (const file of MAPS_KEYBIND_FILES) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf8").trim();
        if (raw) return parseKeybindString(raw);
      }
    } catch {
      /* ignore */
    }
  }
  return ["Control", "Shift", "M"];
}

async function loadMainPage(webContents) {
  await webContents.loadFile(path.join(__dirname, "../renderer/index.html"));
}

/** Must match APP_VERSION in maps-app.js — mismatch remounts panel and wipes filters. */
const MAPS_APP_VERSION = 19;

function loadScriptTag(src, attr) {
  return `
    await new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = ${JSON.stringify(src)} + '?v=' + need;
      s.async = false;
      s.setAttribute(${JSON.stringify(attr)}, String(need));
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error(${JSON.stringify(src)} + ' load failed')); };
      document.documentElement.appendChild(s);
    });
  `;
}

async function ensureMapsApp(webContents) {
  const ok = await webContents.executeJavaScript(
    `
    (async function () {
      var need = ${MAPS_APP_VERSION};
      if (
        window.__TosuGuiMapsApp &&
        window.__TosuGuiMapsAppVersion === need &&
        typeof window.__TosuGuiMapsApp.show === 'function' &&
        window.TosuOsuPreview &&
        typeof window.TosuOsuPreview.parseOsu === 'function'
      ) {
        return true;
      }
      // Drop only when version mismatches (real update). Do not wipe on every open.
      window.__TosuGuiMapsApp = null;
      window.__TosuGuiMapsAppVersion = 0;
      window.TosuOsuPreview = null;
      var old = document.getElementById('tosu-gui-maps-root');
      if (old) old.remove();
      var st = document.getElementById('tosu-gui-maps-style');
      if (st) st.remove();
      document.querySelectorAll('script[data-tosu-gui-maps],script[data-tosu-gui-engine]').forEach(function (n) {
        n.remove();
      });
      ${loadScriptTag(MAPS_ENGINE_URL, "data-tosu-gui-engine")}
      ${loadScriptTag(MAPS_APP_URL, "data-tosu-gui-maps")}
      return !!(window.__TosuGuiMapsApp && window.__TosuGuiMapsApp.show && window.TosuOsuPreview);
    })()
  `,
    true
  );
  if (!ok) throw new Error("Maps app not available");
}

async function mapsShow(webContents) {
  await ensureMapsApp(webContents);
  await webContents.executeJavaScript(`window.__TosuGuiMapsApp.show()`, true);
}

async function mapsHide(webContents) {
  try {
    await webContents.executeJavaScript(
      `window.__TosuGuiMapsApp && window.__TosuGuiMapsApp.hide && window.__TosuGuiMapsApp.hide()`,
      true
    );
  } catch {
    /* ignore */
  }
}

async function mapsIsVisible(webContents) {
  try {
    return !!(await webContents.executeJavaScript(
      `!!(window.__TosuGuiMapsApp && window.__TosuGuiMapsApp.isVisible && window.__TosuGuiMapsApp.isVisible())`,
      true
    ));
  } catch {
    return false;
  }
}

async function mapsPreload(webContents) {
  try {
    await ensureMapsApp(webContents);
    await webContents.executeJavaScript(
      `window.__TosuGuiMapsApp && window.__TosuGuiMapsApp.mount && window.__TosuGuiMapsApp.mount()`,
      true
    );
  } catch (err) {
    console.debug("[maps] preload:", err && err.message);
  }
}

function consoleMessageText(event, level, message) {
  // Electron ≥28: details on event; older: (event, level, message)
  if (event && typeof event === "object" && typeof event.message === "string") {
    return event.message;
  }
  if (typeof message === "string") return message;
  if (typeof level === "string" && level.includes("__TOSU")) return level;
  return String(message ?? level ?? "");
}

const preloadPath = path.join(__dirname, "../preload/index.js");

class OverlayProcess {
  constructor(pid, windowId, overlay, window, luid) {
    this.pid = pid;
    this.windowId = windowId;
    this.overlay = overlay;
    this.window = window;
    this.luid = luid;
    this.event = new EventEmitter();
    this.keybind = new Keybind([]);
    this.mapsKeybind = new Keybind(readMapsKeybindKeys());
    this.input = null;
    this.configurationEnabled = false;
    this.mapsEnabled = false;
    this._togglingMaps = false;
    this._toggleMapsSince = 0;
    /** True while we intentionally call blockInput(false) — ignore spurious input_blocking_ended. */
    this._releasingBlock = false;
    this._closingMaps = false;

    overlay.event.once("disconnected", () => {
      this.window.destroy();
      this.event.emit("destroyed");
    });

    overlay.event.on("resized", (hwnd, width, height) => {
      if (hwnd !== this.windowId) return;
      this.window.setSize(width, height);
    });

    overlay.event.on("input_blocking_ended", () => {
      // Fires often in windowed mode (focus loss / our own unblock). Don't fight ourselves.
      if (this._releasingBlock || this._togglingMaps || this._closingMaps) return;
      // Only clean up if we actually thought maps/config were open
      if (!this.mapsEnabled && !this.configurationEnabled) return;
      void this.forceCloseMaps("input_blocking_ended");
    });

    overlay.event.on("keyboard_input", (_, input) => {
      if (input.kind !== "Key") return;

      // Escape always force-closes maps if open
      if (input.state === "Pressed") {
        const code = input.key && input.key.code;
        if (code === "Escape" || code === "Esc") {
          if (this.mapsEnabled || this._togglingMaps) {
            void this.forceCloseMaps("escape");
            return;
          }
        }
      }

      if (this.mapsKeybind.update(input.key, input.state)) {
        this.keybind.reset();
        this.mapsKeybind.reset();
        void this.toggleMapsMode();
        return;
      }

      if (this.mapsEnabled) return;

      if (this.keybind.update(input.key, input.state)) {
        this.mapsKeybind.reset();
        this.keybind.reset();
        void this.toggleConfigurationMode();
      }
    });

    // Close from maps panel (X / shade). Always force-close — ignore mapsEnabled desync.
    this.window.webContents.on("console-message", (event, level, message) => {
      const text = consoleMessageText(event, level, message);
      if (text.includes("__TOSU_GUI_MAPS_CLOSE__")) {
        void this.forceCloseMaps("ui-close");
      }
    });

    this.surface = ElectronOverlaySurface.connect(
      { id: windowId, overlay },
      luid,
      window.webContents
    );

    if (this.surface.events && typeof this.surface.events.on === "function") {
      this.surface.events.on("error", (error) => {
        console.error(error);
      });
    }
  }

  /**
   * notifyRenderer: only for tosu layout editor (inputCaptureStart/End).
   * Maps must use notifyRenderer:false or the layout editor opens and steals clicks.
   */
  connectInput(opts = {}) {
    const notifyRenderer = opts.notifyRenderer !== false;
    try {
      this.input?.disconnect();
    } catch {
      /* ignore */
    }
    this.input = null;
    try {
      this.input = ElectronOverlayInput.connect(
        { id: this.windowId, overlay: this.overlay },
        this.window.webContents
      );
    } catch (err) {
      console.error("[maps] connectInput:", err);
      this.input = null;
    }
    if (notifyRenderer) {
      try {
        this.window.webContents.send("inputCaptureStart");
      } catch {
        /* ignore */
      }
    }
    try {
      this.window.focusOnWebView();
    } catch {
      /* ignore */
    }
  }

  disconnectInput(opts = {}) {
    const notifyRenderer = opts.notifyRenderer !== false;
    try {
      this.input?.disconnect();
    } catch {
      /* ignore */
    }
    this.input = null;
    if (notifyRenderer) {
      try {
        this.window.webContents.send("inputCaptureEnd");
      } catch {
        /* ignore */
      }
    }
    try {
      this.window.blurWebView();
    } catch {
      /* ignore */
    }
  }

  async setBlockInput(block) {
    if (!block) this._releasingBlock = true;
    try {
      await this.overlay.blockInput(this.windowId, !!block);
    } catch (err) {
      console.error("[maps] blockInput:", block, err);
    } finally {
      if (!block) {
        // brief guard so input_blocking_ended from our unblock is ignored
        setTimeout(() => {
          this._releasingBlock = false;
        }, 80);
      }
    }
  }

  async endInputModes() {
    await this.forceCloseMaps("endInputModes");
  }

  /**
   * Always release input + hide panel. Safe if already closed / desynced.
   * Order matters (windowed mode): hide surface first, then unblock, so the game
   * cursor never sits "under" a still-visible panel without capture.
   */
  async forceCloseMaps(reason) {
    if (this._closingMaps) return;
    this._closingMaps = true;
    const wasConfig = this.configurationEnabled;
    const wasMaps = this.mapsEnabled;
    this.configurationEnabled = false;
    this.mapsEnabled = false;
    this._toggleMapsSince = 0;
    this.mapsKeybind.reset();
    this.keybind.reset();

    try {
      // 1) Hide panel immediately (stops eating clicks visually)
      await mapsHide(this.window.webContents);
      // 2) Drop overlay input routing
      this.disconnectInput({ notifyRenderer: wasConfig && !wasMaps });
      // 3) Return mouse/keyboard to the game
      await this.setBlockInput(false);
      // 4) Hide again in case show raced
      await mapsHide(this.window.webContents);

      if (wasMaps || reason === "ui-close" || reason === "escape" || reason === "desync-close") {
        console.log("[maps] force-closed:", reason || "unknown");
      }
    } finally {
      this._closingMaps = false;
      // Don't clear _togglingMaps here if toggleMapsMode owns it — caller finally does.
      if (reason !== "hotkey-close" && reason !== "desync-close" && reason !== "show-failed") {
        /* leave _togglingMaps to toggleMapsMode.finally when called from there */
      }
    }
  }

  async toggleConfigurationMode() {
    if (this.mapsEnabled || this._togglingMaps || this._closingMaps) return;

    this.configurationEnabled = !this.configurationEnabled;
    await this.setBlockInput(this.configurationEnabled);

    if (this.configurationEnabled) {
      this.connectInput({ notifyRenderer: true });
    } else {
      this.disconnectInput({ notifyRenderer: true });
    }
  }

  async toggleMapsMode() {
    // Unstick if a previous toggle hung
    if (this._togglingMaps) {
      if (this._toggleMapsSince && Date.now() - this._toggleMapsSince > 4000) {
        console.warn("[maps] toggle stuck — force reset");
        this._togglingMaps = false;
        this._closingMaps = false;
      } else {
        return;
      }
    }

    this._togglingMaps = true;
    this._toggleMapsSince = Date.now();
    try {
      let panelVisible = false;
      try {
        panelVisible = await mapsIsVisible(this.window.webContents);
      } catch {
        panelVisible = false;
      }

      // Close if flag set OR panel still painted (desync after windowed focus loss)
      if (this.mapsEnabled || panelVisible) {
        await this.forceCloseMaps(
          panelVisible && !this.mapsEnabled ? "desync-close" : "hotkey-close"
        );
        return;
      }

      // Always start from a clean closed state (fixes "cursor under overlay" on reopen)
      this.disconnectInput({ notifyRenderer: false });
      await this.setBlockInput(false);
      await mapsHide(this.window.webContents);

      if (this.configurationEnabled) {
        this.configurationEnabled = false;
        this.disconnectInput({ notifyRenderer: true });
      }

      // Capture order for windowed: block + input FIRST, then show UI
      this.mapsEnabled = true;
      await this.setBlockInput(true);
      this.connectInput({ notifyRenderer: false });

      try {
        await mapsShow(this.window.webContents);
      } catch (err) {
        console.error("[maps] show failed (tosu GUI on :24777?):", err);
        this.mapsEnabled = false;
        await this.forceCloseMaps("show-failed");
        return;
      }

      // Re-assert capture after show (windowed focus can steal it)
      await this.setBlockInput(true);
      this.connectInput({ notifyRenderer: false });
      this.mapsKeybind.reset();
      this.keybind.reset();
      console.log("[maps] open (in-page panel)");
    } finally {
      this._togglingMaps = false;
      this._toggleMapsSince = 0;
    }
  }

  setMapsKeybind(keys) {
    this.mapsKeybind = new Keybind(keys);
  }

  destroy() {
    this.input?.disconnect();
    this.surface.disconnect();
    this.overlay.destroy();
  }

  static async initialize(pid) {
    const overlay = await Overlay.attach(
      defaultDllDir().replaceAll("app.asar", "app.asar.unpacked"),
      pid,
      5000
    );

    const [hwnd, width, height, luid] = await new Promise((resolve) =>
      overlay.event.once("added", (h, w, ht, l) => resolve([h, w, ht, l]))
    );

    await overlay.setPosition(hwnd, length(0), length(0));
    await overlay.setAnchor(hwnd, length(0), length(0));
    await overlay.setMargin(hwnd, length(0), length(0), length(0), length(0));
    // listen keyboard+mouse for hotkeys; block only when maps/config open
    await overlay.listenInput(hwnd, false, true);

    const window = new BrowserWindow({
      webPreferences: {
        offscreen: {
          useSharedTexture: true,
          sharedTexturePixelFormat: "argb",
        },
        transparent: true,
        backgroundThrottling: false,
        preload: preloadPath,
        webSecurity: false,
      },
      show: false,
    });
    window.setSize(width, height, false);

    return new OverlayProcess(pid, hwnd, overlay, window, luid);
  }
}

class OverlayManager {
  constructor() {
    this.map = new Map();
    this.keybindKeys = ["Control", "Shift", "Space"];
    this.mapsKeybindKeys = readMapsKeybindKeys();
    this.maxFps = 60;

    for (const file of MAPS_KEYBIND_FILES) {
      try {
        fs.watchFile(file, { interval: 2000 }, () => {
          this.mapsKeybindKeys = readMapsKeybindKeys();
          for (const overlay of this.map.values()) {
            overlay.setMapsKeybind(this.mapsKeybindKeys);
          }
          console.debug("[maps] keybind reloaded:", this.mapsKeybindKeys.join(" + "));
        });
      } catch {
        /* ignore */
      }
    }
  }

  async runIpc() {
    for await (const events of on(process, "message")) {
      for (const msg of events) {
        if (msg == null) continue;
        try {
          await this.handleEvent(msg);
        } catch (exc) {
          console.error("IPC:", exc);
        }
      }
    }
  }

  async runOverlay(pid) {
    if (this.map.has(pid)) {
      console.debug("Already attached to process", pid);
      return;
    }

    try {
      console.log("initializing ingame overlay pid:", pid);
      const overlay = await OverlayProcess.initialize(pid);
      overlay.window.webContents.setFrameRate(this.maxFps);
      overlay.keybind = new Keybind(this.keybindKeys);
      overlay.setMapsKeybind(this.mapsKeybindKeys);
      this.map.set(pid, overlay);
      try {
        await loadMainPage(overlay.window.webContents);
        console.log("warn: Initialized successfully");
        console.log("[maps] hotkey:", this.mapsKeybindKeys.join(" + "));
        // Mount maps app in background (no show) so first open is instant
        setTimeout(() => {
          void mapsPreload(overlay.window.webContents);
        }, 2000);
      } catch (exc) {
        console.error("Unnable connect to ingame overlay:", exc);
      }
      overlay.event.once("destroyed", () => {
        this.map.delete(pid);
      });
    } catch (exc) {
      console.error("Injection failed:", exc);
    }
  }

  reloadAll() {
    for (const overlay of this.map.values()) overlay.window.reload();
  }

  destroy() {
    for (const overlay of this.map.values()) overlay.destroy();
  }

  updateKeybind(keybind) {
    this.keybindKeys = parseKeybindString(keybind);
    for (const overlay of this.map.values()) {
      overlay.keybind = new Keybind(this.keybindKeys);
    }
    console.debug(`Keybind updated to ${this.keybindKeys.join(" + ")}`);
  }

  updateMaxFps(maxFps) {
    this.maxFps = maxFps;
    for (const overlay of this.map.values()) {
      overlay.window.webContents.setFrameRate(maxFps);
    }
  }

  async handleEvent(message) {
    if (message.cmd === "add") await this.runOverlay(message.pid);
    else if (message.cmd === "keybind") this.updateKeybind(message.keybind);
    else if (message.cmd === "maxFps") this.updateMaxFps(message.maxFps);
    else if (message.cmd === "mapsKeybind") {
      this.mapsKeybindKeys = parseKeybindString(message.keybind);
      for (const overlay of this.map.values()) {
        overlay.setMapsKeybind(this.mapsKeybindKeys);
      }
    }
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "tosu",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

function registerTosuProtocol() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "ws://localhost:24050/*",
        "http://localhost:24050/*",
        "http://127.0.0.1:24777/*",
      ],
    },
    (details, callback) => {
      if (details.url.includes("24050")) {
        details.requestHeaders.Referer = "http://localhost:24050";
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  protocol.handle("tosu", (req) => {
    if (!req.url.startsWith("tosu://server")) {
      return new Response("Bad request", { status: 400 });
    }
    return new Response("", {
      status: 308,
      headers: {
        Location: req.url.replace("tosu://server", "http://localhost:24050"),
      },
    });
  });
}

app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("high-dpi-support", "1");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("disable-direct-composition");

(async () => {
  if (!app.requestSingleInstanceLock() || !process.channel) return;

  console.log("warn: Starting...");
  Menu.setApplicationMenu(null);
  app.on("window-all-closed", () => {});

  const manager = new OverlayManager();
  manager.runIpc();

  await app.whenReady();
  registerTosuProtocol();
})().catch((exc) => {
  console.error(exc);
});
