# @anthil/gettext

Simple translations using gettext and ICU message format.

## Why

When iterating on a project you should not have to worry about

- giving an ID to a text
- structuring a json file
- jumping between translations and components

## Install

```sh
pnpm add @anthil/gettext
```

## Example

Requires 0 setup to get started.

```tsx
import { useGettext } from "@anthil/gettext/react"

function Component() {
  const [count, setCount] = useState(0)
  const { gettext: t, ngettext: n, fmt } = useGettext()

  return (
    <main>
      <button onClick={() => setCount((c) => c + 1)}>
        {t("Add an apple")}
      </button>
      <p>
        {fmt(n("There is one apple", "Number of apples: {count}", count), {
          count,
        })}
      </p>
      {fmt(t("Click <link>here</link> for more"), {
        link: (child) => <a>{child}</a>,
      })}
    </main>
  )
}
```

`fmt` returns a React element and supports rich tags. Use `sfmt` when you need a
plain string, for example in an attribute.

## Message Format

For more complicated messages use
[ICU message format](https://unicode-org.github.io/icu/userguide/format_parse/messages/).

```ts
fmt(
  t(`{numPhotos, plural,
    =0 {You have no photos.}
    =1 {You have one photo.}
    other {You have # photos.}
  }`),
  { numPhotos: 0 },
)
```

The arguments object is typed from the message, so a missing or misspelled
argument is a compile error.

## Context

For messages that might mean different things in different contexts use
`pgettext`.

```ts
const { pgettext: p } = useGettext()

// "Open" as a verb (action)
p("action", "Open")

// "Open" as an adjective (status)
p("status", "Open")
```

## Adding translations

Translations live in `.po` files, which are created and kept up to date from the
source code using the `anthil-gettext` CLI.

1. Create a `.po` file for each locale.

   ```sh
   pnpm exec anthil-gettext init hu
   ```

2. Add the Vite plugin to import `.po` files directly.

   ```ts
   // vite.config.ts
   import gettext from "@anthil/gettext/vite"

   export default defineConfig({
     plugins: [gettext()],
   })
   ```

   ```ts
   // vite-env.d.ts
   /// <reference types="@anthil/gettext/po-module" />
   ```

   Imported `.po` files are checked against the source code. Missing and
   untranslated messages are logged as warnings during development and fail
   `vite build`.

3. Wrap your app in a `GettextProvider`

   ```tsx
   import { GettextProvider } from "@anthil/gettext/react"

   const locales = import.meta.glob("./po/*.po", { import: "default" })

   async function getMessages(locale: string) {
     return await locales[`./po/${locale}.po`]()
   }

   async function Root() {
     const messages = await getMessages("hu")

     return (
       <GettextProvider messages={messages}>
         <App />
       </GettextProvider>
     )
   }
   ```

   > [!NOTE]
   >
   > The provider is not concerned about how you fetch the messages or how you
   > handle locale routes.

Untranslated messages fall back to the source text.

## Maintaining translations

After changing the source code, update every `.po` file.

```sh
pnpm exec anthil-gettext merge
```

To make sure the `.po` files are up to date, for example in CI, run

```sh
pnpm exec anthil-gettext check
```

## Without React

The core `Gettext` class has no React dependency.

```ts
import { Gettext } from "@anthil/gettext"
import messages from "./po/hu.po"

const { gettext: t, ngettext: n, pgettext: p } = new Gettext(messages)
```

## License

MIT
