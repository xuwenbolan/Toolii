import { useEffect, useRef } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react'
import { replaceAll } from '@milkdown/utils'

import '@milkdown/crepe/theme/common/prosemirror.css'
import '@milkdown/crepe/theme/common/reset.css'
import '@milkdown/crepe/theme/common/code-mirror.css'
import '@milkdown/crepe/theme/common/image-block.css'
import '@milkdown/crepe/theme/common/link-tooltip.css'
import '@milkdown/crepe/theme/common/list-item.css'
import '@milkdown/crepe/theme/common/table.css'
import '@milkdown/crepe/theme/frame.css'
import './typora-editor.css'

type Props = {
  content: string
  className?: string
}

function MilkdownPreviewInner({ content }: Props) {
  const contentRef = useRef(content)
  const [loading, getInstance] = useInstance()

  useEffect(() => {
    contentRef.current = content
    if (loading) return
    const editor = getInstance()
    editor?.action(replaceAll(content))
  }, [content, loading, getInstance])

  useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: contentRef.current,
        features: {
          [CrepeFeature.Latex]: false,
          [CrepeFeature.Placeholder]: false,
          [CrepeFeature.BlockEdit]: false,
          [CrepeFeature.Cursor]: false,
          [CrepeFeature.Toolbar]: false,
        },
      })

      crepe.setReadonly(true)

      return crepe
    },
    [],
  )

  return (
    <div className="typora-root min-h-0 flex-1 select-text" data-readonly>
      <Milkdown />
    </div>
  )
}

export function MilkdownPreview({ content, className }: Props) {
  return (
    <MilkdownProvider>
      <div className={className}>
        <MilkdownPreviewInner content={content} />
      </div>
    </MilkdownProvider>
  )
}
