"use strict";
/**
 * tosu In-Game Overlay with Maps Browser support (tosu-gui).
 * Compatible with tosu 4.26.0+ (@asdf-overlay/core v2).
 */
const { app, BrowserWindow, Menu, protocol, session } = require("electron");
const { on } = require("node:events");
const EventEmitter = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { Overlay, defaultDllDir } = require("@asdf-overlay/core");
const { mapKeycode } = require("@asdf-overlay/electron/input/conv");
const { ElectronOverlayInput } = require("@asdf-overlay/electron/input");
const { ElectronOverlaySurface } = require("@asdf-overlay/electron/surface");

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
    if (!key || !key.code) return false;
    const mapped = mapKeycode(key.code);
    const code = key.code || "";
    const index = this.keys.findIndex((keybindKey) => {
      if (mapped === keybindKey || code === keybindKey) return true;
      const k = String(keybindKey).toLowerCase();
      const m = String(mapped).toLowerCase();
      const c = String(code).toLowerCase();
      return (
        m === k ||
        c === k ||
        c === `key${k}` ||
        m === `key${k}` ||
        `key${m}` === k ||
        (k === "control" && (c === "controlleft" || c === "controlright" || m === "control")) ||
        (k === "shift" && (c === "shiftleft" || c === "shiftright" || m === "shift")) ||
        (k === "alt" && (c === "altleft" || c === "altright" || m === "alt"))
      );
    });
    if (index === -1) return false;
    if (state === "Pressed") {
      this.state &= ~(1 << index);
      const mask = ~(0xffffffff << this.keys.length);
      return (this.state & mask) === 0;
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

// --- Keyboard text fixes for the Maps panel ---
// osu!stable is an ANSI window: WM_CHAR delivers bytes in the system ANSI code page
// (e.g. CP1251 for Cyrillic), which the overlay library forwards as Latin-1 → garbled text.

let ansiDecoder;
function getAnsiDecoder() {
  if (ansiDecoder !== undefined) return ansiDecoder;
  ansiDecoder = null;
  try {
    const out = require("node:child_process").execFileSync(
      "reg",
      ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage", "/v", "ACP"],
      { encoding: "utf8", windowsHide: true, timeout: 3000 }
    );
    const acp = Number((out.match(/ACP\s+REG_SZ\s+(\d+)/) || [])[1]) || 0;
    if (acp && acp !== 1252 && acp !== 65001) ansiDecoder = new TextDecoder(`windows-${acp}`);
  } catch {
    ansiDecoder = null;
  }
  return ansiDecoder;
}

function decodeAnsiChar(ch) {
  if (typeof ch !== "string" || ch.length !== 1) return ch;
  const code = ch.charCodeAt(0);
  if (code < 0x80 || code > 0xff) return ch;
  const decoder = getAnsiDecoder();
  if (!decoder) return ch;
  try {
    return decoder.decode(Uint8Array.of(code)) || ch;
  } catch {
    return ch;
  }
}

/** ElectronOverlayInput.connect + ANSI→Unicode correction for typed characters. */
function connectInput(target, contents) {
  const input = ElectronOverlayInput.connect(target, contents);
  const original = input.sendKeyboardInput.bind(input);
  input.sendKeyboardInput = (ev) => {
    if (ev && ev.type === "Char") return original({ ...ev, ch: decodeAnsiChar(ev.ch) });
    return original(ev);
  };
  return input;
}

/**
 * While the panel blocks game input, Windows never sees the layout hotkey, so we detect
 * Alt+Shift / Ctrl+Shift / Win+Space ourselves and ask the game window to switch layout.
 */
class LayoutHotkey {
  constructor() {
    this.down = new Set();
    this.armed = false;
  }

  /** Returns true when a layout switch should happen. */
  update(key, state) {
    const name = key && key.code ? String(mapKeycode(key.code) || key.code) : "";
    const mod = /control|shift|alt|super|meta/i.test(name) ? name.replace(/(Left|Right)$/, "").toLowerCase() : null;
    if (state === "Pressed") {
      if (this.down.has(name)) return false;
      this.down.add(name);
      if (!mod) {
        const win = [...this.down].some((k) => /super|meta/i.test(k));
        this.armed = false;
        return win && /^space$/i.test(name);
      }
      const mods = new Set([...this.down].map((k) => k.replace(/(Left|Right)$/, "").toLowerCase()));
      this.armed = mods.has("shift") && (mods.has("alt") || mods.has("control")) && mods.size === 2;
      return false;
    }
    this.down.delete(name);
    if (mod && this.armed) {
      this.armed = false;
      return true;
    }
    return false;
  }

  reset() {
    this.down.clear();
    this.armed = false;
  }
}

let layoutShell = null;
function requestNextKeyboardLayout() {
  if (process.platform !== "win32") return;
  try {
    if (!layoutShell || layoutShell.exitCode !== null) {
      layoutShell = require("node:child_process").spawn(
        "powershell.exe",
        ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", "-"],
        { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] }
      );
      layoutShell.on("error", () => {
        layoutShell = null;
      });
      layoutShell.stdin.write(
        "$k = Add-Type -Name KbLayout -Namespace TosuGui -PassThru -MemberDefinition '" +
          "[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow();" +
          "[DllImport(\"user32.dll\")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);'\n"
      );
    }
    // WM_INPUTLANGCHANGEREQUEST with HKL_NEXT on the focused (game) window
    layoutShell.stdin.write("[void]$k::PostMessage($k::GetForegroundWindow(), 0x50, [IntPtr]0, [IntPtr]1)\n");
  } catch {
    layoutShell = null;
  }
}

