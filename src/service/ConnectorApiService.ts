import ApiList from '../api/enum/ApiList'
import PiHoleApiStatusEnum from '../api/enum/PiHoleApiStatusEnum'
import type { PiHoleDomain } from '../api/models/PiHoleDomains'
import type { PiHoleGroup } from '../api/models/PiHoleGroups'
import type { PiHoleApiStatus } from '../api/models/PiHoleApiStatus'
import AdGuardHomeApiService, {
  type AdGuardClientMutation,
} from './AdGuardHomeApiService'
import type { AdGuardRuleMutation } from './AdGuardHomeRules'
import { getConnectorIdentity, normalizeConnectorAddress } from './ConnectorUrl'
import {
  combineDomainStates,
  evaluateDomainSearch,
  type DomainBlockingState,
} from './DomainStatusEvaluator'
import {
  runMultiInstanceTransaction,
  type MultiInstanceTarget,
} from './MultiInstanceOperation'
import OperationCoordinator from './OperationCoordinator'
import PiHoleApiService, { combinePiHoleStatuses } from './PiHoleApiService'
import {
  ConnectorType,
  getConnectorType,
  StorageService,
  type ConnectorSettingsStorage,
} from './StorageService'
import { compareVersions, hasPiHoleUpdate } from './VersionService'

export type ConnectorScope = {
  name: string
}

export type ConnectorVersionInfo = {
  product: 'Pi-hole' | 'AdGuard Home'
  version: string
  updateAvailable: boolean
}

export type ConnectorProtectionResult = {
  address: string
  blocking: PiHoleApiStatusEnum
}

type PiHoleDomainMutation = {
  backend: ConnectorType.piHole
  list: ApiList
  oppositeList: ApiList
  domain: string
  originalTarget: PiHoleDomain | null
  originalOpposite: PiHoleDomain | null
  expectedTarget: PiHoleDomain
  expectedOpposite: PiHoleDomain | null
}

type AdGuardDomainMutation = AdGuardRuleMutation & {
  backend: ConnectorType.adguardHome
}

export type ConnectorDomainMutation =
  PiHoleDomainMutation | AdGuardDomainMutation

type PiHoleScopeMutation = {
  backend: ConnectorType.piHole
  original: PiHoleGroup
  expected: PiHoleGroup
}

type AdGuardScopeMutation = AdGuardClientMutation & {
  backend: ConnectorType.adguardHome
}

export type ConnectorScopeMutation = PiHoleScopeMutation | AdGuardScopeMutation

type ProtectionSnapshot =
  | {
      backend: ConnectorType.piHole
      status: PiHoleApiStatus
    }
  | {
      backend: ConnectorType.adguardHome
      enabled: boolean
      remainingSeconds: number | null
    }

const clonePiHoleDomain = (domain: PiHoleDomain): PiHoleDomain => ({
  ...domain,
  groups: [...domain.groups],
})

const piHoleDomainsEqual = (
  left: PiHoleDomain | undefined,
  right: PiHoleDomain | null,
): boolean => {
  if (!left || !right) {
    return !left && !right
  }
  const leftGroups = [...left.groups].sort((a, b) => a - b)
  const rightGroups = [...right.groups].sort((a, b) => a - b)
  return (
    left.domain === right.domain &&
    left.comment === right.comment &&
    left.enabled === right.enabled &&
    leftGroups.length === rightGroups.length &&
    leftGroups.every((group, index) => group === rightGroups[index])
  )
}

export default class ConnectorApiService {
  public static async getConfiguredConnectors(): Promise<
    ConnectorSettingsStorage[]
  > {
    const configured = (await StorageService.getConnectorSettingsArray()) ?? []
    if (configured.length === 0) {
      throw new Error('No DNS connector is configured')
    }

    return configured.map((connector) => {
      const type = getConnectorType(connector)
      if (
        !connector.pi_uri_base ||
        typeof connector.api_key === 'undefined' ||
        (type === ConnectorType.adguardHome && !connector.username)
      ) {
        throw new Error('One DNS connector is incomplete')
      }
      return {
        connector_type: type,
        pi_uri_base: normalizeConnectorAddress(connector),
        api_key: connector.api_key,
        username:
          type === ConnectorType.adguardHome ? connector.username : undefined,
      }
    })
  }

