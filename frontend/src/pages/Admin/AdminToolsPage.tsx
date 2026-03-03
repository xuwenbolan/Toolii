import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { AdminFilter, DataTable } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'all' },
  { value: 'image', label: 'Image' },
  { value: 'pdf', label: 'PDF' },
  { value: 'facemap', label: 'FaceMap' },
]

const ACCESS_LEVELS = ['public', 'auth', 'verified', 'admin'] as const

const CATEGORY_COLORS: Record<string, string> = {
  image: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  pdf: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  facemap: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
}

export function AdminToolsPage() {
  const { t } = useTranslation('admin')
  const queryClient = useQueryClient()

  const [filterCategory, setFilterCategory] = useState('all')
  const [editingTool, setEditingTool] = useState<AdminToolItem | null>(null)

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['admin', 'tools'],
    queryFn: fetchAdminTools,
  })

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
      updateMutation.mutate({
        name: tool.tool_name,
        updates: { is_enabled: !tool.is_enabled },
      })
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

  const filteredTools =
    filterCategory === 'all'
      ? tools
      : tools.filter((t) => t.category === filterCategory)

  const columns: Column<AdminToolItem>[] = [
    {
      key: 'tool_name',
      header: t('tools.toolName'),
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm">{row.tool_name}</span>
          {(row.display_name_zh || row.display_name_en) && (
            <span className="text-xs text-muted-foreground">
              {row.display_name_zh || row.display_name_en}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: t('tools.category'),
      render: (row) => (
        <Badge variant="secondary" className={CATEGORY_COLORS[row.category] ?? ''}>
          {row.category}
        </Badge>
      ),
    },
    {
      key: 'is_enabled',
      header: t('tools.enabled'),
      align: 'center',
      render: (row) => (
        <Button
          size="sm"
          variant={row.is_enabled ? 'default' : 'outline'}
          className="h-7 min-w-[52px] text-xs"
          onClick={() => handleToggleEnabled(row)}
        >
          {row.is_enabled ? 'ON' : 'OFF'}
        </Button>
      ),
    },
    {
      key: 'credit_cost',
      header: t('tools.creditCost'),
      align: 'center',
      render: (row) => (
        <InlineNumberEditor
          value={row.credit_cost}
          onChange={(v) => handleQuickUpdate(row.tool_name, 'credit_cost', v)}
          min={0}
        />
      ),
    },
    {
      key: 'access_level',
      header: t('tools.accessLevel'),
      render: (row) => (
        <Select
          value={row.access_level}
          onValueChange={(v) => handleQuickUpdate(row.tool_name, 'access_level', v)}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
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
      ),
    },
    {
      key: 'daily_limit_anon',
      header: t('tools.dailyLimitAnon'),
      align: 'center',
      render: (row) => (
        <InlineNumberEditor
          value={row.daily_limit_anon}
          onChange={(v) => handleQuickUpdate(row.tool_name, 'daily_limit_anon', v)}
          min={0}
          nullable
          placeholder={t('tools.unlimited')}
        />
      ),
    },
    {
      key: 'daily_limit_auth',
      header: t('tools.dailyLimitAuth'),
      align: 'center',
      render: (row) => (
        <InlineNumberEditor
          value={row.daily_limit_auth}
          onChange={(v) => handleQuickUpdate(row.tool_name, 'daily_limit_auth', v)}
          min={0}
          nullable
          placeholder={t('tools.unlimited')}
        />
      ),
    },
    {
      key: 'display_order',
      header: t('tools.displayOrder'),
      align: 'center',
      render: (row) => (
        <InlineNumberEditor
          value={row.display_order}
          onChange={(v) => handleQuickUpdate(row.tool_name, 'display_order', v ?? 0)}
          min={0}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setEditingTool(row)}
        >
          {t('tools.editMeta')}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('tools.title')}</h1>
        <AdminFilter
          value={filterCategory}
          options={CATEGORY_OPTIONS.map((o) => ({
            value: o.value,
            label: o.value === 'all' ? t('users.filterAll') : o.label,
          }))}
          onChange={(v) => setFilterCategory(v)}
        />
      </div>

      <DataTable columns={columns} data={filteredTools} rowKey={(row) => row.tool_name} loading={isLoading} />

      {editingTool && (
        <MetadataDialog
          tool={editingTool}
          open={!!editingTool}
          onOpenChange={(open) => !open && setEditingTool(null)}
          onSave={(updates) => {
            updateMutation.mutate(
              { name: editingTool.tool_name, updates },
              { onSuccess: () => setEditingTool(null) },
            )
          }}
          saving={updateMutation.isPending}
        />
      )}
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
        className="h-7 w-16 text-center text-xs"
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
      className="inline-flex h-7 min-w-[40px] items-center justify-center rounded border border-transparent px-1.5 text-xs hover:border-border hover:bg-accent"
      onClick={startEdit}
    >
      {value !== null && value !== undefined ? value : (
        <span className="text-muted-foreground">{placeholder ?? '-'}</span>
      )}
    </button>
  )
}

// -- Metadata dialog --

function MetadataDialog({
  tool,
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  tool: AdminToolItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (updates: AdminToolUpdateRequest) => void
  saving: boolean
}) {
  const { t } = useTranslation('admin')

  const [nameZh, setNameZh] = useState(tool.display_name_zh ?? '')
  const [nameEn, setNameEn] = useState(tool.display_name_en ?? '')
  const [descZh, setDescZh] = useState(tool.description_zh ?? '')
  const [descEn, setDescEn] = useState(tool.description_en ?? '')
  const [icon, setIcon] = useState(tool.icon ?? '')

  const handleSave = () => {
    onSave({
      display_name_zh: nameZh || null,
      display_name_en: nameEn || null,
      description_zh: descZh || null,
      description_en: descEn || null,
      icon: icon || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('tools.editMeta')} - <span className="font-mono">{tool.tool_name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('tools.displayName')} (ZH)</Label>
              <Input value={nameZh} onChange={(e) => setNameZh(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t('tools.displayName')} (EN)</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('tools.description')} (ZH)</Label>
              <Input value={descZh} onChange={(e) => setDescZh(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t('tools.description')} (EN)</Label>
              <Input value={descEn} onChange={(e) => setDescEn(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">{t('tools.icon')}</Label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="mt-1" placeholder="e.g. compress" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.loading') : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
