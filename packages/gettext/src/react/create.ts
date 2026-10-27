import { createElement, Fragment, type JSX, type ReactNode } from "react"
import {
  richFormat,
  stringFormat,
  type RichFmtArgs,
  type StringFmtArgs,
} from "../format.js"
import { Gettext, type PoJson, type Text } from "../gettext.js"

type Messages = Partial<PoJson>

function keyed(parts: ReactNode): JSX.Element {
  return Array.isArray(parts)
    ? createElement(Fragment, null, ...parts)
    : createElement(Fragment, null, parts)
}

export type GettextReact = Gettext["gettext"] & {
  locale: string
  gettext: Gettext["gettext"]
  pgettext: Gettext["pgettext"]
  ngettext: Gettext["ngettext"]
  fmt<T extends Text<any>>(
    text: T,
    args: RichFmtArgs<T, JSX.Element>,
  ): JSX.Element
  sfmt<T extends Text<any>>(text: T, args: StringFmtArgs<T>): string
}

export function createGettext(messages?: Messages): GettextReact {
  const { lang, gettext, pgettext, ngettext } = new Gettext(messages)

  return Object.assign(gettext, {
    locale: lang,
    gettext,
    pgettext,
    ngettext,
    fmt<T extends Text<any>>(
      text: T,
      args: RichFmtArgs<T, JSX.Element>,
    ): JSX.Element {
      return richFormat<ReactNode, JSX.Element>(text, lang, args, keyed)
    },
    sfmt<T extends Text<any>>(text: T, args: StringFmtArgs<T>): string {
      return stringFormat(text, lang, args)
    },
  })
}
