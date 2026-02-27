import { assertMaxFileSize, bytesToMb, formatBytes } from '@/lib/fileValidation'

describe('fileValidation', () => {
  it('converts bytes to MB', () => {
    expect(bytesToMb(1048576)).toBe(1)
  })

  it('formats bytes in human readable text', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB')
  })

  it('throws when file exceeds max size', () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024)], 'big.bin')
    expect(() => assertMaxFileSize(file, 1)).toThrow('文件过大')
  })

  it('passes when file is within max size', () => {
    const file = new File([new Uint8Array(512 * 1024)], 'small.bin')
    expect(() => assertMaxFileSize(file, 1)).not.toThrow()
  })
})
