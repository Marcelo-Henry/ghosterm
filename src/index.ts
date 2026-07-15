import xtermHeadless from '@xterm/headless'
const { Terminal } = xtermHeadless
import * as pty from 'node-pty'

export interface SpawnOptions {
  command: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
}

export interface TerminalStatus {
  pid: number
  running: boolean
  exitCode?: number
  signal?: number
}

export class TerminalSession {
  private term: InstanceType<typeof Terminal>
  private proc: pty.IPty
  private exitCode: number | undefined
  private signal: number | undefined
  private closed = false

  constructor(opts: SpawnOptions) {
    const cols = opts.cols ?? 80
    const rows = opts.rows ?? 24

    this.term = new Terminal({ cols, rows, allowProposedApi: true })
    this.proc = pty.spawn(opts.command, opts.args ?? [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: opts.cwd ?? process.cwd(),
    })

    this.proc.onData((data) => {
      this.term.write(data)
    })
    this.proc.onExit(({ exitCode, signal }) => {
      this.exitCode = exitCode
      this.signal = signal
      this.closed = true
    })
  }

  get pid(): number {
    return this.proc.pid
  }

  status(): TerminalStatus {
    return {
      pid: this.proc.pid,
      running: !this.closed,
      ...(this.exitCode !== undefined && { exitCode: this.exitCode }),
      ...(this.signal !== undefined && { signal: this.signal }),
    }
  }

  screenshot(): string {
    const buf = this.term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i)
      if (line) lines.push(line.translateToString(true))
    }
    // trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop()
    }
    return lines.join('\n')
  }

  input(text: string): void {
    this.proc.write(text)
  }

  key(key: string): void {
    const mapped = KEY_MAP[key.toLowerCase()]
    if (mapped) {
      this.proc.write(mapped)
    } else {
      this.proc.write(key)
    }
  }

  resize(cols: number, rows: number): void {
    this.proc.resize(cols, rows)
    this.term.resize(cols, rows)
  }

  async wait(pattern: string | RegExp, timeout: number = 5000): Promise<string> {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
    const start = Date.now()

    while (Date.now() - start < timeout) {
      const screen = this.screenshot()
      if (regex.test(screen)) return screen
      await sleep(50)
    }
    throw new Error(`Timed out waiting for pattern: ${pattern}`)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.proc.kill()
  }
}

const KEY_MAP: Record<string, string> = {
  enter: '\r',
  tab: '\t',
  escape: '\x1b',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  backspace: '\x7f',
  delete: '\x1b[3~',
  home: '\x1b[H',
  end: '\x1b[F',
  'ctrl+c': '\x03',
  'ctrl+d': '\x04',
  'ctrl+z': '\x1a',
  'ctrl+l': '\x0c',
  'ctrl+a': '\x01',
  'ctrl+e': '\x05',
  'ctrl+k': '\x0b',
  'ctrl+u': '\x15',
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
