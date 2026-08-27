import { For, createBinding, createState } from "ags"
import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import Bluetooth from "gi://AstalBluetooth"
import Mpris from "gi://AstalMpris"
import Network from "gi://AstalNetwork"
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import style from "./style.css"

const { TOP, LEFT, RIGHT } = Astal.WindowAnchor
const PANEL_HEIGHT = 500
const SYSTEM_PANEL_HEIGHT = 40
const SYSTEM_PANEL_WIDTH = 760
const AGENT_PATH = "/com/char0/ags/bluetooth_agent"
const A2DP_AUDIO_SINK_UUID = "0000110b-0000-1000-8000-00805f9b34fb"
const VOLUME_SOUND = "/run/current-system/sw/share/sounds/freedesktop/stereo/audio-volume-change.oga"

let panel: Astal.Window
let wifiPanel: Astal.Window
let systemPanel: Astal.Window
let wallpaperPanel: Astal.Window
let volumeOsd: Astal.Window
let nowPlayingToast: Astal.Window
let agent: Gio.DBusExportedObject | null = null
let agentRegistered = false
const bluetooth = Bluetooth.get_default()
const mpris = Mpris.get_default()
const network = Network.get_default()
const [scanStatus, setScanStatus] = createState("idle")
const [deviceActions, setDeviceActions] = createState<Record<string, string>>({})
const [sortedDevices, setSortedDevices] = createState<Bluetooth.Device[]>([])
const watchedDevices = new WeakSet<Bluetooth.Device>()
const [wifiStatus, setWifiStatus] = createState("idle")
const [wifiActions, setWifiActions] = createState<Record<string, string>>({})
const [sortedAccessPoints, setSortedAccessPoints] = createState<Network.AccessPoint[]>([])
const [passwordPrompt, setPasswordPrompt] = createState<string | null>(null)
const [wifiPassword, setWifiPassword] = createState("")
type WallpaperItem = {
  path: string
  relativePath: string
  thumbnail: string
  generating: boolean
  failed: boolean
}
const wallpaperDir = GLib.build_filenamev([GLib.get_home_dir(), "pictures", "wallpaper"])
const wallpaperCacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "wallpaper", "thumbnails"])
const nowPlayingArtCacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "ags", "apple-music-art"])
const currentWallpaperFile = GLib.build_filenamev([GLib.get_user_cache_dir(), "current-wallpaper"])
const wallpaperExtensions = new Set([
  "avif", "bmp", "cur", "dds", "exr", "ff", "gif", "hdr", "heic", "heif", "ico", "j2c", "j2k", "jp2",
  "jpe", "jpeg", "jpg", "jxl", "pam", "pbm", "pfm", "pgm", "png", "pnm", "ppm", "qoi", "svg", "svgz",
  "tga", "tif", "tiff", "webp", "xbm", "xcf", "xpm",
])
const [wallpapers, setWallpapers] = createState<WallpaperItem[]>([])
const [wallpaperColumn1, setWallpaperColumn1] = createState<WallpaperItem[]>([])
const [wallpaperColumn2, setWallpaperColumn2] = createState<WallpaperItem[]>([])
const [wallpaperColumn3, setWallpaperColumn3] = createState<WallpaperItem[]>([])
const [wallpaperStatus, setWallpaperStatus] = createState("No wallpapers loaded")
const [currentWallpaper, setCurrentWallpaper] = createState("")
let currentWifiPassword = ""
let wifiListFrozen = false
const watchedAccessPoints = new WeakSet<Network.AccessPoint>()
type SystemStats = {
  time: string
  battery: string
  batteryTime: string
  batteryState: string
  powerMode: string
  watts: string
  cpuFrequency: string
  cpuLoad: string
  cpuLoadPercent: number
  ram: string
  ramPercent: number
  batteryPercent: number
}
const [systemStats, setSystemStats] = createState<SystemStats>({
  time: "--:--",
  battery: "--%",
  batteryTime: "",
  batteryState: "unknown",
  powerMode: "unknown",
  watts: "--W",
  cpuFrequency: "--GHz",
  cpuLoad: "--%",
  cpuLoadPercent: 0,
  ram: "--%",
  ramPercent: 0,
  batteryPercent: 0,
})
const [volumePercent, setVolumePercent] = createState(0)
const [volumeMuted, setVolumeMuted] = createState(false)
const [nowPlayingVisible, setNowPlayingVisible] = createState(false)
const [nowPlayingTitle, setNowPlayingTitle] = createState("")
const [nowPlayingArtist, setNowPlayingArtist] = createState("")
const [nowPlayingAlbum, setNowPlayingAlbum] = createState("")
const [nowPlayingPaintable, setNowPlayingPaintable] = createState<Gdk.Paintable | null>(null)
const [nowPlayingIsPlaying, setNowPlayingIsPlaying] = createState(false)
let volumeHideTimer = 0
let nowPlayingHideTimer = 0
let nowPlayingRefreshTimer = 0
let lastNowPlayingKey = ""
let nowPlayingInitialized = false
let previousCpuSample: { idle: number, total: number } | null = null
const notifiedBatteryThresholds = new Set<number>()

Gio._promisify(Bluetooth.Device.prototype, "connect_device", "connect_device_finish")
Gio._promisify(Bluetooth.Device.prototype, "disconnect_device", "disconnect_device_finish")
Gio._promisify(Network.AccessPoint.prototype, "activate", "activate_finish")
Gio._promisify(Network.Wifi.prototype, "deactivate_connection", "deactivate_connection_finish")

const agentXml = `
<node>
  <interface name="org.bluez.Agent1">
    <method name="Release" />
    <method name="RequestPinCode">
      <arg type="o" name="device" direction="in" />
      <arg type="s" name="pincode" direction="out" />
    </method>
    <method name="DisplayPinCode">
      <arg type="o" name="device" direction="in" />
      <arg type="s" name="pincode" direction="in" />
    </method>
    <method name="RequestPasskey">
      <arg type="o" name="device" direction="in" />
      <arg type="u" name="passkey" direction="out" />
    </method>
    <method name="DisplayPasskey">
      <arg type="o" name="device" direction="in" />
      <arg type="u" name="passkey" direction="in" />
      <arg type="q" name="entered" direction="in" />
    </method>
    <method name="RequestConfirmation">
      <arg type="o" name="device" direction="in" />
      <arg type="u" name="passkey" direction="in" />
    </method>
    <method name="RequestAuthorization">
      <arg type="o" name="device" direction="in" />
    </method>
    <method name="AuthorizeService">
      <arg type="o" name="device" direction="in" />
      <arg type="s" name="uuid" direction="in" />
    </method>
    <method name="Cancel" />
  </interface>
</node>`

function centeredTopMargin() {
  const display = Gdk.Display.get_default()
  const monitor = display?.get_monitors().get_item(0) as Gdk.Monitor | null
  const geometry = monitor?.get_geometry()

  return geometry ? Math.max(0, Math.floor((geometry.height - PANEL_HEIGHT) / 2)) : 0
}

function currentAdapter() {
  return bluetooth.adapter
}

function setDeviceAction(address: string, message: string | null) {
  setDeviceActions((actions) => {
    const next = { ...actions }

    if (message) next[address] = message
    else delete next[address]

    return next
  })
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function bluetoothErrorMessage(error: unknown) {
  const message = errorMessage(error)

  if (message.includes("br-connection-create-socket")) return "speaker is not accepting a Bluetooth audio connection"
  if (message.includes("No discovery started")) return "scan already stopped"
  if (message.includes("AlreadyExists")) return "device is already paired"
  if (message.includes("AuthenticationCanceled")) return "pairing was cancelled"
  if (message.includes("AuthenticationFailed")) return "pairing authentication failed"
  if (message.includes("NotReady")) return "Bluetooth adapter is not ready"
  if (message.includes("NotAvailable")) return "device is not available"
  if (message.includes("org.bluez.Error.Failed")) return message.split("org.bluez.Error.Failed:").pop()?.trim() || "Bluetooth operation failed"
  if (message.includes("GDBus.Error:")) return message.split("GDBus.Error:").pop()?.trim() || "Bluetooth operation failed"

  return message
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve()
      return GLib.SOURCE_REMOVE
    })
  })
}

