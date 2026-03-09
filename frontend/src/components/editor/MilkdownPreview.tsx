import { useRef } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'

import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import './typora-editor.css'

type Props = {
  content: string
  className?: string
}

function MilkdownPreviewInner({ content }: Props) {
  const contentRef = useRef(content)
  contentRef.current = content

  useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: contentRef.current,
        features: {
          [CrepeFeature.ImageBlock]: false,
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
    [content],
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
