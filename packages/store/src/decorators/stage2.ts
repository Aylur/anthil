import type { Store } from "../primitives.js"
import { Computed, Signal } from "../signal.js"
import { getComputedMembers, getSignalMembers } from "./cache.js"

/**
 * Replace a property with reactive accessors.
 *
 * @example
 *
 * ```
 * class MyStore {
 *   \@signal n = 0
 * }
 * ```
 */
export function signal<T>(proto: Store, name: string, _?: never): void {
  Object.defineProperty(proto, name, {
    enumerable: true,
    get(): T {
      return getSignalMembers(this).get(name)?.get()
    },
    set(value: T) {
      const signals = getSignalMembers(this)
      let signal = signals.get(name)
      if (!signal) {
        signals.set(name, (signal = new Signal(value)))
      }
      signal.set(value)
    },
  })
}

/**
 * Mark a class getter as computed.
 *
 * @example
 *
 * ```
 * class MyStore {
 *   \@computed get value() {
 *     return this.anyReactiveField
 *   }
 * }
 * ```
 */
export function computed<T>(
  proto: Store,
  name: string,
  descriptor: TypedPropertyDescriptor<T>,
): void {
  const { get, value } = descriptor
  if (value) {
    throw Error(`decorator has no effect on methods: "${proto.name}.${name}"`)
  }
  if (get) {
    descriptor.get = function () {
      const computeds = getComputedMembers(this)
      let computed = computeds.get(name)
      if (!computed) {
        computed = new Computed(get.bind(this))
      }
      return computed.get()
    }
  }
}
