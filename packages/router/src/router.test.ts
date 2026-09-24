import { describe, expect, it } from "vitest"
import { dynamic, hidden, type RoutePaths } from "./path.js"
import { Router } from "./router.js"

const url = (path: string) => new URL(path, "https://example.com")

describe("Router path validation", () => {
  const routes = hidden({
    app: hidden({
      calendar: hidden(dynamic()),
      archive: [],
    }),
  })

  const defaultRoute: RoutePaths<typeof routes> = ["app", "archive"]

  it("keeps a valid path", () => {
    const router = new Router(routes, defaultRoute, url("/app/calendar/123"))
    expect(router.getLocationPath()).toEqual(["app", "calendar", "123"])
  })

  it("keeps a valid terminal path", () => {
    const router = new Router(routes, defaultRoute, url("/app/archive"))
    expect(router.getLocationPath()).toEqual(["app", "archive"])
  })

  it("walks backwards to the deepest valid prefix", () => {
    const router = new Router(routes, defaultRoute, url("/app/calendar/123/extra/junk"))
    expect(router.getLocationPath()).toEqual(["app", "calendar", "123"])
  })

  it("falls back to the default route when no valid prefix exists", () => {
    // every prefix of /app/calendar is hidden
    const router = new Router(routes, defaultRoute, url("/app/calendar"))
    expect(router.getLocationPath()).toEqual(["app", "archive"])
  })

  it("decodes segments before matching", () => {
    const router = new Router(routes, defaultRoute, url("/app/calendar/he%20llo"))
    expect(router.getLocationPath()).toEqual(["app", "calendar", "he llo"])
  })

  it("parses search params", () => {
    const router = new Router(routes, defaultRoute, url("/app/archive?foo=bar"))
    expect(router.getSearchParams().get("foo")).toBe("bar")
  })
})

describe("Router path validation with a visible root", () => {
  const routes = {
    editor: {
      template: hidden(dynamic()),
    },
  }

  it("falls back to the root path", () => {
    const router = new Router(routes, [], url("/"))
    expect(router.getLocationPath()).toEqual([])
  })

  it("keeps a visible intermediate path", () => {
    const router = new Router(routes, [], url("/editor"))
    expect(router.getLocationPath()).toEqual(["editor"])
  })

  it("walks backwards out of a hidden path", () => {
    const router = new Router(routes, [], url("/editor/template"))
    expect(router.getLocationPath()).toEqual(["editor"])
  })

  it("walks backwards from an unknown segment", () => {
    const router = new Router(routes, [], url("/editor/unknown"))
    expect(router.getLocationPath()).toEqual(["editor"])
  })

  it("does not match inherited object properties", () => {
    const router = new Router(routes, [], url("/toString"))
    expect(router.getLocationPath()).toEqual([])
  })
})

describe("Router path validation with nested dynamic segments", () => {
  const routes = {
    user: dynamic({ page: [] }),
    org: dynamic(hidden({ settings: [] })),
  }

  it("matches a dynamic segment with children", () => {
    const router = new Router(routes, [], url("/user/123"))
    expect(router.getLocationPath()).toEqual(["user", "123"])
  })

  it("matches a path below a dynamic segment", () => {
    const router = new Router(routes, [], url("/user/123/page"))
    expect(router.getLocationPath()).toEqual(["user", "123", "page"])
  })

  it("walks backwards from an unknown child of a dynamic segment", () => {
    const router = new Router(routes, [], url("/user/123/nope"))
    expect(router.getLocationPath()).toEqual(["user", "123"])
  })

  it("walks backwards out of a dynamic segment with hidden children", () => {
    const router = new Router(routes, [], url("/org/123"))
    expect(router.getLocationPath()).toEqual(["org"])
  })

  it("matches below a dynamic segment with hidden children", () => {
    const router = new Router(routes, [], url("/org/123/settings"))
    expect(router.getLocationPath()).toEqual(["org", "123", "settings"])
  })
})

describe("Router path validation with alternatives", () => {
  const routes = {
    pick: ["a", "b", dynamic()],
  }

  it("matches a literal alternative", () => {
    const router = new Router(routes, [], url("/pick/a"))
    expect(router.getLocationPath()).toEqual(["pick", "a"])
  })

  it("matches a dynamic alternative", () => {
    const router = new Router(routes, [], url("/pick/anything"))
    expect(router.getLocationPath()).toEqual(["pick", "anything"])
  })

  it("walks backwards from a too deep path", () => {
    const router = new Router(routes, [], url("/pick/a/b"))
    expect(router.getLocationPath()).toEqual(["pick", "a"])
  })
})
