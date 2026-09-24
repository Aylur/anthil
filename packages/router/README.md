# @anthil/router

A tiny, type-safe client-side router.

## Install

```sh
pnpm add @anthil/router
```

## Declaring routes

```ts
import { dynamic, hidden } from "@anthil/router"

// "/" is valid
const routes = {
  // "/about" is valid
  about: [],
  // "/docs", "/docs/intro" and "/docs/setup" are valid
  docs: ["intro", "setup"],
  // "/user/<anything>" and "/user/<anything>/settings" are valid
  user: dynamic({ settings: [] }),
  // "/app" is NOT valid on its own; "/app/calendar" and "/app/archive" are
  app: hidden({ calendar: [], archive: [] }),
}
```

- A key is a static segment. Its value describes what may follow it.
- An array lists the alternatives allowed after a segment. An empty array means
  the path ends there.
- `dynamic()` accepts any single segment. Pass an object to describe what may
  follow it.
- `hidden()` marks a node as not navigable on its own: only its children are
  valid targets.

## Plain usage

```ts
import { Router } from "@anthil/router"

const router = new Router(routes, ["about"])

router.replace("docs", "intro")
router.navigate("user", "42", "settings")
router.getLocationPath() // ["user", "42", "settings"]

router.setSearchParam("q", "hello", { push: true })
router.getSearchParams().get("q") // "hello"

const unsubscribe = router.subscribe(() => {
  console.log(router.getLocationPath())
})
```

## React

```tsx
import { createRouterContext } from "@anthil/router/react"

const { RouterProvider, useRouter, useLocation, useSearchParams } =
  createRouterContext(routes)

function App() {
  return (
    <RouterProvider defaultRoute={["about"]} serverRoute={new URL(APP_URL)}>
      <Page />
    </RouterProvider>
  )
}

function Page() {
  const router = useRouter()
  const [section, ...rest] = useLocation()
  const params = useSearchParams()

  return <button onClick={() => router.navigate("docs", "intro")}>Docs</button>
}
```