async function waitForPaired(device: Bluetooth.Device) {
  for (let i = 0; i < 40; i += 1) {
    if (device.paired) return
    await delay(250)
  }

  throw new Error("pairing timed out")
}

async function waitForDisconnected(device: Bluetooth.Device) {
  for (let i = 0; i < 20; i += 1) {
    if (!device.connected) return
    await delay(250)
  }

  throw new Error("disconnect timed out")
}

function watchDevice(device: Bluetooth.Device) {
  if (watchedDevices.has(device)) return

  watchedDevices.add(device)
  device.connect("notify::connected", refreshDeviceList)
  device.connect("notify::paired", refreshDeviceList)
  device.connect("notify::battery-percentage", refreshDeviceList)
  device.connect("notify::alias", refreshDeviceList)
  device.connect("notify::name", refreshDeviceList)
}

function refreshDeviceList() {
  const list = [...bluetooth.devices].sort(compareDevices)

  list.forEach(watchDevice)
  setSortedDevices(list)
}

function bluezDevicePath(device: Bluetooth.Device) {
  return `/org/bluez/hci0/dev_${device.address.replace(/:/g, "_")}`
}

async function disconnectDevice(device: Bluetooth.Device) {
  const name = deviceName(device)

  console.log(`Bluetooth disconnect starting: ${name} ${device.address}`)

  try {
    await device.disconnect_device()
  } catch (error) {
    console.log(`Astal disconnect failed for ${name}: ${errorMessage(error)}`)
  }

  if (!device.connected) return

  try {
    Gio.DBus.system.call_sync(
      "org.bluez",
      bluezDevicePath(device),
      "org.bluez.Device1",
      "Disconnect",
      null,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
    )
  } catch (error) {
    console.log(`BlueZ disconnect failed for ${name}: ${errorMessage(error)}`)
  }

  await waitForDisconnected(device)
  console.log(`Bluetooth disconnect finished: ${name}`)
}

function connectAudioSinkProfile(device: Bluetooth.Device) {
  Gio.DBus.system.call_sync(
    "org.bluez",
    bluezDevicePath(device),
    "org.bluez.Device1",
    "ConnectProfile",
    new GLib.Variant("(s)", [A2DP_AUDIO_SINK_UUID]),
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null,
  )
}

function registerAgent() {
  if (agentRegistered) return

  try {
    agent ??= Gio.DBusExportedObject.wrapJSObject(agentXml, {
      Release() {},
      RequestPinCode() {
        throw new Error("PIN code pairing is not supported by this panel")
      },
      DisplayPinCode(_device: string, pincode: string) {
        console.log(`Bluetooth PIN code: ${pincode}`)
      },
      RequestPasskey() {
        throw new Error("Passkey entry is not supported by this panel")
      },
      DisplayPasskey(_device: string, passkey: number) {
        console.log(`Bluetooth passkey: ${passkey}`)
      },
      RequestConfirmation() {},
      RequestAuthorization() {},
      AuthorizeService() {},
      Cancel() {},
    })

    agent.export(Gio.DBus.system, AGENT_PATH)
    Gio.DBus.system.call_sync(
      "org.bluez",
      "/org/bluez",
      "org.bluez.AgentManager1",
      "RegisterAgent",
      new GLib.Variant("(os)", [AGENT_PATH, "DisplayYesNo"]),
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
    )
    Gio.DBus.system.call_sync(
      "org.bluez",
      "/org/bluez",
      "org.bluez.AgentManager1",
      "RequestDefaultAgent",
      new GLib.Variant("(o)", [AGENT_PATH]),
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
    )
    agentRegistered = true
  } catch (error) {
    console.log(`Bluetooth agent registration failed: ${error}`)
  }
}

function startDiscovery() {
  const adapter = currentAdapter()

  setScanStatus("starting")

  if (!adapter) {
    setScanStatus("No adapter found")
    console.log("Bluetooth discovery skipped: no adapter")
    return
  }

  if (!adapter.powered) {
    setScanStatus("Adapter is off")
    console.log("Bluetooth discovery skipped: adapter is off")
    return
  }

  try {
    console.log(`Bluetooth discovery starting: discovering=${adapter.discovering}`)
    registerAgent()
    adapter.pairable = true
    adapter.discoverable = true
    if (!adapter.discovering) adapter.start_discovery()
    setScanStatus("scanning")
    console.log("Bluetooth discovery started")
  } catch (error) {
    const message = bluetoothErrorMessage(error)
    setScanStatus(`Scan failed: ${message}`)
    console.log(`Bluetooth discovery failed: ${message}`)
  }
}

function stopDiscovery() {
  const adapter = currentAdapter()

  setScanStatus("idle")

  try {
    if (adapter?.discovering) adapter.stop_discovery()
  } catch (error) {
    const message = bluetoothErrorMessage(error)
    if (message !== "scan already stopped") console.log(`Bluetooth stop discovery failed: ${message}`)
  }
}

function togglePanel() {
  panel.visible = !panel.visible
  if (panel.visible) panel.present()
}

function toggleWifiPanel() {
  wifiPanel.visible = !wifiPanel.visible
  if (wifiPanel.visible) wifiPanel.present()
}

function toggleSystemPanel() {
  systemPanel.visible = !systemPanel.visible
  if (systemPanel.visible) systemPanel.present()
}

function toggleWallpaperPanel() {
  wallpaperPanel.visible = !wallpaperPanel.visible
  if (wallpaperPanel.visible) {
    ensureWallpaperDaemon()
    refreshWallpapers()
    wallpaperPanel.present()
  }
}

function runAsync(command: string) {
  try {
    GLib.spawn_command_line_async(command)
  } catch (error) {
    console.log(`Command failed: ${command}: ${errorMessage(error)}`)
  }
}

function runSync(command: string) {
  try {
    const [ok, stdout] = GLib.spawn_command_line_sync(command)

    return ok ? new TextDecoder().decode(stdout).trim() : null
  } catch (error) {
    console.log(`Command failed: ${command}: ${errorMessage(error)}`)
    return null
  }
}

function updateVolumeState() {
  const output = runSync("wpctl get-volume @DEFAULT_AUDIO_SINK@")
  const level = Number(output?.match(/Volume:\s+([0-9.]+)/)?.[1])

  setVolumePercent(Number.isFinite(level) ? Math.round(Math.max(0, Math.min(1, level)) * 100) : 0)
  setVolumeMuted(!!output?.includes("[MUTED]"))
}

function showVolumeOsd() {
  if (!volumeOsd) return

  volumeOsd.visible = true
  volumeOsd.present()

  if (volumeHideTimer) GLib.source_remove(volumeHideTimer)

  volumeHideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1100, () => {
    volumeOsd.visible = false
    volumeHideTimer = 0
    return GLib.SOURCE_REMOVE
  })
}

function changeVolume(action: "up" | "down" | "mute") {
  if (action === "up") {
    runSync("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+")
  } else if (action === "down") {
    runSync("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-")
  } else {
    runSync("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle")
  }

  updateVolumeState()
  showVolumeOsd()

  if (action !== "mute") runAsync(`pw-play ${VOLUME_SOUND}`)
}

function listMprisPlayers() {
  const players = []

  for (let i = 0; i < mpris.get_n_items(); i += 1) {
    const player = mpris.get_item(i)
    if (player) players.push(player)
  }

  return players
}

function gobjProp(player: any, name: string): any {
  return player[name]
}

