import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import { existsSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI_PATH = resolve(PROJECT_ROOT, 'src', 'cli.ts')

function runCli(args: string[]): Record<string, unknown> {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 15000,
  })
  const output = result.stdout.trim()
  if (!output) {
    throw result.error ?? new Error(result.stderr || 'CLI produced no output')
  }
  return JSON.parse(output) as Record<string, unknown>
}

describe('ghosterm CLI (daemon mode)', () => {
  afterAll(() => {
    try { runCli(['close']) } catch {}
  })

  it('spawns a process', () => {
    const res = runCli(['spawn', 'echo', 'hello-daemon'])
    expect(res.ok).toBe(true)
    expect(res.pid).toEqual(expect.any(Number))
  })

  it('takes a text screenshot', async () => {
    runCli(['spawn', 'bash', '-c', 'echo DAEMON-TEST && sleep 10'])
    await sleep(300)
    const res = runCli(['screenshot-text'])
    expect(res.ok).toBe(true)
    expect(res.content).toContain('DAEMON-TEST')
  })

  it('takes a png screenshot', async () => {
    runCli(['spawn', 'bash', '-c', 'echo PNG-TEST && sleep 10'])
    await sleep(300)
    const pngFile = '/tmp/ghosterm-test.png'
    try { unlinkSync(pngFile) } catch {}
    const res = runCli(['screenshot-png', pngFile])
    expect(res.ok).toBe(true)
    expect(res.file).toBe(pngFile)
    expect(existsSync(pngFile)).toBe(true)
    unlinkSync(pngFile)
  })

  it('sends input', () => {
    runCli(['spawn', 'cat'])
    runCli(['input', 'hello-world'])
    const res = runCli(['screenshot-text'])
    expect(res.content).toContain('hello-world')
  })

  it('sends a key', async () => {
    runCli(['spawn', 'cat'])
    runCli(['input', 'abc'])
    runCli(['key', 'enter'])
    await sleep(100)
    const res = runCli(['screenshot-text'])
    expect(res.content).toContain('abc')
  })

  it('waits for a pattern', () => {
    runCli(['spawn', 'bash', '-c', 'sleep 0.2 && echo FOUND-IT'])
    const res = runCli(['wait', 'FOUND-IT', '--timeout', '5000'])
    expect(res.ok).toBe(true)
    expect(res.content).toContain('FOUND-IT')
  })

  it('times out on missing pattern', () => {
    runCli(['spawn', 'bash', '-c', 'sleep 2'])
    const res = runCli(['wait', 'NEVER', '--timeout', '500'])
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Timed out')
  })

  it('resizes the terminal', () => {
    runCli(['spawn', 'cat'])
    const res = runCli(['resize', '120', '40'])
    expect(res.ok).toBe(true)
  })

  it('reports lifecycle state', async () => {
    runCli(['spawn', 'bash', '-c', 'exit 7'])
    await sleep(200)
    const res = runCli(['status'])
    expect(res).toMatchObject({
      ok: true,
      session: { running: false, exitCode: 7 },
    })
  })

  it('closes the session', () => {
    runCli(['spawn', 'cat'])
    const res = runCli(['close'])
    expect(res.ok).toBe(true)
  })

  it('errors when no daemon running', () => {
    const res = runCli(['screenshot-text'])
    expect(res.ok).toBe(false)
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
