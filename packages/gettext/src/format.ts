import IntlMessageFormat, {
  type FormatXMLElementFn,
  type PrimitiveType,
} from "intl-messageformat"
import type { args, tags, Text } from "./gettext.js"

type Prettify<T> = { [K in keyof T]: T[K] }

export type RichFmtArgs<T, Chunk, Result = Chunk> = T extends {
  [args]: infer Args
  [tags]: infer Tags
}
  ? Prettify<Args & Record<Extract<Tags, string>, (chunk: Chunk) => Result>>
  : never

export type StringFmtArgs<T> = T extends { [args]: infer Args }
  ? Prettify<Args>
  : never

export function richFormat<Part, Chunk>(
  text: Text<any>,
  locale: string,
  fmtArgs: object,
  wrap: (parts: string | Part | Array<string | Part>) => Chunk,
): Chunk {
  const message = new IntlMessageFormat(text as string, locale)
  const values = Object.fromEntries(
    Object.entries(fmtArgs).map(([key, value]) => [
      key,
      typeof value === "function"
        ? (chunks: Array<string | Part>) => value(wrap(chunks))
        : value,
    ]),
  ) as Record<string, PrimitiveType | Part | FormatXMLElementFn<Part>>

  return wrap(message.format<Part>(values))
}

export function stringFormat<T extends Text<any>>(
  text: T,
  locale: string,
  fmtArgs: StringFmtArgs<T>,
): string {
  const message = new IntlMessageFormat(
    text as string,
    locale,
    {},
    { ignoreTag: true },
  )
  const result = message.format(fmtArgs)
  return Array.isArray(result) ? result.map(String).join("") : String(result)
}
