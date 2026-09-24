import type { Store } from "../primitives.js"
import { Computed, Signal } from "../signal.js"
import { getComputedMembers } from "./cache.js"

/**
 * Mark a class accessor reactive.
 *
 * @example
 *
 * ```
 * class MyStore {
 *   \@signal accessor n = 0
 * }
 * ```
 */
export function signal<T>(
  target: ClassAccessorDecoratorTarget<Store, T>,
  _: ClassAccessorDecoratorContext<Store, T>,
): ClassAccessorDecoratorResult<Store, T> {
  const { get } = target as ClassAccessorDecoratorTarget<Store, Signal<T>>

  return {
    get() {
      return get.call(this).get()
    },
    set(value) {
      get.call(this).set(value)
    },
    init(value) {
      return new Signal(value) as T
    },
  }
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
  compute: () => T,
  ctx: ClassGetterDecoratorContext<Store, T>,
): (this: Store) => T {
  const key = ctx.name

  ctx.addInitializer(function () {
    getComputedMembers(this).set(key, new Computed(compute.bind(this)))
  })

  return function () {
    return getComputedMembers(this).get(key)!.get()
  }
}
