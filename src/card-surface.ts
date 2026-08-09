import type { CSSProperties } from 'react'

export type CardTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent'

const TONE_ACCENTS: Record<CardTone, string> = {
  success: '#14B8A6', // teal-500
  warning: '#F59E0B', // amber-500
  danger: '#EF4444',  // red-500
  neutral: '#94A3B8', // ink-400
  info: '#2563EB',    // blue-600
  accent: '#0D9488',  // teal-600
}

export interface CardSurfaceVars extends CSSProperties {
  '--card-accent': string
  '--card-accent-rgb': string
  '--card-surface': string
  '--card-surface-hover': string
  '--card-icon-bg': string
  '--card-icon-color': string
  '--card-text-block-bg': string
  '--card-btn-bg': string
  '--card-btn-text': string
  '--card-btn-border': string
  '--card-btn-hover-bg': string
  '--card-btn-primary-bg': string
  '--card-btn-primary-text': string
  '--card-btn-primary-hover-bg': string
  '--card-link-text': string
  '--card-link-hover-text': string
  '--card-link-hover-bg': string
}

export interface PillSurfaceVars extends CSSProperties {
  '--pill-bg': string
  '--pill-text': string
  '--pill-border': string
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
 * Primary button pair guaranteed to reach AA (>= 4.5:1) on the button's own
 * background. Falls back to darkening the accent with white text when the
 * accent is too mid-tone for either near-black or near-white to pass.
 */
function accessiblePrimary(accent: string): { bg: string; text: string } {
  const light = '#F8FAFC'
  const dark = '#0F172A'
  if (contrastRatio(light, accent) >= 4.5) return { bg: accent, text: light }
  if (contrastRatio(dark, accent) >= 4.5) return { bg: accent, text: dark }
  for (const amount of [0.08, 0.15, 0.22, 0.3, 0.4, 0.5, 0.6]) {
    const bg = blendTowardBlack(accent, amount)
    if (contrastRatio(light, bg) >= 4.5) return { bg, text: light }
  }
  return { bg: accent, text: getContrastColor(accent) }
}

/**
 * Hover background that keeps the chosen text AA by moving the background
 * toward the opposite pole of the text colour (lighten for dark text,
 * darken for light text).
 */
function hoverFor(bg: string, text: string): string {
  const isLightText = relativeLuminance(text) > 0.5
  return isLightText
    ? blendTowardBlack(bg, 0.12)
    : blendTowardWhite(bg, 0.12)
}

/**
 * Link colour that reads as the accent but is guaranteed AA (>= 4.5:1)
 * against the given card surface. In dark mode the accent is lightened
 * toward white; in light mode it is darkened toward black.
 */
function readableLink(
  accent: string,
  background: string,
  isDark: boolean,
): { text: string; hover: string } {
  const steps = [0.1, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9]
  for (const amount of steps) {
    const candidate = isDark
      ? blendTowardWhite(accent, amount)
      : blendTowardBlack(accent, amount)
    if (contrastRatio(candidate, background) >= 4.5) {
      const hover = isDark
        ? blendTowardWhite(accent, Math.min(1, amount + 0.2))
        : blendTowardBlack(accent, Math.min(1, amount + 0.2))
      return { text: candidate, hover }
    }
  }
  return { text: getContrastColor(background), hover: getContrastColor(background) }
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
  const btnBg = isDark
    ? blendTowardBlack(accent, 0.5)
    : blendTowardWhite(accent, 0.72)
  const btnHoverBg = isDark
    ? blendTowardBlack(accent, 0.55)
    : blendTowardWhite(accent, 0.62)
  const btnBorder = isDark
    ? blendTowardBlack(accent, 0.35)
    : blendTowardWhite(accent, 0.5)
  const primary = accessiblePrimary(accent)
  const link = readableLink(accent, surface, isDark)
  return {
    '--card-accent': accent,
    '--card-accent-rgb': `${rgb.r}, ${rgb.g}, ${rgb.b}`,
    '--card-surface': surface,
    '--card-surface-hover': surfaceHover,
    '--card-icon-bg': iconBg,
    '--card-icon-color': getContrastColor(iconBg),
    '--card-text-block-bg': textBlockBg,
    '--card-btn-bg': btnBg,
    '--card-btn-text': getContrastColor(btnBg),
    '--card-btn-border': btnBorder,
    '--card-btn-hover-bg': btnHoverBg,
    '--card-btn-primary-bg': primary.bg,
    '--card-btn-primary-text': primary.text,
    '--card-btn-primary-hover-bg': hoverFor(primary.bg, primary.text),
    '--card-link-text': link.text,
    '--card-link-hover-text': link.hover,
    '--card-link-hover-bg': isDark
      ? blendTowardBlack(accent, 0.68)
      : blendTowardWhite(accent, 0.9),
  }
}

/**
 * Opaque, theme-aware surface for a semantic pill/badge. Each pill carries
 * its own tone so badge meanings stay distinguishable on a tinted card.
 */
export function pillSurfaceVars(tone: CardTone, isDark: boolean): PillSurfaceVars {
  const accent = TONE_ACCENTS[tone]
  const bg = isDark
    ? blendTowardBlack(accent, 0.35)
    : blendTowardWhite(accent, 0.7)
  const border = isDark
    ? blendTowardBlack(accent, 0.5)
    : blendTowardWhite(accent, 0.55)
  return {
    '--pill-bg': bg,
    '--pill-text': getContrastColor(bg),
    '--pill-border': border,
  }
}
