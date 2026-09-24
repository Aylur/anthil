import * as Signal from "./signal.js"

/**
 * Scopes own child scopes, cleanup and mount callbacks.
 * Disposing a scope disposes its children recursively.
 */
export type Scope = Signal.Scope

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
  const effect = new Signal.Effect<T>((prev) => {
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
 * Run a function which tracks reactive values accessed within
 * and re-runs synchronously whenever they change.
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
  const effect = new Signal.Effect(fn)
  if (!effect.parent || effect.parent.mounted) {
    effect.run()
  } else {
    Signal.onMount(() => effect.run())
  }
  return () => effect.dispose()
}

/**
 * Attach a cleanup callback to the current {@link Scope}.
 *
 * Cleanups run in reverse registration order, when the scope is disposed.
 *
 * @throws when called outside of a scope.
 */
export function onCleanup(callback: Signal.Fn) {
  Signal.onCleanup(callback)
}

/**
 * Attach a callback to run after the current {@link Scope} returns.
 * When the scope is already mounted, or there is no scope, the callback runs
 * immediately. Mount callbacks run untracked.
 */
export function onMount(fn: Signal.Fn) {
  const scope = Signal.getScope()
  if (!scope || scope.mounted) {
    Signal.untrack(fn)
  } else {
    Signal.onMount(fn)
  }
}

/**
 * Lets you read values without tracking them.
 *
 * @example
 *
 * ```
 * let a: Accessor<number>
 * let b: Accessor<number>
 *
 * effect(() => {
 *  // will re-run when `a` changes but not when `b` changes
 *   print(a(), untrack(() => b()))
 * })
 * ```
 */
export function untrack<T>(fn: () => T): T {
  return Signal.untrack(fn)
}

/**
 * Group multiple updates so downstream computations run once after the batch
 * completes instead of after each individual update.
 *
 * @example
 *
 * ```
 * const [count, setCount] = createSignal(0);
 * const [total, setTotal] = createSignal(0);
 *
 * effect(() => console.log(`${count()} / ${total()}`)); // logs "0 / 0"
 *
 * setCount(1); // logs "1 / 0"
 * setTotal(5); // logs "1 / 5"
 *
 * batch(() => {
 *   setCount(2);
 *   setTotal(10);
 * }); // logs "2 / 10"
 * ```
 */
export function batch(fn: Signal.Fn): void {
  return Signal.batch(fn)
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
      const computed = new Signal.Computed(desc.get!.bind(obj))
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
