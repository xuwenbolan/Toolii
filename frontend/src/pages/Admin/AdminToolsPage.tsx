import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HelpCircle } from 'lucide-react'

import { AdminErrorState, AdminFilter, DataTable, StatusBadge, ConfirmDialog } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getTranslatedApiError } from '@/lib/apiErrors'
import {
  fetchAdminTools,
  updateAdminTool,
  type AdminToolItem,
  type AdminToolUpdateRequest,
} from '@/services/toolsApi'

const CATEGORY_KEYS = ['image', 'pdf', 'facemap'] as const
const ACCESS_LEVELS = ['public', 'auth', 'verified', 'admin'] as const

// -- Status helpers --

function getToolStatus(tool: AdminToolItem) {
  if (!tool.is_enabled) return 'disabled'
  if (tool.access_level !== 'public') return 'restricted'
  return 'active'
}

function getAccessSummary(tool: AdminToolItem, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!tool.is_enabled) return t('tools.accessSummary.disabled')

  const parts: string[] = []
  parts.push(t(`tools.accessSummary.level.${tool.access_level}`))

  if (tool.daily_limit_anon !== null) {
    parts.push(t('tools.accessSummary.anonLimit', { count: tool.daily_limit_anon }))
  }
  if (tool.daily_limit_auth !== null) {
    parts.push(t('tools.accessSummary.authLimit', { count: tool.daily_limit_auth }))
  }

  if (tool.credit_cost > 0) {
    parts.push(t('tools.accessSummary.cost', { count: tool.credit_cost }))
  } else {
    parts.push(t('tools.accessSummary.free'))
  }

  return parts.join(t('tools.accessSummary.separator'))
}