function isAppleMusicPlayer(player: any) {
  const busName = String(gobjProp(player, "busName") || gobjProp(player, "bus_name") || "").toLowerCase()
  const identity = String(gobjProp(player, "identity") || "").toLowerCase()
  const hasTrack = !!String(gobjProp(player, "title") || "") && !!String(gobjProp(player, "artist") || "")
  const isSupportedBrowser =
    busName.includes("chromium") || busName.includes("chrome") ||
    identity.includes("chromium") || identity.includes("chrome")

  return hasTrack && isSupportedBrowser
}

function appleMusicPlayer() {
  return listMprisPlayers().find(isAppleMusicPlayer) as any | undefined
}

function playerIsPlaying(player: any) {
  const status = gobjProp(player, "playbackStatus") ?? gobjProp(player, "playback_status")
  const s = String(status).toLowerCase()

  return status === Mpris.PlaybackStatus.PLAYING || status === 0 || s === "0" || s === "playing"
}

function cachedArtPath(sourcePath: string): string {
  const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, sourcePath, -1)
  return GLib.build_filenamev([nowPlayingArtCacheDir, `${hash}`])
}

function copyArtToCache(sourcePath: string): string | null {
  if (!sourcePath) return null

  try {
    GLib.mkdir_with_parents(nowPlayingArtCacheDir, 0o755)
  } catch (_err) {
    // dir may already exist
  }

  const destPath = cachedArtPath(sourcePath)

  try {
    const source = Gio.File.new_for_path(sourcePath)
    const dest = Gio.File.new_for_path(destPath)

    if (dest.query_exists(null)) return destPath

    source.copy(dest, Gio.FileCopyFlags.OVERWRITE, null, null)
    return destPath
  } catch (error) {
    console.log(`Art cache copy failed: ${sourcePath} -> ${destPath}: ${errorMessage(error)}`)
    return null
  }
}

function loadNowPlayingArt(sourcePath: string) {
  if (!sourcePath) {
    setNowPlayingPaintable(null)
    return
  }

  const cachedPath = copyArtToCache(sourcePath)

  if (!cachedPath) {
    setNowPlayingPaintable(null)
    return
  }

  try {
    setNowPlayingPaintable(Gdk.Texture.new_from_file(Gio.File.new_for_path(cachedPath)))
  } catch (error) {
    console.log(`Now playing art load failed: ${cachedPath}: ${errorMessage(error)}`)
    setNowPlayingPaintable(null)
  }
}

function scheduleNowPlayingRefresh(player: any) {
  if (nowPlayingRefreshTimer) GLib.source_remove(nowPlayingRefreshTimer)

  nowPlayingRefreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
    nowPlayingRefreshTimer = 0
    updateNowPlayingFromPlayer(player, false)
    return GLib.SOURCE_REMOVE
  })
}

function updateNowPlayingFromPlayer(player: any, force: boolean) {
  const title = String(gobjProp(player, "title") || "")
  const artist = String(gobjProp(player, "artist") || "")
  if (!title || !artist) return

  const trackKey = [String(gobjProp(player, "busName") || gobjProp(player, "bus_name") || ""), artist, title, String(gobjProp(player, "album") || "")].join("\u0000")
  const isTrackChange = trackKey !== lastNowPlayingKey

  if (isTrackChange) lastNowPlayingKey = trackKey

  setNowPlayingTitle(title)
  setNowPlayingArtist(artist)
  setNowPlayingAlbum(String(gobjProp(player, "album") || ""))
  setNowPlayingIsPlaying(playerIsPlaying(player))
  loadNowPlayingArt(String(gobjProp(player, "coverArt") || gobjProp(player, "cover_art") || ""))

  const art = gobjProp(player, "coverArt") || gobjProp(player, "cover_art") || ""
  const playing = playerIsPlaying(player)
  console.log(`Now playing: ${artist} - ${title} art=${art} playing=${playing} trackChange=${isTrackChange} force=${force}`)

  if (!nowPlayingToast) return

  if (isTrackChange || force) {
    setNowPlayingVisible(true)
    nowPlayingToast.visible = true
    nowPlayingToast.present()

    if (nowPlayingHideTimer) GLib.source_remove(nowPlayingHideTimer)
    nowPlayingHideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 6500, () => {
      setNowPlayingVisible(false)
      nowPlayingToast.visible = false
      nowPlayingHideTimer = 0
      return GLib.SOURCE_REMOVE
    })
  }
}

function showNowPlaying(player = appleMusicPlayer(), force = false) {
  if (!player) return
  updateNowPlayingFromPlayer(player, force)
}

function controlAppleMusic(action: "previous" | "play-pause" | "next") {
  const player = appleMusicPlayer()
  if (!player) return

  if (action === "previous") player.previous()
  else if (action === "next") player.next()
  else player.play_pause()

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
    scheduleNowPlayingRefresh(player)
    return GLib.SOURCE_REMOVE
  })
}

function watchMprisPlayer(player: any) {
  player.connect("notify::title", () => scheduleNowPlayingRefresh(player))
  player.connect("notify::artist", () => scheduleNowPlayingRefresh(player))
  player.connect("notify::album", () => scheduleNowPlayingRefresh(player))
  player.connect("notify::cover-art", () => scheduleNowPlayingRefresh(player))
  player.connect("notify::playback-status", () => scheduleNowPlayingRefresh(player))
}

function initNowPlayingWatcher() {
  listMprisPlayers().forEach(watchMprisPlayer)
  mpris.connect("player-added", (_mpris, player) => watchMprisPlayer(player))

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => {
    const player = appleMusicPlayer()
    if (player && !nowPlayingInitialized) {
      updateNowPlayingFromPlayer(player, true)
      nowPlayingInitialized = true
    }
    return GLib.SOURCE_REMOVE
  })
}

function readTextFile(path: string) {
  try {
    const [ok, contents] = GLib.file_get_contents(path)
    return ok ? new TextDecoder().decode(contents).trim() : null
  } catch (_error) {
    return null
  }
}

function readNumberFile(path: string) {
  const text = readTextFile(path)
  const value = text === null ? NaN : Number(text)

  return Number.isFinite(value) ? value : null
}

function fileExists(path: string) {
  return GLib.file_test(path, GLib.FileTest.EXISTS)
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function wallpaperExtension(path: string) {
  const basename = GLib.path_get_basename(path)
  const index = basename.lastIndexOf(".")

  return index >= 0 ? basename.slice(index + 1).toLowerCase() : ""
}

function isWallpaper(path: string) {
  return wallpaperExtensions.has(wallpaperExtension(path))
}

function relativeWallpaperPath(path: string) {
  if (!path.startsWith(`${wallpaperDir}/`)) return GLib.path_get_basename(path)
  return path.slice(wallpaperDir.length + 1)
}

function thumbnailPath(path: string, info: Gio.FileInfo) {
  const modified = info.get_modification_date_time()?.format_iso8601() || "unknown"
  const size = info.get_size()
  const key = `${path}|${modified}|${size}`
  const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, key, -1)

  return GLib.build_filenamev([wallpaperCacheDir, `${hash}.png`])
}

function scanWallpapersInDirectory(directory: Gio.File, items: WallpaperItem[]) {
  let enumerator: Gio.FileEnumerator | null = null

  try {
    enumerator = directory.enumerate_children(
      "standard::name,standard::type,standard::size,time::modified",
      Gio.FileQueryInfoFlags.NONE,
      null,
    )

    let info = enumerator.next_file(null)
    while (info) {
      const child = directory.get_child(info.get_name())
      const path = child.get_path()

      if (path && info.get_file_type() === Gio.FileType.DIRECTORY) {
        scanWallpapersInDirectory(child, items)
      } else if (path && info.get_file_type() === Gio.FileType.REGULAR && isWallpaper(path)) {
        const thumbnail = thumbnailPath(path, info)
        items.push({
          path,
          relativePath: relativeWallpaperPath(path),
          thumbnail: fileExists(thumbnail) ? thumbnail : "",
          generating: !fileExists(thumbnail),
          failed: false,
        })
      }

      info = enumerator.next_file(null)
    }
  } catch (error) {
    console.log(`Wallpaper scan failed: ${errorMessage(error)}`)
  } finally {
    enumerator?.close(null)
  }
}

