import { useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type Props = {
  accept?: string
  multiple?: boolean
  maxFiles?: number
  showCamera?: boolean
  cameraAccept?: string
  onFiles: (files: File[]) => void
}

export function FileDropzone({
  accept,
  multiple = false,
  maxFiles,
  showCamera = true,
  cameraAccept,
  onFiles,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const { t } = useTranslation('common')

  const handleDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length === 0) return
      const files = multiple ? accepted : accepted.slice(0, 1)
      onFiles(files)
    },
    [multiple, onFiles],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: accept ? { [accept]: [] } : undefined,
    multiple,
    maxFiles,
    noClick: true,
    noKeyboard: true,
  })

  return (
    <div className="space-y-3">
      <Card
        {...getRootProps()}
        className={[
          'border-dashed p-4',
          isDragActive ? 'bg-accent/40' : 'bg-card',
        ].join(' ')}
      >
        <input {...getInputProps()} />
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium">{t('upload.dropHere')}</p>
          <p className="text-xs text-muted-foreground">{t('upload.orSelectBelow')}</p>
        </div>
      </Card>

      <div className={showCamera ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'grid grid-cols-1 gap-2'}>
        <Button type="button" variant="outline" onClick={open}>
          {t('actions.selectFile')}
        </Button>
        {showCamera ? (
          <Button
            type="button"
            onClick={() => {
              cameraInputRef.current?.click()
            }}
          >
            {t('actions.takePhoto')}
          </Button>
        ) : null}
      </div>

      {showCamera ? (
        <input
          ref={cameraInputRef}
          className="hidden"
          type="file"
          accept={cameraAccept ?? accept ?? 'image/*'}
          capture="environment"
          multiple={multiple}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
            e.target.value = ''
          }}
        />
      ) : null}
    </div>
  )
}
