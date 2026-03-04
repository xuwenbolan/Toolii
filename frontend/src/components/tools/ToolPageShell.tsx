import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useToolStore } from '@/stores/toolStore'
import { ToolDisabledBanner } from '@/components/tools/ToolDisabledBanner'

type ToolPageLayout = 'compact' | 'split' | 'workspace'
type ToolPageWidth = 'content' | 'wide' | 'full'

type Props = {
  title: string
  description?: string
  backTo?: string
  layout?: ToolPageLayout
  width?: ToolPageWidth
  sidebar?: ReactNode
  className?: string
  contentClassName?: string
  sidebarClassName?: string
  children: ReactNode
  /** Backend tool name (e.g. "image/compress") for disabled-state check */
  toolName?: string
}

const WIDTH_CLASS_MAP: Record<ToolPageWidth, string> = {
  content: 'max-w-4xl',
  wide: 'max-w-6xl',
  full: 'max-w-[88rem]',
}

const GRID_CLASS_MAP: Record<Exclude<ToolPageLayout, 'compact'>, string> = {
  split: 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
  workspace: 'xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]',
}

export function ToolPageShell({
  title,
  description,
  backTo = '/',
  layout = 'compact',
  width = 'content',
  sidebar,
  className,
  contentClassName,
  sidebarClassName,
  children,
  toolName,
}: Props) {
  const { t } = useTranslation('common')
  const { isToolEnabled, loaded } = useToolStore()
  const isDisabled = toolName && loaded && !isToolEnabled(toolName)
  const useSidebar = Boolean(sidebar) && layout !== 'compact'

  return (
    <div className={cn('mx-auto w-full space-y-5', WIDTH_CLASS_MAP[width], className)}>
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/40 px-4 py-4 sm:px-6 sm:py-5 motion-safe:animate-fade-in">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(circle_at_top_right,rgba(80,120,170,0.15),transparent_55%)]"
        />
        <div className="relative space-y-3">
          <Button asChild variant="ghost" size="sm" className="h-8 w-fit px-2.5 motion-safe:animate-fade-in">
            <Link to={backTo} className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              <span>{t('actions.back')}</span>
            </Link>
          </Button>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl motion-safe:animate-fade-in-delay-1">{title}</h1>
            {description ? <p className="max-w-3xl text-sm text-muted-foreground motion-safe:animate-[fade-in_0.4s_ease-out_0.25s_both]">{description}</p> : null}
          </div>
        </div>
      </div>

      {isDisabled ? (
        <Card className="border-border/70 shadow-sm motion-safe:animate-[section-in_0.4s_var(--ease-out)_0.15s_both]">
          <CardContent className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
            <ToolDisabledBanner />
          </CardContent>
        </Card>
      ) : useSidebar ? (
        <div className={cn('grid items-start gap-4 xl:gap-5', GRID_CLASS_MAP[layout])}>
          <Card className="border-border/70 shadow-sm motion-safe:animate-[section-in_0.4s_var(--ease-out)_0.15s_both]">
            <CardContent className={cn('px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5', contentClassName)}>
              {children}
            </CardContent>
          </Card>
          <div className={cn('space-y-4 motion-safe:animate-[section-in_0.4s_var(--ease-out)_0.25s_both]', sidebarClassName)}>{sidebar}</div>
        </div>
      ) : (
        <Card className="border-border/70 shadow-sm motion-safe:animate-[section-in_0.4s_var(--ease-out)_0.15s_both]">
          <CardContent className={cn('px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5', contentClassName)}>
            {children}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
