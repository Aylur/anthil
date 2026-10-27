// @vitest-environment happy-dom

import {
  richFormat,
  stringFormat,
  type RichFmtArgs,
  type StringFmtArgs,
} from "../format.js"
import { Gettext, type PoJson, type Text } from "../gettext.js"

type Messages = Partial<PoJson>

function fragment(parts: string | Node | Array<string | Node>) {
  const frag = document.createDocumentFragment()
  frag.append(...(Array.isArray(parts) ? parts : [parts]))
  return frag
}

export type GettextVanilla = Gettext["gettext"] & {
  locale: string
  gettext: Gettext["gettext"]
  pgettext: Gettext["pgettext"]
  ngettext: Gettext["ngettext"]
  fmt<T extends Text<any>>(
    text: T,
    args: RichFmtArgs<T, DocumentFragment, Node>,
  ): DocumentFragment
  sfmt<T extends Text<any>>(text: T, args: StringFmtArgs<T>): string
}

export function createGettext(messages?: Messages): GettextVanilla {
  const { lang, gettext, pgettext, ngettext } = new Gettext(messages)

  return Object.assign(gettext, {
    locale: lang,
    gettext,
    pgettext,
    ngettext,
    fmt<T extends Text<any>>(
      text: T,
      args: RichFmtArgs<T, DocumentFragment, Node>,
    ): DocumentFragment {
      return richFormat<Node, DocumentFragment>(text, lang, args, fragment)
    },
    sfmt<T extends Text<any>>(text: T, args: StringFmtArgs<T>): string {
      return stringFormat(text, lang, args)
    },
  })
}

if (import.meta.vitest) {
  const { describe, expect, test } = import.meta.vitest

  const g = createGettext({
    lang: "hu",
    messages: {
      "": {
        Hello: "Szia",
        "Click <link>here</link>, {name}": "Kattints <link>ide</link>, {name}",
        "There is one apple": ["Egy alma van", "{count} alma van"],
      },
      action: { Open: "Megnyitás" },
    },
  })

  function html(node: Node) {
    const div = document.createElement("div")
    div.append(node)
    return div.innerHTML
  }

  describe("vanilla", () => {
    test("lookups", () => {
      expect(g.locale).toBe("hu")
      expect(g("Hello")).toBe("Szia")
      expect(g.gettext("Missing")).toBe("Missing")
      expect(g.pgettext("action", "Open")).toBe("Megnyitás")
      expect(g.ngettext("There is one apple", "There are apples", 3)).toBe(
        "{count} alma van",
      )
    })

    test("fmt with rich tags", () => {
      const result = g.fmt(g.gettext("Click <link>here</link>, {name}"), {
        name: "Anna",
        link: (chunk) => {
          const a = document.createElement("a")
          a.href = "/here"
          a.append(chunk)
          return a
        },
      })

      expect(result).toBeInstanceOf(DocumentFragment)
      expect(html(result)).toBe('Kattints <a href="/here">ide</a>, Anna')
    })

    test("fmt escapes text", () => {
      const result = g.fmt(g.gettext("{name}"), { name: "<b>x</b>" })
      expect(html(result)).toBe("&lt;b&gt;x&lt;/b&gt;")
    })

    test("sfmt", () => {
      const n = 3
      expect(
        g.sfmt(g.ngettext("There is one apple", "{count} apples", n), {
          count: n,
        }),
      ).toBe("3 alma van")
      expect(
        g.sfmt(g.gettext("Click <link>here</link>, {name}"), { name: "Anna" }),
      ).toBe("Kattints <link>ide</link>, Anna")
    })
  })
}
