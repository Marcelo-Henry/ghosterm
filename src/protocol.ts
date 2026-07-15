export interface SpawnCommand {
  action: 'spawn'
  command: string
  args: string[]
  cwd?: string
  cols?: number
  rows?: number
}

export interface ScreenshotTextCommand {
  action: 'screenshot-text'
}

export interface ScreenshotPngCommand {
  action: 'screenshot-png'
  file: string
}

export interface InputCommand {
  action: 'input'
  text: string
}

export interface KeyCommand {
  action: 'key'
  key: string
}

export interface WaitCommand {
  action: 'wait'
  pattern: string
  timeout?: number
}

export interface ResizeCommand {
  action: 'resize'
  cols: number
  rows: number
}

export interface CloseCommand {
  action: 'close'
}

export interface StatusCommand {
  action: 'status'
}

export interface PingCommand {
  action: 'ping'
}

export type ClientCommand =
  | SpawnCommand
  | ScreenshotTextCommand
  | ScreenshotPngCommand
  | InputCommand
  | KeyCommand
  | WaitCommand
  | ResizeCommand
  | CloseCommand
  | StatusCommand
  | PingCommand

export type DaemonResponse =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string }

export type ParseResult =
  | { ok: true; value: ClientCommand }
  | { ok: false; error: string }

export function parseClientCommand(input: unknown): ParseResult {
  if (!isRecord(input)) return invalid('Command must be a JSON object')
  if (typeof input.action !== 'string') return invalid('Command action must be a string')

  switch (input.action) {
    case 'spawn':
      return parseSpawnCommand(input)
    case 'screenshot-text':
    case 'close':
    case 'status':
    case 'ping':
      return valid({ action: input.action })
    case 'screenshot-png':
      return parseScreenshotPngCommand(input)
    case 'input':
      return parseInputCommand(input)
    case 'key':
      return parseKeyCommand(input)
    case 'wait':
      return parseWaitCommand(input)
    case 'resize':
      return parseResizeCommand(input)
    default:
      return invalid(`Unknown action: ${input.action}`)
  }
}

function parseSpawnCommand(input: Record<string, unknown>): ParseResult {
  if (!isNonEmptyString(input.command)) return invalid('Spawn command must be a non-empty string')
  if (input.args !== undefined && !isStringArray(input.args)) return invalid('Spawn args must be an array of strings')
  if (input.cwd !== undefined && !isNonEmptyString(input.cwd)) return invalid('Spawn cwd must be a non-empty string')
  if (!isOptionalDimension(input.cols)) return invalid('Spawn cols must be a positive integer')
  if (!isOptionalDimension(input.rows)) return invalid('Spawn rows must be a positive integer')

  return valid({
    action: 'spawn',
    command: input.command,
    args: input.args ?? [],
    ...(input.cwd !== undefined && { cwd: input.cwd }),
    ...(input.cols !== undefined && { cols: input.cols }),
    ...(input.rows !== undefined && { rows: input.rows }),
  })
}

function parseScreenshotPngCommand(input: Record<string, unknown>): ParseResult {
  if (!isNonEmptyString(input.file)) return invalid('PNG file must be a non-empty string')
  return valid({ action: 'screenshot-png', file: input.file })
}

function parseInputCommand(input: Record<string, unknown>): ParseResult {
  if (typeof input.text !== 'string') return invalid('Input text must be a string')
  return valid({ action: 'input', text: input.text })
}

function parseKeyCommand(input: Record<string, unknown>): ParseResult {
  if (!isNonEmptyString(input.key)) return invalid('Key must be a non-empty string')
  return valid({ action: 'key', key: input.key })
}

function parseWaitCommand(input: Record<string, unknown>): ParseResult {
  if (typeof input.pattern !== 'string') return invalid('Wait pattern must be a string')
  if (input.timeout !== undefined && !isNonNegativeInteger(input.timeout)) {
    return invalid('Wait timeout must be a non-negative integer')
  }
  return valid({
    action: 'wait',
    pattern: input.pattern,
    ...(input.timeout !== undefined && { timeout: input.timeout }),
  })
}

function parseResizeCommand(input: Record<string, unknown>): ParseResult {
  if (!isDimension(input.cols)) return invalid('Resize cols must be a positive integer')
  if (!isDimension(input.rows)) return invalid('Resize rows must be a positive integer')
  return valid({ action: 'resize', cols: input.cols, rows: input.rows })
}

function valid(value: ClientCommand): ParseResult {
  return { ok: true, value }
}

function invalid(error: string): ParseResult {
  return { ok: false, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isOptionalDimension(value: unknown): value is number | undefined {
  return value === undefined || isDimension(value)
}

function isDimension(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
