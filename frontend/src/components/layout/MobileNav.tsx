import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Camera,
  FileText,
  Home,
  ImageIcon,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  UserPlus,
  Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { label: '首页', to: '/', icon: Home },
  { label: '证件照', to: '/id-photo', icon: Camera },
  { label: '图片工具', to: '/image-tools', icon: ImageIcon },
  { label: 'PDF 工具', to: '/pdf-tools', icon: FileText },
]

const AUTH_NAV = [
  { label: '控制台', to: '/dashboard', icon: LayoutDashboard },
  { label: '兑换卡密', to: '/credits/redeem', icon: Wallet },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-left text-base font-semibold tracking-tight">
            Toolii
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                isActive(item.to)
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}

          <Separator className="my-2" />

          {user ? (
            <>
              {AUTH_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                    isActive(item.to)
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  logout()
                  setOpen(false)
                }}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
              >
                <LogIn className="h-4 w-4" />
                登录
              </Link>
              <Link
                to="/auth/register"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
              >
                <UserPlus className="h-4 w-4" />
                注册
              </Link>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
