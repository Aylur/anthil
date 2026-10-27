import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Logger, Plugin } from "vite"
import { defaultSources, extractFromGlobs, type Message } from "./extract.js"
import { diffPo, formatKey, po2json } from "./po.js"

export type GettextPluginOptions = {
  /**
   * source globs relative to the vite root
   * defaults to `src/**\/*.{js,jsx,ts,tsx,...}` */
  src?: string[]
  /** globs of files and directories to skip, e.g. `**\/node_modules` */
  ignore?: string[]
  /** xgettext style keyword specs, e.g. `t`, `n:1,2`, `p:1c,2` */
  keywords?: string[]
}

function problems(content: string, catalog: Message[]): string[] {
  const diff = diffPo(content, catalog)
  return [
    ...diff.missing.map((key) => `missing ${formatKey(key)}`),
    ...diff.pluralMismatch.map((key) => `plural mismatch ${formatKey(key)}`),
    ...diff.untranslated.map((key) => `untranslated ${formatKey(key)}`),
  ]
}

/**
 * Whether a path relative to the source root, or one of its parent
 * directories, matches one of the ignore globs.
 */
function isIgnored(file: string, ignore: string[]): boolean {
  const parts = file.split(/[\\/]/)
  return parts.some((_, i) => {
    const prefix = parts.slice(0, i + 1).join("/")
    return ignore.some((glob) => path.matchesGlob(prefix, glob))
  })
}

/**
 * Allows importing `.po` files, which are compiled to the json format
 * that `Gettext` expect.
 *
 * Imported `.po` files are checked for missing and untranslated messages,
 * which are logged as warnings in dev and fail the build.
 *
 * ```ts
 * import messages from "./po/hu.po"
 * ```
 */
export default function gettext(options: GettextPluginOptions = {}): Plugin {
  const { src = defaultSources, ignore = [], keywords } = options

  let root = process.cwd()
  let build = false
  let logger: Logger | null = null
  let catalog: Promise<Message[]> | null = null

  // dev only: loaded .po files and their last reported problems
  const reported = new Map<string, string>()
  let recheck: ReturnType<typeof setTimeout> | null = null

  function getCatalog() {
    return (catalog ??= extractFromGlobs(src, {
      keywords,
      ignore,
      cwd: root,
    }).then((result) => result.catalog))
  }

  function report(file: string, list: string[]) {
    const name = path.relative(root, file)
    return `${name} is not up to date:\n${list.map((p) => `  ${p}`).join("\n")}`
  }

  async function warn(file: string, content: string) {
    const list = problems(content, await getCatalog())
    const message = list.length > 0 ? report(file, list) : ""

    // avoid repeating the same warning on every save
    if (reported.get(file) !== message && message) {
      logger?.warn(message, { timestamp: true })
    }
    reported.set(file, message)
  }

  function isSource(file: string) {
    const rel = path.relative(root, file)
    return (
      !rel.startsWith("..") &&
      !isIgnored(rel, ignore) &&
      src.some((glob) => path.matchesGlob(rel, glob))
    )
  }

  return {
    name: "anthil-gettext",
    enforce: "pre",
    configResolved(config) {
      root = config.root
      build = config.command === "build"
      logger = config.logger
    },
    watchChange(id) {
      if (!isSource(id)) return

      catalog = null
      if (build) return

      if (recheck) clearTimeout(recheck)
      recheck = setTimeout(async () => {
        for (const file of reported.keys()) {
          try {
            await warn(file, await fs.readFile(file, "utf-8"))
          } catch {
            reported.delete(file)
          }
        }
      }, 100)
    },
    async load(id) {
      // leave virtual modules and queries such as `?raw` and `?url` to vite
      if (id.startsWith("\0") || id.includes("?") || !id.endsWith(".po")) {
        return null
      }

      const content = await fs.readFile(id, "utf-8")

      if (build) {
        const list = problems(content, await getCatalog())
        if (list.length > 0) {
          this.error(
            `${report(id, list)}\n\n` +
              `run "anthil-gettext merge" and translate the missing messages`,
          )
        }
      } else {
        await warn(id, content)
      }

      return {
        code: `export default ${JSON.stringify(po2json(content))}`,
        map: null,
        moduleType: "js",
      }
    },
  }
}

