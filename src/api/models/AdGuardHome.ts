export type AdGuardHomeStatus = {
  protection_enabled: boolean
  protection_disabled_duration: number
  running: boolean
  version: string
}

export type AdGuardFilteringReason =
  | 'NotFilteredNotFound'
  | 'NotFilteredWhiteList'
  | 'NotFilteredError'
  | 'FilteredBlackList'
  | 'FilteredSafeBrowsing'
  | 'FilteredParental'
  | 'FilteredInvalid'
  | 'FilteredSafeSearch'
  | 'FilteredBlockedService'
  | 'Rewrite'
  | 'RewriteEtcHosts'
  | 'RewriteRule'

export type AdGuardCheckHostResponse = {
  reason?: AdGuardFilteringReason
  rule?: string
  rules?: Array<{ text?: string; filter_list_id?: number }>
}

export type AdGuardFilterStatus = {
  enabled?: boolean
  user_rules?: string[]
}

export type AdGuardClient = {
  name: string
  ids?: string[]
  use_global_settings?: boolean
  filtering_enabled?: boolean
  parental_enabled?: boolean
  safebrowsing_enabled?: boolean
  safesearch_enabled?: boolean
  safe_search?: Record<string, unknown>
  use_global_blocked_services?: boolean
  blocked_services_schedule?: Record<string, unknown>
  blocked_services?: string[]
  upstreams?: string[]
  tags?: string[]
  ignore_querylog?: boolean
  ignore_statistics?: boolean
  upstreams_cache_enabled?: boolean
  upstreams_cache_size?: number
}

export type AdGuardClientsResponse = {
  clients?: AdGuardClient[]
}
