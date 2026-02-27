import { Link } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="space-y-4 py-16 text-center">
      <SEOHead title="页面不存在" description="请求的页面不存在或已被移动。" noindex />
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">404</p>
        <h1 className="text-xl font-semibold tracking-tight">页面不存在</h1>
      </div>
      <Link to="/">
        <Button>返回首页</Button>
      </Link>
    </div>
  )
}
