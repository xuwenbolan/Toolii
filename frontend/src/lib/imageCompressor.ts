import imageCompression from 'browser-image-compression'

type Options = {
  maxSizeMB: number
  maxWidthOrHeight?: number
}

export async function precompressImage(file: File, options: Options): Promise<File> {
  return imageCompression(file, {
    maxSizeMB: options.maxSizeMB,
    maxWidthOrHeight: options.maxWidthOrHeight,
    useWebWorker: true,
  })
}

