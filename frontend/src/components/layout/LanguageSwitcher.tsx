import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const LANGUAGES = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
] as const

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language

  const handleChange = (lang: string) => {
    void i18n.changeLanguage(lang)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 md:h-8 md:w-8">
          <Globe className="h-4 w-4" />
          <span className="sr-only">Switch language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={current === lang.code ? 'bg-accent' : ''}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
