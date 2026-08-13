export default class OperationCoordinator {
  private static readonly sharedLockPrefix = 'wormhole-connector:'

  private static readonly locks = new Map<string, Promise<void>>()

  public static runExclusive<T>(
    keys: string | string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    const orderedKeys = [...new Set(Array.isArray(keys) ? keys : [keys])]
      .filter(Boolean)
      .sort()

    const acquire = (index: number): Promise<T> => {
      if (index >= orderedKeys.length) {
        return operation()
      }

      return this.runWithKey(orderedKeys[index], () => acquire(index + 1))
    }

    return acquire(0)
  }

  private static async runWithKey<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const sharedLocks =
      typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (sharedLocks) {
      return sharedLocks.request(
        `${this.sharedLockPrefix}${key}`,
        { mode: 'exclusive' },
        operation,
      )
    }

    return this.runWithLocalKey(key, operation)
  }

  private static async runWithLocalKey<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.catch(() => undefined).then(() => gate)
    this.locks.set(key, tail)

    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release()
      if (this.locks.get(key) === tail) {
        this.locks.delete(key)
      }
    }
  }
}