function setWallpaperColumns(items: WallpaperItem[]) {
  setWallpaperColumn1(items.filter((_item, index) => index % 3 === 0))
  setWallpaperColumn2(items.filter((_item, index) => index % 3 === 1))
  setWallpaperColumn3(items.filter((_item, index) => index % 3 === 2))
}

function setWallpaperItems(items: WallpaperItem[]) {
  setWallpapers(items)
  setWallpaperColumns(items)
}

function refreshWallpapers() {
  const directory = Gio.File.new_for_path(wallpaperDir)

  setCurrentWallpaper(readTextFile(currentWallpaperFile) || "")

  if (!directory.query_exists(null)) {
    setWallpaperItems([])
    setWallpaperStatus(`Create ${wallpaperDir} and add images`)
    return
  }

  const items: WallpaperItem[] = []
  scanWallpapersInDirectory(directory, items)
  items.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  setWallpaperItems(items)
  setWallpaperStatus(items.length ? `${items.length} images in ~/pictures/wallpaper` : "No images found in ~/pictures/wallpaper")
  generateMissingThumbnails(items)
}

function updateWallpaperItem(path: string, update: Partial<WallpaperItem>) {
  setWallpapers((items) => {
    const next = items.map((item) => item.path === path ? { ...item, ...update } : item)
    setWallpaperColumns(next)
    return next
  })
}

function ensureWallpaperDaemon() {
  try {
    GLib.spawn_command_line_async("pgrep -x awww-daemon >/dev/null || awww-daemon")
  } catch (error) {
    console.log(`Starting awww-daemon failed: ${errorMessage(error)}`)
  }
}

function generateMissingThumbnails(items: WallpaperItem[]) {
  const missing = items.filter((item) => !item.thumbnail && item.generating)

  GLib.mkdir_with_parents(wallpaperCacheDir, 0o755)
  generateThumbnailQueue(missing, 0)
}

function generateThumbnailQueue(items: WallpaperItem[], index: number) {
  const item = items[index]
  if (!item) return

  const thumbnail = thumbnailPath(item.path, Gio.File.new_for_path(item.path).query_info(
    "standard::size,time::modified",
    Gio.FileQueryInfoFlags.NONE,
    null,
  ))
  const command = [
    "magick",
    `${item.path}[0]`,
    "-auto-orient",
    "-thumbnail",
    "260x146^",
    "-gravity",
    "center",
    "-extent",
    "260x146",
    thumbnail,
  ]

  try {
    const [, pid] = GLib.spawn_async(null, command, null, GLib.SpawnFlags.DO_NOT_REAP_CHILD | GLib.SpawnFlags.SEARCH_PATH, null)
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (_pid, status) => {
      GLib.spawn_close_pid(pid)
      updateWallpaperItem(item.path, {
        thumbnail: status === 0 && fileExists(thumbnail) ? thumbnail : "",
        generating: false,
        failed: status !== 0 || !fileExists(thumbnail),
      })
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
        generateThumbnailQueue(items, index + 1)
        return GLib.SOURCE_REMOVE
      })
    })
  } catch (error) {
    console.log(`Thumbnail generation failed for ${item.path}: ${errorMessage(error)}`)
    updateWallpaperItem(item.path, { generating: false, failed: true })
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
      generateThumbnailQueue(items, index + 1)
      return GLib.SOURCE_REMOVE
    })
  }
}

function setWallpaper(path: string) {
  try {
    ensureWallpaperDaemon()
    GLib.mkdir_with_parents(GLib.path_get_dirname(currentWallpaperFile), 0o755)
    GLib.file_set_contents(currentWallpaperFile, path)
    setCurrentWallpaper(path)
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
      GLib.spawn_command_line_async(
        `awww img ${shellQuote(path)} --transition-type fade --transition-duration 0.2 --transition-fps 60`,
      )
      return GLib.SOURCE_REMOVE
    })
  } catch (error) {
    console.log(`Set wallpaper failed for ${path}: ${errorMessage(error)}`)
  }
}

function formatWatts(microwatts: number | null) {
  return microwatts === null ? "--W" : `${(microwatts / 1_000_000).toFixed(1)}W`
}

function formatBytesFromKb(kb: number) {
  return (kb / 1024 / 1024).toFixed(1)
}

function cpuSample() {
  const line = readTextFile("/proc/stat")?.split("\n")[0]
  const values = line?.trim().split(/\s+/).slice(1).map(Number)

  if (!values || values.some((value) => !Number.isFinite(value))) return null

  const idle = (values[3] || 0) + (values[4] || 0)
  const total = values.reduce((sum, value) => sum + value, 0)

  return { idle, total }
}

function cpuLoadPercent() {
  const sample = cpuSample()

  if (!sample) return null
  if (!previousCpuSample) {
    previousCpuSample = sample
    return null
  }

  const idleDelta = sample.idle - previousCpuSample.idle
  const totalDelta = sample.total - previousCpuSample.total
  previousCpuSample = sample

  if (totalDelta <= 0) return null

  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)))
}

function cpuFrequency() {
  const matches = readTextFile("/proc/cpuinfo")?.match(/cpu MHz\s*:\s*([0-9.]+)/g)
  const values = matches?.map((match) => Number(match.split(":")[1]?.trim())).filter(Number.isFinite)

  if (!values?.length) return "--GHz"
  const average = values.reduce((sum, value) => sum + value, 0) / values.length

  return `${(average / 1000).toFixed(2)}GHz`
}

function ramStats() {
  const lines = readTextFile("/proc/meminfo")?.split("\n") || []
  const total = Number(lines.find((line) => line.startsWith("MemTotal:"))?.match(/\d+/)?.[0])
  const available = Number(lines.find((line) => line.startsWith("MemAvailable:"))?.match(/\d+/)?.[0])

  if (!Number.isFinite(total) || !Number.isFinite(available) || total <= 0) return { label: "--%", percent: 0 }

  const used = total - available
  const percent = Math.round((used / total) * 100)

  return { label: `${percent}% ${formatBytesFromKb(used)}/${formatBytesFromKb(total)}G`, percent }
}

function meterText(percent: number) {
  const filled = Math.max(0, Math.min(5, Math.ceil(percent / 20)))

  return "▰".repeat(filled) + "▱".repeat(5 - filled)
}

function notifyBattery(threshold: number, percentage: number) {
  try {
    GLib.spawn_command_line_async(`notify-send -u critical "Battery low" "Battery at ${percentage}%, running on battery"`)
  } catch (error) {
    console.log(`Battery notification failed at ${threshold}%: ${errorMessage(error)}`)
  }
}

