import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  title: string
  description?: string
  backTo?: string
  children: ReactNode
}

export function ToolPageShell({ title, description, backTo = '/image-tools', children }: Props) {
  const { t } = useTranslation('common')

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to={backTo}>{t('actions.back')}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg sm:text-xl">{title}</CardTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </CardHeader>
        <CardContent className="px-4 pb-5 sm:px-6 sm:pb-6">{children}</CardContent>
      </Card>
    </div>
  )
}
