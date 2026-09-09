import { matchesPath, type RoutePaths } from "./path.js"

type ReadonlyURLSearchParams = Omit<
  URLSearchParams,
  "append" | "delete" | "set" | "sort"
>

type SetSearchParamOptions = {
  persistent?: boolean
  push?: boolean
}

const withParam = (
  params: URLSearchParams,
  key: string,
  value: string[] | string | null,
): URLSearchParams => {
  const next = new URLSearchParams(params)
  next.delete(key)
  if (value === null) return next
  for (const v of Array.isArray(value) ? value : [value]) next.append(key, v)
  return next
}

export class Router<const T extends object> {
  #routes: object
  #observers = new Set<() => void>()
  #defaultRoute: RoutePaths<T>
  #persistentParams = new URLSearchParams()
  #locationPath: RoutePaths<T>
  #searchParams = new URLSearchParams()

  /**
   * @param routes Route definition paths are validated against at runtime
   * @param defaultRoute Route to fall back to when no valid prefix exists
   * @param serverRoute Server rendered route
   */
  constructor(routes: T, defaultRoute: RoutePaths<T>, serverRoute?: URL) {
    this.#routes = routes
    this.#defaultRoute = defaultRoute
    this.#locationPath = defaultRoute
    if (typeof window !== "undefined") {
      this.#sync(window.location)
      addEventListener("popstate", this.#syncLocation)
      addEventListener("pushState", this.#syncLocation)
    } else if (serverRoute) {
      this.#sync(serverRoute)
    }
  }

  #sync(location: { pathname: string; search: string }) {
    const path = location.pathname
      .split("/")
      .slice(1)
      .map((segment) => decodeURIComponent(segment))

    if (matchesPath(this.#routes, path)) {
      this.#locationPath = path as RoutePaths<T>
    } else {
      const fallback = this.#validPrefix(path)
      this.#locationPath = fallback
      const pathname = `/${(fallback as readonly string[])
        .map((v) => encodeURIComponent(v))
        .join("/")}`
      if (typeof window !== "undefined" && pathname !== location.pathname) {
        window.history.replaceState(null, "", `${pathname}${location.search}`)
      }
    }

    this.#searchParams = new URLSearchParams(location.search)
  }

  // deepest prefix that is a valid route, walking backwards from the full path
  #validPrefix(path: readonly string[]): RoutePaths<T> {
    for (let length = path.length - 1; length >= 0; length--) {
      const prefix = path.slice(0, length)
      if (matchesPath(this.#routes, prefix)) {
        return prefix as RoutePaths<T>
      }
    }
    return this.#defaultRoute
  }

  #basePath(path: RoutePaths<T>) {
    const segments = (path as readonly string[]).map((v) =>
      encodeURIComponent(v),
    )
    const rootpath = `/${segments.join("/")}`
    const params = this.#persistentParams.toString()
    return params ? `${rootpath}?${params}` : rootpath
  }

  #syncLocation = () => {
    this.#sync(window.location)
    for (const observer of Array.from(this.#observers)) observer()
  }

  navigate = (...path: RoutePaths<T>) => {
    window.history.pushState(null, "", this.#basePath(path))
    this.#syncLocation()
  }

  replace = (...path: RoutePaths<T>) => {
    window.history.replaceState(null, "", this.#basePath(path))
    this.#syncLocation()
  }

  setSearchParam = (
    key: string,
    value: string[] | string | null,
    options?: SetSearchParamOptions,
  ) => {
    const url = new URL(location.href)
    url.search = withParam(url.searchParams, key, value).toString()

    if (options?.persistent) {
      this.#persistentParams = withParam(this.#persistentParams, key, value)
    }

    if (options?.push) {
      history.pushState({}, "", url)
    } else {
      history.replaceState({}, "", url)
    }

    this.#syncLocation()
  }

  subscribe = (callback: () => void) => {
    this.#observers.add(callback)
    return () => void this.#observers.delete(callback)
  }

  getLocationPath = (): RoutePaths<T> => {
    return this.#locationPath as RoutePaths<T>
  }

  getSearchParams = (): ReadonlyURLSearchParams => {
    return this.#searchParams
  }

  destroy = () => {
    removeEventListener("popstate", this.#syncLocation)
    removeEventListener("pushState", this.#syncLocation)
    this.#observers.clear()
  }
}