function formatBatteryTimeLeft(acOnline: boolean, status: string) {
  if (acOnline || status !== "Discharging") return ""

  const energyNow = readNumberFile("/sys/class/power_supply/BAT0/energy_now")
  const powerNow = readNumberFile("/sys/class/power_supply/BAT0/power_now")

  if (!energyNow || !powerNow || energyNow <= 0 || powerNow <= 0) return ""

  const totalMinutes = Math.max(1, Math.round((energyNow / powerNow) * 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) return `${minutes}m`
  if (minutes <= 0) return `${hours}h`

  return `${hours}h ${minutes}m`
}

function checkBatteryNotifications(percentage: number | null, status: string, acOnline: boolean) {
  if (acOnline || status === "Charging" || status === "Full") {
    notifiedBatteryThresholds.clear()
    return
  }

  if (percentage === null || status !== "Discharging") return

  for (const threshold of [20, 10, 5]) {
    if (percentage <= threshold && !notifiedBatteryThresholds.has(threshold)) {
      notifiedBatteryThresholds.add(threshold)
      notifyBattery(threshold, percentage)
    }
  }
}

function updateSystemStats() {
  const now = GLib.DateTime.new_now_local()
  const capacity = readNumberFile("/sys/class/power_supply/BAT0/capacity")
  const status = readTextFile("/sys/class/power_supply/BAT0/status") || "unknown"
  const acOnline = readNumberFile("/sys/class/power_supply/AC/online") === 1
  const watts = readNumberFile("/sys/class/power_supply/BAT0/power_now")
  const cpuPercent = cpuLoadPercent()
  const ram = ramStats()
  const batteryTime = formatBatteryTimeLeft(acOnline, status)

  checkBatteryNotifications(capacity, status, acOnline)
  setSystemStats({
    time: now.format("%a %H:%M") || "--:--",
    battery: capacity === null ? "--%" : `${capacity}%`,
    batteryTime,
    batteryState: status === "Charging" ? "CHG" : status === "Discharging" ? "DIS" : status,
    powerMode: acOnline ? "AC" : "BAT",
    watts: formatWatts(watts),
    cpuFrequency: cpuFrequency(),
    cpuLoad: cpuPercent === null ? "--%" : `${cpuPercent}%`,
    cpuLoadPercent: cpuPercent || 0,
    ram: ram.label,
    ramPercent: ram.percent,
    batteryPercent: capacity || 0,
  })
}

function deviceName(device: Bluetooth.Device) {
  return device.alias || device.name || device.address || "Unknown device"
}

function deviceStatus(device: Bluetooth.Device) {
  return device.batteryPercentage >= 0 ? `${device.batteryPercentage}%` : ""
}

function deviceSortGroup(device: Bluetooth.Device) {
  if (device.connected) return 0
  if (device.paired) return 1
  return 2
}

function compareDevices(a: Bluetooth.Device, b: Bluetooth.Device) {
  const group = deviceSortGroup(a) - deviceSortGroup(b)

  if (group !== 0) return group

  return deviceName(a).localeCompare(deviceName(b))
}

function deviceIcon(device: Bluetooth.Device) {
  const icon = device.icon
  const candidates = [
    icon,
    icon && !icon.endsWith("-symbolic") ? `${icon}-symbolic` : null,
    icon?.replace(/^audio-card$/, "audio-speakers-symbolic"),
    icon?.replace(/^audio-headphones$/, "audio-headphones-symbolic"),
    icon?.replace(/^audio-headset$/, "audio-headset-symbolic"),
    icon?.replace(/^input-keyboard$/, "input-keyboard-symbolic"),
    icon?.replace(/^input-mouse$/, "input-mouse-symbolic"),
    icon?.replace(/^input-gaming$/, "input-gaming-symbolic"),
    icon?.replace(/^phone$/, "phone-symbolic"),
    icon?.replace(/^computer$/, "computer-symbolic"),
    "bluetooth-active-symbolic",
    "network-bluetooth-symbolic",
    "bluetooth-symbolic",
  ].filter(Boolean) as string[]

  const display = Gdk.Display.get_default()
  const theme = display ? Gtk.IconTheme.get_for_display(display) : null
  const resolved = candidates.find((candidate) => theme?.has_icon(candidate))

  return resolved || null
}

function deviceIconFallback(device: Bluetooth.Device) {
  const icon = device.icon || ""

  if (icon.includes("headphone") || icon.includes("headset") || icon.includes("audio")) return "HP"
  if (icon.includes("keyboard")) return "KB"
  if (icon.includes("mouse")) return "MS"
  if (icon.includes("phone")) return "PH"
  if (icon.includes("computer")) return "PC"

  return "BT"
}

function batteryIcon(percentage: number) {
  const candidates = [
    percentage >= 90 ? "battery-full-symbolic" : null,
    percentage >= 60 ? "battery-good-symbolic" : null,
    percentage >= 30 ? "battery-medium-symbolic" : null,
    percentage >= 10 ? "battery-low-symbolic" : null,
    "battery-caution-symbolic",
    "battery-symbolic",
  ].filter(Boolean) as string[]

  const display = Gdk.Display.get_default()
  const theme = display ? Gtk.IconTheme.get_for_display(display) : null

  return candidates.find((candidate) => theme?.has_icon(candidate)) || null
}

async function toggleDevice(device: Bluetooth.Device) {
  const address = device.address

  try {
    stopDiscovery()

    if (device.connected) {
      setDeviceAction(address, "disconnecting")
      await disconnectDevice(device)
      setDeviceAction(address, null)
      refreshDeviceList()
      return
    }

    if (!device.paired) {
      setDeviceAction(address, "pairing")
      registerAgent()
      device.pair()
      await waitForPaired(device)
    }

    device.trusted = true

    setDeviceAction(address, "connecting")
    try {
      await device.connect_device()
    } catch (error) {
      console.log(`Bluetooth generic connect failed for ${deviceName(device)}: ${bluetoothErrorMessage(error)}`)
      connectAudioSinkProfile(device)
    }
    setDeviceAction(address, null)
    refreshDeviceList()
  } catch (error) {
    setDeviceAction(address, `failed: ${bluetoothErrorMessage(error)}`)
    refreshDeviceList()
  }
}

function wifi() {
  return network.wifi
}

function accessPointName(ap: Network.AccessPoint) {
  return ap.ssid || "Hidden network"
}

function accessPointId(ap: Network.AccessPoint) {
  return ap.bssid || accessPointName(ap)
}

function accessPointConnected(ap: Network.AccessPoint) {
  return wifi()?.activeAccessPoint?.bssid === ap.bssid
}

function accessPointDedupeKey(ap: Network.AccessPoint) {
  const ssid = ap.ssid?.trim()

  return ssid ? `ssid:${ssid}` : `bssid:${ap.bssid}`
}

function chooseAccessPoint(existing: Network.AccessPoint, next: Network.AccessPoint) {
  if (accessPointConnected(next)) return next
  if (accessPointConnected(existing)) return existing

  return next.strength > existing.strength ? next : existing
}

function accessPointSortGroup(ap: Network.AccessPoint) {
  if (accessPointConnected(ap)) return 0
  if (!ap.requiresPassword) return 1
  return 2
}

function compareAccessPoints(a: Network.AccessPoint, b: Network.AccessPoint) {
  const group = accessPointSortGroup(a) - accessPointSortGroup(b)

  if (group !== 0) return group
  if (a.strength !== b.strength) return b.strength - a.strength

  return accessPointName(a).localeCompare(accessPointName(b))
}

function setWifiAction(id: string, message: string | null) {
  setWifiActions((actions) => {
    const next = { ...actions }

    if (message) next[id] = message
    else delete next[id]

    return next
  })
}

function watchAccessPoint(ap: Network.AccessPoint) {
  if (watchedAccessPoints.has(ap)) return

  watchedAccessPoints.add(ap)
  ap.connect("notify::strength", refreshAccessPoints)
  ap.connect("notify::ssid", refreshAccessPoints)
  ap.connect("notify::icon-name", refreshAccessPoints)
}

function refreshAccessPoints() {
  if (wifiListFrozen) return

  const currentWifi = wifi()
  const byNetwork = new Map<string, Network.AccessPoint>()

  for (const ap of currentWifi?.accessPoints || []) {
    const key = accessPointDedupeKey(ap)
    const existing = byNetwork.get(key)

    byNetwork.set(key, existing ? chooseAccessPoint(existing, ap) : ap)
  }

  const list = [...byNetwork.values()].sort(compareAccessPoints)

  list.forEach(watchAccessPoint)
  setSortedAccessPoints(list)
}

function startWifiScan() {
  const currentWifi = wifi()

  setWifiStatus("starting")

  if (!currentWifi) {
    setWifiStatus("No Wi-Fi device found")
    return
  }

  if (!currentWifi.enabled) {
    setWifiStatus("Wi-Fi is off")
    return
  }

  try {
    currentWifi.scan()
    setWifiStatus("scanning")
  } catch (error) {
    setWifiStatus(`Scan failed: ${errorMessage(error)}`)
  }
}

async function activateAccessPoint(ap: Network.AccessPoint, password: string | null = null) {
  const id = accessPointId(ap)

  wifiListFrozen = true

  try {
    setWifiAction(id, accessPointConnected(ap) ? "disconnecting" : "connecting")

    if (accessPointConnected(ap)) await wifi()?.deactivate_connection()
    else await ap.activate(password)

    setWifiAction(id, null)
    setPasswordPrompt(null)
    setCurrentWifiPassword("")
    wifiListFrozen = false
    refreshAccessPoints()
  } catch (error) {
    setWifiAction(id, `failed: ${errorMessage(error)}`)
    wifiListFrozen = false
    refreshAccessPoints()
  }
}

async function toggleAccessPoint(ap: Network.AccessPoint) {
  if (accessPointConnected(ap)) {
    await activateAccessPoint(ap)
    return
  }

  if (ap.requiresPassword) {
    wifiListFrozen = true
    setPasswordPrompt(accessPointId(ap))
    setCurrentWifiPassword("")
    return
  }

  await activateAccessPoint(ap)
}

async function submitWifiPassword(ap: Network.AccessPoint) {
  const password = currentWifiPassword

  if (!password) return

  await activateAccessPoint(ap, password)
}

function setCurrentWifiPassword(password: string) {
  currentWifiPassword = password
  setWifiPassword(password)
}

function closeWifiPasswordPrompt() {
  setPasswordPrompt(null)
  setCurrentWifiPassword("")
  wifiListFrozen = false
  refreshAccessPoints()
}

function WifiPanel() {
  const currentWifi = wifi()

  function onKey(
    _controller: Gtk.EventControllerKey,
    keyval: number,
  ) {
    if (keyval === Gdk.KEY_Escape) {
      closeWifiPasswordPrompt()
      wifiPanel.visible = false
      return true
    }

    return false
  }

  currentWifi?.connect("access-point-added", refreshAccessPoints)
  currentWifi?.connect("access-point-removed", refreshAccessPoints)
  currentWifi?.connect("notify::ssid", refreshAccessPoints)
  currentWifi?.connect("notify::strength", refreshAccessPoints)
  currentWifi?.connect("notify::scanning", () => {
    setWifiStatus(currentWifi.scanning ? "scanning" : "idle")
    refreshAccessPoints()
  })
  currentWifi?.connect("notify::enabled", refreshAccessPoints)
  currentWifi?.connect("notify::active-access-point", refreshAccessPoints)

  return (
    <window
      $={(ref) => {
        wifiPanel = ref
        ref.connect("notify::visible", () => {
          if (ref.visible) {
            refreshAccessPoints()
            startWifiScan()
          }
        })
      }}
      name="wifi-panel"
      namespace="wifi-panel"
      anchor={TOP | RIGHT}
      defaultHeight={PANEL_HEIGHT}
      marginTop={centeredTopMargin()}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      visible={false}
    >
      <Gtk.EventControllerKey onKeyPressed={onKey} />
      <box
        name="wifi-shell"
        orientation={Gtk.Orientation.VERTICAL}
        heightRequest={PANEL_HEIGHT}
      >
        <box name="wifi-header" orientation={Gtk.Orientation.VERTICAL}>
          <box orientation={Gtk.Orientation.HORIZONTAL}>
            <label name="wifi-title" label="Wi-Fi" halign={Gtk.Align.START} hexpand />
            <Gtk.Spinner
              name="wifi-spinner"
              spinning={wifiStatus.as((status) => status === "starting" || status === "scanning")}
              visible={wifiStatus.as((status) => status === "starting" || status === "scanning")}
            />
          </box>
          <label
            name="wifi-subtitle"
            label={wifiStatus.as((status) =>
              status === "idle" ? currentWifi?.ssid || "Available networks" : status === "starting" ? "Starting scan" : status === "scanning" ? "Scanning for networks" : status,
            )}
            halign={Gtk.Align.START}
          />
        </box>

        <scrolledwindow name="wifi-scroll" hscrollbarPolicy={Gtk.PolicyType.NEVER} vexpand>
          <box name="wifi-list" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
            <For each={sortedAccessPoints}>
              {(ap) => (
                <box name="wifi-row" orientation={Gtk.Orientation.VERTICAL}>
                  <button
                    name="wifi-device"
                    onClicked={() => toggleAccessPoint(ap)}
                    sensitive={wifiActions.as((actions) => !actions[accessPointId(ap)])}
                  >
                    <box orientation={Gtk.Orientation.HORIZONTAL} spacing={9}>
                      <label
                        name={createBinding(wifi()!, "activeAccessPoint").as(() => accessPointConnected(ap) ? "wifi-dot-connected" : "wifi-dot")}
                        label="●"
                        valign={Gtk.Align.CENTER}
                      />
                      <image
                        name="wifi-icon"
                        iconName={createBinding(ap, "iconName")}
                        pixelSize={22}
                        valign={Gtk.Align.CENTER}
                      />
                      <box hexpand orientation={Gtk.Orientation.VERTICAL}>
                        <box orientation={Gtk.Orientation.HORIZONTAL} spacing={10}>
                          <label
                            name="wifi-name"
                            label={accessPointName(ap)}
                            halign={Gtk.Align.START}
                            ellipsize={3}
                            maxWidthChars={22}
                            hexpand
                          />
                          <box name="wifi-strength" orientation={Gtk.Orientation.HORIZONTAL} spacing={5}>
                            <image
                              name="wifi-lock-icon"
                              iconName="changes-prevent-symbolic"
                              pixelSize={12}
                              visible={ap.requiresPassword}
                            />
                            <label
                              name="wifi-strength-label"
                              label={createBinding(ap, "strength").as((strength) => `${strength}%`)}
                              halign={Gtk.Align.START}
                            />
                          </box>
                        </box>
                        <label
                          name="wifi-status"
                          label={wifiActions.as((actions) => actions[accessPointId(ap)] || "")}
                          halign={Gtk.Align.START}
                          visible={wifiActions.as((actions) => !!actions[accessPointId(ap)])}
                        />
                      </box>
                    </box>
                  </button>
                  <box
                    name="wifi-password-row"
                    orientation={Gtk.Orientation.HORIZONTAL}
                    spacing={8}
                    visible={passwordPrompt.as((id) => id === accessPointId(ap))}
                  >
                    <entry
                      name="wifi-password"
                      placeholderText="Password"
                      visibility={false}
                      text={wifiPassword}
                      hexpand
                      onNotifyText={(entry) => setCurrentWifiPassword(entry.text)}
                      onActivate={() => submitWifiPassword(ap)}
                    />
                    <box name="wifi-password-actions" orientation={Gtk.Orientation.HORIZONTAL} spacing={6}>
                      <button name="wifi-password-connect" onClicked={() => submitWifiPassword(ap)}>
                        <label label="Join" />
                      </button>
                      <button name="wifi-password-cancel" onClicked={closeWifiPasswordPrompt}>
                        <label label="Cancel" />
                      </button>
                    </box>
                  </box>
                </box>
              )}
            </For>
          </box>
        </scrolledwindow>
      </box>
    </window>
  )
}

function StatSegment({ label, value, meter }: { label: string, value: string, meter?: string }) {
  return (
    <box name="system-segment" orientation={Gtk.Orientation.HORIZONTAL} spacing={5} valign={Gtk.Align.CENTER}>
      <label name="system-segment-label" label={label} />
      <label name="system-segment-value" label={value} />
      {meter ? <label name="system-segment-meter" label={meter} /> : null}
    </box>
  )
}

function VolumeOsd() {
  return (
    <window
      $={(ref) => {
        volumeOsd = ref
        updateVolumeState()
      }}
      name="volume-osd"
      namespace="volume-osd"
      anchor={TOP}
      defaultWidth={320}
      defaultHeight={64}
      exclusivity={Astal.Exclusivity.IGNORE}
      visible={false}
    >
      <box
        name="volume-osd-shell"
        orientation={Gtk.Orientation.HORIZONTAL}
        spacing={10}
        widthRequest={320}
        heightRequest={64}
      >
        <label
          name={volumeMuted.as((muted) => muted ? "volume-osd-label-muted" : "volume-osd-label")}
          label={volumeMuted.as((muted) => muted ? "MUTE" : "VOL")}
          valign={Gtk.Align.CENTER}
        />
        <label
          name="volume-osd-value"
          label={volumePercent.as((percent) => `${percent}%`)}
          valign={Gtk.Align.CENTER}
        />
        <label
          name={volumeMuted.as((muted) => muted ? "volume-osd-meter-muted" : "volume-osd-meter")}
          label={volumePercent.as((percent) => meterText(percent))}
          valign={Gtk.Align.CENTER}
        />
      </box>
    </window>
  )
}

function NowPlayingToast() {
  return (
    <window
      $={(ref) => {
        nowPlayingToast = ref
      }}
      name="now-playing-toast"
      namespace="now-playing-toast"
      anchor={TOP | RIGHT}
      defaultWidth={430}
      defaultHeight={128}
      exclusivity={Astal.Exclusivity.IGNORE}
      visible={nowPlayingVisible}
    >
      <box name="now-playing-shell" orientation={Gtk.Orientation.HORIZONTAL} spacing={14} widthRequest={430} heightRequest={128}>
        <box name="now-playing-art-frame" widthRequest={92} heightRequest={92} valign={Gtk.Align.CENTER}>
          <Gtk.Picture
            name="now-playing-art"
            paintable={nowPlayingPaintable}
            contentFit={Gtk.ContentFit.COVER}
            widthRequest={92}
            heightRequest={92}
            visible={nowPlayingPaintable.as((paintable) => !!paintable)}
          />
          <box
            name="now-playing-art-placeholder"
            widthRequest={92}
            heightRequest={92}
            visible={nowPlayingPaintable.as((paintable) => !paintable)}
          >
            <image iconName="audio-x-generic-symbolic" pixelSize={36} valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER} />
          </box>
        </box>

        <box name="now-playing-content" orientation={Gtk.Orientation.VERTICAL} spacing={7} valign={Gtk.Align.CENTER} hexpand>
          <label name="now-playing-kicker" label="Now Playing" halign={Gtk.Align.START} />
          <label
            name="now-playing-title"
            label={nowPlayingTitle}
            halign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={32}
          />
          <label
            name="now-playing-artist"
            label={nowPlayingArtist.as((artist) => artist ? artist : "Unknown Artist")}
            halign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={36}
          />
          <label
            name="now-playing-album"
            label={nowPlayingAlbum}
            halign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={36}
            visible={nowPlayingAlbum.as((album) => !!album)}
          />
          <box name="now-playing-controls" orientation={Gtk.Orientation.HORIZONTAL} spacing={8} halign={Gtk.Align.START}>
            <button name="now-playing-control" onClicked={() => controlAppleMusic("previous")}>
              <image iconName="media-skip-backward-symbolic" pixelSize={16} />
            </button>
            <button name="now-playing-control-primary" onClicked={() => controlAppleMusic("play-pause")}>
              <image iconName={nowPlayingIsPlaying.as((playing) => playing ? "media-playback-pause-symbolic" : "media-playback-start-symbolic")} pixelSize={17} />
            </button>
            <button name="now-playing-control" onClicked={() => controlAppleMusic("next")}>
              <image iconName="media-skip-forward-symbolic" pixelSize={16} />
            </button>
          </box>
        </box>
      </box>
    </window>
  )
}

