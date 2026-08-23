import axios, { type AxiosInstance } from 'axios'
import ApiList from '../api/enum/ApiList'
import PiHoleApiStatusEnum from '../api/enum/PiHoleApiStatusEnum'
import type {
  AdGuardCheckHostResponse,
  AdGuardClient,
  AdGuardClientsResponse,
  AdGuardFilterStatus,
  AdGuardHomeStatus,
} from '../api/models/AdGuardHome'
import {
  adGuardRulesEqual,
  evaluateAdGuardReason,
  mergeAdGuardRuleRollback,
  planAdGuardRuleMutation,
  type AdGuardRuleMutation,
} from './AdGuardHomeRules'
import { getAdGuardHomeApiBase } from './ConnectorUrl'
import {
  ConnectorType,
  getConnectorType,
  StorageService,
  type ConnectorSettingsStorage,
} from './StorageService'
import type { DomainBlockingState } from './DomainStatusEvaluator'

export type AdGuardClientMutation = {
  original: AdGuardClient
  expected: AdGuardClient
}

const cloneClient = (client: AdGuardClient): AdGuardClient =>
  structuredClone(client)

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)]),
    )
  }
  return value
}

const clientsEqual = (left: AdGuardClient, right: AdGuardClient): boolean =>
  JSON.stringify(sortJsonValue(left)) === JSON.stringify(sortJsonValue(right))

export default class AdGuardHomeApiService {
  public static async getConfiguredInstances(): Promise<
    ConnectorSettingsStorage[]
  > {
    const configured = (await StorageService.getConnectorSettingsArray()) ?? []
    const instances = configured.filter(
      (connector) => getConnectorType(connector) === ConnectorType.adguardHome,
    )
    if (instances.length === 0) {
      throw new Error('No AdGuard Home connector is configured')
    }
    instances.forEach((instance) => this.assertValidInstance(instance))
    return instances.map((instance) => ({
      ...instance,
      connector_type: ConnectorType.adguardHome,
    }))
  }

  public static async getStatusFor(
    instance: ConnectorSettingsStorage,
  ): Promise<AdGuardHomeStatus> {
    const response =
      await this.getAxiosInstance(instance).get<AdGuardHomeStatus>('status')
    return response.data
  }

  public static async setProtectionFor(
    instance: ConnectorSettingsStorage,
    enabled: boolean,
    durationSeconds: number | null,
  ): Promise<AdGuardHomeStatus> {
    if (
      durationSeconds !== null &&
      (!Number.isInteger(durationSeconds) || durationSeconds < 0)
    ) {
      throw new Error('Protection duration must be a non-negative integer')
    }

    const data: { enabled: boolean; duration?: number } = { enabled }
    if (!enabled && durationSeconds && durationSeconds > 0) {
      data.duration = durationSeconds * 1000
    }
    await this.getAxiosInstance(instance).post('protection', data)
    const status = await this.getStatusFor(instance)
    if (status.protection_enabled !== enabled) {
      throw new Error('AdGuard Home returned an unexpected protection state')
    }
    return status
  }

  public static getBlockingStatus(
    status: AdGuardHomeStatus,
  ): PiHoleApiStatusEnum {
    if (!status.running) {
      return PiHoleApiStatusEnum.error
    }
    return status.protection_enabled
      ? PiHoleApiStatusEnum.enabled
      : PiHoleApiStatusEnum.disabled
  }

  public static async getDomainStatusFor(
    instance: ConnectorSettingsStorage,
    domain: string,
    clientId?: string,
  ): Promise<DomainBlockingState> {
    const response = await this.getAxiosInstance(
      instance,
    ).get<AdGuardCheckHostResponse>('filtering/check_host', {
      params: {
        name: domain,
        ...(clientId ? { client: clientId } : {}),
      },
    })
    return evaluateAdGuardReason(response.data.reason)
  }

  public static async getUserRules(
    instance: ConnectorSettingsStorage,
  ): Promise<string[]> {
    const response =
      await this.getAxiosInstance(instance).get<AdGuardFilterStatus>(
        'filtering/status',
      )
    if (response.data.user_rules === null) {
      return []
    }
    if (!Array.isArray(response.data.user_rules)) {
      throw new Error('AdGuard Home did not return its custom filtering rules')
    }
    return [...response.data.user_rules]
  }

  public static async prepareRuleMutation(
    instance: ConnectorSettingsStorage,
    list: ApiList,
    domain: string,
    clientName?: string | null,
  ): Promise<AdGuardRuleMutation> {
    return planAdGuardRuleMutation(
      await this.getUserRules(instance),
      list,
      domain,
      clientName,
    )
  }