/** tosu GUI writes "disabled" when the Maps panel is switched off in Settings. */
const MAPS_DISABLED = "disabled";

function readMapsKeybindKeys() {
  for (const file of MAPS_KEYBIND_FILES) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf8").trim();
        if (raw.toLowerCase() === MAPS_DISABLED) return [];
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

const preloadPath = path.join(__dirname, "../preload/index.js");

function readStaticFile(filename) {
  const candidateDirs = [
    path.join(path.dirname(process.execPath), "..", "static", "Maps Browser by tosu-gui"),
    path.join(process.cwd(), "static", "Maps Browser by tosu-gui"),
    path.join(__dirname, "../../static/Maps Browser by tosu-gui"),
    path.join(path.dirname(process.execPath), "static", "Maps Browser by tosu-gui"),
  ];
  for (const dir of candidateDirs) {
    const full = path.join(dir, filename);
    if (fs.existsSync(full)) {
      try {
        return fs.readFileSync(full, "utf8");
      } catch {
        /* ignore */
      }
    }
  }
  return "";
}

async function ensureMapsApp(webContents) {
  let isReady = false;
  try {
    isReady = await webContents.executeJavaScript(
      `!!(window.__TosuGuiMapsApp && typeof window.__TosuGuiMapsApp.show === 'function' && window.TosuOsuPreview)`,
      true
    );
  } catch {
    isReady = false;
  }
  if (isReady) return;

  const engineCode = readStaticFile("osu-preview-engine.js");
  const appCode = readStaticFile("maps-app.js");

  if (engineCode && appCode) {
    try {
      await webContents.executeJavaScript(engineCode, true);
      await webContents.executeJavaScript(appCode, true);
      return;
    } catch (err) {
      console.warn("[maps] direct injection failed:", err);
    }
  }

  // Fallback: try loading from server port 24050
  await webContents.executeJavaScript(`
    (async function () {
      function loadScript(src) {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.async = false;
          s.onload = function () { resolve(); };
          s.onerror = function () { reject(new Error(src + ' load failed')); };
          document.documentElement.appendChild(s);
        });
      }
      try {
        await loadScript('http://127.0.0.1:24050/Maps%20Browser%20by%20tosu-gui/osu-preview-engine.js');
        await loadScript('http://127.0.0.1:24050/Maps%20Browser%20by%20tosu-gui/maps-app.js');
      } catch (e) {
        console.warn('Maps scripts HTTP load failed', e);
      }
    })()
  `, true).catch(() => {});
}

async function mapsShow(webContents) {
  await ensureMapsApp(webContents);
  await webContents.executeJavaScript(
    `window.__TosuGuiMapsApp && window.__TosuGuiMapsApp.show && window.__TosuGuiMapsApp.show()`,
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
  } catch {
    /* ignore */
  }
}

function consoleMessageText(event, level, message) {
  if (event && typeof event === "object" && typeof event.message === "string") {
    return event.message;
  }
  if (typeof message === "string") return message;
  if (typeof level === "string" && level.includes("__TOSU")) return level;
  return String(message ?? level ?? "");
}

const OVERLAY_LOG = path.join(path.dirname(process.execPath), "overlay-console.log");
const OVERLAY_LOG_MAX_BYTES = 512 * 1024;
let overlayLogQueue = Promise.resolve();

function isWarnOrError(event, level) {
  const lvl = event && typeof event === "object" && "level" in event ? event.level : level;
  return lvl === "warning" || lvl === "error" || (typeof lvl === "number" && lvl >= 2);
}

function appendOverlayLog(line) {
  overlayLogQueue = overlayLogQueue
    .then(async () => {
      try {
        const st = await fs.promises.stat(OVERLAY_LOG);
        if (st.size > OVERLAY_LOG_MAX_BYTES) await fs.promises.truncate(OVERLAY_LOG, 0);
      } catch {
        /* no log yet */
      }
      await fs.promises.appendFile(OVERLAY_LOG, line);
    })
    .catch(() => {});
}

class OverlayProcess {
  constructor(surface, window) {
    this.surface = surface;
    this.window = window;
    this.event = new EventEmitter();
    this.keybind = new Keybind([]);
    this.mapsKeybind = new Keybind(readMapsKeybindKeys());
    this.layoutHotkey = new LayoutHotkey();
    this.refreshMapsKeybind = () => {
      const keys = readMapsKeybindKeys();
      if (keys.join("+") === this.mapsKeybind.keys.join("+")) return;
      this.mapsKeybind = new Keybind(keys);
      if (keys.length === 0) {
        if (this.mapsEnabled) void this.forceCloseMaps("disabled");
      } else {
        void mapsPreload(this.window.webContents);
      }
    };
    // Settings changes are rare; a slow poll keeps the overlay process idle.
    for (const file of MAPS_KEYBIND_FILES) {
      fs.watchFile(file, { interval: 1000, persistent: false }, this.refreshMapsKeybind);
    }
    this.inputs = [];
    this.configurationEnabled = false;
    this.mapsEnabled = false;
    this._togglingMaps = false;

    const { overlay } = surface;

    overlay.event.on("tracing_event", (e, t) => this.onOverlayLog(e, t));
    overlay.event.once("disconnected", () => this.onDisconnected());

    overlay.event.on("surface_resized", (id, width, height) => {
      if (id === this.surface.id) {
        console.debug("surface resized id:", this.surface.id, "width:", width, "height:", height);
        this.window.setSize(width, height);
      }
    });

    overlay.event.on("input_blocking_ended", () => {
      if (this.mapsEnabled) {
        this.forceCloseMaps("input_blocking_ended");
      }
      if (this.configurationEnabled) {
        this.closeConfiguration();
        this.resetInputs();
        this.configurationEnabled = false;
      }
    });

    overlay.event.on("window_keyboard_input", (windowId, keyEvent) => {
      if (keyEvent.type !== "Key") return;

      // Escape closes Maps Browser
      if (keyEvent.state === "Pressed") {
        const code = keyEvent.key && keyEvent.key.code;
        if (code === "Escape" || code === "Esc") {
          if (this.mapsEnabled || this._togglingMaps) {
            void this.forceCloseMaps("escape");
            return;
          }
        }
      }

      // Keyboard layout switch while the panel owns input (Windows can't see the hotkey then)
      if (this.mapsEnabled && this.layoutHotkey.update(keyEvent.key, keyEvent.state)) {
        requestNextKeyboardLayout();
      }

      // Maps Browser Hotkey (Ctrl + Shift + M)
      if (this.mapsKeybind.update(keyEvent.key, keyEvent.state)) {
        this.keybind.reset();
        this.mapsKeybind.reset();
        void this.toggleMapsMode(windowId);
        return;
      }

      if (this.mapsEnabled) return;

      // Tosu Layout Editor Hotkey (Delete)
      if (this.keybind.update(keyEvent.key, keyEvent.state)) {
        this.mapsKeybind.reset();
        this.keybind.reset();
        this.configurationEnabled = !this.configurationEnabled;
        overlay.blockInput(this.configurationEnabled);

        if (this.configurationEnabled) {
          this.inputs.push(connectInput({ id: windowId, overlay }, window.webContents));
          const targetWindowId = this.surface.info.ty.windowId;
          if (targetWindowId && targetWindowId !== windowId) {
            this.inputs.push(connectInput({ id: targetWindowId, overlay }, window.webContents));
          }
          this.openConfiguration();
        } else {
          this.closeConfiguration();
          this.resetInputs();
        }
      }
    });

    // Close request from UI (X button). Only warnings/errors are logged, asynchronously,
    // so the overlay never blocks on disk I/O for regular console output.
    this.window.webContents.on("console-message", (event, level, message) => {
      const text = consoleMessageText(event, level, message);
      if (text.includes("__TOSU_GUI_MAPS_CLOSE__")) {
        void this.forceCloseMaps("ui-close");
        return;
      }
      if (isWarnOrError(event, level)) {
        appendOverlayLog(`[${new Date().toISOString()}] ${text}\n`);
      }
    });

    this.surfaceInterop = ElectronOverlaySurface.connect(this.surface, window.webContents);
    this.surfaceInterop.events.on("error", (err) => this.onSurfaceError(err));

    overlay.event.on("surface_destroyed", (id) => {
      if (id === this.surface.id) {
        console.log("main surface destroyed id:", this.surface.id);
        findSurface(overlay).then(([newSurface]) => {
          console.debug("surface found id:", newSurface.id, "info:", newSurface.info);
          this.surfaceInterop.disconnect();
          this.surfaceInterop = ElectronOverlaySurface.connect(newSurface, window.webContents);
          this.surface = newSurface;
          this.window.webContents.invalidate();
        });
      }
    });

    // Preload Maps Browser script into webContents on load (skipped while disabled)
    this.window.webContents.on("did-finish-load", () => {
      if (this.mapsKeybind.keys.length > 0) void mapsPreload(this.window.webContents);
    });
  }

  resetInputs() {
    for (const input of this.inputs) {
      try {
        input.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.inputs = [];
  }

  onOverlayLog(e, t) {
    const msg = `${e.modulePath ?? "<unknown>"}:${e.line ?? "<unknown>"} ${t}`;
    if (e.level === "Error") {
      console.error(msg);
      return;
    }
    console.log(msg);
  }

  onDisconnected() {
    for (const file of MAPS_KEYBIND_FILES) fs.unwatchFile(file, this.refreshMapsKeybind);
    this.window.destroy();
    this.event.emit("destroyed");
  }

  onSurfaceError(e) {
    console.error(e);
  }

  openConfiguration() {
    this.window.webContents.send("inputCaptureStart");
    this.window.focusOnWebView();
  }

  closeConfiguration() {
    this.window.webContents.send("inputCaptureEnd");
    this.window.blurWebView();
  }

  async forceCloseMaps(reason) {
    this.mapsEnabled = false;
    this.mapsKeybind.reset();
    this.layoutHotkey.reset();
    this.keybind.reset();

    try {
      await mapsHide(this.window.webContents);
    } catch {
      /* ignore */
    }

    this.resetInputs();
    this.window.blurWebView();
    this.surface.overlay.blockInput(false);
    console.log("[maps] force-closed:", reason || "unknown");
  }

  async toggleMapsMode(windowId) {
    if (this._togglingMaps || this.mapsKeybind.keys.length === 0) return;
    this._togglingMaps = true;

    try {
      let isVis = false;
      try {
        isVis = await mapsIsVisible(this.window.webContents);
      } catch {
        isVis = false;
      }

      if (this.mapsEnabled || isVis) {
        await this.forceCloseMaps("hotkey-toggle");
        return;
      }

      if (this.configurationEnabled) {
        this.configurationEnabled = false;
        this.closeConfiguration();
        this.resetInputs();
      }

      this.mapsEnabled = true;
      this.surface.overlay.blockInput(true);
      this.resetInputs();

      const { overlay } = this.surface;
      this.inputs.push(connectInput({ id: windowId, overlay }, this.window.webContents));
      const targetWindowId = this.surface.info.ty.windowId;
      if (targetWindowId && targetWindowId !== windowId) {
        this.inputs.push(connectInput({ id: targetWindowId, overlay }, this.window.webContents));
      }

      this.window.focusOnWebView();
      await mapsShow(this.window.webContents);
      console.log("[maps] opened (in-game panel)");
    } catch (err) {
      console.error("[maps] toggle error:", err);
      await this.forceCloseMaps("error");
    } finally {
      this._togglingMaps = false;
    }
  }

  destroy() {
    this.resetInputs();
    this.surfaceInterop.disconnect();
    this.surface.overlay.detach();
  }

  static async initialize(pid) {
    const overlay = await Overlay.attach(
      defaultDllDir().replaceAll("app.asar", "app.asar.unpacked"),
      pid,
      5000
    );

    overlay.event.on("window_added", (windowId) => {
      overlay.listenInput(windowId, false, true);
    });

    const [surface, width, height] = await findSurface(overlay);
    console.debug("surface found id:", surface.id, "info:", surface.info, "for pid:", pid);

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
    return new OverlayProcess(surface, window);
  }
}

function findSurface(overlay) {
  return new Promise((resolve) => {
    const handler = (id, width, height, surfaceInfo) => {
      if (surfaceInfo.ty.windowId != null) {
        resolve([{ id, overlay, info: surfaceInfo }, width, height]);
        overlay.event.off("surface_added", handler);
      }
    };
    overlay.event.on("surface_added", handler);
  });
}

class OverlayManager {
  constructor() {
    this.map = new Map();
    this.keybindKeys = ["Control", "Shift", "Space"];
    this.maxFps = 240;
  }

  async runIpc() {
    for await (const messages of on(process, "message")) {
      for (const msg of messages) {
        if (msg != null) {
          try {
            await this.handleEvent(msg);
          } catch (err) {
            console.error("IPC:", err);
          }
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
      const proc = await OverlayProcess.initialize(pid);
      proc.window.webContents.setFrameRate(this.maxFps);
      proc.keybind = new Keybind(this.keybindKeys);
      this.map.set(pid, proc);

      try {
        await loadMainPage(proc.window.webContents);
        console.log("warn: Initialized successfully");
      } catch (err) {
        console.error("Unable connect to ingame overlay:", err);
      }

      proc.event.once("destroyed", () => {
        this.map.delete(pid);
      });
    } catch (err) {
      console.error("Injection failed:", err);
    }
  }

  reloadAll() {
    for (const proc of this.map.values()) {
      proc.window.reload();
    }
  }

  destroy() {
    for (const proc of this.map.values()) {
      proc.destroy();
    }
  }

  updateKeybind(keybindStr) {
    this.keybindKeys = parseKeybindString(keybindStr);
    for (const proc of this.map.values()) {
      proc.keybind = new Keybind(this.keybindKeys);
    }
    console.debug(`Keybind updated to ${this.keybindKeys.join(" + ")}`);
  }

  updateMaxFps(fps) {
    this.maxFps = fps;
    for (const proc of this.map.values()) {
      proc.window.webContents.setFrameRate(fps);
    }
    console.debug(`MaxFps updated to ${fps}`);
  }

  async handleEvent(msg) {
    if (msg.cmd === "add") {
      await this.runOverlay(msg.pid);
    } else if (msg.cmd === "keybind") {
      this.updateKeybind(msg.keybind);
    } else if (msg.cmd === "maxFps") {
      this.updateMaxFps(msg.maxFps);
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

function setupCustomProtocol() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["ws://localhost:24050/*", "http://localhost:24050/*"] },
    (details, callback) => {
      details.requestHeaders.Referer = "http://localhost:24050";
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  protocol.handle("tosu", (request) => {
    if (request.url.startsWith("tosu://server")) {
      return new Response("", {
        status: 308,
        headers: { Location: request.url.replace("tosu://server", "http://localhost:24050") },
      });
    }
    return new Response("Bad request", { status: 400 });
  });
}

app.commandLine.appendSwitch("force_high_performance_gpu");
// app.commandLine.appendSwitch("in-process-gpu");
// app.commandLine.appendSwitch("disable-direct-composition");
app.commandLine.appendSwitch("disable-features", "ThirdPartyStoragePartitioning");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

(async () => {
  if (app.requestSingleInstanceLock()) {
    if (!process.channel) throw new Error("Failed to acquire IPC channel. Exiting...");
  } else {
    throw new Error("Another instance is already running. Please close it first. Exiting...");
  }

  console.log("warn: Starting...");
  Menu.setApplicationMenu(null);
  app.on("window-all-closed", () => {});

  const manager = new OverlayManager();
  manager.runIpc();

  await app.whenReady();
  setupCustomProtocol();
})().catch((err) => {
  console.error(err);
  app.exit(0);
});
