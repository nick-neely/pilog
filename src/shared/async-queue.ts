export type AsyncQueue<T> = AsyncIterable<T> & {
  push: (value: T) => void
  close: () => void
}

export function createAsyncQueue<T>(): AsyncQueue<T> {
  const values: T[] = []
  const resolvers: Array<(result: IteratorResult<T>) => void> = []
  let closed = false

  return {
    push(value: T): void {
      const resolve = resolvers.shift()
      if (resolve) resolve({ value, done: false })
      else values.push(value)
    },
    close(): void {
      closed = true
      for (const resolve of resolvers.splice(0)) resolve({ value: undefined, done: true })
    },
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next(): Promise<IteratorResult<T>> {
          const value = values.shift()
          if (value !== undefined) return Promise.resolve({ value, done: false })
          if (closed) return Promise.resolve({ value: undefined, done: true })
          return new Promise((resolve) => resolvers.push(resolve))
        }
      }
    }
  }
}
