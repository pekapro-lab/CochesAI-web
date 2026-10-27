import './style.css'
import { UI } from './game/UI.js'
import { Game } from './game/Game.js'
import { soloGrid, netGrid } from './game/RaceMixin.js'
import { NetSession } from './net/Net.js'
import { getTrack } from './game/tracks/index.js'

const root = document.querySelector('#app')
const ui = new UI(root)
const game = new Game(root, ui)

window.__COCHES__ = game
window.__PEKA_R__ = game // same probe name as Peka-R so its physics tests run unchanged
// eslint-disable-next-line no-undef
document.documentElement.dataset.version = __COCHES_VERSION__

let net = null
let lastSolo = null
const app = { ui, game, get net() { return net } }
window.__COCHES_APP__ = app

ui.onStartSolo = async (trackId) => {
  await game.audio.ensure()
  lastSolo = trackId
  ui.showResults(null)
  game.startTrack(trackId, { grid: soloGrid(ui.playerName, ui.botCount, ui.difficulty), difficulty: ui.difficulty })
}
game.restartRace = function () {
  if (net || !lastSolo) return
  ui.showPause(false); ui.setPauseTitle('Pausa'); ui.hideCountdown()
  ui.onStartSolo(lastSolo)
}

function toMenu() {
  ui.showResults(null)
  ui.showLobby(false)
  game.exitToMenu()
}

function leaveNet() {
  net?.close()
  net = null
  game.net = null
  toMenu()
}

function wireNet(n) {
  n.on('lobby', (players) => ui.setLobbyPlayers(players, n.myId, n.isHost ? n.myId : 'cochesai-v1-' + n.code))
  n.on('msg', (m, from) => {
    if (m.t === 'start' && !n.isHost) startNetRace(m)
    else game._netMessage(m, from)
  })
  n.on('left', (pid) => {
    // A client left mid-race: its car is taken over by a bot? keep it parked.
    const r = game.racers?.find((x) => x.id === pid)
    if (r) r.name += ' (desconectado)'
  })
  n.on('hostLost', () => {
    ui.setStatus('Se ha perdido la conexión con el anfitrión.')
    leaveNet()
    ui.setStatus('Se ha perdido la conexión con el anfitrión.')
  })
  n.on('error', (e) => ui.setStatus('Error de red: ' + (e?.message || e?.type || e)))
}

async function startNetRace(m) {
  await game.audio.ensure().catch(() => {})
  ui.showLobby(false)
  ui.showResults(null)
  game.timeOfDay = m.tod || game.timeOfDay
  game.startTrack(m.track, { grid: m.grid, myId: net.myId, net, startAt: m.startAt, difficulty: m.difficulty, laps: m.laps })
}

ui.onHost = async () => {
  ui.setStatus('Creando sala…')
  try {
    net = new NetSession()
    wireNet(net)
    const code = await net.host(ui.playerName)
    ui.setStatus('')
    ui.showMenu(false)
    ui.showLobby(true, { code, isHost: true })
    ui.setLobbyPlayers(net.players, net.myId, net.myId)
  } catch (e) {
    net?.close(); net = null
    ui.setStatus('No se pudo crear la sala: ' + (e?.message || e?.type || e))
  }
}

ui.onJoin = async (code) => {
  code = String(code || '').trim().toUpperCase()
  if (code.length < 4) { ui.setStatus('Escribe el código de la sala.'); return }
  ui.setStatus('Conectando con la sala ' + code + '…')
  try {
    net = new NetSession()
    wireNet(net)
    await net.join(code, ui.playerName)
    ui.setStatus('')
    ui.showMenu(false)
    ui.showLobby(true, { code, isHost: false })
  } catch (e) {
    net?.close(); net = null
    ui.setStatus(e?.message || 'No se pudo conectar')
  }
}

ui.onStartNet = async (trackId, extra = {}) => {
  if (!net?.isHost) return
  await game.audio.ensure().catch(() => {})
  const grid = netGrid(net.players, Math.max(net.players.length, Math.min(6, net.players.length + ui.botCount)), ui.difficulty)
  const m = { t: 'start', track: trackId, tod: game.timeOfDay, grid, startAt: performance.now() + 4800, difficulty: ui.difficulty, laps: extra.laps || getTrack(trackId).laps }
  net.racing = true
  net.broadcast(m)
  startNetRace(m)
}

ui.onLeave = () => leaveNet()
ui.onResultsAgain = () => {
  ui.showResults(null)
  if (net) {
    net.racing = false
    game.exitToMenu()
    ui.showMenu(false)
    ui.showLobby(true, { code: net.code, isHost: net.isHost })
    ui.setLobbyPlayers(net.players, net.myId, net.isHost ? net.myId : 'cochesai-v1-' + net.code)
  } else if (lastSolo) ui.onStartSolo(lastSolo)
}
ui.onResultsMenu = () => (net ? leaveNet() : toMenu())
const origExit = ui.onExitToMenu
ui.onExitToMenu = () => (net ? leaveNet() : origExit())

ui.setMute(game.audio.muted)
ui.showMenu(true)
ui.showHud(false)

// Test hooks (used by scripts/ai-race.mjs)
import { AIDriver, PERSONALITIES } from './game/ai/AIDriver.js'
window.__COCHES_TEST__ = { soloGrid, netGrid, AIDriver, PERSONALITIES }
