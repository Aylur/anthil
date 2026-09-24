import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type DependencyList,
} from "react"
import {
  createComputed,
  effect,
  subscribe,
  type Accessor,
  type Store,
} from "../primitives.js"

/**
 * Subscribe a component to a reactive {@link Accessor} and re-render it
 * whenever the accessed value changes.
 *
 * @param accessor The accessor to read. Should be a stable reference.
 * @returns The current value of the accessor.
 *
 * @example
 *
 * ```tsx
 * const [count, setCount] = createSignal(0)
 *
 * function Counter() {
 *   const value = useAccessor(count)
 *   return <button onClick={() => setCount((c) => c + 1)}>{value}</button>
 * }
 * ```
 */
export function useAccessor<T>(accessor: Accessor<T>): T {
  return useSyncExternalStore(
    useCallback((callback) => subscribe(accessor, callback), [accessor]),
    accessor,
    accessor,
  )
}

/**
 * Derive a value from reactive accessors and re-render the component only
 * when the derived value changes.
 *
 * @param compute Function reading accessors and returning the derived value.
 * @param deps List of non-reactive dependencies used in `compute`.
 * @returns The current derived value.
 *
 * @example
 *
 * ```tsx
 * let firstName: Accessor<string>
 * let lastName: Accessor<string>
 *
 * function FullName({ separator }: { separator: string }) {
 *   const name = useComputed(
 *     () => firstName() + separator + lastName(),
 *     [separator],
 *   )
 *   return <span>{name}</span>
 * }
 * ```
 */
export function useComputed<T>(compute: () => T, deps: DependencyList = []): T {
  return useAccessor(useMemo(() => createComputed(compute), deps))
}

/**
 * Read selected fields of a {@link Store} and re-render the component when
 * any of them changes.
 *
 * Only the listed `keys` are subscribed to. Changes to other fields of the
 * store do not cause a re-render.
 *
 * @param store Store with reactive accessor fields.
 * @param keys The reactive fields to read.
 * @returns A plain object holding the current values of the selected fields.
 *
 * @example
 *
 * ```tsx
 * const settings = createStore({ theme: "dark", fontSize: 14, locale: "en" })
 *
 * function Preview() {
 *   const { theme, fontSize } = useStore(settings, "theme", "fontSize")
 *   return <div className={theme} style={{ fontSize }} />
 * }
 * ```
 */
export function useStore<S extends Store, K extends Array<keyof S>>(
  store: S,
  ...keys: K
): Pick<S, K[number]> {
  return useComputed(() => {
    const object = {} as Pick<S, K[number]>
    for (const key of keys) {
      object[key] = store[key]
    }
    return object
  }, keys)
}

/**
 * Run a reactive {@link effect} for the lifetime of the component.
 *
 * @param fn Function reading accessors to track.
 * @param deps List of non-reactive dependencies used in `fn`.
 *
 * @example
 *
 * ```tsx
 * let title: Accessor<string>
 *
 * function DocumentTitle({ prefix }: { prefix: string }) {
 *   useSignalEffect(
 *     () => {
 *       document.title = prefix + title()
 *     },
 *     [prefix]
 *   )
 *   return <></>
 * }
 * ```
 */
export function useSignalEffect(fn: () => void, deps: DependencyList = []) {
  useEffect(() => effect(fn), deps)
}
