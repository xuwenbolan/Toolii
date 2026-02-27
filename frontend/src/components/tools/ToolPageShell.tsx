import { Link } from 'react-router-dom'
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
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to={backTo}>返回</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
