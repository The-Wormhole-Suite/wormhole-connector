import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { PiHoleApiStatus } from '../api/models/PiHoleApiStatus'
import {
  ConnectorType,
  getConnectorType,
  PiHoleSettingsStorage,
  StorageService,
} from './StorageService'
import { PiHoleVersionsV6 } from '../api/models/PiHoleVersions'
import ApiListMode from '../api/enum/ApiListMode'
import ApiList from '../api/enum/ApiList'
import PiHoleApiStatusEnum from '../api/enum/PiHoleApiStatusEnum'
import { PiHoleAuth } from '../api/models/PiHoleAuth'
import { PiHoleDomain, PiHoleDomains } from '../api/models/PiHoleDomains'
import { PiHoleGroup, PiHoleGroups } from '../api/models/PiHoleGroups'
import { PiHoleSearchResponse } from '../api/models/PiHoleSearch'
import { getPiHoleApiBase, normalizePiHoleAddress } from './PiHoleUrl'
import OperationCoordinator from './OperationCoordinator'
import {
  runMultiInstanceTransaction,
  type MultiInstanceTarget,
} from './MultiInstanceOperation'

export type DomainMutationPayload = {
  comment: string | null
  groups: number[]
  enabled: boolean
}

type DomainListSnapshot = {
  target: PiHoleDomain | null
  opposite: PiHoleDomain | null
  groupIds: number[]
}

export const combinePiHoleStatuses = (
  statuses: PiHoleApiStatusEnum[],
): PiHoleApiStatusEnum => {
  if (
    statuses.length === 0 ||
    statuses.some(
      (status) =>
        status === PiHoleApiStatusEnum.error ||
        status === PiHoleApiStatusEnum.unknown,
    )
  ) {
    return PiHoleApiStatusEnum.error
  }

  const uniqueStatuses = new Set(statuses)
  if (uniqueStatuses.size > 1) {
    return PiHoleApiStatusEnum.mixed
  }

  return statuses[0]
}

export default class PiHoleApiService {
  private static readonly authenticationRequests = new Map<
    string,
    Promise<PiHoleAuth['session']>
  >()

  public static async getConfiguredPiHoles(): Promise<PiHoleSettingsStorage[]> {
    const piHoleSettingsArray = await StorageService.getPiHoleSettingsArray()
    const piHoleConnections = (piHoleSettingsArray ?? []).filter(
      (connection) => getConnectorType(connection) === ConnectorType.piHole,
    )
    if (piHoleConnections.length < 1) {
      return Promise.reject('PiHoleSettings empty')
    }

    for (const piHole of piHoleConnections) {
      if (!piHole.pi_uri_base || typeof piHole.api_key === 'undefined') {
        return Promise.reject('Some PiHoleSettings are undefined.')
      }
    }

    return piHoleConnections.map((piHole) => ({
      connector_type: ConnectorType.piHole,
      pi_uri_base: normalizePiHoleAddress(piHole.pi_uri_base!),
      api_key: piHole.api_key,
    }))
  }

  public static async getPiHoleStatusCombined(): Promise<PiHoleApiStatusEnum> {
    try {
      const results = await this.getPiHoleStatus()
      return combinePiHoleStatuses(
        results.map((result) => result.data.blocking),
      )
    } catch (reason) {
      console.warn(reason)
      return PiHoleApiStatusEnum.error
    }
  }

  public static async getPiHoleStatus(): Promise<
    AxiosResponse<PiHoleApiStatus>[]
  > {
    const piHoleSettingsArray = await this.getConfiguredPiHoles()

    return Promise.all(
      piHoleSettingsArray.map((piHole) =>
        this.getAxiosInstance(
          piHole.pi_uri_base!,
          piHole.api_key,
        ).get<PiHoleApiStatus>('dns/blocking'),
      ),
    )
  }

  public static async getPiHoleStatusFor(
    piHole: PiHoleSettingsStorage,
  ): Promise<PiHoleApiStatus> {
    this.assertValidPiHole(piHole)
    const response = await this.getAxiosInstance(
      piHole.pi_uri_base!,
      piHole.api_key,
    ).get<PiHoleApiStatus>('dns/blocking')
    return response.data
  }

  public static async getPiHoleVersion(
    piHole: PiHoleSettingsStorage,
  ): Promise<AxiosResponse<PiHoleVersionsV6>> {
    this.assertValidPiHole(piHole)

    return this.getAxiosInstance(
      piHole.pi_uri_base!,
      piHole.api_key,
    ).get<PiHoleVersionsV6>('info/version')
  }

