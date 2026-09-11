import { isIP } from 'node:net'

export const normalizeClientIp = (value: string | null | undefined) => {
  let candidate = (value || '').split(',')[0]?.trim() || ''
  const bracketed = candidate.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (bracketed) candidate = bracketed[1]
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(candidate)) candidate = candidate.slice(0, candidate.lastIndexOf(':'))
  if (candidate.toLowerCase().startsWith('::ffff:') && isIP(candidate.slice(7)) === 4) candidate = candidate.slice(7)
  return isIP(candidate) ? candidate : null
}

export const getRequestIp = (headers: Headers) => normalizeClientIp(
  headers.get('cf-connecting-ip') || headers.get('x-forwarded-for') || headers.get('x-real-ip')
)

export const normalizeOfficeNetwork = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Office network is required.')
  const parts = trimmed.split('/')
  if (parts.length > 2) throw new Error(`Invalid office network: ${trimmed}`)
  const version = isIP(parts[0])
  if (!version) throw new Error(`Invalid office IP or CIDR: ${trimmed}`)
  const maximum = version === 4 ? 32 : 128
  if (parts.length === 1) return `${parts[0]}/${maximum}`
  if (!/^\d+$/.test(parts[1])) throw new Error(`Invalid CIDR prefix: ${trimmed}`)
  const prefix = Number(parts[1])
  if (prefix < 0 || prefix > maximum) throw new Error(`Invalid CIDR prefix: ${trimmed}`)
  return `${parts[0]}/${prefix}`
}
