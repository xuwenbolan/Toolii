import {
  AlertTriangle,
  Thermometer,
  HardDrive,
  Clock,
  CircleSlash,
} from 'lucide-react'
import { createElement } from 'react'

import type {
  CortexModelItem,
  CortexModelEvent,
  CortexGpuInfo,
  CortexQueueInfo,
} from '@/services/adminApi'

// -- Format helpers --

export function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatIdleTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function formatRelativeTime(timestamp: number): string {
  const delta = Math.floor(Date.now() / 1000 - timestamp)
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  return `${Math.floor(delta / 86400)}d ago`
}

export function formatEventTime(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// -- Status & event color maps --

export const MODEL_STATUS_COLORS: Record<string, string> = {
  loaded: 'bg-success-light text-success border-success/20',
  available: 'bg-info-light text-info border-info/20',
  disabled: 'bg-muted text-muted-foreground border-border',
  missing: 'bg-destructive-light text-destructive border-destructive/20',
}

export const EVENT_COLORS: Record<string, string> = {
  loaded: 'bg-success-light text-success border-success/20',
  evicted_lru: 'bg-warning-light text-warning border-warning/20',
  evicted_idle: 'bg-warning-light text-warning border-warning/20',
  evicted_budget: 'bg-warning-light text-warning border-warning/20',
  evicted_workspace: 'bg-warning-light text-warning border-warning/20',
  oom_retry: 'bg-destructive-light text-destructive border-destructive/20',
  disabled: 'bg-muted text-muted-foreground border-border',
}

// -- Alert types --

export type AlertLevel = 'info' | 'warning' | 'critical'
export type AlertItem = { key: string; level: AlertLevel; icon: React.ReactNode; message: string }

export const ALERT_STYLES: Record<AlertLevel, string> = {
  info: 'border-info/20 bg-info-light text-info',
  warning: 'border-warning/20 bg-warning-light text-warning',
  critical: 'border-destructive/20 bg-destructive-light text-destructive',
}

export function computeAlerts(
  gpu: CortexGpuInfo,
  modelList: CortexModelItem[],
  events: CortexModelEvent[],
  queue: CortexQueueInfo | undefined,
  t: (key: string, vars?: Record<string, unknown>) => string,
): AlertItem[] {
  const alerts: AlertItem[] = []

  // Temperature
  if (gpu.temperature_c != null && gpu.temperature_c >= 90) {
    alerts.push({
      key: 'temp-critical',
      level: 'critical',
      icon: createElement(Thermometer, { className: 'h-4 w-4' }),
      message: t('system.alertTempHigh', { temp: `${gpu.temperature_c}C`, threshold: '90C' }),
    })
  } else if (gpu.temperature_c != null && gpu.temperature_c >= 80) {
    alerts.push({
      key: 'temp-warn',
      level: 'warning',
      icon: createElement(Thermometer, { className: 'h-4 w-4' }),
      message: t('system.alertTempHigh', { temp: `${gpu.temperature_c}C`, threshold: '80C' }),
    })
  }

  // VRAM utilization (budget-based)
  const budgetPct = gpu.vram_total_mb > 0
    ? Math.round((gpu.vram_used_mb / gpu.vram_total_mb) * 100)
    : 0
  if (budgetPct >= 90) {
    alerts.push({
      key: 'vram-high',
      level: 'warning',
      icon: createElement(HardDrive, { className: 'h-4 w-4' }),
      message: t('system.alertVramHigh', { pct: budgetPct }),
    })
  }

  // Missing required models
  const missingRequired = modelList.filter(m => m.status === 'missing' && m.required)
  if (missingRequired.length > 0) {
    alerts.push({
      key: 'missing-models',
      level: 'critical',
      icon: createElement(AlertTriangle, { className: 'h-4 w-4' }),
      message: t('system.alertMissingModels', { count: missingRequired.length }),
    })
  }

  // OOM retries in recent events
  const recentOom = events.some(e => e.event === 'oom_retry')
  if (recentOom) {
    alerts.push({
      key: 'oom-retries',
      level: 'warning',
      icon: createElement(AlertTriangle, { className: 'h-4 w-4' }),
      message: t('system.alertOomRetries'),
    })
  }

  // Queue saturated
  if (queue && queue.active >= queue.max_concurrent) {
    alerts.push({
      key: 'queue-full',
      level: 'info',
      icon: createElement(Clock, { className: 'h-4 w-4' }),
      message: t('system.alertQueueFull'),
    })
  }

  // Disabled models
  const disabledCount = modelList.filter(m => !m.enabled).length
  if (disabledCount > 0) {
    alerts.push({
      key: 'disabled-models',
      level: 'info',
      icon: createElement(CircleSlash, { className: 'h-4 w-4' }),
      message: t('system.alertDisabledModels', { count: disabledCount }),
    })
  }

  return alerts
}
