import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { Link } from 'react-router-dom'

export function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>注册</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <Link className="text-foreground underline underline-offset-4" to="/auth/login">
            去登录
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
