import { AppException, ResponseCode } from '@yikart/common'
import { describe, expect, it } from 'vitest'
import { assertSafeOutboundUrl } from './safe-outbound-url.util'

describe('assertSafeOutboundUrl', () => {
  it('allows public https URLs', async () => {
    const url = await assertSafeOutboundUrl('https://93.184.216.34/video.mp4')
    expect(url.href).toBe('https://93.184.216.34/video.mp4')
  })

  it('blocks localhost and private addresses', async () => {
    await expect(assertSafeOutboundUrl('http://127.0.0.1/secret')).rejects.toMatchObject({
      code: ResponseCode.ChannelOutboundUrlBlocked,
    })
    await expect(assertSafeOutboundUrl('http://10.0.0.8/internal')).rejects.toBeInstanceOf(AppException)
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(AppException)
  })

  it('allows configured private CDN hosts', async () => {
    const url = await assertSafeOutboundUrl('http://localhost:8080/oss/a.mp4', {
      allowedHosts: ['localhost'],
    })
    expect(url.hostname).toBe('localhost')
  })

  it('rejects non-http schemes and embedded credentials', async () => {
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toBeInstanceOf(AppException)
    await expect(assertSafeOutboundUrl('https://user:pass@example.com/a')).rejects.toBeInstanceOf(AppException)
  })
})