  public static async changePiHoleStatus(
    mode: PiHoleApiStatusEnum,
    time: number,
  ): Promise<AxiosResponse<PiHoleApiStatus>[]> {
    const piHoleSettingsArray = await this.getConfiguredPiHoles()

    if (time < 0) {
      return Promise.reject(`Disable time smaller than allowed:${time}`)
    }

    let blocking: boolean
    if (mode === PiHoleApiStatusEnum.disabled) {
      blocking = false
    } else if (mode === PiHoleApiStatusEnum.enabled) {
      blocking = true
    } else {
      return Promise.reject(`Mode ${mode} not allowed for this function.`)
    }

    const targets = this.toTargets(piHoleSettingsArray)
    return OperationCoordinator.runExclusive('global:blocking', () =>
      runMultiInstanceTransaction(
        targets,
        (piHole) => this.getPiHoleStatusFor(piHole),
        (piHole) =>
          this.setPiHoleStatusFor(
            piHole,
            blocking,
            time === 0 || blocking ? null : time,
          ),
        async (piHole, original) => {
          await this.setPiHoleStatusFor(
            piHole,
            original.blocking === PiHoleApiStatusEnum.enabled,
            original.blocking === PiHoleApiStatusEnum.disabled
              ? (original.timer ?? null)
              : null,
          )
        },
      ),
    )
  }

  public static async setDomainListGlobally(
    list: ApiList,
    domain: string,
  ): Promise<void> {
    if (!domain) {
      throw new Error("Domain can't be empty")
    }

    const opposite =
      list === ApiList.whitelist ? ApiList.blacklist : ApiList.whitelist
    const piHoles = await this.getConfiguredPiHoles()

    await OperationCoordinator.runExclusive(`domain:${domain}`, async () => {
      await runMultiInstanceTransaction(
        this.toTargets(piHoles),
        async (piHole): Promise<DomainListSnapshot> => {
          const [groups, target, oppositeDomain] = await Promise.all([
            this.getGroups(piHole),
            this.getExactDomain(piHole, list, domain),
            this.getExactDomain(piHole, opposite, domain),
          ])
          if (groups.length === 0) {
            throw new Error('Pi-hole did not return any client groups')
          }
          return {
            target: target ? this.cloneDomain(target) : null,
            opposite: oppositeDomain ? this.cloneDomain(oppositeDomain) : null,
            groupIds: groups.map((group) => group.id),
          }
        },
        async (piHole, snapshot) => {
          await this.upsertExactDomain(piHole, list, domain, {
            comment: snapshot.target?.comment ?? 'From Wormhole Connector',
            groups: snapshot.groupIds,
            enabled: true,
          })
          await this.deleteExactDomainIfPresent(piHole, opposite, domain)
        },
        async (piHole, snapshot) => {
          await this.restoreExactDomain(piHole, list, domain, snapshot.target)
          await this.restoreExactDomain(
            piHole,
            opposite,
            domain,
            snapshot.opposite,
          )
        },
      )
    })
  }

  public static async addDomainToList(
    list: ApiList,
    domain: string,
  ): Promise<void> {
    return this.changeDomainOnList(list, ApiListMode.add, domain)
  }

  public static async subDomainFromList(
    list: ApiList,
    domain: string,
  ): Promise<void> {
    return this.changeDomainOnList(list, ApiListMode.sub, domain)
  }

