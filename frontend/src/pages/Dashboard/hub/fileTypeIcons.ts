import {
  FileArchive,
  FileAudio,
  FileCode,
  FileIcon,
  FileImage,
  FileText,
  FileType,
  FileVideo,
  type LucideIcon,
} from 'lucide-react'

const TYPE_MAP: [RegExp, LucideIcon][] = [
  [/^image\//, FileImage],
  [/^video\//, FileVideo],
  [/^audio\//, FileAudio],
  [/^text\/markdown/, FileType],
  [/^text\//, FileCode],
  [/^application\/pdf/, FileText],
  [/^application\/(zip|x-rar|x-7z|gzip|x-tar|x-bzip2)/, FileArchive],
]

export function getFileTypeIcon(contentType: string): LucideIcon {
  for (const [re, icon] of TYPE_MAP) {
    if (re.test(contentType)) return icon
  }
  return FileIcon
}

export function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot === -1 || dot === filename.length - 1) return ''
  return filename.slice(dot + 1).toUpperCase()
}
