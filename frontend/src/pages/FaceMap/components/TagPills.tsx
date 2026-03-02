import { Star } from 'lucide-react'

export function TagPills({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
        >
          <Star className="h-3 w-3" />
          {tag}
        </span>
      ))}
    </div>
  )
}
