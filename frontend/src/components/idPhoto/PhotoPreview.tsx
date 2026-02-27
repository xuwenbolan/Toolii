type Props = {
  src: string
  title?: string
  subtitle?: string
}

export function PhotoPreview({ src, title = '预览图（含水印）', subtitle }: Props) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 p-3">
        <img
          src={src}
          alt="证件照预览"
          className="mx-auto max-h-[360px] w-auto rounded-md border bg-white shadow-sm"
        />
      </div>
    </div>
  )
}

