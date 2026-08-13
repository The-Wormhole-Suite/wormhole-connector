export enum ConnectorType {
  piHole = 'pihole',
  adguardHome = 'adguard-home',
}

export interface ConnectorSettingsStorage {
  connector_type?: ConnectorType
  pi_uri_base?: string
  api_key?: string
  username?: string
}

export const getConnectorType = (
  settings: Pick<ConnectorSettingsStorage, 'connector_type'>,
): ConnectorType =>
  settings.connector_type === ConnectorType.adguardHome
    ? ConnectorType.adguardHome
    : ConnectorType.piHole
