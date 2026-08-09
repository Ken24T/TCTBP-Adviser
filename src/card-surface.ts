export type CardTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent'

const TONE_ACCENTS: Record<CardTone, string> = {
  success: '#14B8A6', // teal-500
  warning: '#F59E0B', // amber-500
  danger: '#EF4444',  // red-500
  neutral: '#94A3B8', // ink-400
  info: '#2563EB',    // blue-600
  accent: '#0D9488',  // teal-600
}

export interface CardSurfaceVars {
  '--card-accent': string
  '--card-accent-rgb': string
  '--card-surface': string
  '--card-surface-hover': string
  '--card-icon-bg': string
  '--card-icon-color': string
  '--card-text-block-bg': string
}

function normalizeHex(hex: string): string {
  const value = hex.trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase()
  }
  return '#000000'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex)
  const result = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(normalized)
  if (!result) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  }
}

function blendChannel(channel: number, target: number, amount: number): number {
  return Math.round(channel + (target - channel) * amount)
}

function blendToward(hex: string, target: number, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const toHex = (value: number): string => value.toString(16).padStart(2, '0')
  return `#${toHex(blendChannel(r, target, amount))}${toHex(blendChannel(g, target, amount))}${toHex(blendChannel(b, target, amount))}`
}

export function blendTowardWhite(hex: string, amount: number): string {
  return blendToward(hex, 255, amount)
}

export function blendTowardBlack(hex: string, amount: number): string {
  return blendToward(hex, 0, amount)
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (value: number): number => {
    const normalized = value / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }
  return channel(r) * 0.2126 + channel(g) * 0.7152 + channel(b) * 0.0722
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  )
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  )
  return (lighter + 0.05) / (darker + 0.05)
}

/** Picks near-black (#0F172A) or near-white (#F8FAFC) for AA contrast. */
export function getContrastColor(background: string): string {
  const dark = '#0F172A'
  const light = '#F8FAFC'
  return contrastRatio(light, background) > contrastRatio(dark, background)
    ? light
    : dark
}

/**
 * Opaque, theme-aware card surfaces for a tone. Never alpha — text contrast
 * stays deterministic regardless of what sits behind the card. Mirrors the
 * Hub Card approach from the intranet's hubSurfaceColors helper.
 */
export function cardSurfaceVars(tone: CardTone, isDark: boolean): CardSurfaceVars {
  const accent = TONE_ACCENTS[tone]
  const rgb = hexToRgb(accent)
  const surface = isDark
    ? blendTowardBlack(accent, 0.6)
    : blendTowardWhite(accent, 0.85)
  const surfaceHover = isDark
    ? blendTowardBlack(accent, 0.5)
    : blendTowardWhite(accent, 0.78)
  const iconBg = isDark
    ? blendTowardBlack(accent, 0.4)
    : blendTowardWhite(accent, 0.55)
  const textBlockBg = isDark
    ? blendTowardBlack(accent, 0.5)
    : blendTowardWhite(accent, 0.9)
  return {
    '--card-accent': accent,
    '--card-accent-rgb': `${rgb.r}, ${rgb.g}, ${rgb.b}`,
    '--card-surface': surface,
    '--card-surface-hover': surfaceHover,
    '--card-icon-bg': iconBg,
    '--card-icon-color': getContrastColor(iconBg),
    '--card-text-block-bg': textBlockBg,
  }
}