function WallpaperTile({ item }: { item: WallpaperItem }) {
  return (
    <button
      name={currentWallpaper.as((current) => current === item.path ? "wallpaper-tile-selected" : "wallpaper-tile")}
      onClicked={() => setWallpaper(item.path)}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={7}>
        <box name="wallpaper-preview" widthRequest={260} heightRequest={146}>
          {item.thumbnail ? (
            <Gtk.Picture
              name="wallpaper-thumbnail"
              file={Gio.File.new_for_path(item.thumbnail)}
              contentFit={Gtk.ContentFit.COVER}
              widthRequest={260}
              heightRequest={146}
            />
          ) : (
            <box name="wallpaper-placeholder" orientation={Gtk.Orientation.VERTICAL} widthRequest={260} heightRequest={146} valign={Gtk.Align.CENTER}>
              <label name="wallpaper-placeholder-ext" label={wallpaperExtension(item.path).toUpperCase() || "IMG"} />
              <label
                name="wallpaper-placeholder-status"
                label={item.failed ? "preview unavailable" : item.generating ? "generating..." : "preview pending"}
              />
            </box>
          )}
        </box>
        <label name="wallpaper-name" label={item.relativePath} wrap xalign={0} lines={2} />
      </box>
    </button>
  )
}

function WallpaperPanel() {
  function onKey(
    _controller: Gtk.EventControllerKey,
    keyval: number,
  ) {
    if (keyval === Gdk.KEY_Escape) {
      wallpaperPanel.visible = false
      return true
    }

    return false
  }

  return (
    <window
      $={(ref) => {
        wallpaperPanel = ref
        ref.connect("notify::visible", () => {
          if (ref.visible) refreshWallpapers()
        })
      }}
      name="wallpaper-panel"
      namespace="wallpaper-panel"
      anchor={0}
      defaultWidth={900}
      defaultHeight={620}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      visible={false}
    >
      <Gtk.EventControllerKey onKeyPressed={onKey} />
      <box name="wallpaper-shell" orientation={Gtk.Orientation.VERTICAL} widthRequest={900} heightRequest={620}>
        <box name="wallpaper-header" orientation={Gtk.Orientation.VERTICAL}>
          <label name="wallpaper-title" label="Wallpaper" halign={Gtk.Align.START} />
          <label name="wallpaper-subtitle" label={wallpaperStatus} halign={Gtk.Align.START} />
        </box>
        <scrolledwindow name="wallpaper-scroll" hscrollbarPolicy={Gtk.PolicyType.NEVER} vexpand>
          <box
            name="wallpaper-grid"
            orientation={Gtk.Orientation.HORIZONTAL}
            spacing={12}
          >
            <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
              <For each={wallpaperColumn1}>
                {(item) => <WallpaperTile item={item} />}
              </For>
            </box>
            <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
              <For each={wallpaperColumn2}>
                {(item) => <WallpaperTile item={item} />}
              </For>
            </box>
            <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
              <For each={wallpaperColumn3}>
                {(item) => <WallpaperTile item={item} />}
              </For>
            </box>
          </box>
        </scrolledwindow>
      </box>
    </window>
  )
}