  public static async testConnection(
    connector: ConnectorSettingsStorage,
  ): Promise<ConnectorVersionInfo> {
    if (getConnectorType(connector) === ConnectorType.adguardHome) {
      const status = await AdGuardHomeApiService.getStatusFor(connector)
      if (!status.running) {
        throw new Error('AdGuard Home reports that its DNS server is stopped')
      }
      if (compareVersions(status.version, '0.107.58') < 0) {
        throw new Error('AdGuard Home 0.107.58 or later is required')
      }
      return {
        product: 'AdGuard Home',
        version: status.version,
        updateAvailable: false,
      }
    }

    const response = await PiHoleApiService.getPiHoleVersion(connector)
    return {
      product: 'Pi-hole',
      version: `Core ${response.data.version.core.local.version}; FTL ${response.data.version.ftl.local.version}; Web ${response.data.version.web.local.version}`,
      updateAvailable: hasPiHoleUpdate(response.data),
    }
  }

  public static async getProtectionStatusFor(
    connector: ConnectorSettingsStorage,
  ): Promise<PiHoleApiStatusEnum> {
    if (getConnectorType(connector) === ConnectorType.adguardHome) {
      return AdGuardHomeApiService.getBlockingStatus(
        await AdGuardHomeApiService.getStatusFor(connector),
      )
    }
    return (await PiHoleApiService.getPiHoleStatusFor(connector)).blocking
  }

  public static async getProtectionStatusCombined(): Promise<PiHoleApiStatusEnum> {
    try {
      const connectors = await this.getConfiguredConnectors()
      const statuses = await Promise.all(
        connectors.map((connector) => this.getProtectionStatusFor(connector)),
      )
      return combinePiHoleStatuses(statuses)
    } catch (reason) {
      console.warn(reason)
      return PiHoleApiStatusEnum.error
    }
  }

