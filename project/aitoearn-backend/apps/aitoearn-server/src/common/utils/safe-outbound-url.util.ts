import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { AppException, ResponseCode } from '@yikart/common'

export interface SafeOutboundUrlOptions {
  /** Hostnames that may resolve to private/link-local addresses (e.g. local CDN). */
  allowedHosts?: Iterable<string>
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
}

function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split('.')
  if (parts.length !== 4)
    return undefined
  let value = 0
  for (const part of parts) {
    if (!/^\d+$/.test(part))
      return undefined
    const octet = Number(part)
    if (octet < 0 || octet > 255)
      return undefined
    value = (value << 8) + octet
  }
  return value >>> 0
}

function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = normalizeHost(ip)
  const version = isIP(normalized)
  if (version === 4) {
    const value = ipv4ToInt(normalized)
    if (value === undefined)
      return true
    // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 240.0.0.0/4
    return (
      (value & 0xff000000) === 0x00000000
      || (value & 0xff000000) === 0x0a000000
      || (value & 0xff000000) === 0x7f000000
      || (value & 0xffff0000) === 0xa9fe0000
      || (value & 0xfff00000) === 0xac100000
      || (value & 0xffff0000) === 0xc0a80000
      || (value & 0xf0000000) === 0xe0000000
      || (value & 0xf0000000) === 0xf0000000
    )
  }
  if (version === 6) {
    const lower = normalized.toLowerCase()
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice('::ffff:'.length)
      return isIP(mapped) === 4 ? isPrivateOrReservedIp(mapped) : true
    }
    return (
      lower === '::'
      || lower === '::1'
      || lower.startsWith('fc')
      || lower.startsWith('fd')
      || lower.startsWith('fe8')
      || lower.startsWith('fe9')
      || lower.startsWith('fea')
      || lower.startsWith('feb')
      || lower.startsWith('ff')
    )
  }
  return true
}

function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (!host)
    return true
  if (host === 'localhost' || host.endsWith('.localhost'))
    return true
  if (host === 'metadata.google.internal' || host === 'metadata')
    return true
  return false
}

/**
 * Reject outbound media/fetch URLs that target non-http(s) schemes or private networks.
 * Hosts in `allowedHosts` may resolve to private addresses (local CDN / object storage).
 */
export async function assertSafeOutboundUrl(rawUrl: string, options: SafeOutboundUrlOptions = {}): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  }
  catch {
    throw new AppException(ResponseCode.ChannelOutboundUrlBlocked, { reason: 'invalid_url' })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppException(ResponseCode.ChannelOutboundUrlBlocked, { reason: 'invalid_protocol' })
  }
  if (parsed.username || parsed.password) {
    throw new AppException(ResponseCode.ChannelOutboundUrlBlocked, { reason: 'credentials_in_url' })
  }

  const hostname = normalizeHost(parsed.hostname)
  const allowedHosts = new Set(
    [...(options.allowedHosts ?? [])].map(host => normalizeHost(host)).filter(Boolean),
  )
  const hostAllowed = allowedHosts.has(hostname)

  if (!hostAllowed && isBlockedHostname(hostname)) {
    throw new AppException(ResponseCode.ChannelOutboundUrlBlocked, { reason: 'blocked_host' })
  }

  if (isIP(hostname)) {
    if (!hostAllowed && isPrivateOrReservedIp(hostname)) {
      throw new AppException(ResponseCode.ChannelOutboundUrlBlocked, { reason: 'private_ip' })
    }
    return parsed
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  }
  catch {
    throw new AppException(ResponseCode.ChannelOutboundUrlBlocked, { reason: 'dns_lookup_failed' })
  }

  if (!addresses.length) {
    throw new AppException(ResponseCode.ChannelOutboundUrlBlocked, { reason: 'dns_lookup_failed' })
  }

  if (!hostAllowed) {
    for (const { address } of addresses) {
      if (isPrivateOrReservedIp(address)) {
        throw new AppException(ResponseCode.ChannelOutboundUrlBlocked, { reason: 'private_ip' })
      }
    }
  }

  return parsed
}
