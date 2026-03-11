import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share2, Trash2 } from 'lucide-react'

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { deleteFiles, type UserFileItem } from '@/services/hubApi'

import { ExtendDialog } from './hub/ExtendDialog'
import { RenameDialog } from './hub/RenameDialog'
import { ShareDialog } from './hub/ShareDialog'

// -- Types --

export type DialogActions = {
  setRenameItem: (item: UserFileItem | null) => void
  setExtendItem: (item: UserFileItem | null) => void
  openSingleDelete: (item: UserFileItem) => void
  openBatchDelete: () => void
  openShare: (item: UserFileItem) => void
  openBatchShare: () => void
}

/**
 * Hook that manages all dialog state and actions for HubFilesPage.
 * Returns action handlers (for the page) and dialogProps (for HubDialogs).
 */
export function useHubDialogs(
  selected: Set<number>,
  fetchList: () => void,
  clearSelection: () => void,
) {
  const [renameItem, setRenameItem] = useState<UserFileItem | null>(null)
  const [extendItem, setExtendItem] = useState<UserFileItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<UserFileItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareFileIds, setShareFileIds] = useState<number[]>([])

  const openSingleDelete = useCallback((item: UserFileItem) => {
    setDeleteItem(item)
    setDeleteOpen(true)
  }, [])

  const openBatchDelete = useCallback(() => {
    setDeleteItem(null)
    setDeleteOpen(true)
  }, [])

  const openShare = useCallback((item: UserFileItem) => {
    setShareFileIds([item.id])
    setShareDialogOpen(true)
  }, [])

  const openBatchShare = useCallback(() => {
    setShareFileIds([...selected])
    setShareDialogOpen(true)
  }, [selected])

  const handleDelete = useCallback(async () => {
    const ids = deleteItem ? [deleteItem.id] : [...selected]
    if (ids.length === 0) return
    try {
      await deleteFiles(ids)
      clearSelection()
      setDeleteItem(null)
      fetchList()
    } catch {
      // silent
    } finally {
      setDeleteOpen(false)
    }
  }, [selected, deleteItem, fetchList, clearSelection])

  const actions: DialogActions = {
    setRenameItem,
    setExtendItem,
    openSingleDelete,
    openBatchDelete,
    openShare,
    openBatchShare,
  }

  const dialogProps: HubDialogsProps = {
    deleteOpen,
    deleteCount: deleteItem ? 1 : selected.size,
    renameItem,
    extendItem,
    shareDialogOpen,
    shareFileIds,
    onDeleteConfirm: () => { void handleDelete() },
    onDeleteOpenChange: setDeleteOpen,
    onRenameClose: () => setRenameItem(null),
    onExtendClose: () => setExtendItem(null),
    onShareClose: () => setShareDialogOpen(false),
    onDone: fetchList,
  }

  return { actions, dialogProps }
}

// -- Compound dialog component --

export type HubDialogsProps = {
  deleteOpen: boolean
  deleteCount: number
  renameItem: UserFileItem | null
  extendItem: UserFileItem | null
  shareDialogOpen: boolean
  shareFileIds: number[]
  onDeleteConfirm: () => void
  onDeleteOpenChange: (open: boolean) => void
  onRenameClose: () => void
  onExtendClose: () => void
  onShareClose: () => void
  onDone: () => void
}

/** Renders all hub file dialogs (delete, rename, extend, share). */
export function HubDialogs({
  deleteOpen,
  deleteCount,
  renameItem,
  extendItem,
  shareDialogOpen,
  shareFileIds,
  onDeleteConfirm,
  onDeleteOpenChange,
  onRenameClose,
  onExtendClose,
  onShareClose,
  onDone,
}: HubDialogsProps) {
  const { t } = useTranslation('hub')

  return (
    <>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={onDeleteOpenChange}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDesc', { count: deleteCount })}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        variant="destructive"
        onConfirm={onDeleteConfirm}
      />

      <RenameDialog
        item={renameItem}
        onClose={onRenameClose}
        onDone={onDone}
      />

      <ExtendDialog
        item={extendItem}
        onClose={onExtendClose}
        onDone={onDone}
      />

      <ShareDialog
        open={shareDialogOpen}
        fileIds={shareFileIds}
        onClose={onShareClose}
        onShared={onDone}
      />
    </>
  )
}

// -- Bulk action bar component --

export type BulkActionBarProps = {
  selectedCount: number
  totalCount: number
  onToggleSelectAll: () => void
  onShare: () => void
  onDelete: () => void
}

/** Floating bottom bar shown when files are selected. */
export function BulkActionBar({
  selectedCount,
  totalCount,
  onToggleSelectAll,
  onShare,
  onDelete,
}: BulkActionBarProps) {
  const { t } = useTranslation('hub')

  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-[var(--duration-normal)]">
      <Checkbox
        checked={selectedCount === totalCount}
        onCheckedChange={onToggleSelectAll}
        aria-label={t('selectAll')}
      />
      <span className="text-sm font-medium">{t('selected', { count: selectedCount })}</span>
      <Button size="sm" variant="outline" onClick={onShare}>
        <Share2 className="mr-1 h-3.5 w-3.5" />
        {t('share')}
      </Button>
      <Button size="sm" variant="destructive" onClick={onDelete}>
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        {t('delete')}
      </Button>
    </div>
  )
}
