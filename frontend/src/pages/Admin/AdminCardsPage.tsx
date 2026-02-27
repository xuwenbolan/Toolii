import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  fetchAdminCards,
  fetchCardSummary,
  generateCards,
  disableCard,
  type AdminCardItem,
  type AdminCardListResponse,
  type CardSummaryResponse,
} from '@/services/adminApi'

// -- Constants --------------------------------------------------------

const PAGE_SIZE = 20

const STATUS_BADGE_CLASS: Record<string, string> = {
  unused: 'bg-blue-100 text-blue-800 border-blue-200',
  redeemed: 'bg-green-100 text-green-800 border-green-200',
  expired: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  disabled: 'bg-red-100 text-red-800 border-red-200',
}

// -- Helpers ----------------------------------------------------------

function statusCount(summary: CardSummaryResponse | null, status: string): number {
  if (!summary) return 0
  return summary.status_counts.find((s) => s.status === status)?.count ?? 0
}

function formatDate(d: string | null): string {
  if (!d) return '-'
  return new Date(d).toLocaleString()
}

// -- Component --------------------------------------------------------

export function AdminCardsPage() {
  const { t } = useTranslation('admin')

  // Summary state
  const [summary, setSummary] = useState<CardSummaryResponse | null>(null)

  // Generate panel state
  const [showGenerate, setShowGenerate] = useState(false)
  const [genCount, setGenCount] = useState(10)
  const [genCredits, setGenCredits] = useState(100)
  const [genType, setGenType] = useState('standard')
  const [genPrefix, setGenPrefix] = useState('TOOL')
  const [genExpiresDays, setGenExpiresDays] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  // Table state
  const [cards, setCards] = useState<AdminCardItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [loading, setLoading] = useState(false)
  const [disablingId, setDisablingId] = useState<number | null>(null)

  // -- Data fetching --------------------------------------------------

  const loadSummary = useCallback(async () => {
    try {
      const data = await fetchCardSummary()
      setSummary(data)
    } catch {
      // Silently ignore summary errors
    }
  }, [])

  const loadCards = useCallback(async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof fetchAdminCards>[0] = {
        limit: PAGE_SIZE,
        offset,
      }
      if (filterStatus !== 'all') params!.status = filterStatus
      if (filterType !== 'all') params!.card_type = filterType
      const data: AdminCardListResponse = await fetchAdminCards(params)
      setCards(data.items)
      setTotal(data.total)
    } catch {
      // Silently ignore load errors
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterType, offset])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    void loadCards()
  }, [loadCards])

  // -- Actions --------------------------------------------------------

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const payload: Parameters<typeof generateCards>[0] = {
        count: genCount,
        credits: genCredits,
        card_type: genType,
        prefix: genPrefix,
      }
      const days = Number(genExpiresDays)
      if (days > 0) payload.expires_days = days
      const result = await generateCards(payload)
      setGeneratedCodes(result.codes)
      setCopied(false)
      // Reload data after generation
      void loadSummary()
      void loadCards()
    } catch {
      // Silently ignore generation errors
    } finally {
      setGenerating(false)
    }
  }

  const handleDisable = async (cardId: number) => {
    setDisablingId(cardId)
    try {
      await disableCard(cardId)
      void loadSummary()
      void loadCards()
    } catch {
      // Silently ignore disable errors
    } finally {
      setDisablingId(null)
    }
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

  // Reset to first page when filters change
  const handleStatusChange = (value: string) => {
    setFilterStatus(value)
    setOffset(0)
  }

  const handleTypeChange = (value: string) => {
    setFilterType(value)
    setOffset(0)
  }

  // -- Pagination -----------------------------------------------------

  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  // -- Render ---------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page title */}
      <h1 className="text-2xl font-bold">{t('cards.title')}</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('cards.summary.unused')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{statusCount(summary, 'unused')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('cards.summary.redeemed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{statusCount(summary, 'redeemed')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('cards.summary.expired')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{statusCount(summary, 'expired')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('cards.summary.disabled')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{statusCount(summary, 'disabled')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Credits summary row */}
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
              type="button"
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
            {/* Generate form */}
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
                <Input
                  type="text"
                  value={genType}
                  onChange={(e) => setGenType(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('cards.prefix')}</Label>
                <Input
                  type="text"
                  value={genPrefix}
                  onChange={(e) => setGenPrefix(e.target.value)}
                />
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

            <Button type="button" disabled={generating} onClick={() => void handleGenerate()}>
              {generating ? t('common.loading') : t('cards.generateSubmit')}
            </Button>

            {/* Generated codes output */}
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
                  <Button type="button" size="sm" variant="outline" onClick={handleCopyAll}>
                    {copied ? t('cards.copied') : t('cards.copyAll')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleExportCsv}>
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
              <Select value={filterStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('users.filterAll')}</SelectItem>
                  <SelectItem value="unused">{t('cards.summary.unused')}</SelectItem>
                  <SelectItem value="redeemed">{t('cards.summary.redeemed')}</SelectItem>
                  <SelectItem value="expired">{t('cards.summary.expired')}</SelectItem>
                  <SelectItem value="disabled">{t('cards.summary.disabled')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('users.filterAll')}</SelectItem>
                  <SelectItem value="standard">standard</SelectItem>
                  <SelectItem value="promo">promo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : cards.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="whitespace-nowrap px-3 py-2">{t('cards.id')}</th>
                    <th className="whitespace-nowrap px-3 py-2">{t('cards.credits')}</th>
                    <th className="whitespace-nowrap px-3 py-2">{t('cards.cardType')}</th>
                    <th className="whitespace-nowrap px-3 py-2">{t('cards.status')}</th>
                    <th className="whitespace-nowrap px-3 py-2">{t('cards.redeemedBy')}</th>
                    <th className="whitespace-nowrap px-3 py-2">{t('cards.expiresAt')}</th>
                    <th className="whitespace-nowrap px-3 py-2">{t('cards.redeemedAt')}</th>
                    <th className="whitespace-nowrap px-3 py-2">{t('cards.createdAt')}</th>
                    <th className="whitespace-nowrap px-3 py-2">{t('users.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => (
                    <tr key={card.id} className="border-b last:border-b-0">
                      <td className="whitespace-nowrap px-3 py-2">{card.id}</td>
                      <td className="whitespace-nowrap px-3 py-2">{card.credits}</td>
                      <td className="whitespace-nowrap px-3 py-2">{card.card_type}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE_CLASS[card.status] ?? ''}
                        >
                          {card.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {card.redeemed_by_email ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDate(card.expires_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDate(card.redeemed_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDate(card.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {card.status === 'unused' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={disablingId === card.id}
                            onClick={() => void handleDisable(card.id)}
                          >
                            {t('cards.disableCard')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!hasPrev}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  {t('common.previous')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!hasNext}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  {t('common.next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