  public static async applyRuleMutation(
    instance: ConnectorSettingsStorage,
    mutation: AdGuardRuleMutation,
  ): Promise<void> {
    await this.writeRulesIfUnchanged(
      instance,
      mutation.originalRules,
      mutation.expectedRules,
    )
  }

  public static async restoreRuleMutation(
    instance: ConnectorSettingsStorage,
    mutation: AdGuardRuleMutation,
  ): Promise<void> {
    const current = await this.getUserRules(instance)
    const restored = mergeAdGuardRuleRollback(current, mutation)
    if (restored === null || adGuardRulesEqual(current, restored)) {
      return
    }
    await this.writeRulesIfUnchanged(instance, current, restored)
  }

  public static async getClients(
    instance: ConnectorSettingsStorage,
  ): Promise<AdGuardClient[]> {
    const response =
      await this.getAxiosInstance(instance).get<AdGuardClientsResponse>(
        'clients',
      )
    return (response.data.clients ?? []).map(cloneClient)
  }

  public static async getClient(
    instance: ConnectorSettingsStorage,
    name: string,
  ): Promise<AdGuardClient | undefined> {
    const clients = await this.getClients(instance)
    return clients.find((client) => client.name === name)
  }

  public static isClientFilteringActive(client: AdGuardClient): boolean {
    return (
      client.use_global_settings !== false || client.filtering_enabled !== false
    )
  }

  public static prepareClientMutation(
    client: AdGuardClient,
    enabled: boolean,
  ): AdGuardClientMutation {
    const expected = cloneClient(client)
    if (enabled) {
      expected.filtering_enabled = true
    } else {
      expected.use_global_settings = false
      expected.filtering_enabled = false
    }
    return { original: cloneClient(client), expected }
  }

  public static async applyClientMutation(
    instance: ConnectorSettingsStorage,
    mutation: AdGuardClientMutation,
  ): Promise<void> {
    await this.replaceClientIfUnchanged(
      instance,
      mutation.original,
      mutation.expected,
    )
  }

  public static async restoreClientMutation(
    instance: ConnectorSettingsStorage,
    mutation: AdGuardClientMutation,
  ): Promise<void> {
    const current = await this.getClient(instance, mutation.expected.name)
    if (!current || !clientsEqual(current, mutation.expected)) {
      return
    }
    await this.replaceClientIfUnchanged(instance, current, mutation.original)
  }

  private static async writeRulesIfUnchanged(
    instance: ConnectorSettingsStorage,
    expectedCurrent: readonly string[],
    next: readonly string[],
  ): Promise<void> {
    const current = await this.getUserRules(instance)
    if (!adGuardRulesEqual(current, expectedCurrent)) {
      throw new Error(
        'AdGuard Home custom rules changed concurrently; no rules were overwritten',
      )
    }
    await this.getAxiosInstance(instance).post('filtering/set_rules', {
      rules: [...next],
    })
    const verified = await this.getUserRules(instance)
    if (!adGuardRulesEqual(verified, next)) {
      throw new Error('AdGuard Home did not retain the expected custom rules')
    }
  }

  private static async replaceClientIfUnchanged(
    instance: ConnectorSettingsStorage,
    expectedCurrent: AdGuardClient,
    next: AdGuardClient,
  ): Promise<void> {
    const current = await this.getClient(instance, expectedCurrent.name)
    if (!current || !clientsEqual(current, expectedCurrent)) {
      throw new Error(
        `AdGuard Home client ${expectedCurrent.name} changed concurrently`,
      )
    }
    await this.getAxiosInstance(instance).post('clients/update', {
      name: expectedCurrent.name,
      data: cloneClient(next),
    })
    const verified = await this.getClient(instance, next.name)
    if (!verified || !clientsEqual(verified, next)) {
      throw new Error(`AdGuard Home did not retain client ${next.name}`)
    }
  }

  private static getAxiosInstance(
    instance: ConnectorSettingsStorage,
  ): AxiosInstance {
    this.assertValidInstance(instance)
    return axios.create({
      baseURL: getAdGuardHomeApiBase(instance.pi_uri_base!),
      headers: {
        Authorization: `Basic ${btoa(`${instance.username}:${instance.api_key}`)}`,
      },
      transformRequest: axios.defaults.transformRequest,
      transformResponse: axios.defaults.transformResponse,
      adapter: 'fetch',
    })
  }

  private static assertValidInstance(
    instance: ConnectorSettingsStorage,
  ): void {
    if (
      getConnectorType(instance) !== ConnectorType.adguardHome ||
      !instance.pi_uri_base ||
      !instance.username ||
      typeof instance.api_key !== 'string'
    ) {
      throw new Error('Invalid AdGuard Home connector configuration')
    }
  }
}