export function AdminToolsPage() {
  const { t } = useTranslation('console')
  const queryClient = useQueryClient()

  const [filterCategory, setFilterCategory] = useState('all')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [disablingTool, setDisablingTool] = useState<AdminToolItem | null>(null)

  const { data: tools = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'tools'],
    queryFn: fetchAdminTools,
  })

  if (isError) return <AdminErrorState onRetry={() => refetch()} />

  const updateMutation = useMutation({
    mutationFn: ({ name, updates }: { name: string; updates: AdminToolUpdateRequest }) =>
      updateAdminTool(name, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tools'] })
      toast.success(t('tools.updateSuccess'))
    },
    onError: (err) => {
      toast.error(getTranslatedApiError(err, t('common.error')))
    },
  })

  const handleToggleEnabled = useCallback(
    (tool: AdminToolItem) => {
      if (tool.is_enabled) {
        setDisablingTool(tool)
      } else {
        updateMutation.mutate({ name: tool.tool_name, updates: { is_enabled: true } })
      }
    },
    [updateMutation],
  )

  const handleQuickUpdate = useCallback(
    (toolName: string, field: string, value: number | string | null) => {
      updateMutation.mutate({
        name: toolName,
        updates: { [field]: value },
      })
    },
    [updateMutation],
  )

  const handleTextFieldSave = useCallback(
    (toolName: string, field: string, value: string) => {
      updateMutation.mutate({
        name: toolName,
        updates: { [field]: value || null },
      })
    },
    [updateMutation],
  )

  const filteredTools =
    filterCategory === 'all'
      ? tools
      : tools.filter((t) => t.category === filterCategory)

  const columns: Column<AdminToolItem>[] = [
    {
      key: 'tool',
      header: t('tools.toolName'),
      render: (row) => (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="shrink-0 text-[11px]">
            {t(`tools.categories.${row.category}`)}
          </Badge>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-sm">{row.tool_name}</span>
            {(row.display_name_zh || row.display_name_en) && (
              <span className="text-xs text-muted-foreground">
                {row.display_name_zh || row.display_name_en}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('tools.status'),
      render: (row) => {
        const status = getToolStatus(row)
        return <StatusBadge status={status} label={t(`tools.statuses.${status}`)} />
      },
    },
    {
      key: 'access_level',
      header: t('tools.accessLevel'),
      hiddenOnMobile: true,
      render: (row) => (
        <Badge variant="outline">
          {t(`tools.accessLevels.${row.access_level}`)}
        </Badge>
      ),
    },
    {
      key: 'credit_cost',
      header: t('tools.creditCost'),
      align: 'center',
      hiddenOnMobile: true,
      render: (row) => (
        <span className="tabular-nums text-sm">{row.credit_cost}</span>
      ),
    },
    {
      key: 'is_enabled',
      header: t('tools.enabled'),
      align: 'center',
      render: (row) => (
        // stopPropagation prevents row expansion when clicking switch
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Switch
            checked={row.is_enabled}
            onCheckedChange={() => handleToggleEnabled(row)}
          />
        </div>
      ),
    },
  ]

  const handleRowClick = (row: AdminToolItem) => {
    setExpandedKey((prev) => (prev === row.tool_name ? null : row.tool_name))
  }

  const renderExpanded = (tool: AdminToolItem) => (
    <div className="space-y-5">
      {/* Section 1: Display Info */}
      <ExpandedSection title={t('tools.section.displayInfo')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextFieldEditor
            label={`${t('tools.displayName')} (ZH)`}
            value={tool.display_name_zh ?? ''}
            onSave={(v) => handleTextFieldSave(tool.tool_name, 'display_name_zh', v)}
          />
          <TextFieldEditor
            label={`${t('tools.displayName')} (EN)`}
            value={tool.display_name_en ?? ''}
            onSave={(v) => handleTextFieldSave(tool.tool_name, 'display_name_en', v)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextFieldEditor
            label={`${t('tools.description')} (ZH)`}
            value={tool.description_zh ?? ''}
            onSave={(v) => handleTextFieldSave(tool.tool_name, 'description_zh', v)}
          />
          <TextFieldEditor
            label={`${t('tools.description')} (EN)`}
            value={tool.description_en ?? ''}
            onSave={(v) => handleTextFieldSave(tool.tool_name, 'description_en', v)}
          />
        </div>
        <TextFieldEditor
          label={t('tools.icon')}
          value={tool.icon ?? ''}
          onSave={(v) => handleTextFieldSave(tool.tool_name, 'icon', v)}
          placeholder="e.g. compress"
          className="max-w-xs"
        />
      </ExpandedSection>

      <div className="border-t" />

      {/* Section 2: Access Control */}
      <ExpandedSection title={t('tools.section.accessControl')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">{t('tools.accessLevel')}</Label>
            <Select
              value={tool.access_level}
              onValueChange={(v) => handleQuickUpdate(tool.tool_name, 'access_level', v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`tools.accessLevels.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <LabelWithTooltip label={t('tools.creditCost')} tooltip={t('tools.help.creditCost')} />
            <InlineNumberEditor
              value={tool.credit_cost}
              onChange={(v) => handleQuickUpdate(tool.tool_name, 'credit_cost', v)}
              min={0}
            />
          </div>
          <div className="space-y-1">
            <LabelWithTooltip label={t('tools.dailyLimitAnon')} tooltip={t('tools.help.dailyLimitAnon')} />
            <InlineNumberEditor
              value={tool.daily_limit_anon}
              onChange={(v) => handleQuickUpdate(tool.tool_name, 'daily_limit_anon', v)}
              min={0}
              nullable
              placeholder={t('tools.unlimited')}
            />
          </div>
          <div className="space-y-1">
            <LabelWithTooltip label={t('tools.dailyLimitAuth')} tooltip={t('tools.help.dailyLimitAuth')} />
            <InlineNumberEditor
              value={tool.daily_limit_auth}
              onChange={(v) => handleQuickUpdate(tool.tool_name, 'daily_limit_auth', v)}
              min={0}
              nullable
              placeholder={t('tools.unlimited')}
            />
          </div>
        </div>
        {/* Access summary */}
        <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {getAccessSummary(tool, t)}
        </div>
      </ExpandedSection>

      <div className="border-t" />

      {/* Section 3: Display Settings */}
      <ExpandedSection title={t('tools.section.displaySettings')}>
        <div className="max-w-[120px] space-y-1">
          <LabelWithTooltip label={t('tools.displayOrder')} tooltip={t('tools.help.displayOrder')} />
          <InlineNumberEditor
            value={tool.display_order}
            onChange={(v) => handleQuickUpdate(tool.tool_name, 'display_order', v ?? 0)}
            min={0}
          />
        </div>
      </ExpandedSection>
    </div>
  )

  const renderMobileCard = (tool: AdminToolItem) => {
    const status = getToolStatus(tool)
    const isExpanded = expandedKey === tool.tool_name

    return (
      <div className="rounded-xl border bg-card">
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2.5 cursor-pointer"
          onClick={() => handleRowClick(tool)}
        >
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[11px]">
              {t(`tools.categories.${tool.category}`)}
            </Badge>
            <div className="flex flex-col">
              <span className="font-mono text-sm">{tool.tool_name}</span>
              {(tool.display_name_zh || tool.display_name_en) && (
                <span className="text-xs text-muted-foreground">
                  {tool.display_name_zh || tool.display_name_en}
                </span>
              )}
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={tool.is_enabled}
              onCheckedChange={() => handleToggleEnabled(tool)}
            />
          </div>
        </div>

        {/* Summary badges */}
        <div
          className="flex flex-wrap gap-1.5 px-3 pb-2.5 cursor-pointer"
          onClick={() => handleRowClick(tool)}
        >
          <StatusBadge status={status} label={t(`tools.statuses.${status}`)} />
          <Badge variant="outline">{t(`tools.accessLevels.${tool.access_level}`)}</Badge>
          {tool.credit_cost > 0 && (
            <Badge variant="outline" className="tabular-nums">
              {tool.credit_cost} credits
            </Badge>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t px-3 py-3">
            {renderExpanded(tool)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('tools.title')}</h1>
        <AdminFilter
          value={filterCategory}
          options={[
            { value: 'all', label: t('users.filterAll') },
            ...CATEGORY_KEYS.map((k) => ({ value: k, label: t(`tools.categories.${k}`) })),
          ]}
          onChange={(v) => setFilterCategory(v)}
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredTools}
        rowKey={(row) => row.tool_name}
        loading={isLoading}
        onRowClick={handleRowClick}
        expandedRowKey={expandedKey}
        renderExpanded={renderExpanded}
        renderMobileCard={renderMobileCard}
      />

      {/* Disable confirmation dialog */}
      {disablingTool && (
        <ConfirmDialog
          open={!!disablingTool}
          onOpenChange={(open) => !open && setDisablingTool(null)}
          title={t('tools.disableConfirm.title')}
          description={t('tools.disableConfirm.description', { tool: disablingTool.tool_name })}
          confirmText={t('tools.disableConfirm.confirm')}
          variant="destructive"
          loading={updateMutation.isPending}
          onConfirm={() => {
            updateMutation.mutate(
              { name: disablingTool.tool_name, updates: { is_enabled: false } },
              { onSuccess: () => setDisablingTool(null) },
            )
          }}
        />
      )}
    </div>
  )
}


// -- Expanded section wrapper --

function ExpandedSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  )
}


// -- Label with tooltip help icon --

function LabelWithTooltip({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <div className="flex items-center gap-1">
      <Label className="text-xs">{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}


// -- Text field editor (onBlur save) --

function TextFieldEditor({
  label,
  value,
  onSave,
  placeholder,
  className,
}: {
  label: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useState(value)

  // Sync draft when external value changes (e.g. after React Query refetch)
  useEffect(() => {
    setDraft(value)
  }, [value])

  const handleBlur = () => {
    if (draft !== value) onSave(draft)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <Input
        className="mt-1 h-8 text-xs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
    </div>
  )
}


// -- Inline number editor --

function InlineNumberEditor({
  value,
  onChange,
  min = 0,
  nullable = false,
  placeholder,
}: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  nullable?: boolean
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    setDraft(value?.toString() ?? '')
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (nullable && trimmed === '') {
      if (value !== null) onChange(null)
      return
    }
    const num = parseInt(trimmed, 10)
    if (!isNaN(num) && num >= min && num !== value) {
      onChange(num)
    }
  }

  if (editing) {
    return (
      <Input
        type="number"
        className="h-8 w-20 text-center text-xs"
        value={draft}
        min={min}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button
      type="button"
      aria-label={`${value ?? placeholder ?? '-'}`}
      className="inline-flex h-8 min-w-[44px] items-center justify-center rounded border border-transparent px-2 text-xs hover:border-border hover:bg-accent"
      onClick={startEdit}
    >
      {value !== null && value !== undefined ? value : (
        <span className="text-muted-foreground">{placeholder ?? '-'}</span>
      )}
    </button>
  )
}
