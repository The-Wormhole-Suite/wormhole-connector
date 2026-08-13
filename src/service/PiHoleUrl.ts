const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export const normalizeHttpAddress = (
  input: string,
  productName: string,
): string => {
  const value = String(input ?? '').trim()
  if (!value) {
    throw new Error(`${productName} address cannot be empty`)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${productName} address is not a valid URL`)
  }

  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    throw new Error(`${productName} address must use HTTP or HTTPS`)
  }
  if (url.username || url.password) {
    throw new Error(
      `Credentials must not be embedded in the ${productName} URL`,
    )
  }
  if (url.search || url.hash) {
    throw new Error(
      `${productName} address must not contain a query or fragment`,
    )
  }

  const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  return `${url.origin}${pathname === '/' ? '' : pathname}`
}

export const normalizePiHoleAddress = (input: string): string => {
  return normalizeHttpAddress(input, 'Pi-hole')
}

export const getPiHoleApiBase = (input: string): string => {
  const normalizedAddress = normalizePiHoleAddress(input)
  const url = new URL(normalizedAddress)
  const segments = url.pathname.split('/').filter(Boolean)
  const finalSegment = segments.at(-1)?.toLowerCase()

  if (finalSegment === 'admin' || finalSegment === 'api') {
    segments.pop()
  }
  segments.push('api')

  url.pathname = `/${segments.join('/')}/`
  return url.toString()
}

export const isValidPiHoleAddress = (input: string): boolean => {
  try {
    normalizePiHoleAddress(input)
    return true
  } catch {
    return false
  }
}
