"use client"

import { createContext, use, useMemo, type PropsWithChildren } from "react"
import type { PoJson } from "../gettext.js"
import { createGettext, type GettextReact } from "./fmt.js"

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
