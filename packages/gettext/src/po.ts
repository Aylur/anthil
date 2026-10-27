import {
  po,
  type GetTextTranslation,
  type GetTextTranslationRecord,
  type GetTextTranslations,
} from "gettext-parser"
import type { Message } from "./extract.js"
import type { PoJson } from "./gettext.js"
import { nplurals, pluralFormsFor } from "./plural-forms.js"

type MessageKey = { msgctxt?: string; msgid: string }

type PoDiff = {
  /** in the codebase, but not in the po file */
  missing: MessageKey[]
  /** in the po file, but not in the codebase */
  obsolete: MessageKey[]
  /** plural form or number of plural translations does not match */
  pluralMismatch: MessageKey[]
  /** has an empty msgstr */
  untranslated: MessageKey[]
}

type InitOptions = {
  /** defaults to the built-in table */
  pluralForms?: string
}

type MergeOptions = {
  /** keep removed messages as obsolete (`#~`) entries */
  keepObsolete?: boolean
}

function headers(extra: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    "MIME-Version": "1.0",
    "Content-Type": "text/plain; charset=UTF-8",
    "Content-Transfer-Encoding": "8bit",
  }
}

function compile(table: Omit<GetTextTranslations, "charset">): string {
  return po.compile({ charset: "utf-8", ...table }).toString("utf-8") + "\n"
}

function* entries(record: GetTextTranslationRecord = {}) {
  for (const [ctx, translations] of Object.entries(record)) {
    for (const [msgid, translation] of Object.entries(translations)) {
      if (ctx === "" && msgid === "") continue // header
      yield translation
    }
  }
}

function lookup(
  record: GetTextTranslationRecord = {},
  { msgctxt, msgid }: MessageKey,
): GetTextTranslation | null {
  return record[msgctxt ?? ""]?.[msgid] ?? null
}

function insert(record: GetTextTranslationRecord, entry: GetTextTranslation) {
  ;(record[entry.msgctxt ?? ""] ??= {})[entry.msgid] = entry
}

function toKey({ msgctxt, msgid }: MessageKey): MessageKey {
  return typeof msgctxt === "string" ? { msgctxt, msgid } : { msgid }
}

function sizeMsgstr(msg: Message, n: number, msgstr: string[] = []) {
  const size = typeof msg.msgidPlural === "string" ? n : 1
  return Array.from({ length: size }, (_, i) => msgstr[i] ?? "")
}

function toEntry(
  msg: Message,
  msgstr: string[],
  comments: GetTextTranslation["comments"] = {},
): GetTextTranslation {
  return {
    ...(typeof msg.msgctxt === "string" && { msgctxt: msg.msgctxt }),
    msgid: msg.msgid,
    ...(typeof msg.msgidPlural === "string" && {
      msgid_plural: msg.msgidPlural,
    }),
    msgstr,
    comments: {
      ...comments,
      reference: msg.references.join("\n"),
    },
  }
}

function record(): GetTextTranslationRecord {
  // default context first
  return { "": {} }
}

export function createPot(catalog: Message[]): string {
  const translations = record()
  for (const msg of catalog) {
    insert(translations, toEntry(msg, sizeMsgstr(msg, 2)))
  }

  return compile({
    headers: headers({
      "Plural-Forms": "nplurals=INTEGER; plural=EXPRESSION;",
    }),
    translations,
  })
}

export function initPo(
  catalog: Message[],
  locale: string,
  options: InitOptions = {},
): string {
  const pluralForms = options.pluralForms ?? pluralFormsFor(locale)
  if (!pluralForms) {
    throw Error(
      `unknown plural forms for locale "${locale}", specify them explicitly`,
    )
  }

  const n = nplurals(pluralForms)
  const translations = record()
  for (const msg of catalog) {
    insert(translations, toEntry(msg, sizeMsgstr(msg, n)))
  }

  return compile({
    headers: headers({
      Language: locale,
      "Plural-Forms": pluralForms,
    }),
    translations,
  })
}

