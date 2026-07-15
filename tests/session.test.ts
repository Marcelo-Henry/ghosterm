import { describe, it, expect, afterEach } from 'vitest'
import { TerminalSession } from '../src/index.js'

let session: TerminalSession | null = null

afterEach(() => {
  session?.close()
  session = null
})

describe('TerminalSession', () => {
  it('spawns a process and takes a screenshot', async () => {
    session = new TerminalSession({ command: 'echo', args: ['hello ghosterm'] })
    await sleep(200)
    const screen = session.screenshot()
    expect(screen).toContain('hello ghosterm')
  })

  it('sends input and reads output', async () => {
    session = new TerminalSession({ command: 'cat' })
    session.input('ping\n')
    await sleep(200)
    const screen = session.screenshot()
    expect(screen).toContain('ping')
  })

  it('sends special keys', async () => {
    session = new TerminalSession({ command: 'cat' })
    session.input('abc')
    session.key('enter')
    await sleep(200)
    const screen = session.screenshot()
    expect(screen).toContain('abc')
  })

  it('waits for a pattern', async () => {
    session = new TerminalSession({ command: 'bash', args: ['-c', 'sleep 0.1 && echo READY'] })
    const screen = await session.wait('READY', 3000)
    expect(screen).toContain('READY')
  })

  it('times out if pattern never appears', async () => {
    session = new TerminalSession({ command: 'echo', args: ['nope'] })
    await expect(session.wait('NEVER', 300)).rejects.toThrow('Timed out')
  })

  it('resizes the terminal', async () => {
    session = new TerminalSession({ command: 'cat', cols: 40, rows: 10 })
    session.resize(120, 40)
    session.input('still works\n')
    await sleep(200)
    const screen = session.screenshot()
    expect(screen).toContain('still works')
  })

  it('reports when the child process exits', async () => {
    session = new TerminalSession({ command: 'bash', args: ['-c', 'exit 7'] })
    await sleep(200)
    expect(session.status()).toMatchObject({ running: false, exitCode: 7 })
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
