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

`fmt` returns a React element and supports rich tags. Use `sfmt` when you
need a plain string, for example in an attribute.

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

1. To extract translatable text, use `xgettext`.

   ```sh
   xgettext **/\*.ts **/\*.tsx \
     --from-code=UTF-8 \
     --output=messages.pot \
     --language=JavaScript \
     --keyword=p:1c,2 \
     --keyword=t \
     --keyword=n:1,2
   ```

   > [!TIP]
   >
   > You can scope translation files per page/path by adjusting the target
   > list.

2. Init `.po` files

   ```sh
   msginit --locale=yourlocale --input=messages.pot --no-translator
   ```

3. After filling it in, generate a messages json file.

   ```sh
   pnpm exec anthil-gettext yourlocale.po yourlocale.json
   ```

   The same conversion is available programmatically from
   `@anthil/gettext/po2json`.

4. Wrap your app in a `GettextProvider`

   ```tsx
   import { GettextProvider } from "@anthil/gettext/react"

   async function getMessages(locale: string) {
     return await import(`./messages/${locale}.json`)
   }

   async function Root() {
     const messages = await getMessages("en")

     return (
       <GettextProvider messages={messages}>
         <App />
       </GettextProvider>
     )
   }
   ```

   > [!NOTE]
   >
   > The provider is not concerned about how you fetch the messages or how
   > you handle locale routes.

## Maintaining translations

1. Regenerate the `.pot` file with `xgettext` as seen above

2. Merge messages

   ```sh
   for po in po/*.po; do
     msgmerge --update --backup=off "$po" po/messages.pot
     # optionally remove obsolete messages
     msgattrib --no-obsolete --output-file="$po" "$po"
   done
   ```

## Without React

The core `Gettext` class has no React dependency.

```ts
import { Gettext } from "@anthil/gettext"
import messages from "./messages/hu.json"

const { gettext: t, ngettext: n, pgettext: p } = new Gettext(messages)
```

## License

MIT
