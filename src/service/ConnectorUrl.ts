import { normalizeHttpAddress, normalizePiHoleAddress } from './PiHoleUrl'
import {
  ConnectorType,
  getConnectorType,
  type ConnectorSettingsStorage,
} from './ConnectorTypes'

export const normalizeAdGuardHomeAddress = (input: string): string =>
  normalizeHttpAddress(input, 'AdGuard Home')

export const getAdGuardHomeApiBase = (input: string): string => {
  const normalizedAddress = normalizeAdGuardHomeAddress(input)
  const url = new URL(normalizedAddress)
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.at(-1)?.toLowerCase() === 'control') {
    segments.pop()
  }
  segments.push('control')
  url.pathname = `/${segments.join('/')}/`
  return url.toString()
}

export const normalizeConnectorAddress = (
  connector: Pick<ConnectorSettingsStorage, 'connector_type' | 'pi_uri_base'>,
): string => {
  const address = String(connector.pi_uri_base ?? '')
  return getConnectorType(connector) === ConnectorType.adguardHome
    ? normalizeAdGuardHomeAddress(address)
    : normalizePiHoleAddress(address)
}

export const isValidConnectorAddress = (
  connector: Pick<ConnectorSettingsStorage, 'connector_type' | 'pi_uri_base'>,
): boolean => {
  try {
    normalizeConnectorAddress(connector)
    return true
  } catch {
    return false
  }
}

export const getConnectorIdentity = (
  connector: Pick<ConnectorSettingsStorage, 'connector_type' | 'pi_uri_base'>,
): string =>
  `${getConnectorType(connector)}:${normalizeConnectorAddress(connector)}`
