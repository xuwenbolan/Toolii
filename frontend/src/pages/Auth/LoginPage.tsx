import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/components/auth/LoginForm'
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton'
import { Separator } from '@/components/ui/separator'
import { Link } from 'react-router-dom'

export function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>登录</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoginForm />
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            或
          </span>
        </div>
        <GoogleOAuthButton />
        <p className="text-center text-sm text-muted-foreground">
          还没有账号？{' '}
          <Link className="text-foreground underline underline-offset-4" to="/auth/register">
            去注册
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
