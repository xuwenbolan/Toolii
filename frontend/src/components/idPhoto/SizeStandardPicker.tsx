import type { PhotoStandard } from '@/services/idPhotoApi'

import { Label } from '@/components/ui/label'

type Props = {
  standards: PhotoStandard[]
  value: string
  onChange: (value: string) => void
}

export function SizeStandardPicker({ standards, value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="photo-standard">证件照规格</Label>
      <select
        id="photo-standard"
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {standards.map((item) => (
          <option key={item.code} value={item.code}>
            {item.name} ({item.width_mm}×{item.height_mm}mm)
          </option>
        ))}
      </select>
    </div>
  )
}

