import { Peer } from 'peerjs'

const PREFIX = 'cochesai-v1-'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeRoomCode(n = 5) {
  let s = ''
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

/** PeerJS options: free public PeerJS cloud server + Google public STUN. Overridable with ?peerHost=host:port */
function peerOptions() {
  const opts = {
    debug: 0,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] },
  }
  const q = new URLSearchParams(location.search)
  const ph = q.get('peerHost')
  if (ph) {
    const [host, port] = ph.split(':')
    Object.assign(opts, { host, port: Number(port || 9000), path: q.get('peerPath') || '/', secure: q.get('peerSecure') === '1' })
  }
  return opts
}

/**
 * Star topology: the host owns the room (lobby, start time, laps, standings, bots).
 * Clients send their own car state; the host relays a snapshot of every car to everyone.
 */
export class NetSession {
  constructor() {
    this.isHost = false
    this.code = null
    this.peer = null
    this.conns = new Map() // peerId -> DataConnection (host) ; 'host' -> conn (client)
    this.players = [] // [{ id, name }]
    this.myId = null
    this.handlers = {}
    this.clockOffset = 0 // hostTime ≈ performance.now() + clockOffset
  }

  on(type, fn) { this.handlers[type] = fn }
  _emit(type, ...a) { this.handlers[type]?.(...a) }
  hostNow() { return this.isHost ? performance.now() : performance.now() + this.clockOffset }

  _open(id) {
    return new Promise((resolve, reject) => {
      const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions())
      const t = setTimeout(() => reject(new Error('Sin respuesta del servidor de salas (PeerJS)')), 15000)
      peer.on('open', (pid) => { clearTimeout(t); resolve(peer) })
      peer.on('error', (e) => { clearTimeout(t); reject(e); this._emit('error', e) })
      this.peer = peer
    })
  }

  async host(name) {
    this.isHost = true
    for (let attempt = 0; attempt < 4; attempt++) {
      this.code = makeRoomCode()
      try { await this._open(PREFIX + this.code); break } catch (e) {
        if (e?.type !== 'unavailable-id' || attempt === 3) throw e
      }
    }
    this.myId = this.peer.id
    this.players = [{ id: this.myId, name }]
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (this.players.length >= 6 || this.racing) { conn.send({ t: 'full', racing: !!this.racing }); setTimeout(() => conn.close(), 300); return }
        this.conns.set(conn.peer, conn)
      })
      conn.on('data', (m) => this._hostData(conn, m))
      conn.on('close', () => this._dropPeer(conn.peer))
      conn.on('error', () => this._dropPeer(conn.peer))
    })
    this._emit('lobby', this.players)
    return this.code
  }

  _dropPeer(pid) {
    if (!this.conns.has(pid)) return
    this.conns.delete(pid)
    this.players = this.players.filter((p) => p.id !== pid)
    this.broadcast({ t: 'lobby', players: this.players })
    this._emit('lobby', this.players)
    this._emit('left', pid)
  }

  _hostData(conn, m) {
    if (m.t === 'hello') {
      if (!this.players.find((p) => p.id === conn.peer)) this.players.push({ id: conn.peer, name: String(m.name || 'Piloto').slice(0, 16) })
      conn.send({ t: 'welcome', id: conn.peer, code: this.code })
      this.broadcast({ t: 'lobby', players: this.players })
      this._emit('lobby', this.players)
    } else if (m.t === 'ping') {
      conn.send({ t: 'pong', c: m.c, h: performance.now() })
    } else {
      this._emit('msg', m, conn.peer)
    }
  }

  async join(code, name) {
    this.isHost = false
    this.code = code.trim().toUpperCase()
    await this._open(null)
    this.myId = this.peer.id
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true })
      const t = setTimeout(() => reject(new Error('No se encuentra la sala ' + this.code)), 15000)
      this.peer.on('error', (e) => { if (e.type === 'peer-unavailable') { clearTimeout(t); reject(new Error('No existe la sala ' + this.code)) } })
      conn.on('open', () => {
        clearTimeout(t)
        this.conns.set('host', conn)
        conn.send({ t: 'hello', name })
        this._syncClock()
        resolve(this.code)
      })
      conn.on('data', (m) => {
        if (m.t === 'pong') {
          const now = performance.now(), rtt = now - m.c
          const off = m.h + rtt / 2 - now
          this._rtts = (this._rtts || []).concat([[rtt, off]]).slice(-8)
          const bestPair = this._rtts.reduce((a, b) => (b[0] < a[0] ? b : a))
          this.clockOffset = bestPair[1]
          this.rtt = bestPair[0]
        } else if (m.t === 'lobby') { this.players = m.players; this._emit('lobby', m.players) }
        else if (m.t === 'full') { reject(new Error(m.racing ? 'La carrera ya ha empezado' : 'La sala está llena')); this._emit('error', new Error('Sala llena')) }
        else this._emit('msg', m, 'host')
      })
      conn.on('close', () => this._emit('hostLost'))
    })
  }

  _syncClock() {
    let n = 0
    const tick = () => {
      const c = this.conns.get('host')
      if (!c || !c.open) return
      c.send({ t: 'ping', c: performance.now() })
      n++
      this._pingTimer = setTimeout(tick, n < 6 ? 250 : 2000)
    }
    tick()
  }

  send(m) { // client -> host
    const c = this.conns.get('host')
    if (c?.open) c.send(m)
  }

  broadcast(m, except) { // host -> all
    for (const [pid, c] of this.conns) if (pid !== except && c.open) c.send(m)
  }

  close() {
    clearTimeout(this._pingTimer)
    for (const c of this.conns.values()) try { c.close() } catch {}
    this.conns.clear()
    try { this.peer?.destroy() } catch {}
    this.peer = null
  }
}
