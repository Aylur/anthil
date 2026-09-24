import { po, type GetTextTranslation } from "gettext-parser"

const { fromEntries, entries } = Object

export type Messages = { [ctx: string]: Record<string, string | string[]> }
export type PoJson = { pluralForms: string; lang: string; messages: Messages }

function translate(translations: Record<string, GetTextTranslation>) {
  return fromEntries(
    entries(translations).map(([, { msgid, msgid_plural, msgstr }]) => [
      msgid,
      msgid_plural ? msgstr : msgstr[0],
    ]),
  )
}

export default function po2json(content: string): PoJson {
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
      ...fromEntries(
        entries(contexts).map(([ctx, translations]) => [
          ctx,
          translate(translations),
        ]),
      ),
    },
  }
}
