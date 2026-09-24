import type { Store } from "../primitives.js"
import type { Computed, Signal } from "../signal.js"

const computedMembers = new WeakMap<
  Store,
  Map<string | symbol, Computed<any>>
>()

const signalMembers = new WeakMap<Store, Map<string | symbol, Signal<any>>>()

export function getComputedMembers(object: Store) {
  const computeds =
    computedMembers.get(object) ?? new Map<string, Computed<any>>()

  if (!computedMembers.has(object)) computedMembers.set(object, computeds)
  return computeds
}

export function getSignalMembers(object: Store) {
  const signals = signalMembers.get(object) ?? new Map<string, Signal<any>>()

  if (!signalMembers.has(object)) signalMembers.set(object, signals)
  return signals
}
