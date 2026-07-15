import { describe, expect, it } from 'vitest'
import { parseClientCommand } from '../src/protocol.js'

describe('client command protocol', () => {
  it('accepts a complete spawn command', () => {
    expect(parseClientCommand({
      action: 'spawn',
      command: 'bash',
      args: ['-c', 'echo ready'],
      cwd: '/tmp',
      cols: 120,
      rows: 40,
    })).toEqual({
      ok: true,
      value: {
        action: 'spawn',
        command: 'bash',
        args: ['-c', 'echo ready'],
        cwd: '/tmp',
        cols: 120,
        rows: 40,
      },
    })
  })

  it.each([
    [{ action: 'spawn', command: '', args: [] }, 'Spawn command must be a non-empty string'],
    [{ action: 'resize', cols: 0, rows: 24 }, 'Resize cols must be a positive integer'],
    [{ action: 'wait', pattern: 'ready', timeout: -1 }, 'Wait timeout must be a non-negative integer'],
    [{ action: 'key', key: '' }, 'Key must be a non-empty string'],
    [{ action: 'unknown' }, 'Unknown action: unknown'],
  ])('rejects invalid commands', (command, error) => {
    expect(parseClientCommand(command)).toEqual({ ok: false, error })
  })
})
