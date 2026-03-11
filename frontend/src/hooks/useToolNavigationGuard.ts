import { createElement, useEffect, useMemo } from 'react'
import { useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

type Options = {
  /** True while the tool is actively processing (upload, inference, etc.) */
  pending: boolean
  /** True when a result is available but not yet downloaded */
  hasUnsavedResult: boolean
}

/**
 * Blocks navigation (both in-app and tab close) when a tool page
 * has an active process or an undownloaded result.
 *
 * Returns a ReactNode (the confirmation dialog) that must be rendered
 * by the calling component.
 *
 * Spec reference: Section 6.5 — In-Progress Navigation Guard.
 */
export function useToolNavigationGuard({ pending, hasUnsavedResult }: Options) {
  const { t } = useTranslation('common')
  const shouldBlock = pending || hasUnsavedResult

  // In-app navigation via react-router
  const blocker = useBlocker(shouldBlock)
  const isBlocked = blocker.state === 'blocked'

  // Tab close / browser navigation via beforeunload
  useEffect(() => {
    if (!shouldBlock) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldBlock])

  const message = pending
    ? t('navGuard.processing')
    : t('navGuard.unsavedResult')

  const dialog = useMemo(() => {
    if (!isBlocked) return null
    return createElement(ConfirmDialog, {
      open: true,
      onOpenChange: (open: boolean) => {
        if (!open) blocker.reset()
      },
      title: t('navGuard.title'),
      description: message,
      confirmLabel: t('navGuard.leave'),
      cancelLabel: t('navGuard.stay'),
      variant: 'destructive' as const,
      onConfirm: () => {
        blocker.proceed()
      },
    })
  }, [blocker, isBlocked, message, t])

  return dialog
}
