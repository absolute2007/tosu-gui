import type { TosuAppSettings } from '../../electron/tosu-api'

export function settingsToPayload(settings: TosuAppSettings): Record<string, string> {
  return {
    ENABLE_AUTOUPDATE: String(settings.ENABLE_AUTOUPDATE),
    OPEN_DASHBOARD_ON_STARTUP: String(settings.OPEN_DASHBOARD_ON_STARTUP),
    CALCULATE_PP: String(settings.CALCULATE_PP),
    READ_MANIA_SCROLL_SPEED: String(settings.READ_MANIA_SCROLL_SPEED),
    ENABLE_KEY_OVERLAY: String(settings.ENABLE_KEY_OVERLAY),
    POLL_RATE: String(settings.POLL_RATE),
    PRECISE_DATA_POLL_RATE: String(settings.PRECISE_DATA_POLL_RATE),
    ENABLE_INGAME_OVERLAY: String(settings.ENABLE_INGAME_OVERLAY),
    INGAME_OVERLAY_KEYBIND: settings.INGAME_OVERLAY_KEYBIND,
    INGAME_OVERLAY_MAX_FPS: String(settings.INGAME_OVERLAY_MAX_FPS),
    INGAME_OVERLAY_DISABLE_ANTIALIASING: String(settings.INGAME_OVERLAY_DISABLE_ANTIALIASING),
    SERVER_IP: settings.SERVER_IP,
    SERVER_PORT: String(settings.SERVER_PORT),
  }
}