function SystemPanel() {
  function onKey(
    _controller: Gtk.EventControllerKey,
    _keyval: number,
  ) {
    systemPanel.visible = false
    return true
  }

  return (
    <window
      $={(ref) => {
        systemPanel = ref
        ref.connect("notify::visible", () => {
          if (ref.visible) updateSystemStats()
        })
      }}
      name="system-panel"
      namespace="system-panel"
      anchor={TOP}
      defaultWidth={SYSTEM_PANEL_WIDTH}
      defaultHeight={SYSTEM_PANEL_HEIGHT}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      visible={false}
    >
      <Gtk.EventControllerKey onKeyPressed={onKey} />
      <box
        name="system-shell"
        orientation={Gtk.Orientation.HORIZONTAL}
        widthRequest={SYSTEM_PANEL_WIDTH}
        heightRequest={SYSTEM_PANEL_HEIGHT}
      >
        <box name="system-content" orientation={Gtk.Orientation.HORIZONTAL} spacing={8} halign={Gtk.Align.CENTER} hexpand>
          <StatSegment label="TIME" value={systemStats.as((stats) => stats.time)} />
          <StatSegment
            label="BAT"
            value={systemStats.as((stats) => stats.batteryTime ? `${stats.battery} ${stats.batteryTime}` : `${stats.battery} ${stats.batteryState}`)}
            meter={systemStats.as((stats) => meterText(stats.batteryPercent))}
          />
          <StatSegment label="PWR" value={systemStats.as((stats) => `${stats.powerMode} ${stats.watts}`)} />
          <StatSegment
            label="CPU"
            value={systemStats.as((stats) => `${stats.cpuLoad} ${stats.cpuFrequency.replace("GHz", "G")}`)}
            meter={systemStats.as((stats) => meterText(stats.cpuLoadPercent))}
          />
          <StatSegment
            label="RAM"
            value={systemStats.as((stats) => stats.ram)}
            meter={systemStats.as((stats) => meterText(stats.ramPercent))}
          />
        </box>
      </box>
    </window>
  )
}

