"use client"

import { createContext, use, useMemo, type PropsWithChildren } from "react"
import { createGettext, type GettextReact } from "./fmt.js"
import type { PoJson } from "../po2json.js"

const GettextContext = createContext(createGettext({ lang: "en" }))

export function GettextProvider({
  messages,
  gettext,
  children,
}: PropsWithChildren<
  | { messages?: Partial<PoJson>; gettext?: never }
  | { messages?: never; gettext?: GettextReact }
>) {
  const ctx = useMemo(
    () => gettext ?? createGettext(messages),
    [gettext, messages],
  )

  return <GettextContext value={ctx}>{children}</GettextContext>
}

export function useGettext(): GettextReact {
  return use(GettextContext)
}
