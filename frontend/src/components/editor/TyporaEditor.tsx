import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { callCommand } from '@milkdown/utils'
import { undoCommand, redoCommand } from '@milkdown/plugin-history'

// Import Crepe component CSS individually (skip latex.css to avoid KaTeX
// inline fonts that violate CSP font-src 'self').
import '@milkdown/crepe/theme/common/prosemirror.css'
import '@milkdown/crepe/theme/common/reset.css'
import '@milkdown/crepe/theme/common/block-edit.css'
import '@milkdown/crepe/theme/common/code-mirror.css'
import '@milkdown/crepe/theme/common/cursor.css'
import '@milkdown/crepe/theme/common/image-block.css'
import '@milkdown/crepe/theme/common/link-tooltip.css'
import '@milkdown/crepe/theme/common/list-item.css'
import '@milkdown/crepe/theme/common/placeholder.css'
import '@milkdown/crepe/theme/common/toolbar.css'
import '@milkdown/crepe/theme/common/table.css'
import '@milkdown/crepe/theme/frame.css'
import './typora-editor.css'

export type TyporaEditorHandle = {
  undo: () => void
  redo: () => void
}

type Props = {
  initialContent: string
  placeholder?: string
  onChange: (markdown: string) => void
  onNormalized?: (markdown: string) => void
  onImageUpload?: (file: File) => Promise<string>
}

const TyporaEditorInner = forwardRef<TyporaEditorHandle, Props>(
  function TyporaEditorInner({ initialContent, placeholder, onChange, onNormalized, onImageUpload }, ref) {
    const onChangeRef = useRef(onChange)
    useEffect(() => { onChangeRef.current = onChange }, [onChange])
    const onNormalizedRef = useRef(onNormalized)
    useEffect(() => { onNormalizedRef.current = onNormalized }, [onNormalized])
    const onImageUploadRef = useRef(onImageUpload)
    useEffect(() => { onImageUploadRef.current = onImageUpload }, [onImageUpload])
    const initializedRef = useRef(false)
    const crepeRef = useRef<Crepe | null>(null)

    // The component is keyed by fileId:editorRevision, so remounting handles
    // reinitialization. Empty deps prevents editor recreation on parent re-renders.
    const initialContentRef = useRef(initialContent)

    useEditor(
      (root) => {
        initializedRef.current = false

        const crepe = new Crepe({
          root,
          defaultValue: initialContentRef.current,
          features: {
            [CrepeFeature.Latex]: false,
          },
          featureConfigs: {
            [CrepeFeature.Placeholder]: {
              text: placeholder ?? '',
              mode: 'doc',
            },
            [CrepeFeature.ImageBlock]: {
              onUpload: async (file: File) => onImageUploadRef.current?.(file) ?? '',
            },
          },
        })

        crepe.on((listener) => {
          listener.mounted(() => {
            crepeRef.current = crepe
            // Focus editor as soon as ProseMirror view is ready.
            // mounted fires after EditorViewReady, so DOM is guaranteed.
            const pm = root.querySelector('.ProseMirror') as HTMLElement | null
            pm?.focus()
          })
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
      [],
    )

    useImperativeHandle(ref, () => ({
      undo: () => {
        try { crepeRef.current?.editor.action(callCommand(undoCommand.key)) } catch { /* not ready */ }
      },
      redo: () => {
        try { crepeRef.current?.editor.action(callCommand(redoCommand.key)) } catch { /* not ready */ }
      },
    }))

    return (
      <div className="typora-root min-h-0 flex-1">
        <Milkdown />
      </div>
    )
  },
)

export const TyporaEditor = forwardRef<TyporaEditorHandle, Props>(
  function TyporaEditor(props, ref) {
    return (
      <MilkdownProvider>
        <TyporaEditorInner ref={ref} {...props} />
      </MilkdownProvider>
    )
  },
)
