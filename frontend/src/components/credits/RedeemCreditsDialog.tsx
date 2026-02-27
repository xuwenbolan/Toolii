import { useEffect } from 'react'

import { RedeemForm } from '@/components/credits/RedeemForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
  closeOnRedeemed?: boolean
}

export function RedeemCreditsDialog({
  open,
  onOpenChange,
  onChanged,
  closeOnRedeemed = false,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="关闭兑换弹窗"
        className="absolute inset-0 bg-black/45"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex min-h-full w-full max-w-md items-start sm:items-center">
          <Card className="w-full shadow-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">兑换 Credits</CardTitle>
              <p className="text-sm text-muted-foreground">
                输入卡密后会立即到账。格式：TOOL-XXXX-XXXX-XXXX。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <RedeemForm
                onRedeemed={() => {
                  onChanged?.()
                  if (closeOnRedeemed) onOpenChange(false)
                }}
              />

              <div className="flex justify-end">
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                  关闭
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
