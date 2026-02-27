import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-3 px-4 py-6 text-center text-xs text-muted-foreground sm:justify-between sm:px-6 sm:text-left lg:px-8">
        <p>© {new Date().getFullYear()} Toolii</p>
        <div className="flex items-center gap-3">
          <Link className="transition hover:text-foreground" to="/legal/privacy">
            隐私政策
          </Link>
          <Link className="transition hover:text-foreground" to="/legal/terms">
            使用条款
          </Link>
        </div>
      </div>
    </footer>
  )
}
