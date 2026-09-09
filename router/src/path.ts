const HIDDEN = Symbol("hidden")
const DYNAMIC = Symbol("dynamic")

type ChildPaths<T> = T extends readonly unknown[]
  ? ElementPaths<T[number]>
  : T extends object
    ?
        | {
            [K in keyof T & string]: readonly [K, ...RoutePaths<T[K]>]
          }[keyof T & string]
        | (T extends { [DYNAMIC]: infer C }
            ? readonly [string, ...RoutePaths<C>]
            : never)
    : never

type ElementPaths<E> = E extends string
  ? readonly [E]
  : E extends object
    ? ChildPaths<E>
    : never

export type Hidden<T> = { [HIDDEN]: T }
export type Dynamic<T> = { [DYNAMIC]: T }

export type RoutePaths<T> = T extends { [HIDDEN]: infer U }
  ? ChildPaths<U>
  : readonly [] | ChildPaths<T>

export function hidden<const T extends object>(route: T): Hidden<T> {
  return { [HIDDEN]: route }
}

export function dynamic(): Dynamic<[]>
export function dynamic<const T extends object>(route: T): Dynamic<T>
export function dynamic(route?: object) {
  return { [DYNAMIC]: route ?? [] }
}

const isObject = (node: unknown): node is Record<PropertyKey, unknown> =>
  typeof node === "object" && node !== null

function matchesChildPath(node: unknown, path: readonly string[]): boolean {
  if (!isObject(node)) return false

  if (Array.isArray(node)) {
    return node.some((element: unknown) =>
      typeof element === "string"
        ? path.length === 1 && path[0] === element
        : matchesChildPath(element, path),
    )
  }

  const [head, ...rest] = path
  if (typeof head === "string" && Object.hasOwn(node, head)) {
    if (matchesPath(node[head], rest)) return true
  }

  return DYNAMIC in node && matchesPath(node[DYNAMIC], path.slice(1))
}

export function matchesPath(node: unknown, path: readonly string[]): boolean {
  if (isObject(node) && HIDDEN in node) {
    return path.length > 0 && matchesChildPath(node[HIDDEN], path)
  }
  return path.length === 0 || matchesChildPath(node, path)
}
