"use strict";
/**
 * Tray-free tosu ingame-overlay main process (based on @tosu/ingame-overlay 4.25.x).
 * Replaces dist/src/index.js and drops bytecode so Electron loads plain JS.
 */
const { app, BrowserWindow, Menu, protocol, session } = require("electron");
const { on } = require("node:events");
const EventEmitter = require("node:events");
const path = require("node:path");
const { Overlay, defaultDllDir, length } = require("@asdf-overlay/core");
const { mapKeycode } = require("@asdf-overlay/electron/input/conv");
const { ElectronOverlayInput } = require("@asdf-overlay/electron/input");
const { ElectronOverlaySurface } = require("@asdf-overlay/electron/surface");

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
}

async function loadMainPage(webContents) {
  await webContents.loadFile(path.join(__dirname, "../renderer/index.html"));
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
    this.input = null;

    overlay.event.once("disconnected", () => {
      this.window.destroy();
      this.event.emit("destroyed");
    });

    overlay.event.on("resized", (hwnd, width, height) => {
      if (hwnd !== this.windowId) return;
      console.debug("window resized hwnd:", hwnd, "width:", width, "height:", height);
      this.window.setSize(width, height);
    });

    let configurationEnabled = false;
    overlay.event.on("input_blocking_ended", () => {
      this.closeConfiguration();
      this.input?.disconnect();
      configurationEnabled = false;
    });

    overlay.event.on("keyboard_input", (_, input) => {
      if (input.kind === "Key" && this.keybind.update(input.key, input.state)) {
        configurationEnabled = !configurationEnabled;
        overlay.blockInput(windowId, configurationEnabled);
        if (configurationEnabled) {
          this.input = ElectronOverlayInput.connect(
            { id: windowId, overlay },
            window.webContents
          );
          this.openConfiguration();
        }
      }
    });

    this.surface = ElectronOverlaySurface.connect(
      { id: windowId, overlay },
      luid,
      window.webContents
    );

    // asdf-overlay 1.2+ surfaces emit paint errors instead of crashing silently
    if (this.surface.events && typeof this.surface.events.on === "function") {
      this.surface.events.on("error", (error) => {
        console.error(error);
      });
    }
  }

  openConfiguration() {
    this.window.webContents.send("inputCaptureStart");
    this.window.focusOnWebView();
  }

  closeConfiguration() {
    this.window.webContents.send("inputCaptureEnd");
    this.window.blurWebView();
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
    console.debug("found hwnd:", hwnd, "for pid:", pid);

    await overlay.setPosition(hwnd, length(0), length(0));
    await overlay.setAnchor(hwnd, length(0), length(0));
    await overlay.setMargin(hwnd, length(0), length(0), length(0), length(0));
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
    this.maxFps = 60;
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
      this.map.set(pid, overlay);
      try {
        await loadMainPage(overlay.window.webContents);
        console.log("warn: Initialized successfully");
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
    this.keybindKeys = keybind.split(/\s*\+\s*/);
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
    console.debug(`MaxFps updated to ${maxFps}`);
  }

  async handleEvent(message) {
    if (message.cmd === "add") await this.runOverlay(message.pid);
    else if (message.cmd === "keybind") this.updateKeybind(message.keybind);
    else if (message.cmd === "maxFps") this.updateMaxFps(message.maxFps);
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
    { urls: ["ws://localhost:24050/*", "http://localhost:24050/*"] },
    (details, callback) => {
      details.requestHeaders.Referer = "http://localhost:24050";
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
  // Single instance + must be spawned by tosu with IPC channel
  if (!app.requestSingleInstanceLock() || !process.channel) return;

  console.log("warn: Starting...");
  Menu.setApplicationMenu(null);
  app.on("window-all-closed", () => {});

  const manager = new OverlayManager();
  manager.runIpc();

  await app.whenReady();
  registerTosuProtocol();
  // Tray intentionally omitted — tosu GUI owns the system tray.
})().catch((exc) => {
  console.error(exc);
});
