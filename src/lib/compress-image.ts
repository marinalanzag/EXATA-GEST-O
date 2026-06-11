const MAX_DIMENSION = 1600
const SKIP_THRESHOLD = 300 * 1024 // 300KB
const JPEG_QUALITY = 0.8

export interface CompressedImage {
  blob: Blob
  /** Extension to use when saving (jpg when re-encoded, original otherwise) */
  ext: string
  contentType: string
}

function getOriginalExt(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext || 'jpg'
}

/**
 * Compresses an image client-side: resizes to a maximum of 1600px on the
 * longest side and re-encodes as JPEG (quality 0.8). Files smaller than
 * 300KB are returned untouched. Falls back to the original file if the
 * browser cannot decode/encode the image.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const original: CompressedImage = {
    blob: file,
    ext: getOriginalExt(file),
    contentType: file.type || 'application/octet-stream',
  }

  if (file.size < SKIP_THRESHOLD) return original

  try {
    const bitmap = await createImageBitmap(file)
    try {
      const { width, height } = bitmap
      const longest = Math.max(width, height)
      const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1
      const targetW = Math.max(1, Math.round(width * scale))
      const targetH = Math.max(1, Math.round(height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) return original

      ctx.drawImage(bitmap, 0, 0, targetW, targetH)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
      )

      if (!blob) return original
      // If compression somehow made it bigger, keep the original
      if (blob.size >= file.size) return original

      return { blob, ext: 'jpg', contentType: 'image/jpeg' }
    } finally {
      bitmap.close()
    }
  } catch (error) {
    console.warn('Falha ao comprimir imagem, enviando original:', error)
    return original
  }
}
