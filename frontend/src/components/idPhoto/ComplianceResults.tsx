import { useTranslation } from 'react-i18next'

import type { ComplianceResult } from '@/services/idPhotoApi'

type Props = {
  result: ComplianceResult
}

export function ComplianceResults({ result }: Props) {
  const { t } = useTranslation('idPhoto')

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">{t('compliance.title')}</h3>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={[
              'rounded-full px-2 py-0.5 font-medium',
              result.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
            ].join(' ')}
          >
            {result.passed ? t('compliance.pass') : t('compliance.needReview')}
          </span>
          <span className="text-muted-foreground">{t('compliance.score', { score: result.score })}</span>
        </div>
      </div>

      <div className="space-y-2">
        {result.checks.map((check) => (
          <div key={check.id} className="rounded-lg border px-3 py-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">{check.label}</p>
              <span
                className={[
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                  check.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
                ].join(' ')}
              >
                {check.passed ? 'PASS' : 'CHECK'}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{check.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
