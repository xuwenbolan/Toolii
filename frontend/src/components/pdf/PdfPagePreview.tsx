type Props = {
  page: number
}

export function PdfPagePreview({ page }: Props) {
  return (
    <div className="flex h-16 w-12 items-center justify-center rounded-md border bg-card text-xs font-medium">
      {page}
    </div>
  )
}

