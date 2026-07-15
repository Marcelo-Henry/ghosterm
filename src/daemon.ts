import { createServer, Server, Socket } from 'net'
import { unlinkSync } from 'fs'
import { TerminalSession } from './index.js'
import { renderPng } from './render.js'
import { ClientCommand, DaemonResponse, parseClientCommand } from './protocol.js'

const SOCKET_PATH = `/tmp/ghosterm-${process.getuid!()}.sock`
const IDLE_TIMEOUT = 10 * 60 * 1000
const MAX_MESSAGE_BYTES = 64 * 1024

let session: TerminalSession | null = null
let idleTimer: NodeJS.Timeout | null = null
let server: Server | null = null
let shuttingDown = false
let closeScheduled = false

function resetIdle(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(shutdown, IDLE_TIMEOUT)
}

function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true

  if (idleTimer) clearTimeout(idleTimer)
  session?.close()
  session = null
  const finish = () => {
    try { unlinkSync(SOCKET_PATH) } catch {}
    process.exit(0)
  }

  if (server?.listening) {
    server.close(finish)
  } else {
    finish()
  }
}

async function handle(msg: ClientCommand): Promise<DaemonResponse> {
  if (closeScheduled) return { ok: false, error: 'Daemon is shutting down' }
  resetIdle()

  switch (msg.action) {
    case 'spawn': {
      if (session) session.close()
      session = new TerminalSession({
        command: msg.command,
        args: msg.args,
        cwd: msg.cwd,
        cols: msg.cols,
        rows: msg.rows,
      })
      return { ok: true, pid: session.pid, message: 'Process spawned' }
    }
    case 'status': {
      return { ok: true, session: session?.status() ?? null }
    }
    case 'ping': {
      return { ok: true }
    }
    case 'screenshot-text': {
      if (!session) return { ok: false, error: 'No process' }
      return { ok: true, content: session.screenshot() }
    }
    case 'screenshot-png': {
      if (!session) return { ok: false, error: 'No process' }
      const text = session.screenshot()
      const png = renderPng(text)
      return { ok: true, file: msg.file, data: png.toString('base64') }
    }
    case 'input': {
      const activeSession = requireRunningSession()
      if (!activeSession.ok) return activeSession
      activeSession.session.input(msg.text)
      return { ok: true }
    }
    case 'key': {
      const activeSession = requireRunningSession()
      if (!activeSession.ok) return activeSession
      activeSession.session.key(msg.key)
      return { ok: true }
    }
    case 'wait': {
      const activeSession = requireRunningSession()
      if (!activeSession.ok) return activeSession
      const content = await activeSession.session.wait(msg.pattern, msg.timeout)
      return { ok: true, content }
    }
    case 'resize': {
      const activeSession = requireRunningSession()
      if (!activeSession.ok) return activeSession
      activeSession.session.resize(msg.cols, msg.rows)
      return { ok: true }
    }
    case 'close': {
      if (!session) return { ok: false, error: 'No process' }
      session.close()
      session = null
      closeScheduled = true
      setTimeout(shutdown, 100)
      return { ok: true, message: 'Process closed' }
    }
    default:
      return { ok: false, error: 'Unknown action' }
  }
}

function requireRunningSession():
  | { ok: true; session: TerminalSession }
  | { ok: false; error: string } {
  if (!session) return { ok: false, error: 'No process' }
  const status = session.status()
  if (!status.running) {
    const exitDetail = status.exitCode === undefined ? '' : ` (exit code ${status.exitCode})`
    return { ok: false, error: `Process has exited${exitDetail}` }
  }
  return { ok: true, session }
}

function handleConnection(conn: Socket): void {
  let buf = ''
  let handled = false

  conn.setTimeout(5000)
  conn.on('timeout', () => {
    conn.end(JSON.stringify({ ok: false, error: 'Command timed out before completion' }) + '\n')
  })
  conn.on('data', (chunk) => {
    if (handled) return
    buf += chunk.toString()
    if (Buffer.byteLength(buf) > MAX_MESSAGE_BYTES) {
      handled = true
      conn.end(JSON.stringify({ ok: false, error: 'Command is too large' }) + '\n')
      return
    }

    const idx = buf.indexOf('\n')
    if (idx === -1) return
    handled = true
    const line = buf.slice(0, idx)

    let input: unknown
    try {
      input = JSON.parse(line)
    } catch {
      conn.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }) + '\n')
      return
    }

    const parsed = parseClientCommand(input)
    if (!parsed.ok) {
      conn.end(JSON.stringify({ ok: false, error: parsed.error }) + '\n')
      return
    }

    conn.setTimeout(0)
    handle(parsed.value)
      .then((res) => conn.end(JSON.stringify(res) + '\n'))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unexpected daemon error'
        conn.end(JSON.stringify({ ok: false, error: message }) + '\n')
      })
  })
}

export function startDaemon(): void {
  server = createServer(handleConnection)
  server.on('error', (error) => {
    console.error(`ghosterm daemon failed: ${error.message}`)
    if (idleTimer) clearTimeout(idleTimer)
    session?.close()
    process.exit(1)
  })
  server.listen(SOCKET_PATH, () => {
    resetIdle()
  })

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

export { SOCKET_PATH }

if (process.argv[1] && process.argv[1].includes('daemon')) {
  startDaemon()
}