export function mergePo(
  existing: string,
  catalog: Message[],
  options: MergeOptions = {},
): string {
  const parsed = po.parse(existing)
  const n = nplurals(parsed.headers["Plural-Forms"])
  const translations = record()
  const obsolete: GetTextTranslationRecord = {}

  for (const msg of catalog) {
    const prev =
      lookup(parsed.translations, msg) ?? lookup(parsed.obsolete, msg)

    const { translator, flag } = prev?.comments ?? {}
    insert(
      translations,
      toEntry(msg, sizeMsgstr(msg, n, prev?.msgstr), {
        ...(translator && { translator }),
        ...(flag && { flag }),
      }),
    )
  }

  if (options.keepObsolete) {
    for (const entry of [
      ...entries(parsed.translations),
      ...entries(parsed.obsolete),
    ]) {
      if (!lookup(translations, entry)) {
        const { reference: _, ...comments } = entry.comments ?? {}
        insert(obsolete, { ...entry, comments })
      }
    }
  }

  return compile({
    headers: parsed.headers,
    translations,
    ...(Object.keys(obsolete).length > 0 && { obsolete }),
  })
}

export function diffPo(existing: string, catalog: Message[]): PoDiff {
  const parsed = po.parse(existing)
  const n = nplurals(parsed.headers["Plural-Forms"])
  const diff: PoDiff = {
    missing: [],
    obsolete: [],
    pluralMismatch: [],
    untranslated: [],
  }

  const current = record()
  for (const msg of catalog) {
    insert(current, toEntry(msg, []))

    const entry = lookup(parsed.translations, msg)
    if (!entry) {
      diff.missing.push(toKey(msg))
      continue
    }

    const expected = typeof msg.msgidPlural === "string" ? n : 1
    if (
      entry.msgid_plural !== msg.msgidPlural ||
      entry.msgstr.length !== expected
    ) {
      diff.pluralMismatch.push(toKey(msg))
    }

    if (entry.msgstr.length === 0 || entry.msgstr.some((s) => s === "")) {
      diff.untranslated.push(toKey(msg))
    }
  }

  for (const entry of entries(parsed.translations)) {
    if (!lookup(current, entry)) {
      diff.obsolete.push(toKey(entry))
    }
  }

  return diff
}

export function formatKey({ msgctxt, msgid }: MessageKey): string {
  const id = JSON.stringify(msgid)
  return typeof msgctxt === "string" ? `${JSON.stringify(msgctxt)} ${id}` : id
}

export function isUpToDate(diff: PoDiff): boolean {
  return (
    diff.missing.length === 0 &&
    diff.obsolete.length === 0 &&
    diff.pluralMismatch.length === 0
  )
}

// like msgfmt, untranslated and fuzzy messages are left out
// so that the runtime falls back to the msgid
function isTranslated({ msgstr, comments }: GetTextTranslation) {
  const fuzzy = comments?.flag?.split(",").some((f) => f.trim() === "fuzzy")
  return !fuzzy && msgstr.length > 0 && msgstr.every((str) => str !== "")
}

function translate(translations: Record<string, GetTextTranslation>) {
  return Object.fromEntries(
    Object.entries(translations)
      .filter(([, translation]) => isTranslated(translation))
      .map(([, { msgid, msgid_plural, msgstr }]) => [
        msgid,
        msgid_plural ? msgstr : msgstr[0],
      ]),
  )
}

export function po2json(content: string): PoJson {
  const tr = po.parse(content)

  const pluralForms =
    tr.headers["Plural-Forms"] ?? "nplurals=2; plural=(n != 1);"

  const { "": defaultContext, ...contexts } = tr.translations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { "": _header, ...defaultContextTranslations } = defaultContext

  return {
    pluralForms,
    lang: tr.headers["Language"],
    messages: {
      "": translate(defaultContextTranslations),
      ...Object.fromEntries(
        Object.entries(contexts).map(([ctx, translations]) => [
          ctx,
          translate(translations),
        ]),
      ),
    },
  }
}

