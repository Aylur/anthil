import type { GetArgs, GetTags } from "./icu.js"
import type { Messages, PoJson } from "./po2json.js"

export declare const args: unique symbol
export declare const tags: unique symbol

export type Text<T> = T & {
  [args]: GetArgs<T>
  [tags]: GetTags<T>
}

export class Gettext {
  readonly lang: string

  private readonly messages: Messages
  private readonly pluralFunc!: (n: number) => number

  constructor({
    pluralForms = "nplurals=2; plural=(n != 1);",
    lang = "en",
    messages = { "": {} },
  }: Partial<PoJson> = {}) {
    this.lang = lang
    this.messages = messages
    this.pluralFunc = Function(
      "n",
      "let plural, nplurals; " + pluralForms + " return Number(plural);",
    ) as (n: number) => number
  }

  gettext = <const S extends string>(msgid: S): Text<S> => {
    if (msgid in this.messages[""]) {
      const msg = this.messages[""][msgid]
      return ((Array.isArray(msg) ? msg.at(1) : msg) ?? msgid) as Text<S>
    }

    return msgid as Text<S>
  }

  ngettext = <const S1 extends string, const S2 extends string>(
    msgid1: S1,
    msgid2: S2,
    n: number,
  ): Text<S1 | S2> => {
    const index = this.pluralFunc(n)
    return (this.messages[""][msgid1]?.at(index) ??
      (n === 1 ? msgid1 : msgid2)) as Text<S1 | S2>
  }

  pgettext = <const S extends string>(msgctxt: string, msgid: S): Text<S> => {
    const msg = this.messages[msgctxt]?.[msgid] ?? msgid
    return ((Array.isArray(msg) ? msg.at(0) : msg) ?? msgid) as Text<S>
  }
}
