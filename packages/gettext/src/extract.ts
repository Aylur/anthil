import * as fs from "node:fs/promises"
import * as path from "node:path"
import { parseSync, Visitor, type Expression, type Argument } from "oxc-parser"

export type Message = {
  msgctxt?: string
  msgid: string
  msgidPlural?: string
  references: string[]
}

type Keyword = {
  name: string
  msgctxt?: number
  msgid: number
  msgidPlural?: number
}

type ExtractOptions = {
  /** xgettext style keyword specs, e.g. `t`, `n:1,2`, `p:1c,2` */
  keywords?: string[]
  /** references are relative to this directory, defaults to `process.cwd()` */
  cwd?: string
  /** globs of files and directories to skip, e.g. `**\/node_modules` */
  ignore?: string[]
}

type ExtractResult = {
  catalog: Message[]
  warnings: string[]
}

const defaultKeywords = [
  "t",
  "gettext",
  "n:1,2",
  "ngettext:1,2",
  "p:1c,2",
  "pgettext:1c,2",
]

export const defaultSources = ["src/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}"]

function parseKeyword(spec: string): Keyword {
  const [name, args] = spec.split(":", 2)
  if (!name || !/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name)) {
    throw Error(`invalid keyword "${spec}"`)
  }

  if (!args) return { name, msgid: 0 }

  const keyword: Keyword = { name, msgid: 0 }
  const positional: number[] = []

  for (const arg of args.split(",")) {
    const match = /^(\d+)(c?)$/.exec(arg.trim())
    if (!match || Number(match[1]) < 1) {
      throw Error(`invalid keyword "${spec}"`)
    }

    const index = Number(match[1]) - 1
    if (match[2]) {
      keyword.msgctxt = index
    } else {
      positional.push(index)
    }
  }

  const [msgid, msgidPlural, ...rest] = positional
  if (typeof msgid !== "number" || rest.length > 0) {
    throw Error(`invalid keyword "${spec}"`)
  }

  return {
    ...keyword,
    msgid,
    ...(typeof msgidPlural === "number" && { msgidPlural }),
  }
}

function lineCounter(code: string) {
  const starts = [0]
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "\n") starts.push(i + 1)
  }

  return (offset: number) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid]! <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

function staticString(node: Argument | Expression): string | null {
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? node.value : null
    case "TemplateLiteral":
      return node.expressions.length === 0
        ? (node.quasis[0]?.value.cooked ?? null)
        : null
    case "BinaryExpression": {
      if (node.operator !== "+") return null
      const left = staticString(node.left as Expression)
      const right = staticString(node.right)
      return left !== null && right !== null ? left + right : null
    }
    case "ParenthesizedExpression":
      return staticString(node.expression)
    default:
      return null
  }
}

function key(msgctxt: string | null, msgid: string): string {
  return `${msgctxt ?? ""}\u0004${msgid}`
}

function extract(
  files: Array<{ path: string; code: string }>,
  options: ExtractOptions = {},
): ExtractResult {
  const cwd = options.cwd ?? process.cwd()
  const keywords = new Map(
    (options.keywords ?? defaultKeywords).map((spec) => {
      const kw = parseKeyword(spec)
      return [kw.name, kw]
    }),
  )

  const messages = new Map<string, Message>()
  const warnings: string[] = []

  for (const file of files) {
    const ref = path.relative(cwd, path.resolve(cwd, file.path))
    const location = ref.split(path.sep).join("/")
    const lineOf = lineCounter(file.code)
    const { program, errors } = parseSync(file.path, file.code)

    for (const error of errors) {
      warnings.push(`${location}: ${error.message}`)
    }

    new Visitor({
      CallExpression(node) {
        const { callee } = node
        const name =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" &&
                !callee.computed &&
                callee.property.type === "Identifier"
              ? callee.property.name
              : null

        const keyword = typeof name === "string" ? keywords.get(name) : null
        if (!keyword) return

        const line = lineOf(node.start)
        const reference = `${location}:${line}`

        const { arguments: args } = node
        const resolve = (index?: number) => {
          const arg = typeof index === "number" ? args[index] : null
          return arg ? staticString(arg) : null
        }

        const hasCtx = typeof keyword.msgctxt === "number"
        const hasPlural = typeof keyword.msgidPlural === "number"

        const msgid = resolve(keyword.msgid)
        const msgctxt = resolve(keyword.msgctxt)
        const msgidPlural = resolve(keyword.msgidPlural)

        if (
          typeof msgid !== "string" ||
          (hasCtx && typeof msgctxt !== "string") ||
          (hasPlural && typeof msgidPlural !== "string")
        ) {
          warnings.push(
            `${reference}: skipping ${name}(), arguments must be static strings`,
          )
          return
        }

        const k = key(msgctxt, msgid)
        const existing = messages.get(k)

        if (existing) {
          if (!existing.references.includes(reference)) {
            existing.references.push(reference)
          }
          if (typeof msgidPlural === "string") {
            if (
              typeof existing.msgidPlural === "string" &&
              existing.msgidPlural !== msgidPlural
            ) {
              warnings.push(
                `${reference}: conflicting plural form for "${msgid}", ` +
                  `keeping "${existing.msgidPlural}"`,
              )
            } else {
              existing.msgidPlural = msgidPlural
            }
          }
        } else {
          messages.set(k, {
            ...(typeof msgctxt === "string" && { msgctxt }),
            msgid,
            ...(typeof msgidPlural === "string" && { msgidPlural }),
            references: [reference],
          })
        }
      },
    }).visit(program)
  }

  return { catalog: [...messages.values()], warnings }
}

