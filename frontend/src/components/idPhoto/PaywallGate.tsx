import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

type Props = {
  children: ReactNode
}

export function PaywallGate({ children }: Props) {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <>{children}</>
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">登录后导出无水印</h3>
        <p className="text-xs text-muted-foreground">
          导出无水印与 6x4 排版均需登录，且各消耗 1 Credit。
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild size="sm">
          <Link to="/auth/login">去登录</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth/register">注册</Link>
        </Button>
      </div>
    </div>
  )
}