if (import.meta.vitest) {
  const { describe, expect, test } = import.meta.vitest

  const catalog: Message[] = [
    { msgid: "Hello", references: ["src/a.ts:1"] },
    { msgid: "apple", msgidPlural: "apples", references: ["src/a.ts:2"] },
    { msgctxt: "action", msgid: "Open", references: ["src/a.ts:3"] },
  ]

  function translate(content: string, msgstr: Record<string, string[]>) {
    const parsed = po.parse(content)
    for (const ctx of Object.values(parsed.translations)) {
      for (const [msgid, entry] of Object.entries(ctx)) {
        if (msgstr[msgid]) entry.msgstr = msgstr[msgid]
      }
    }
    return po.compile(parsed).toString()
  }

  describe("createPot", () => {
    test("template", () => {
      const pot = po.parse(createPot(catalog))
      expect(pot.translations[""]!["apple"]!.msgstr).toEqual(["", ""])
      expect(pot.translations["action"]!["Open"]!.comments?.reference).toBe(
        "src/a.ts:3",
      )
    })
  })

  describe("initPo", () => {
    test("header and plurals", () => {
      const parsed = po.parse(initPo(catalog, "ru"))
      expect(parsed.headers["Language"]).toBe("ru")
      expect(parsed.headers["Plural-Forms"]).toBe(pluralFormsFor("ru"))
      expect(parsed.translations[""]!["apple"]!.msgstr).toEqual(["", "", ""])
      expect(parsed.translations[""]!["Hello"]!.msgstr).toEqual([""])
    })

    test("unknown locale", () => {
      expect(() => initPo(catalog, "xx")).toThrow(/plural forms/)
      const parsed = po.parse(
        initPo(catalog, "xx", { pluralForms: "nplurals=1; plural=0;" }),
      )
      expect(parsed.translations[""]!["apple"]!.msgstr).toEqual([""])
    })

    test("is up to date", () => {
      expect(isUpToDate(diffPo(initPo(catalog, "hu"), catalog))).toBe(true)
    })
  })

  describe("mergePo", () => {
    const existing = translate(initPo(catalog, "hu"), {
      Hello: ["Szia"],
      apple: ["alma", "almák"],
      Open: ["Megnyitás"],
    })

    test("keeps translations and adds new messages", () => {
      const next: Message[] = [
        { msgid: "Hello", references: ["src/b.ts:10"] },
        { msgid: "New", references: ["src/b.ts:11"] },
      ]

      const parsed = po.parse(mergePo(existing, next))
      expect(parsed.headers["Language"]).toBe("hu")
      expect(parsed.translations[""]!["Hello"]).toMatchObject({
        msgstr: ["Szia"],
        comments: { reference: "src/b.ts:10" },
      })
      expect(parsed.translations[""]!["New"]!.msgstr).toEqual([""])
      expect(parsed.translations[""]).not.toHaveProperty("apple")
      expect(parsed.translations).not.toHaveProperty("action")
      expect(parsed).not.toHaveProperty("obsolete")
    })

    test("keeps obsolete messages and revives them", () => {
      const merged = mergePo(existing, catalog.slice(0, 1), {
        keepObsolete: true,
      })
      expect(merged).toContain('#~ msgid "apple"')
      expect(merged).toContain('#~ msgstr "Megnyitás"')

      const revived = po.parse(mergePo(merged, catalog))
      expect(revived.translations["action"]!["Open"]!.msgstr).toEqual([
        "Megnyitás",
      ])
      expect(revived).not.toHaveProperty("obsolete")
    })

    test("pads and trims plurals", () => {
      const plural = translate(initPo(catalog, "hu"), { Hello: ["Szia"] })
      const parsed = po.parse(
        mergePo(plural, [
          { msgid: "Hello", msgidPlural: "Hellos", references: [] },
          { msgid: "apple", references: [] },
        ]),
      )
      expect(parsed.translations[""]!["Hello"]!.msgstr).toEqual(["Szia", ""])
      expect(parsed.translations[""]!["apple"]!.msgstr).toEqual([""])
    })

    test("keeps translator comments and flags", () => {
      const commented = existing.replace(
        'msgid "Hello"',
        '# a note\n#, fuzzy\nmsgid "Hello"',
      )
      const parsed = po.parse(mergePo(commented, catalog))
      expect(parsed.translations[""]!["Hello"]!.comments).toMatchObject({
        translator: "a note",
        flag: "fuzzy",
      })
    })

    test("is idempotent", () => {
      const merged = mergePo(existing, catalog)
      expect(mergePo(merged, catalog)).toBe(merged)
    })
  })

  describe("diffPo", () => {
    test("reports differences", () => {
      const existing = translate(initPo(catalog, "hu"), { Hello: ["Szia"] })
      const diff = diffPo(existing, [
        { msgid: "Hello", msgidPlural: "Hellos", references: [] },
        { msgid: "apple", msgidPlural: "apples", references: [] },
        { msgctxt: "status", msgid: "Open", references: [] },
      ])

      expect(diff).toEqual({
        missing: [{ msgctxt: "status", msgid: "Open" }],
        obsolete: [{ msgctxt: "action", msgid: "Open" }],
        pluralMismatch: [{ msgid: "Hello" }],
        untranslated: [{ msgid: "apple" }],
      })
      expect(isUpToDate(diff)).toBe(false)
    })

    test("ignores references", () => {
      const moved = catalog.map((m) => ({ ...m, references: ["src/z.ts:99"] }))
      expect(isUpToDate(diffPo(initPo(catalog, "hu"), moved))).toBe(true)
    })
  })
}