  public static async changeProtection(
    mode: PiHoleApiStatusEnum,
    durationSeconds: number,
  ): Promise<ConnectorProtectionResult[]> {
    if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
      throw new Error('Disable duration must be a non-negative integer')
    }
    const enabled = mode === PiHoleApiStatusEnum.enabled
    if (!enabled && mode !== PiHoleApiStatusEnum.disabled) {
      throw new Error(`Mode ${mode} is not supported for this action`)
    }
    const connectors = await this.getConfiguredConnectors()
    return OperationCoordinator.runExclusive('global:blocking', () =>
      runMultiInstanceTransaction(
        this.toTargets(connectors),
        (connector) => this.getProtectionSnapshot(connector),
        async (connector) => ({
          address: connector.pi_uri_base!,
          blocking: await this.setProtectionFor(
            connector,
            enabled,
            enabled || durationSeconds === 0 ? null : durationSeconds,
          ),
        }),
        (connector, original) =>
          this.restoreProtectionSnapshot(connector, original),
      ),
    )
  }

  public static async setDomainListGlobally(
    list: ApiList,
    domain: string,
  ): Promise<void> {
    return this.setDomainList(list, domain, null)
  }

  public static async setDomainListForScope(
    list: ApiList,
    domain: string,
    scopeName: string,
  ): Promise<void> {
    if (!scopeName) {
      throw new Error('Scope name cannot be empty')
    }
    return this.setDomainList(list, domain, scopeName)
  }

  public static async prepareDomainMutation(
    connector: ConnectorSettingsStorage,
    list: ApiList,
    domain: string,
    scopeName: string | null,
  ): Promise<ConnectorDomainMutation> {
    if (getConnectorType(connector) === ConnectorType.adguardHome) {
      if (
        scopeName &&
        !(await AdGuardHomeApiService.getClient(connector, scopeName))
      ) {
        throw new Error(`Client ${scopeName} is missing`)
      }
      return {
        backend: ConnectorType.adguardHome,
        ...(await AdGuardHomeApiService.prepareRuleMutation(
          connector,
          list,
          domain,
          scopeName,
        )),
      }
    }

    const oppositeList =
      list === ApiList.whitelist ? ApiList.blacklist : ApiList.whitelist
    const [groups, target, opposite] = await Promise.all([
      PiHoleApiService.getGroups(connector),
      PiHoleApiService.getExactDomain(connector, list, domain),
      PiHoleApiService.getExactDomain(connector, oppositeList, domain),
    ])
    const targetGroupIds = scopeName
      ? groups
          .filter((group) => group.name === scopeName)
          .map((group) => group.id)
      : groups.map((group) => group.id)
    if (targetGroupIds.length === 0) {
      throw new Error(
        scopeName
          ? `Group ${scopeName} is missing`
          : 'Pi-hole did not return any client groups',
      )
    }

    const expectedTarget: PiHoleDomain = target
      ? {
          ...clonePiHoleDomain(target),
          enabled: true,
          groups: scopeName
            ? Array.from(new Set([...target.groups, ...targetGroupIds]))
            : targetGroupIds,
        }
      : {
          domain,
          unicode: domain,
          type: list,
          kind: 'exact',
          comment: 'From Wormhole Connector',
          groups: targetGroupIds,
          enabled: true,
          id: -1,
          date_added: 0,
          date_modified: 0,
        }
    let expectedOpposite = opposite ? clonePiHoleDomain(opposite) : null
    if (expectedOpposite) {
      expectedOpposite.groups = scopeName
        ? expectedOpposite.groups.filter((id) => !targetGroupIds.includes(id))
        : []
      if (expectedOpposite.groups.length === 0) {
        expectedOpposite = null
      }
    }

    return {
      backend: ConnectorType.piHole,
      list,
      oppositeList,
      domain,
      originalTarget: target ? clonePiHoleDomain(target) : null,
      originalOpposite: opposite ? clonePiHoleDomain(opposite) : null,
      expectedTarget,
      expectedOpposite,
    }
  }

  public static async applyDomainMutation(
    connector: ConnectorSettingsStorage,
    mutation: ConnectorDomainMutation,
  ): Promise<void> {
    if (mutation.backend === ConnectorType.adguardHome) {
      await AdGuardHomeApiService.applyRuleMutation(connector, mutation)
      return
    }
    await this.putPiHoleDomain(
      connector,
      mutation.list,
      mutation.domain,
      mutation.expectedTarget,
    )
    await this.putPiHoleDomain(
      connector,
      mutation.oppositeList,
      mutation.domain,
      mutation.expectedOpposite,
    )
  }

  public static async restoreDomainMutation(
    connector: ConnectorSettingsStorage,
    mutation: ConnectorDomainMutation,
    onlyIfStillApplied = false,
  ): Promise<void> {
    if (mutation.backend === ConnectorType.adguardHome) {
      await AdGuardHomeApiService.restoreRuleMutation(connector, mutation)
      return
    }
    if (onlyIfStillApplied) {
      const [currentTarget, currentOpposite] = await Promise.all([
        PiHoleApiService.getExactDomain(
          connector,
          mutation.list,
          mutation.domain,
        ),
        PiHoleApiService.getExactDomain(
          connector,
          mutation.oppositeList,
          mutation.domain,
        ),
      ])
      if (
        !piHoleDomainsEqual(currentTarget, mutation.expectedTarget) ||
        !piHoleDomainsEqual(currentOpposite, mutation.expectedOpposite)
      ) {
        return
      }
    }
    await this.putPiHoleDomain(
      connector,
      mutation.list,
      mutation.domain,
      mutation.originalTarget,
    )
    await this.putPiHoleDomain(
      connector,
      mutation.oppositeList,
      mutation.domain,
      mutation.originalOpposite,
    )
  }

  public static async getCommonScopes(): Promise<ConnectorScope[]> {
    const connectors = await this.getConfiguredConnectors()
    const scopeSets = await Promise.all(
      connectors.map(async (connector) => {
        if (getConnectorType(connector) === ConnectorType.adguardHome) {
          return (await AdGuardHomeApiService.getClients(connector)).map(
            (client) => client.name,
          )
        }
        return (await PiHoleApiService.getGroups(connector)).map(
          (group) => group.name,
        )
      }),
    )
    const commonNames = scopeSets[0].filter((name) =>
      scopeSets.slice(1).every((names) => names.includes(name)),
    )
    return commonNames.map((name) => ({ name }))
  }

  public static async getScopeState(
    scopeName: string,
  ): Promise<'active' | 'paused' | 'mixed'> {
    const connectors = await this.getConfiguredConnectors()
    const states = await Promise.all(
      connectors.map(async (connector) => {
        if (getConnectorType(connector) === ConnectorType.adguardHome) {
          const client = await AdGuardHomeApiService.getClient(
            connector,
            scopeName,
          )
          if (!client) {
            throw new Error(`Client ${scopeName} is missing`)
          }
          return AdGuardHomeApiService.isClientFilteringActive(client)
        }
        const group = await PiHoleApiService.getGroup(connector, scopeName)
        if (!group) {
          throw new Error(`Group ${scopeName} is missing`)
        }
        return group.enabled
      }),
    )
    if (states.every(Boolean)) {
      return 'active'
    }
    if (states.every((state) => !state)) {
      return 'paused'
    }
    return 'mixed'
  }

  public static async setScopeState(
    scopeName: string,
    enabled: boolean,
  ): Promise<void> {
    if (!scopeName) {
      throw new Error('Scope name cannot be empty')
    }
    const connectors = await this.getConfiguredConnectors()
    await OperationCoordinator.runExclusive(`scope:${scopeName}`, () =>
      runMultiInstanceTransaction(
        this.toTargets(connectors),
        (connector) => this.prepareScopeMutation(connector, scopeName, enabled),
        (connector, mutation) => this.applyScopeMutation(connector, mutation),
        (connector, mutation) => this.restoreScopeMutation(connector, mutation),
      ),
    )
  }

  public static async prepareScopeMutation(
    connector: ConnectorSettingsStorage,
    scopeName: string,
    enabled: boolean,
  ): Promise<ConnectorScopeMutation> {
    if (getConnectorType(connector) === ConnectorType.adguardHome) {
      const client = await AdGuardHomeApiService.getClient(connector, scopeName)
      if (!client) {
        throw new Error(`Client ${scopeName} is missing`)
      }
      return {
        backend: ConnectorType.adguardHome,
        ...AdGuardHomeApiService.prepareClientMutation(client, enabled),
      }
    }
    const group = await PiHoleApiService.getGroup(connector, scopeName)
    if (!group) {
      throw new Error(`Group ${scopeName} is missing`)
    }
    return {
      backend: ConnectorType.piHole,
      original: { ...group },
      expected: { ...group, enabled },
    }
  }

  public static async applyScopeMutation(
    connector: ConnectorSettingsStorage,
    mutation: ConnectorScopeMutation,
  ): Promise<void> {
    if (mutation.backend === ConnectorType.adguardHome) {
      await AdGuardHomeApiService.applyClientMutation(connector, mutation)
      return
    }
    await PiHoleApiService.replaceGroup(connector, mutation.original.name, {
      name: mutation.expected.name,
      comment: mutation.expected.comment,
      enabled: mutation.expected.enabled,
    })
  }

  public static async restoreScopeMutation(
    connector: ConnectorSettingsStorage,
    mutation: ConnectorScopeMutation,
    onlyIfStillApplied = false,
  ): Promise<void> {
    if (mutation.backend === ConnectorType.adguardHome) {
      await AdGuardHomeApiService.restoreClientMutation(connector, mutation)
      return
    }
    if (onlyIfStillApplied) {
      const current = await PiHoleApiService.getGroup(
        connector,
        mutation.expected.name,
      )
      if (
        !current ||
        current.name !== mutation.expected.name ||
        current.comment !== mutation.expected.comment ||
        current.enabled !== mutation.expected.enabled
      ) {
        return
      }
    }
    await PiHoleApiService.replaceGroup(connector, mutation.expected.name, {
      name: mutation.original.name,
      comment: mutation.original.comment,
      enabled: mutation.original.enabled,
    })
  }

  public static async getDomainStatus(
    domain: string,
    scopeName?: string | null,
  ): Promise<DomainBlockingState> {
    if (!domain) {
      return 'unknown'
    }
    let connectors: ConnectorSettingsStorage[]
    try {
      connectors = await this.getConfiguredConnectors()
    } catch (reason) {
      console.warn('Could not load configured DNS connectors', reason)
      return 'unknown'
    }
    const states = await Promise.all(
      connectors.map((connector) =>
        this.getDomainStatusFor(connector, domain, scopeName),
      ),
    )
    return combineDomainStates(states)
  }

  private static async getDomainStatusFor(
    connector: ConnectorSettingsStorage,
    domain: string,
    scopeName?: string | null,
  ): Promise<DomainBlockingState> {
    try {
      const protection = await this.getProtectionStatusFor(connector)
      if (protection === PiHoleApiStatusEnum.disabled) {
        return 'allowed'
      }
      if (protection !== PiHoleApiStatusEnum.enabled) {
        return 'unknown'
      }

      if (getConnectorType(connector) === ConnectorType.adguardHome) {
        let clientId: string | undefined
        if (scopeName) {
          const client = await AdGuardHomeApiService.getClient(
            connector,
            scopeName,
          )
          if (!client) {
            return 'unknown'
          }
          if (!AdGuardHomeApiService.isClientFilteringActive(client)) {
            return 'allowed'
          }
          clientId = client.ids?.[0]
          if (!clientId) {
            return 'unknown'
          }
        }
        return AdGuardHomeApiService.getDomainStatusFor(
          connector,
          domain,
          clientId,
        )
      }

      const groups = await PiHoleApiService.getGroups(connector)
      const group = scopeName
        ? groups.find((item) => item.name === scopeName)
        : groups.find((item) => item.name === 'Default')
      if (!group) {
        return 'unknown'
      }
      if (!group.enabled) {
        return 'allowed'
      }
      return evaluateDomainSearch(
        await PiHoleApiService.searchDomain(connector, domain),
        group.id,
      )
    } catch (reason) {
      console.warn(`Could not determine the status of ${domain}`, reason)
      return 'unknown'
    }
  }

  private static async setDomainList(
    list: ApiList,
    domain: string,
    scopeName: string | null,
  ): Promise<void> {
    if (!domain) {
      throw new Error('Domain cannot be empty')
    }
    const connectors = await this.getConfiguredConnectors()
    await OperationCoordinator.runExclusive(`domain:${domain}`, () =>
      runMultiInstanceTransaction(
        this.toTargets(connectors),
        (connector) =>
          this.prepareDomainMutation(connector, list, domain, scopeName),
        (connector, mutation) => this.applyDomainMutation(connector, mutation),
        (connector, mutation) =>
          this.restoreDomainMutation(connector, mutation),
      ),
    )
  }

  private static async getProtectionSnapshot(
    connector: ConnectorSettingsStorage,
  ): Promise<ProtectionSnapshot> {
    if (getConnectorType(connector) === ConnectorType.adguardHome) {
      const status = await AdGuardHomeApiService.getStatusFor(connector)
      return {
        backend: ConnectorType.adguardHome,
        enabled: status.protection_enabled,
        remainingSeconds:
          status.protection_enabled || status.protection_disabled_duration <= 0
            ? null
            : Math.ceil(status.protection_disabled_duration / 1000),
      }
    }
    return {
      backend: ConnectorType.piHole,
      status: await PiHoleApiService.getPiHoleStatusFor(connector),
    }
  }

  private static async setProtectionFor(
    connector: ConnectorSettingsStorage,
    enabled: boolean,
    durationSeconds: number | null,
  ): Promise<PiHoleApiStatusEnum> {
    if (getConnectorType(connector) === ConnectorType.adguardHome) {
      return AdGuardHomeApiService.getBlockingStatus(
        await AdGuardHomeApiService.setProtectionFor(
          connector,
          enabled,
          durationSeconds,
        ),
      )
    }
    return (
      await PiHoleApiService.setPiHoleStatusFor(
        connector,
        enabled,
        durationSeconds,
      )
    ).data.blocking
  }

  private static async restoreProtectionSnapshot(
    connector: ConnectorSettingsStorage,
    snapshot: ProtectionSnapshot,
  ): Promise<void> {
    if (snapshot.backend === ConnectorType.adguardHome) {
      await AdGuardHomeApiService.setProtectionFor(
        connector,
        snapshot.enabled,
        snapshot.remainingSeconds,
      )
      return
    }
    await PiHoleApiService.setPiHoleStatusFor(
      connector,
      snapshot.status.blocking === PiHoleApiStatusEnum.enabled,
      snapshot.status.blocking === PiHoleApiStatusEnum.disabled
        ? (snapshot.status.timer ?? null)
        : null,
    )
  }

  private static async putPiHoleDomain(
    connector: ConnectorSettingsStorage,
    list: ApiList,
    domain: string,
    value: PiHoleDomain | null,
  ): Promise<void> {
    const current = await PiHoleApiService.getExactDomain(
      connector,
      list,
      domain,
    )
    if (!value) {
      if (current) {
        await PiHoleApiService.deleteExactDomain(connector, list, domain)
      }
      return
    }
    const payload = {
      comment: value.comment,
      groups: [...value.groups],
      enabled: value.enabled,
    }
    if (current) {
      await PiHoleApiService.replaceExactDomain(
        connector,
        list,
        domain,
        payload,
      )
    } else {
      await PiHoleApiService.addExactDomain(connector, list, domain, payload)
    }
  }

  private static toTargets(
    connectors: ConnectorSettingsStorage[],
  ): MultiInstanceTarget<ConnectorSettingsStorage>[] {
    return connectors.map((connector) => ({
      address: getConnectorIdentity(connector),
      value: connector,
    }))
  }
}
