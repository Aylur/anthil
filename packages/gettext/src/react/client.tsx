"use client"

import {
  createContext,
  use,
  useLayoutEffect,
  useState,
  type PropsWithChildren,
} from "react"
import { createGettext, type GettextReact } from "./fmt.js"
import type { Messages } from "../po2json.js"

const GettextContext = createContext(createGettext({ lang: "en" }))

export function GettextProvider({
  messages,
  gettext,
  children,
}: PropsWithChildren<
  | { messages?: Messages; gettext?: never }
  | { messages?: never; gettext?: GettextReact }
>) {
  const [ctx, setGettext] = useState<GettextReact>(
    () => gettext ?? createGettext(messages),
  )

  useLayoutEffect(
    () => setGettext(() => gettext ?? createGettext(messages)),
    [gettext, messages],
  )

  return <GettextContext value={ctx}>{children}</GettextContext>
}

export function useGettext(): GettextReact {
  return use(GettextContext)
}
