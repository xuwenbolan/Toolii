import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

type Props = {
  content: string
  className?: string
}

function isSafeExternalUrl(value?: string) {
  if (!value) return false
  try {
    const parsed = new URL(value, window.location.origin)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function MarkdownPreview({ content, className }: Props) {
  return (
    <div
      className={cn(
        'doc-markdown text-[15px] leading-7 text-foreground',
        '[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:bg-muted/70 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em]',
        '[&_em]:text-foreground/80 [&_hr]:my-8 [&_hr]:border-border',
        '[&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight',
        '[&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight',
        '[&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold',
        '[&_img]:rounded-xl [&_img]:border [&_img]:border-border/70 [&_img]:shadow-sm',
        '[&_li]:marker:text-muted-foreground [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6',
        '[&_p]:my-4 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_pre]:text-zinc-100',
        '[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-xl [&_table]:border [&_table]:border-border/70',
        '[&_tbody_tr:nth-child(odd)]:bg-muted/20 [&_td]:border [&_td]:border-border/70 [&_td]:px-3 [&_td]:py-2',
        '[&_th]:border [&_th]:border-border/70 [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium',
        '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, ...props }) => (
            <a
              {...props}
              href={isSafeExternalUrl(href) ? href : undefined}
              rel="noreferrer noopener"
              target="_blank"
            />
          ),
          img: ({ src, alt }) =>
            isSafeExternalUrl(src) ? <img src={src} alt={alt ?? ''} loading="lazy" /> : null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
