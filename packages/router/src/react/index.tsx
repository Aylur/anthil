import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { RoutePaths } from "../path.js"
import { Router } from "../router.js"

export function useLocation<const T extends object>(router: Router<T>) {
  return useSyncExternalStore(
    router.subscribe,
    router.getLocationPath,
    router.getLocationPath,
  )
}

export function useSearchParams<const T extends object>(router: Router<T>) {
  return useSyncExternalStore(
    router.subscribe,
    router.getSearchParams,
    router.getSearchParams,
  )
}

export function createRouterContext<const T extends object>(routes: T) {
  const RouterContext = createContext<Router<T> | null>(null)

  function RouterProvider(props: {
    serverRoute?: URL
    defaultRoute: RoutePaths<T>
    children?: ReactNode
  }) {
    const { serverRoute, defaultRoute, children } = props
    const router = useMemo(
      () => new Router(routes, defaultRoute, serverRoute),
      [serverRoute, defaultRoute],
    )
    return <RouterContext value={router}>{children}</RouterContext>
  }

  function useRouter() {
    const router = useContext(RouterContext)
    if (!router) throw Error("missing RouterContext")
    return router
  }

  return {
    RouterProvider,
    useRouter,
    useLocation: () => useLocation(useRouter()),
    useSearchParams: () => useSearchParams(useRouter()),
  }
}
