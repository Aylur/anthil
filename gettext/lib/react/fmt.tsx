import IntlMessageFormat from "intl-messageformat"
import { type JSX } from "react"
import { type args, Gettext, type tags, type Text } from "../gettext.js"
import type { PoJson } from "../po2json.js"

type Messages = Partial<PoJson>
type Prettify<T> = { [K in keyof T]: T[K] }

type RichFmtArgs<T> = T extends { [args]: infer Args; [tags]: infer Tags }
  ? Prettify<
      Args & Record<Extract<Tags, string>, (chunk: JSX.Element) => JSX.Element>
    >
  : never

type StringFmtArgs<T> = T extends { [args]: infer Args }
  ? Prettify<Args>
  : never

function richFormat<T extends Text<any>>(
  text: T,
  locale: string,
  fmtArgs: RichFmtArgs<T>,
): JSX.Element {
  const message = new IntlMessageFormat(text as string, locale)
  return <>{message.format(fmtArgs)}</>
}

function stringFormat<T extends Text<any>>(
  text: T,
  locale: string,
  fmtArgs: StringFmtArgs<T>,
): string {
  const message = new IntlMessageFormat(text as string, locale, undefined, {
    ignoreTag: true,
  })
  const result = message.format(fmtArgs)
  return Array.isArray(result) ? result.map(String).join("") : String(result)
}

export type GettextReact = Gettext["gettext"] & {
  locale: string
  gettext: Gettext["gettext"]
  pgettext: Gettext["pgettext"]
  ngettext: Gettext["ngettext"]
  fmt<T extends Text<any>>(text: T, args: RichFmtArgs<T>): JSX.Element
  sfmt<T extends Text<any>>(text: T, args: StringFmtArgs<T>): string
}

export function createGettext(messages?: Messages): GettextReact {
  const { lang, gettext, pgettext, ngettext } = new Gettext(messages)

  return Object.assign(gettext, {
    locale: lang,
    gettext,
    pgettext,
    ngettext,
    fmt<T extends Text<any>>(text: T, args: RichFmtArgs<T>): JSX.Element {
      return richFormat(text, "en", args)
    },
    sfmt<T extends Text<any>>(text: T, args: StringFmtArgs<T>): string {
      return stringFormat(text, "en", args)
    },
  })
}
