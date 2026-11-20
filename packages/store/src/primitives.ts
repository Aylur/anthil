import * as Signal from "./signal.js"

/**
 * Get the current value and track it as a dependency in reactive scopes.
 * @returns The current value.
 */
export type Accessor<T = unknown> = () => T

/**
 * Set the value using a concrete value or an updater function.
 */
export type Setter<T> = {
  (value: Exclude<T, Function>): void
  (producer: (prev: T) => T): void
}

export type WritableSignal<T> = [Accessor<T>, Setter<T>]

export interface SignalOptions<T> {
  /**
   * Can be used to customize the equality check used to determine whether value has changed.
   * @default Object.is
   */
  equals?: (prev: T, next: T) => boolean
}

/**
 * Create a writable reactive value.
 *
 * @param init The initial value.
 * @returns An {@link Accessor} and a setter function.
 *
 * @example
 *
 * ```ts
 * const [count, setCount] = createSignal(0)
 *
 * setCount(1)
 * setCount((prev) => prev + 1)
 * ```
 */
export function createSignal<T>(
  init: T,
  options?: SignalOptions<NoInfer<T>>,
): WritableSignal<T> {
  const signal = new Signal.Signal(init, options?.equals)

  function get(): T {
    return signal.get()
  }

  function set(newValue: unknown): void {
    const value: T =
      typeof newValue === "function" ? newValue(signal.pendingValue) : newValue
    signal.set(value)
  }

  return [get, set]
}

/**
 * Create a derived reactive value which tracks its dependencies and reruns the computation
 * whenever a dependency changes. The resulting {@link Accessor} will only notify observers
 * when the computed value has changed.
 *
 * This operation is also known as `memo` in other libraries.
 *
 * @example
 *
 * ```ts
 * let a: Accessor<number>
 * let b: Accessor<number>
 * const c: Accessor<number> = createComputed(() => a() + b())
 * ```
 */
export function createComputed<T>(
  fn: (prev?: T) => T,
  options?: SignalOptions<NoInfer<T>>,
): Accessor<T> {
  const computed = new Signal.Computed(fn, options?.equals)
  return computed.get.bind(computed)
}

/**
 * Subscribe for value changes.
 *
 * The subscription is disposed together with the current {@link Scope}, if there
 * is one. Outside of a scope you need to dispose it yourself when it is no longer used.
 *
 * @param track Function reading accessors to track.
 * @param callback The function to run when a tracked value changes.
 * @returns Unsubscribe function.
 *
 * @example
 *
 * ```ts
 * let a: Accessor<number>
 * let b: Accessor<number>
 *
 * const dispose = subscribe(a, () => print(a()))
 * dispose() // stop subscription manually
 *
 * subscribe(() => { a(); b() }, () => print(a(), b()))
 * ```
 */
export function subscribe<T>(
  track: Signal.Fn,
  callback: (prev?: T) => T,
): Signal.Fn {
  let first = true
  const effect = new Signal.Effect<T>("render", (prev) => {
    track()
    if (first) {
      return void (first = false) as T
    } else {
      return Signal.untrack(callback, prev)
    }
  })
  effect.run()
  return () => effect.dispose()
}

/**
 * Schedule a function to run after the current root {@link Scope} returns,
 * tracking reactive values accessed within and re-running whenever they change.
 *
 * Errors thrown by `fn` propagate to the code that triggered the run.
 *
 * @param fn Receives the value returned by the previous run.
 * @returns A function that disposes the effect.
 *
 * @example
 *
 * ```ts
 * let count: Accessor<number>
 *
 * const dispose = effect(() => {
 *   print(`count is ${count()}`)
 *   onCleanup(() => print("count is about to change"))
 * })
 *
 * dispose() // stop effect manually
 * ```
 */
export function effect<T = void>(fn: (prev?: T) => T): Signal.Fn {
  const effect = new Signal.Effect("user", fn)
  Signal.onMount(() => effect.run())
  return () => effect.dispose()
}

/**
 * Like {@link effect}, but runs immediately and re-runs before user effects
 * and mount callbacks.
 *
 * @param fn Receives the value returned by the previous run.
 * @returns A function that disposes the effect.
 */
export function renderEffect<T = void>(fn: (prev?: T) => T): Signal.Fn {
  const effect = new Signal.Effect("render", fn)
  effect.run()
  return () => effect.dispose()
}

/**
 * Run a function in a scope that groups lifecycles.
 *
 * @example
 * ```tsx
 * const dispose = createOwnerScope((dispose) => {
 *   effect(() => {
 *     console.log('Scoped effect');
 *   });
 *
 *   return dispose
 * });
 *
 * dispose();
 * ```
 */
export function createOwnerScope<T>(fn: (dispose: Signal.Fn) => T): T {
  const scope = Signal.createScope()
  return Signal.runScope(scope, () => fn(() => scope.dispose()))
}

export type Store = Record<string | symbol, any>

/**
 * Create a store where each field is replaced with a reactive accessor.
 *
 * @experimental
 *
 * @example
 *
 * ```
 * const myStore = createStore({
 *   value: 0,
 *   get double() {
 *     return this.value * 2
 *   },
 *   nestedStore: createStore({
 *     value: "",
 *   }),
 * })
 * ```
 */
export function createStore<S extends Store>(store: S): S {
  const obj = {}
  const properties = Object.entries(Object.getOwnPropertyDescriptors(store))

  for (const [key, desc] of properties) {
    if ("value" in desc) {
      const signal = new Signal.Signal(desc.value)
      Object.defineProperty(obj, key, {
        get: signal.get.bind(signal),
        set: signal.set.bind(signal),
        enumerable: true,
      })
    } else if ("get" in desc) {
      const computed = new Signal.Computed(desc.get!.bind(obj), Object.is, null)
      Object.defineProperty(obj, key, {
        get: computed.get.bind(computed),
        set: desc.set,
        enumerable: true,
      })
    } else {
      Object.defineProperty(obj, key, desc)
    }
  }

  return obj as S
}