function BluetoothPanel() {
  function onKey(
    _controller: Gtk.EventControllerKey,
    keyval: number,
  ) {
    if (keyval === Gdk.KEY_Escape) {
      stopDiscovery()
      panel.visible = false
      return true
    }

    return false
  }

  return (
    <window
      $={(ref) => {
        panel = ref
        ref.connect("notify::visible", () => {
          if (ref.visible) {
            refreshDeviceList()
            startDiscovery()
          } else stopDiscovery()
        })
      }}
      name="bluetooth-panel"
      namespace="bluetooth-panel"
      anchor={TOP | RIGHT}
      defaultHeight={PANEL_HEIGHT}
      marginTop={centeredTopMargin()}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      visible={false}
    >
      <Gtk.EventControllerKey onKeyPressed={onKey} />
      <box
        name="bluetooth-shell"
        orientation={Gtk.Orientation.VERTICAL}
        heightRequest={PANEL_HEIGHT}
      >
          <box name="bluetooth-header" orientation={Gtk.Orientation.VERTICAL}>
            <box orientation={Gtk.Orientation.HORIZONTAL}>
              <label name="bluetooth-title" label="Bluetooth" halign={Gtk.Align.START} hexpand />
              <Gtk.Spinner
                name="bluetooth-spinner"
                spinning={scanStatus.as((status) => status === "starting" || status === "scanning")}
                visible={scanStatus.as((status) => status === "starting" || status === "scanning")}
              />
            </box>
            <label
              name="bluetooth-subtitle"
              label={scanStatus.as((status) =>
                status === "idle" ? "Known devices" : status === "starting" ? "Starting scan" : status === "scanning" ? "Scanning for devices" : status,
              )}
              halign={Gtk.Align.START}
            />
          </box>

          <scrolledwindow name="bluetooth-scroll" vexpand>
            <box name="bluetooth-list" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
              <For each={sortedDevices}>
                {(device) => (
                  <button
                    name="bluetooth-device"
                    onClicked={() => toggleDevice(device)}
                    sensitive={deviceActions.as((actions) => !actions[device.address])}
                  >
                    <box orientation={Gtk.Orientation.HORIZONTAL} spacing={12}>
                      <label
                        name={createBinding(device, "connected").as((connected) => connected ? "device-dot-connected" : "device-dot")}
                        label="●"
                        valign={Gtk.Align.CENTER}
                      />
                      <box name="device-icon-wrapper" valign={Gtk.Align.CENTER}>
                        <image
                          name="device-icon"
                          iconName={createBinding(device, "icon").as(() => deviceIcon(device))}
                          pixelSize={22}
                          valign={Gtk.Align.CENTER}
                          visible={createBinding(device, "icon").as(() => !!deviceIcon(device))}
                        />
                        <label
                          name="device-icon-fallback"
                          label={createBinding(device, "icon").as(() => deviceIconFallback(device))}
                          valign={Gtk.Align.CENTER}
                          visible={createBinding(device, "icon").as(() => !deviceIcon(device))}
                        />
                      </box>
                      <box hexpand orientation={Gtk.Orientation.VERTICAL}>
                        <box orientation={Gtk.Orientation.HORIZONTAL} spacing={10}>
                          <label
                            name="device-name"
                            label={deviceName(device)}
                            halign={Gtk.Align.START}
                            ellipsize={3}
                            hexpand
                          />
                          <box
                            name="device-battery"
                            orientation={Gtk.Orientation.HORIZONTAL}
                            spacing={5}
                            visible={createBinding(device, "connected").as((connected) => connected && device.batteryPercentage >= 0)}
                          >
                            <image
                              name="device-battery-icon"
                              iconName={createBinding(device, "batteryPercentage").as((battery) => batteryIcon(battery) || "battery-symbolic")}
                              pixelSize={13}
                              visible={createBinding(device, "batteryPercentage").as((battery) => !!batteryIcon(battery))}
                            />
                            <label
                              name="device-battery-label"
                              label={createBinding(device, "batteryPercentage").as((battery) => battery >= 0 ? `${battery}%` : "")}
                              halign={Gtk.Align.START}
                            />
                          </box>
                        </box>
                        <label
                          name="device-status"
                          label={deviceActions.as((actions) => actions[device.address] || "")}
                          halign={Gtk.Align.START}
                          visible={deviceActions.as((actions) => !!actions[device.address])}
                        />
                      </box>
                    </box>
                  </button>
                )}
              </For>
            </box>
          </scrolledwindow>
      </box>
    </window>
  )
}

app.start({
  css: style,
  gtkTheme: "Adwaita",
  requestHandler(request, res) {
    const command = Array.isArray(request) ? request.join(" ") : request

    if (command === "toggle bluetooth-panel") {
      togglePanel()
      return res("ok")
    }

    if (command === "toggle wifi-panel") {
      toggleWifiPanel()
      return res("ok")
    }

    if (command === "toggle system-panel") {
      toggleSystemPanel()
      return res("ok")
    }

    if (command === "toggle wallpaper-panel") {
      toggleWallpaperPanel()
      return res("ok")
    }

    if (command === "volume up") {
      changeVolume("up")
      return res("ok")
    }

    if (command === "volume down") {
      changeVolume("down")
      return res("ok")
    }

    if (command === "volume mute") {
      changeVolume("mute")
      return res("ok")
    }

    if (command === "now-playing") {
      showNowPlaying(appleMusicPlayer(), true)
      return res("ok")
    }

    if (command === "now-playing previous") {
      controlAppleMusic("previous")
      return res("ok")
    }

    if (command === "now-playing play-pause") {
      controlAppleMusic("play-pause")
      return res("ok")
    }

    if (command === "now-playing next") {
      controlAppleMusic("next")
      return res("ok")
    }

    console.log(`Unknown request: ${JSON.stringify(request)}`)
    return res("unknown command")
  },
  main() {
    updateSystemStats()
    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
      updateSystemStats()
      return GLib.SOURCE_CONTINUE
    })

    app.add_window(BluetoothPanel())
    app.add_window(WifiPanel())
    app.add_window(SystemPanel())
    app.add_window(WallpaperPanel())
    app.add_window(VolumeOsd())
    app.add_window(NowPlayingToast())
    initNowPlayingWatcher()
  },
})