export async function extractFromGlobs(
  globs: string[] = defaultSources,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const cwd = options.cwd ?? process.cwd()
  const paths: string[] = []

  for await (const file of fs.glob(globs, {
    cwd,
    exclude: options.ignore ?? [],
  })) {
    paths.push(file)
  }

  paths.sort()

  const files = await Promise.all(
    paths.map(async (p) => ({
      path: p,
      code: await fs.readFile(path.resolve(cwd, p), "utf-8"),
    })),
  )

  return extract(files, { ...options, cwd })
}

if (import.meta.vitest) {
  const { describe, expect, test } = import.meta.vitest

  function run(code: string, keywords?: string[], path = "src/app.tsx") {
    return extract([{ path, code }], { cwd: "/", keywords })
  }

  describe("parseKeyword", () => {
    test("specs", () => {
      expect(parseKeyword("t")).toEqual({ name: "t", msgid: 0 })
      expect(parseKeyword("n:1,2")).toEqual({
        name: "n",
        msgid: 0,
        msgidPlural: 1,
      })
      expect(parseKeyword("p:1c,2")).toEqual({
        name: "p",
        msgctxt: 0,
        msgid: 1,
      })
      expect(() => parseKeyword("p:0")).toThrow()
      expect(() => parseKeyword("p:1c")).toThrow()
      expect(() => parseKeyword("1t")).toThrow()
    })
  })

  describe("extract", () => {
    test("default keywords", () => {
      const { catalog, warnings } = run(`
      t("a")
      gettext("b")
      n("c", "cs", 2)
      ngettext("d", "ds", 2)
      p("ctx", "e")
      pgettext("ctx", "f")
    `)

      expect(warnings).toEqual([])
      expect(catalog).toEqual([
        { msgid: "a", references: ["src/app.tsx:2"] },
        { msgid: "b", references: ["src/app.tsx:3"] },
        { msgid: "c", msgidPlural: "cs", references: ["src/app.tsx:4"] },
        { msgid: "d", msgidPlural: "ds", references: ["src/app.tsx:5"] },
        { msgctxt: "ctx", msgid: "e", references: ["src/app.tsx:6"] },
        { msgctxt: "ctx", msgid: "f", references: ["src/app.tsx:7"] },
      ])
    })

    test("member calls, template literals and concatenation", () => {
      const { catalog } = run(
        'g.t(`multi\nline`); this.gettext("a" + `b` + "c"); g["t"]("computed")',
      )
      expect(catalog.map((m) => m.msgid)).toEqual(["multi\nline", "abc"])
    })

    test("jsx", () => {
      const { catalog } = run(
        'const el = <div title={t("title")}>{fmt(t("<b>bold</b>"), {})}</div>',
      )
      expect(catalog.map((m) => m.msgid)).toEqual(["title", "<b>bold</b>"])
    })

    test("dynamic arguments are skipped with a warning", () => {
      const { catalog, warnings } = run(
        't(x)\nt(`a${x}`)\np(ctx, "a")\nt("ok")',
      )
      expect(catalog.map((m) => m.msgid)).toEqual(["ok"])
      expect(warnings).toHaveLength(3)
      expect(warnings[0]).toMatch(/^src\/app.tsx:1: /)
    })

    test("deduplication and references", () => {
      const { catalog } = extract(
        [
          { path: "src/a.ts", code: 't("x")\nt("x")\n\nt("x")' },
          { path: "src/b.ts", code: 'n("x", "xs", 1)' },
        ],
        { cwd: "/" },
      )
      expect(catalog).toEqual([
        {
          msgid: "x",
          msgidPlural: "xs",
          references: ["src/a.ts:1", "src/a.ts:2", "src/a.ts:4", "src/b.ts:1"],
        },
      ])
    })

    test("line numbers after non-ascii text", () => {
      const { catalog } = run('t("árvíztűrő 🍎")\n\nt("b")')
      expect(catalog[1]?.references).toEqual(["src/app.tsx:3"])
    })

    test("contexts are separate messages", () => {
      const { catalog } = run('p("a", "Open"); p("b", "Open"); t("Open")')
      expect(catalog).toHaveLength(3)
    })

    test("custom keywords", () => {
      const { catalog } = run('_("a"); t("b"); np("ctx", "c", "cs", 1)', [
        "_",
        "np:1c,2,3",
      ])
      expect(catalog).toEqual([
        { msgid: "a", references: ["src/app.tsx:1"] },
        {
          msgctxt: "ctx",
          msgid: "c",
          msgidPlural: "cs",
          references: ["src/app.tsx:1"],
        },
      ])
    })

    describe("ignore", () => {
      test("extractFromGlobs", async () => {
        const os = await import("node:os")
        const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "anthil-gettext-"))
        try {
          await fs.mkdir(path.join(cwd, "src", "gen"), { recursive: true })
          await fs.writeFile(path.join(cwd, "src", "a.ts"), 't("a")')
          await fs.writeFile(path.join(cwd, "src", "gen", "b.ts"), 't("b")')

          const all = await extractFromGlobs(["src/**/*.ts"], { cwd })
          expect(all.catalog.map((m) => m.msgid)).toEqual(["a", "b"])

          const some = await extractFromGlobs(["src/**/*.ts"], {
            cwd,
            ignore: ["src/gen"],
          })
          expect(some.catalog.map((m) => m.msgid)).toEqual(["a"])
        } finally {
          await fs.rm(cwd, { recursive: true })
        }
      })
    })
  })
}