if (import.meta.vitest) {
  const { afterEach, beforeEach, expect, test, vi } = import.meta.vitest
  const os = await import("node:os")

  test("isIgnored", () => {
    expect(isIgnored("src/a.ts", [])).toBe(false)
    expect(isIgnored("src/gen/a.ts", ["src/gen"])).toBe(true)
    expect(isIgnored("src/x/node_modules/y/a.ts", ["**/node_modules"])).toBe(
      true,
    )
    expect(isIgnored("src/a.gen.ts", ["**/*.gen.ts"])).toBe(true)
    expect(isIgnored("src/a.ts", ["**/*.gen.ts"])).toBe(false)
  })

  const content = `
msgid ""
msgstr ""
"Language: hu\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

msgid "Hello"
msgstr "Szia"

msgid "Untranslated"
msgstr ""

msgid "apple"
msgid_plural "apples"
msgstr[0] "alma"
msgstr[1] "almák"
`

  let root: string
  let po: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "anthil-gettext-"))
    po = path.join(root, "po", "hu.po")
    await fs.mkdir(path.join(root, "src"))
    await fs.mkdir(path.join(root, "po"))
    await fs.writeFile(po, content)
    await fs.writeFile(
      path.join(root, "src", "app.ts"),
      't("Hello"); t("Untranslated"); n("apple", "apples", 2)',
    )
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true })
  })

  type Load = (id: string) => Promise<{ code: string } | null>

  function setup(
    command: "serve" | "build",
    options: GettextPluginOptions = {},
  ) {
    const plugin = gettext(options)
    const logger = { warn: vi.fn() }
    const context = {
      error: vi.fn((message: string) => {
        throw Error(message)
      }),
    }

    const configResolved = plugin.configResolved as (config: object) => void
    configResolved({ root, command, logger })

    return {
      logger,
      load: (id: string) => (plugin.load as Load).call(context, id),
      watchChange: (id: string) =>
        (plugin.watchChange as (id: string) => void).call(context, id),
    }
  }

  async function evaluate(code: string) {
    const url = `data:text/javascript,${encodeURIComponent(code)}`
    return (await import(/* @vite-ignore */ url)).default
  }

  test("compiles .po files to modules", async () => {
    const result = await setup("serve").load(po)

    expect(await evaluate(result!.code)).toEqual({
      lang: "hu",
      pluralForms: "nplurals=2; plural=(n != 1);",
      messages: { "": { Hello: "Szia", apple: ["alma", "almák"] } },
    })
  })

  test("ignores other modules", async () => {
    const { load } = setup("serve")
    expect(await load("/a/b.ts")).toBeNull()
    expect(await load("/a/hu.po?raw")).toBeNull()
    expect(await load("\0virtual.po")).toBeNull()
  })

  test("warns about missing and untranslated messages in dev", async () => {
    await fs.appendFile(path.join(root, "src", "app.ts"), '\nt("New")')

    const { load, logger } = setup("serve")
    expect(await load(po)).toBeDefined()
    expect(logger.warn).toHaveBeenCalledOnce()

    const [message] = logger.warn.mock.calls[0]!
    expect(message).toContain(path.join("po", "hu.po"))
    expect(message).toContain('missing "New"')
    expect(message).toContain('untranslated "Untranslated"')

    // same problems are not reported twice
    await load(po)
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  test("rechecks loaded .po files when sources change", async () => {
    vi.useFakeTimers()
    try {
      const app = path.join(root, "src", "app.ts")
      await fs.writeFile(app, 't("Hello"); n("apple", "apples", 2)')

      const { load, watchChange, logger } = setup("serve")
      await load(po)
      expect(logger.warn).not.toHaveBeenCalled()

      await fs.writeFile(app, 't("Hello"); t("New")')
      watchChange(path.join(root, "README.md"))
      watchChange(app)
      await vi.runAllTimersAsync()
      await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledOnce())
      expect(logger.warn.mock.calls[0]![0]).toContain('missing "New"')
    } finally {
      vi.useRealTimers()
    }
  })

  test("fails the build", async () => {
    const { load } = setup("build")
    await expect(load(po)).rejects.toThrow(/untranslated "Untranslated"/)
  })

  test("passes the build when up to date", async () => {
    await fs.writeFile(
      po,
      content.replace(
        'msgstr ""\n\nmsgid "apple"',
        'msgstr "x"\n\nmsgid "apple"',
      ),
    )
    const { load, logger } = setup("build")
    expect(await load(po)).toBeDefined()
    expect(logger.warn).not.toHaveBeenCalled()
  })
}
