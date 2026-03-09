import { useRef } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'

import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import './typora-editor.css'

type Props = {
  initialContent: string
  placeholder?: string
  onChange: (markdown: string) => void
  onNormalized?: (markdown: string) => void
}

function TyporaEditorInner({ initialContent, placeholder, onChange, onNormalized }: Props) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onNormalizedRef = useRef(onNormalized)
  onNormalizedRef.current = onNormalized
  const initializedRef = useRef(false)

  useEditor(
    (root) => {
      initializedRef.current = false

      const crepe = new Crepe({
        root,
        defaultValue: initialContent,
        features: {
          [CrepeFeature.ImageBlock]: false,
          [CrepeFeature.Latex]: false,
        },
        featureConfigs: {
          [CrepeFeature.Placeholder]: {
            text: placeholder ?? '',
            mode: 'doc',
          },
        },
      })

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (!initializedRef.current) {
            // First callback is the round-trip normalization from editor init.
            // Sync both content and lastSavedContent to avoid false dirty state.
            initializedRef.current = true
            onNormalizedRef.current?.(markdown)
            return
          }
          onChangeRef.current(markdown)
        })
      })

      return crepe
    },
    [initialContent],
  )

  return (
    <div className="typora-root min-h-0 flex-1">
      <Milkdown />
    </div>
  )
}

export function TyporaEditor(props: Omit<Props, 'onNormalized'> & { onNormalized?: (markdown: string) => void }) {
  return (
    <MilkdownProvider>
      <TyporaEditorInner {...props} />
    </MilkdownProvider>
  )
}