  public static async getExactDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
  ): Promise<PiHoleDomain | undefined> {
    return this.getDomain(piHole, list, 'exact', domain)
  }

  public static async addExactDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
    payload: DomainMutationPayload,
  ): Promise<PiHoleDomain> {
    return this.addDomain(piHole, list, 'exact', domain, payload)
  }

  public static async replaceExactDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
    payload: DomainMutationPayload,
  ): Promise<PiHoleDomain> {
    return this.replaceDomain(piHole, list, 'exact', domain, payload)
  }

  public static async deleteExactDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
  ): Promise<void> {
    return this.deleteDomain(piHole, list, 'exact', domain)
  }

  public static async getRegexDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
  ): Promise<PiHoleDomain | undefined> {
    return this.getDomain(piHole, list, 'regex', domain)
  }

  public static async addRegexDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
    payload: DomainMutationPayload,
  ): Promise<PiHoleDomain> {
    return this.addDomain(piHole, list, 'regex', domain, payload)
  }

  public static async replaceRegexDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
    payload: DomainMutationPayload,
  ): Promise<PiHoleDomain> {
    return this.replaceDomain(piHole, list, 'regex', domain, payload)
  }

  public static async deleteRegexDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
  ): Promise<void> {
    return this.deleteDomain(piHole, list, 'regex', domain)
  }

  public static async searchDomain(
    piHole: PiHoleSettingsStorage,
    domain: string,
  ): Promise<PiHoleSearchResponse> {
    this.assertValidPiHole(piHole)
    const response = await this.getAxiosInstance(
      piHole.pi_uri_base!,
      piHole.api_key,
    ).get<PiHoleSearchResponse>(
      `search/${encodeURIComponent(domain)}?partial=false&N=100`,
    )
    return response.data
  }

  public static async getGroups(
    piHole: PiHoleSettingsStorage,
  ): Promise<PiHoleGroup[]> {
    this.assertValidPiHole(piHole)
    const response = await this.getAxiosInstance(
      piHole.pi_uri_base!,
      piHole.api_key,
    ).get<PiHoleGroups>('groups')
    return response.data.groups
  }

  public static async getCommonGroups(): Promise<PiHoleGroup[]> {
    const piHoles = await this.getConfiguredPiHoles()
    const groupSets = await Promise.all(
      piHoles.map((piHole) => this.getGroups(piHole)),
    )

    const firstGroups = groupSets[0]
    if (groupSets.length === 1) {
      return firstGroups
    }

    const remainingGroupNames = groupSets
      .slice(1)
      .map((groups) => new Set(groups.map((group) => group.name)))

    return firstGroups.filter((group) =>
      remainingGroupNames.every((names) => names.has(group.name)),
    )
  }

  public static async getGroup(
    piHole: PiHoleSettingsStorage,
    name: string,
  ): Promise<PiHoleGroup | undefined> {
    this.assertValidPiHole(piHole)

    try {
      const response = await this.getAxiosInstance(
        piHole.pi_uri_base!,
        piHole.api_key,
      ).get<PiHoleGroups>(`groups/${encodeURIComponent(name)}`)

      return response.data.groups[0]
    } catch (reason) {
      if (this.isNotFound(reason)) {
        return undefined
      }
      throw reason
    }
  }

  public static async replaceGroup(
    piHole: PiHoleSettingsStorage,
    originalName: string,
    group: Pick<PiHoleGroup, 'name' | 'comment' | 'enabled'>,
  ): Promise<PiHoleGroup> {
    this.assertValidPiHole(piHole)
    const response = await this.getAxiosInstance(
      piHole.pi_uri_base!,
      piHole.api_key,
    ).put<PiHoleGroups>(`groups/${encodeURIComponent(originalName)}`, group)

    const updatedGroup = response.data.groups[0]
    if (!updatedGroup) {
      throw new Error(`Pi-hole did not return updated group ${originalName}`)
    }
    return updatedGroup
  }

  public static async endSession(piHole: PiHoleSettingsStorage): Promise<void> {
    if (!piHole.pi_uri_base) {
      return
    }

    await OperationCoordinator.runExclusive(
      this.getSessionLockKey(piHole.pi_uri_base),
      async () => {
        const sid = await StorageService.getSid(piHole.pi_uri_base!)
        try {
          if (sid) {
            await this.createAxiosBaseInstance(piHole.pi_uri_base!).delete(
              'auth',
              {
                headers: { 'X-FTL-SID': sid },
              },
            )
          }
        } catch (reason) {
          console.warn('Could not close a Pi-hole API session', reason)
        } finally {
          await StorageService.removeSid(piHole.pi_uri_base!)
        }
      },
    )
  }

  public static async endSessions(
    piHoles: PiHoleSettingsStorage[],
  ): Promise<void> {
    await Promise.allSettled(piHoles.map((piHole) => this.endSession(piHole)))
  }

  private static async getDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    kind: 'exact' | 'regex',
    domain: string,
  ): Promise<PiHoleDomain | undefined> {
    this.assertValidPiHole(piHole)

    try {
      const response = await this.getAxiosInstance(
        piHole.pi_uri_base!,
        piHole.api_key,
      ).get<PiHoleDomains>(
        `domains/${list}/${kind}/${encodeURIComponent(domain)}`,
      )

      return response.data.domains[0]
    } catch (reason) {
      if (this.isNotFound(reason)) {
        return undefined
      }
      throw reason
    }
  }

  private static async addDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    kind: 'exact' | 'regex',
    domain: string,
    payload: DomainMutationPayload,
  ): Promise<PiHoleDomain> {
    this.assertValidPiHole(piHole)
    const response = await this.getAxiosInstance(
      piHole.pi_uri_base!,
      piHole.api_key,
    ).post<PiHoleDomains>(`domains/${list}/${kind}`, {
      domain,
      ...payload,
    })

    return this.requireDomain(response.data, domain)
  }

  private static async replaceDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    kind: 'exact' | 'regex',
    domain: string,
    payload: DomainMutationPayload,
  ): Promise<PiHoleDomain> {
    this.assertValidPiHole(piHole)
    const response = await this.getAxiosInstance(
      piHole.pi_uri_base!,
      piHole.api_key,
    ).put<PiHoleDomains>(
      `domains/${list}/${kind}/${encodeURIComponent(domain)}`,
      {
        type: list,
        kind,
        ...payload,
      },
    )

    return this.requireDomain(response.data, domain)
  }

  private static async deleteDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    kind: 'exact' | 'regex',
    domain: string,
  ): Promise<void> {
    this.assertValidPiHole(piHole)
    await this.getAxiosInstance(piHole.pi_uri_base!, piHole.api_key).delete(
      `domains/${list}/${kind}/${encodeURIComponent(domain)}`,
    )
  }

  private static async changeDomainOnList(
    list: ApiList,
    mode: ApiListMode,
    domain: string,
  ): Promise<void> {
    const piHoleSettingsArray = await this.getConfiguredPiHoles()

    if (domain.length < 1) {
      return Promise.reject("Domain can't be empty")
    }

    await OperationCoordinator.runExclusive(`domain:${domain}`, async () => {
      await runMultiInstanceTransaction(
        this.toTargets(piHoleSettingsArray),
        async (piHole) => {
          const [current, groups] = await Promise.all([
            this.getExactDomain(piHole, list, domain),
            mode === ApiListMode.add
              ? this.getGroups(piHole)
              : Promise.resolve([]),
          ])
          if (mode === ApiListMode.add && groups.length === 0) {
            throw new Error('Pi-hole did not return any client groups')
          }
          return {
            current: current ? this.cloneDomain(current) : null,
            groupIds: groups.map((group) => group.id),
          }
        },
        async (piHole, snapshot) => {
          if (mode === ApiListMode.add) {
            await this.upsertExactDomain(piHole, list, domain, {
              comment: snapshot.current?.comment ?? 'From Wormhole Connector',
              groups: snapshot.groupIds,
              enabled: true,
            })
            return
          }
          await this.deleteExactDomainIfPresent(piHole, list, domain)
        },
        (piHole, snapshot) =>
          this.restoreExactDomain(piHole, list, domain, snapshot.current),
      )
    })
  }

  public static async setPiHoleStatusFor(
    piHole: PiHoleSettingsStorage,
    blocking: boolean,
    timer: number | null,
  ): Promise<AxiosResponse<PiHoleApiStatus>> {
    return this.getAxiosInstance(
      piHole.pi_uri_base!,
      piHole.api_key,
    ).post<PiHoleApiStatus>('dns/blocking', { blocking, timer })
  }

  private static async upsertExactDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
    payload: DomainMutationPayload,
  ): Promise<PiHoleDomain> {
    const current = await this.getExactDomain(piHole, list, domain)
    return current
      ? this.replaceExactDomain(piHole, list, domain, payload)
      : this.addExactDomain(piHole, list, domain, payload)
  }

  private static async deleteExactDomainIfPresent(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
  ): Promise<void> {
    try {
      await this.deleteExactDomain(piHole, list, domain)
    } catch (reason) {
      if (!this.isNotFound(reason)) {
        throw reason
      }
    }
  }

  private static async restoreExactDomain(
    piHole: PiHoleSettingsStorage,
    list: ApiList,
    domain: string,
    original: PiHoleDomain | null,
  ): Promise<void> {
    if (!original) {
      await this.deleteExactDomainIfPresent(piHole, list, domain)
      return
    }

    await this.upsertExactDomain(piHole, list, domain, {
      comment: original.comment,
      groups: [...original.groups],
      enabled: original.enabled,
    })
  }

  private static cloneDomain(domain: PiHoleDomain): PiHoleDomain {
    return { ...domain, groups: [...domain.groups] }
  }

  private static toTargets(
    piHoles: PiHoleSettingsStorage[],
  ): MultiInstanceTarget<PiHoleSettingsStorage>[] {
    return piHoles.map((piHole) => ({
      address: piHole.pi_uri_base!,
      value: piHole,
    }))
  }

  private static requireDomain(
    response: PiHoleDomains,
    domain: string,
  ): PiHoleDomain {
    const updatedDomain = response.domains.find(
      (item) => item.domain === domain,
    )
    if (!updatedDomain) {
      throw new Error(`Pi-hole did not return updated domain ${domain}`)
    }
    return updatedDomain
  }

  private static assertValidPiHole(piHole: PiHoleSettingsStorage): void {
    if (
      getConnectorType(piHole) !== ConnectorType.piHole ||
      !piHole.pi_uri_base ||
      typeof piHole.api_key === 'undefined'
    ) {
      throw new Error('Some PiHoleSettings are undefined.')
    }
  }

  private static isNotFound(reason: unknown): boolean {
    return Boolean(
      reason &&
      typeof reason === 'object' &&
      'response' in reason &&
      (reason as { response?: { status?: number } }).response?.status === 404,
    )
  }

  private static createAxiosBaseInstance(domain: string): AxiosInstance {
    return axios.create({
      baseURL: getPiHoleApiBase(domain),
      adapter: 'fetch',
      withCredentials: false,
    })
  }

  private static acquireSession(
    domain: string,
    apiKey: string,
  ): Promise<PiHoleAuth['session']> {
    const key = getPiHoleApiBase(domain)
    const pending = this.authenticationRequests.get(key)
    if (pending) {
      return pending
    }

    const request = this.createAxiosBaseInstance(domain)
      .post<PiHoleAuth>('auth', { password: apiKey })
      .then((response) => {
        if (!response.data.session.valid || !response.data.session.sid) {
          throw new Error('Pi-hole authentication did not return a valid SID')
        }
        return response.data.session
      })
      .finally(() => {
        this.authenticationRequests.delete(key)
      })
    this.authenticationRequests.set(key, request)
    return request
  }

  private static getAxiosInstance(
    domain: string,
    apiKey?: string,
  ): AxiosInstance {
    const instance = this.createAxiosBaseInstance(domain)

    instance.interceptors.request.use(async (config) => {
      if (!apiKey) {
        return config
      }

      config.headers['X-FTL-SID'] = await this.getOrCreateSid(domain, apiKey)
      return config
    })

    instance.interceptors.response.use(undefined, async (error) => {
      const requestConfig = error.config as typeof error.config & {
        piholeAuthRetried?: boolean
      }
      const isAuthRoute = requestConfig?.url === 'auth'
      const isUnauthorized = error.response?.status === 401

      if (
        isUnauthorized &&
        !isAuthRoute &&
        apiKey &&
        requestConfig &&
        !requestConfig.piholeAuthRetried
      ) {
        requestConfig.piholeAuthRetried = true
        console.warn('Session expired, acquiring new session')
        const failedSid = String(requestConfig.headers?.['X-FTL-SID'] ?? '')
        requestConfig.headers['X-FTL-SID'] = await this.refreshSid(
          domain,
          apiKey,
          failedSid || undefined,
        )
        return instance.request(requestConfig)
      }
      return Promise.reject(error)
    })

    return instance
  }

  private static getOrCreateSid(
    domain: string,
    apiKey: string,
  ): Promise<string> {
    return OperationCoordinator.runExclusive(
      this.getSessionLockKey(domain),
      async () => {
        const existing = await StorageService.getSid(domain)
        if (existing) {
          return existing
        }

        const session = await this.acquireSession(domain, apiKey)
        await StorageService.saveSid(domain, session.sid)
        return session.sid
      },
    )
  }

  private static refreshSid(
    domain: string,
    apiKey: string,
    failedSid?: string,
  ): Promise<string> {
    return OperationCoordinator.runExclusive(
      this.getSessionLockKey(domain),
      async () => {
        const current = await StorageService.getSid(domain)
        if (failedSid && current && current !== failedSid) {
          return current
        }

        await StorageService.removeSid(domain)
        const session = await this.acquireSession(domain, apiKey)
        await StorageService.saveSid(domain, session.sid)
        return session.sid
      },
    )
  }

  private static getSessionLockKey(domain: string): string {
    return `pihole-session:${getPiHoleApiBase(domain)}`
  }
}
