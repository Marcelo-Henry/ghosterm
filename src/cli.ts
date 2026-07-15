#!/usr/bin/env node
import { connect } from 'net'
import { existsSync, lstatSync, unlinkSync, writeFileSync } from 'fs'
import { spawn as cpSpawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { ClientCommand, DaemonResponse } from './protocol.js'

const SOCKET_PATH = `/tmp/ghosterm-${process.getuid!()}.sock`

function sendCommand(msg: ClientCommand): Promise<DaemonResponse> {
  return new Promise((res, rej) => {
    const conn = connect(SOCKET_PATH)
    let buf = ''
    conn.on('data', (chunk) => { buf += chunk.toString() })
    conn.on('end', () => {
      try {
        res(parseDaemonResponse(JSON.parse(buf.trim()) as unknown))
      } catch (error) {
        rej(error)
      }
    })
    conn.on('error', (e) => rej(e))
    conn.write(JSON.stringify(msg) + '\n')
  })
}

function waitForSocket(timeout: number = 5000): Promise<void> {
  const start = Date.now()
  return new Promise((res, rej) => {
    const check = () => {
      if (existsSync(SOCKET_PATH)) return res()
      if (Date.now() - start > timeout) return rej(new Error('Daemon failed to start'))
      setTimeout(check, 30)
    }
    check()
  })
}

function startDaemon(): void {
  const __filename = fileURLToPath(import.meta.url)
  const daemonPath = resolve(dirname(__filename), 'daemon.ts')
  const daemonDistPath = resolve(dirname(__filename), 'daemon.js')

  let cmd: string
  let args: string[]

  if (existsSync(daemonDistPath)) {
    cmd = process.execPath
    args = [daemonDistPath]
  } else {
    cmd = 'npx'
    args = ['tsx', daemonPath]
  }

  const child = cpSpawn(cmd, args, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

async function ensureDaemon(): Promise<void> {
  if (existsSync(SOCKET_PATH)) {
    try {
      const response = await sendCommand({ action: 'ping' })
      if (response.ok) return
    } catch {
      removeStaleSocket()
    }
  }

  startDaemon()
  await waitForSocket()
}

function removeStaleSocket(): void {
  let stats
  try {
    stats = lstatSync(SOCKET_PATH)
  } catch {
    return
  }
  if (!stats.isSocket()) {
    throw new Error(`Refusing to remove non-socket path: ${SOCKET_PATH}`)
  }
  unlinkSync(SOCKET_PATH)
}

function parseDaemonResponse(input: unknown): DaemonResponse {
  if (typeof input !== 'object' || input === null || typeof (input as { ok?: unknown }).ok !== 'boolean') {
    throw new Error('Daemon returned an invalid response')
  }
  if ((input as { ok: boolean }).ok === false && typeof (input as { error?: unknown }).error !== 'string') {
    throw new Error('Daemon returned an invalid error response')
  }
  return input as DaemonResponse
}

async function main(): Promise<void> {
  const [, , subcommand, ...rest] = process.argv

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(`ghosterm v0.1.0 — Terminal automation for AI agents

Run interactive terminal and TUI applications in a virtual session. Send input
and keys, wait for screen output, and capture the current terminal as text or PNG.

Usage: ghosterm <command> [args]

Commands:
  spawn <cmd> [args...]   Start a process in a virtual terminal
    --cwd <path>          Working directory (default: current)
    --cols <n>            Terminal width (default: 80)
    --rows <n>            Terminal height (default: 24)
  screenshot-text         Capture current terminal content as text
  screenshot-png [file]   Capture current terminal as a PNG image
  input <text>            Send text to the process stdin
  key <key>               Send a special key (enter, tab, escape, up, down,
                          left, right, backspace, delete, home, end, ctrl+c,
                          ctrl+d, ctrl+z, ctrl+l, ctrl+a, ctrl+e, ctrl+k, ctrl+u)
  wait <pattern>          Wait until pattern appears on screen
    --timeout <ms>        Timeout in milliseconds (default: 5000)
  resize <cols> <rows>    Resize the virtual terminal
  status                  Show the current process status
  close                   Kill the process and stop the daemon
  --examples              Show practical usage examples

Output: JSON to stdout. Exit code 0 on success, 1 on error.`)
    process.exit(0)
  }

  if (subcommand === '--examples') {
    console.log(`ghosterm — practical examples

1. Spawn htop and take a screenshot:
   ghosterm spawn htop
   ghosterm screenshot-text
   ghosterm key q
   ghosterm close

2. Interact with nano (type and save):
   ghosterm spawn nano
   ghosterm wait "GNU nano"
   ghosterm input "Hello world"
   ghosterm key ctrl+o
   ghosterm key enter
   ghosterm key ctrl+x
   ghosterm close

3. Change model in Codex CLI:
   ghosterm spawn codex --cols 120 --rows 35
   ghosterm wait "~/ghosterm"
   ghosterm input "/model"
   ghosterm key enter
   ghosterm wait "Select Model"
   ghosterm key down
   ghosterm key down
   ghosterm key enter
   ghosterm key enter
   ghosterm screenshot-text
   ghosterm close

4. Send a message to Claude Code:
   ghosterm spawn claude --cols 120 --rows 30
   ghosterm wait ">"
   ghosterm input "explain this codebase"
   ghosterm key enter
   ghosterm wait ">" --timeout 30000
   ghosterm screenshot-text
   ghosterm close

5. Take a PNG screenshot of a TUI:
   ghosterm spawn htop
   ghosterm wait "CPU"
   ghosterm screenshot-png /tmp/htop.png
   ghosterm close

6. Run a script and wait for output:
   ghosterm spawn bash -c "npm test"
   ghosterm wait "passed" --timeout 60000
   ghosterm screenshot-text
   ghosterm close

7. Navigate a menu with arrow keys:
   ghosterm spawn my-cli-app
   ghosterm wait "Select option"
   ghosterm key down
   ghosterm key down
   ghosterm key enter
   ghosterm screenshot-text
   ghosterm close

8. Use vim to edit a file:
   ghosterm spawn vim test.txt
   ghosterm wait "test.txt"
   ghosterm key i
   ghosterm input "first line"
   ghosterm key escape
   ghosterm input ":wq"
   ghosterm key enter
   ghosterm close

9. Debug a hanging process:
   ghosterm spawn node server.js --cols 120
   ghosterm wait "listening" --timeout 10000
   ghosterm screenshot-text
   ghosterm key ctrl+c
   ghosterm close

10. Resize terminal mid-session:
    ghosterm spawn top
    ghosterm wait "load average"
    ghosterm resize 200 50
    ghosterm screenshot-png /tmp/top-wide.png
    ghosterm close`)
    process.exit(0)
  }

  let msg: ClientCommand

  switch (subcommand) {
    case 'spawn': {
      const cwd = extractFlag(rest, '--cwd')
      const cols = extractFlag(rest, '--cols')
      const rows = extractFlag(rest, '--rows')
      const [command, ...args] = rest
      if (!command) { console.error('Usage: ghosterm spawn <command> [args...]'); process.exit(1) }
      msg = {
        action: 'spawn',
        command,
        args,
        ...(cwd !== undefined && { cwd }),
        ...(cols !== undefined && { cols: Number(cols) }),
        ...(rows !== undefined && { rows: Number(rows) }),
      }
      break
    }
    case 'screenshot-text':
      msg = { action: 'screenshot-text' }
      break
    case 'screenshot-png': {
      const file = rest[0] || '/tmp/ghosterm.png'
      msg = { action: 'screenshot-png', file }
      break
    }
    case 'input':
      msg = { action: 'input', text: rest.join(' ') }
      break
    case 'key':
      msg = { action: 'key', key: rest[0] }
      break
    case 'wait': {
      const timeout = extractFlag(rest, '--timeout')
      msg = { action: 'wait', pattern: rest[0] ?? '', ...(timeout !== undefined && { timeout: Number(timeout) }) }
      break
    }
    case 'resize':
      msg = { action: 'resize', cols: Number(rest[0]), rows: Number(rest[1]) }
      break
    case 'status':
      msg = { action: 'status' }
      break
    case 'close':
      msg = { action: 'close' }
      break
    default:
      console.error(`Unknown command: ${subcommand}`)
      process.exit(1)
  }

  // For spawn, ensure daemon is running
  if (subcommand === 'spawn') {
    try {
      await ensureDaemon()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start daemon'
      console.log(JSON.stringify({ ok: false, error: message }))
      process.exit(1)
    }
  }

  if (!existsSync(SOCKET_PATH)) {
    console.log(JSON.stringify({ ok: false, error: 'No daemon running. Run "ghosterm spawn <cmd>" first.' }))
    process.exit(1)
  }

  try {
    const result = await sendCommand(msg)
    if (result.ok && typeof result.data === 'string' && msg.action === 'screenshot-png') {
      writeFileSync(msg.file, Buffer.from(result.data, 'base64'))
      console.log(JSON.stringify({ ok: true, file: msg.file }))
    } else {
      console.log(JSON.stringify(result))
    }
    process.exit(result.ok ? 0 : 1)
  } catch (e: any) {
    console.log(JSON.stringify({ ok: false, error: e.message }))
    process.exit(1)
  }
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1) return undefined
  const val = args[idx + 1]
  args.splice(idx, 2)
  return val
}

main()
