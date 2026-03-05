import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { AdminErrorState, AdminFilter, ConfirmDialog, DataTable, Pagination, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getTranslatedApiError } from '@/lib/apiErrors'
import {
  fetchAdminCards,
  fetchCardSummary,
  generateCards,
  disableCard,
} from '@/services/adminApi'
import type { AdminCardItem } from '@/services/adminApi'

const PAGE_SIZE = 20

function formatDate(d: string | null): string {
  if (!d) return '-'
  return new Date(d).toLocaleString()
}

function statusCount(summary: { status_counts: { status: string; count: number }[] } | undefined, status: string): number {
  if (!summary) return 0
  return summary.status_counts.find((s) => s.status === status)?.count ?? 0
}

export function AdminCardsPage() {
  const { t } = useTranslation('console')
  const queryClient = useQueryClient()

  // Generate panel state
  const [showGenerate, setShowGenerate] = useState(false)
  const [genCount, setGenCount] = useState(10)
  const [genCredits, setGenCredits] = useState(100)
  const [genType, setGenType] = useState('standard')
  const [genPrefix, setGenPrefix] = useState('TOOL')
  const [genExpiresDays, setGenExpiresDays] = useState('')
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  // Table filters
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [offset, setOffset] = useState(0)

  // Confirm dialog
  const [confirmCardId, setConfirmCardId] = useState<number | null>(null)

  // Queries
  const { data: summary } = useQuery({
    queryKey: ['admin', 'card-summary'],
    queryFn: fetchCardSummary,
  })

  const cardsQueryKey = ['admin', 'cards', { status: filterStatus, cardType: filterType, offset }]
  const { data: cardsData, isLoading, isError, refetch } = useQuery({
    queryKey: cardsQueryKey,
    queryFn: () => {
      const params: Parameters<typeof fetchAdminCards>[0] = { limit: PAGE_SIZE, offset }
      if (filterStatus !== 'all') params!.status = filterStatus
      if (filterType !== 'all') params!.card_type = filterType
      return fetchAdminCards(params)
    },
  })

  if (isError) return <AdminErrorState onRetry={() => refetch()} />

  // Mutations
  const generateMutation = useMutation({
    mutationFn: generateCards,
    onSuccess: (result) => {
      setGeneratedCodes(result.codes)
      setCopied(false)
      toast.success(t('common.success'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'card-summary'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'cards'] })
    },
    onError: (err) => {
      toast.error(getTranslatedApiError(err, t('common.error')))
    },
  })

  const disableMutation = useMutation({
    mutationFn: disableCard,
    onSuccess: () => {
      toast.success(t('common.success'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'card-summary'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'cards'] })
      setConfirmCardId(null)
    },
    onError: (err) => {
      toast.error(getTranslatedApiError(err, t('common.error')))
      setConfirmCardId(null)
    },
  })

  const handleGenerate = () => {
    const payload: Parameters<typeof generateCards>[0] = {
      count: genCount,
      credits: genCredits,
      card_type: genType,
      prefix: genPrefix,
    }
    const days = Number(genExpiresDays)
    if (days > 0) payload.expires_days = days
    generateMutation.mutate(payload)
  }

  const handleCopyAll = () => {
    void navigator.clipboard.writeText(generatedCodes.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleExportCsv = () => {
    const csvContent = 'code\n' + generatedCodes.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cards.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleStatusChange = (value: string) => {
    setFilterStatus(value)
    setOffset(0)
  }

  const handleTypeChange = (value: string) => {
    setFilterType(value)
    setOffset(0)
  }

  const cards = cardsData?.items ?? []
  const total = cardsData?.total ?? 0

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('users.filterAll') },
      { value: 'unused', label: t('cards.summary.unused') },
      { value: 'redeemed', label: t('cards.summary.redeemed') },
      { value: 'expired', label: t('cards.summary.expired') },
      { value: 'disabled', label: t('cards.summary.disabled') },
    ],
    [t],
  )

  const typeFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('users.filterAll') },
      { value: 'standard', label: 'standard' },
      { value: 'promo', label: 'promo' },
    ],
    [t],
  )

  const columns: Column<AdminCardItem>[] = useMemo(
    () => [
      { key: 'id', header: t('cards.id'), hiddenOnMobile: true, render: (c) => c.id },
      { key: 'credits', header: t('cards.credits'), render: (c) => c.credits },
      { key: 'type', header: t('cards.cardType'), hiddenOnMobile: true, render: (c) => c.card_type },
      {
        key: 'status',
        header: t('cards.status'),
        render: (c) => <StatusBadge status={c.status} />,
      },
      {
        key: 'redeemedBy',
        header: t('cards.redeemedBy'),
        render: (c) => c.redeemed_by_email ?? '-',
      },
      {
        key: 'expiresAt',
        header: t('cards.expiresAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (c) => formatDate(c.expires_at),
      },
      {
        key: 'redeemedAt',
        header: t('cards.redeemedAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (c) => formatDate(c.redeemed_at),
      },
      {
        key: 'createdAt',
        header: t('cards.createdAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (c) => formatDate(c.created_at),
      },
      {
        key: 'actions',
        header: t('users.actions'),
        render: (c) =>
          c.status === 'unused' ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={disableMutation.isPending}
              onClick={(e) => {
                e.stopPropagation()
                setConfirmCardId(c.id)
              }}
            >
              {t('cards.disableCard')}
            </Button>
          ) : null,
      },
    ],
    [t, disableMutation.isPending],
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('cards.title')}</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(['unused', 'redeemed', 'expired', 'disabled'] as const).map((status) => {
          const colorMap: Record<string, string> = {
            unused: 'text-info',
            redeemed: 'text-success',
            expired: 'text-warning',
            disabled: 'text-destructive',
          }
          return (
            <Card key={status}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t(`cards.summary.${status}`)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${colorMap[status]}`}>
                  {statusCount(summary, status)}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Credits summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('cards.summary.totalIssued')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary?.total_credits_issued ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('cards.summary.totalRedeemed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary?.total_credits_redeemed ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Generate cards section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>{t('cards.generate')}</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowGenerate(!showGenerate)}
            >
              {showGenerate ? t('common.close') : t('cards.generate')}
            </Button>
          </div>
        </CardHeader>

        {showGenerate && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div className="space-y-1">
                <Label>{t('cards.count')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('cards.credits')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={genCredits}
                  onChange={(e) => setGenCredits(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('cards.cardType')}</Label>
                <Input value={genType} onChange={(e) => setGenType(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('cards.prefix')}</Label>
                <Input value={genPrefix} onChange={(e) => setGenPrefix(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('cards.expiresDays')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={genExpiresDays}
                  placeholder="-"
                  onChange={(e) => setGenExpiresDays(e.target.value)}
                />
              </div>
            </div>

            <Button disabled={generateMutation.isPending} onClick={handleGenerate}>
              {generateMutation.isPending ? t('common.loading') : t('cards.generateSubmit')}
            </Button>

            {generatedCodes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t('cards.generatedCodes')} ({generatedCodes.length})
                </p>
                <textarea
                  readOnly
                  className="h-40 w-full rounded-md border border-input bg-muted p-3 font-mono text-sm"
                  value={generatedCodes.join('\n')}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopyAll}>
                    {copied ? t('cards.copied') : t('cards.copyAll')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExportCsv}>
                    {t('cards.exportCsv')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Cards table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t('cards.title')}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <AdminFilter
                value={filterStatus}
                options={statusFilterOptions}
                onChange={handleStatusChange}
                className="w-[140px]"
              />
              <AdminFilter
                value={filterType}
                options={typeFilterOptions}
                onChange={handleTypeChange}
                className="w-[140px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={cards}
            rowKey={(c) => c.id}
            loading={isLoading}
            renderMobileCard={(c) => (
              <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.credits} {t('cards.credits')}</span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{c.card_type}</span>
                  <span>#{c.id}</span>
                </div>
                {c.redeemed_by_email && (
                  <div className="truncate text-xs text-muted-foreground">
                    {t('cards.redeemedBy')}: {c.redeemed_by_email}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(c.expires_at !== null ? c.expires_at : c.created_at)}
                  </span>
                  {c.status === 'unused' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7"
                      disabled={disableMutation.isPending}
                      onClick={() => setConfirmCardId(c.id)}
                    >
                      {t('cards.disableCard')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          />
          {total > PAGE_SIZE && (
            <div className="p-4 pt-0">
              <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmCardId !== null}
        onOpenChange={(open) => { if (!open) setConfirmCardId(null) }}
        title={t('common.confirmAction')}
        description={`${t('cards.disableCard')} #${confirmCardId}?`}
        variant="destructive"
        loading={disableMutation.isPending}
        onConfirm={() => { if (confirmCardId) disableMutation.mutate(confirmCardId) }}
      />
    </div>
  )
}
