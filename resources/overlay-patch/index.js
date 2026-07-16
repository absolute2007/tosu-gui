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

const MAPS_APP_VERSION = 10;

async function ensureMapsApp(webContents) {
  const ok = await webContents.executeJavaScript(
    `
    (async function () {
      var need = ${MAPS_APP_VERSION};
      if (
        window.__TosuGuiMapsApp &&
        window.__TosuGuiMapsAppVersion === need &&
        typeof window.__TosuGuiMapsApp.show === 'function'
      ) {
        return true;
      }
      // Drop stale script so CSS/layout fixes always apply
      window.__TosuGuiMapsApp = null;
      window.__TosuGuiMapsAppVersion = 0;
      var old = document.getElementById('tosu-gui-maps-root');
      if (old) old.remove();
      var st = document.getElementById('tosu-gui-maps-style');
      if (st) st.remove();
      document.querySelectorAll('script[data-tosu-gui-maps]').forEach(function (n) {
        n.remove();
      });
      await new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = ${JSON.stringify(MAPS_APP_URL)} + '?v=' + need;
        s.async = true;
        s.setAttribute('data-tosu-gui-maps', String(need));
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('maps-app.js load failed')); };
        document.documentElement.appendChild(s);
      });
      return !!(window.__TosuGuiMapsApp && window.__TosuGuiMapsApp.show);
    })()
  `,
    true
  );
  if (!ok) throw new Error("Maps app not available");
}

async function mapsShow(webContents) {
  await ensureMapsApp(webContents);
  await webContents.executeJavaScript(
    `window.__TosuGuiMapsApp.show()`,
    true
  );
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

    overlay.event.once("disconnected", () => {
      this.window.destroy();
      this.event.emit("destroyed");
    });

    overlay.event.on("resized", (hwnd, width, height) => {
      if (hwnd !== this.windowId) return;
      this.window.setSize(width, height);
    });

    overlay.event.on("input_blocking_ended", () => {
      void this.endInputModes();
    });

    overlay.event.on("keyboard_input", (_, input) => {
      if (input.kind !== "Key") return;

      if (this.mapsKeybind.update(input.key, input.state)) {
        this.keybind.reset();
        void this.toggleMapsMode();
        return;
      }

      if (this.mapsEnabled) return;

      if (this.keybind.update(input.key, input.state)) {
        this.mapsKeybind.reset();
        void this.toggleConfigurationMode();
      }
    });

    // Close button inside maps panel
    this.window.webContents.on("console-message", (_e, _level, message) => {
      if (String(message).includes("__TOSU_GUI_MAPS_CLOSE__") && this.mapsEnabled) {
        void this.toggleMapsMode();
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
    this.input?.disconnect();
    this.input = ElectronOverlayInput.connect(
      { id: this.windowId, overlay: this.overlay },
      this.window.webContents
    );
    if (notifyRenderer) {
      this.window.webContents.send("inputCaptureStart");
    }
    this.window.focusOnWebView();
  }

  disconnectInput(opts = {}) {
    const notifyRenderer = opts.notifyRenderer !== false;
    this.input?.disconnect();
    this.input = null;
    if (notifyRenderer) {
      this.window.webContents.send("inputCaptureEnd");
    }
    this.window.blurWebView();
  }

  async endInputModes() {
    const wasMaps = this.mapsEnabled;
    const wasConfig = this.configurationEnabled;
    this.configurationEnabled = false;
    this.mapsEnabled = false;
    this.disconnectInput({ notifyRenderer: wasConfig && !wasMaps });
    try {
      await this.overlay.blockInput(this.windowId, false);
    } catch {
      /* ignore */
    }
    if (wasMaps) {
      await mapsHide(this.window.webContents);
    }
  }

  async toggleConfigurationMode() {
    if (this.mapsEnabled || this._togglingMaps) return;

    this.configurationEnabled = !this.configurationEnabled;
    try {
      await this.overlay.blockInput(this.windowId, this.configurationEnabled);
    } catch (err) {
      console.error("blockInput config:", err);
    }

    if (this.configurationEnabled) {
      this.connectInput({ notifyRenderer: true });
    } else {
      this.disconnectInput({ notifyRenderer: true });
    }
  }

  async toggleMapsMode() {
    if (this._togglingMaps) return;
    this._togglingMaps = true;
    try {
      if (this.mapsEnabled) {
        this.mapsEnabled = false;
        this.configurationEnabled = false;
        this.disconnectInput({ notifyRenderer: false });
        try {
          await this.overlay.blockInput(this.windowId, false);
        } catch {
          /* ignore */
        }
        await mapsHide(this.window.webContents);
        console.log("[maps] closed (panel hidden, state kept)");
        return;
      }

      if (this.configurationEnabled) {
        this.configurationEnabled = false;
        this.disconnectInput({ notifyRenderer: true });
        try {
          await this.overlay.blockInput(this.windowId, false);
        } catch {
          /* ignore */
        }
      }

      this.mapsEnabled = true;
      try {
        await mapsShow(this.window.webContents);
      } catch (err) {
        console.error("[maps] show failed (tosu GUI on :24777?):", err);
        this.mapsEnabled = false;
        return;
      }

      try {
        await this.overlay.blockInput(this.windowId, true);
      } catch (err) {
        console.error("[maps] blockInput:", err);
      }
      // No inputCaptureStart — layout editor stays closed
      this.connectInput({ notifyRenderer: false });
      console.log("[maps] open (in-page panel)");
    } finally {
      this._togglingMaps = false;
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
