export type GlobalToolbarIconState = 'active' | 'disabled' | 'error' | 'unknown'

export type DomainToolbarIconState =
  'allowed' | 'blocked' | 'temporary' | 'unknown'

export type ToolbarIconState = GlobalToolbarIconState | 'blocked' | 'temporary'

export type ToolbarBadgePresentation = {
  text: string
  backgroundColor: string
  textColor: string
}

const toolbarBadgePresentations: Record<
  Exclude<ToolbarIconState, 'temporary'>,
  ToolbarBadgePresentation
> = {
  active: {
    text: '✓',
    backgroundColor: '#16A34A',
    textColor: '#FFFFFF',
  },
  blocked: {
    text: '×',
    backgroundColor: '#DC2626',
    textColor: '#FFFFFF',
  },
  disabled: {
    text: 'OFF',
    backgroundColor: '#64748B',
    textColor: '#FFFFFF',
  },
  error: {
    text: '!',
    backgroundColor: '#FACC15',
    textColor: '#1F2937',
  },
  unknown: {
    text: '!',
    backgroundColor: '#FACC15',
    textColor: '#1F2937',
  },
}

export const composeToolbarIconState = (
  globalState: GlobalToolbarIconState,
  domainState: DomainToolbarIconState,
): ToolbarIconState => {
  if (globalState === 'disabled' || globalState === 'error') {
    return globalState
  }

  if (globalState !== 'active') {
    return 'unknown'
  }

  if (domainState === 'temporary') {
    return 'temporary'
  }

  if (domainState === 'blocked') {
    return 'blocked'
  }

  if (domainState === 'allowed') {
    return 'active'
  }

  return 'unknown'
}

export const formatTemporaryBadgeText = (
  remainingSeconds?: number | null,
): string => {
  if (
    typeof remainingSeconds !== 'number' ||
    !Number.isFinite(remainingSeconds)
  ) {
    return '…'
  }

  const seconds = Math.max(1, Math.ceil(remainingSeconds))
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.ceil(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }

  const days = Math.ceil(hours / 24)
  return days <= 999 ? `${days}d` : '>99d'
}

export const getToolbarBadgePresentation = (
  state: ToolbarIconState,
  temporaryRemainingSeconds?: number | null,
): ToolbarBadgePresentation => {
  if (state === 'temporary') {
    return {
      text: formatTemporaryBadgeText(temporaryRemainingSeconds),
      backgroundColor: '#F97316',
      textColor: '#FFFFFF',
    }
  }

  return toolbarBadgePresentations[state]
}
