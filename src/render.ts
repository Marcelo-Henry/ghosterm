import { createCanvas, GlobalFonts } from '@napi-rs/canvas'

const FONT_SIZE = 14
const LINE_HEIGHT = 18
const PADDING = 16
const BG = '#1e1e2e'
const FG = '#cdd6f4'
const FONT_FAMILY = 'monospace'

export function renderPng(text: string): Buffer {
  const lines = text.split('\n')
  const cols = Math.max(...lines.map((l) => l.length), 1)

  const charWidth = FONT_SIZE * 0.6
  const width = Math.ceil(cols * charWidth + PADDING * 2)
  const height = Math.ceil(lines.length * LINE_HEIGHT + PADDING * 2)

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = FG
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`
  ctx.textBaseline = 'top'

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], PADDING, PADDING + i * LINE_HEIGHT)
  }

  return Buffer.from(canvas.toBuffer('image/png'))
}
