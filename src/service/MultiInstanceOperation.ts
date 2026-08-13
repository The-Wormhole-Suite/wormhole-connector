export type MultiInstancePhase = 'preflight' | 'apply' | 'rollback'

export type MultiInstanceFailure = {
  address: string
  phase: MultiInstancePhase
  message: string
}

export class MultiInstanceOperationError extends Error {
  public readonly failures: MultiInstanceFailure[]

  public constructor(message: string, failures: MultiInstanceFailure[]) {
    super(message)
    this.name = 'MultiInstanceOperationError'
    this.failures = failures
  }
}

export type MultiInstanceTarget<T> = {
  address: string
  value: T
}

type PreparedTarget<T, S> = MultiInstanceTarget<T> & {
  snapshot: S
}

export const runMultiInstanceTransaction = async <T, S, R>(
  targets: MultiInstanceTarget<T>[],
  prepare: (target: T) => Promise<S>,
  apply: (target: T, snapshot: S) => Promise<R>,
  rollback: (target: T, snapshot: S) => Promise<void>,
): Promise<R[]> => {
  const preparationResults = await Promise.allSettled(
    targets.map(async (target): Promise<PreparedTarget<T, S>> => ({
      ...target,
      snapshot: await prepare(target.value),
    })),
  )
  const preparationFailures = preparationResults.flatMap((result, index) =>
    result.status === 'rejected'
      ? [toFailure(targets[index].address, 'preflight', result.reason)]
      : [],
  )

  if (preparationFailures.length > 0) {
    throw new MultiInstanceOperationError(
      'One or more server preflight checks failed',
      preparationFailures,
    )
  }

  const preparedTargets = preparationResults.map(
    (result) => (result as PromiseFulfilledResult<PreparedTarget<T, S>>).value,
  )
  const completed: PreparedTarget<T, S>[] = []
  const results: R[] = []

  for (const target of preparedTargets) {
    completed.push(target)
    try {
      results.push(await apply(target.value, target.snapshot))
    } catch (reason) {
      const failures = [toFailure(target.address, 'apply', reason)]

      for (const appliedTarget of [...completed].reverse()) {
        try {
          await rollback(appliedTarget.value, appliedTarget.snapshot)
        } catch (rollbackReason) {
          failures.push(
            toFailure(appliedTarget.address, 'rollback', rollbackReason),
          )
        }
      }

      throw new MultiInstanceOperationError(
        'A multi-server action failed and was rolled back where possible',
        failures,
      )
    }
  }

  return results
}

export const getOperationFailureDetails = (reason: unknown): string[] => {
  if (!(reason instanceof MultiInstanceOperationError)) {
    return []
  }

  return reason.failures.map(
    (failure) => `${failure.address} (${failure.phase}): ${failure.message}`,
  )
}

const toFailure = (
  address: string,
  phase: MultiInstancePhase,
  reason: unknown,
): MultiInstanceFailure => ({
  address,
  phase,
  message: reason instanceof Error ? reason.message : String(reason),
})
