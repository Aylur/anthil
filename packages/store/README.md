# @anthil/store

Tiny signal based stores.

```tsx
import { signal, computed } from "@anthil/store"
import { useStore } from "@anthil/store/react"

class MyStore {
  @signal accessor count = 1

  @computed get double() {
    return this.count * 2
  }

  readonly increment = () => {
    this.count++
  }
}

const myStore = new MyStore()

function App() {
  const { count, double } = useStore(myStore, "count", "double")

  return (
    <button onClick={myStore.increment}>
      {count} / {double}
    </button>
  )
}
```

## Signals

```ts
import { createSignal, createComputed, effect } from "@anthil/store"

const [count, setCount] = createSignal(0)
const double = createComputed(() => count() * 2)

const dispose = effect(() => {
  console.log(count(), double())
})

setCount(1) // logs "1 2"
setCount((prev) => prev + 1) // logs "2 4"

dispose() // stop the effect
```

### Batching and untracking

```ts
import { batch, untrack } from "@anthil/store"

batch(() => {
  setCount(2)
  setTotal(10)
}) // effects flushed once

effect(() => {
  // reruns when `count` changes but not when `total` changes
  console.log(
    count(),
    untrack(() => total()),
  )
})
```

### Subscriptions

`subscribe` is like `effect` but the callback does not run on the first pass,
only when a tracked value changes.

```ts
import { subscribe } from "@anthil/store"

const unsubscribe = subscribe(count, () => console.log(count()))

// track several accessors at once
subscribe(
  () => {
    count()
    total()
  },
  () => console.log(count(), total()),
)
```

### Scopes and lifecycles

Effects and computeds own a scope. Cleanups attached to a scope run when it is
disposed or before it reruns, and disposing a scope disposes nested scopes.

```ts
import { effect, onCleanup, createOwnerScope } from "@anthil/store"

const dispose = createOwnerScope((dispose) => {
  effect(() => {
    console.log("Outer effect")

    effect(() => {
      // when count changes, only this effect re-runs
      console.log(count())
      onCleanup(() => console.log("Inner effect is about to be re-run"))
    })

    onCleanup(() => console.log("Outer and inner effect has been disposed"))
  })

  return dispose
})

dispose()
```

## Stores

Stores are objects whose fields are backed by signals.

```ts
import { createStore, effect } from "@anthil/store"

const settings = createStore({
  theme: "dark" as "dark" | "light",
  fontSize: 14,
  get style(): string {
    return `${this.theme} ${this.fontSize}px`
  },
})

effect(() => console.log(settings.style))

settings.fontSize = 16 // logs "dark 16px"
```

Fields become signals, getters become computeds. Stores can be nested by passing
another store as a field.

### Class stores

Stores can be defined using classes and decorators

```ts
import { signal, computed } from "@anthil/store/decorators"

class SettingsStore {
  @signal accessor theme: "dark" | "light" = "dark"
  @signal accessor fontSize: number = 14

  @computed get style(): string {
    return `${this.theme} ${this.fontSize}px`
  }

  // tip: define methods as read-only arrow to bind `this`
  // so it can be passed around e.g in `onClick={settings.increment}`
  readonly increment = () => {
    this.fontSize++
  }
}
```

> [!NOTE]
>
> To use legacy (stage 2) decorators import from
> `@anthil/store/legacy-decorators`.

## React

```tsx
import { useStore } from "@anthil/store/react"

const counter = new Counter()

function App() {
  const { count, double } = useStore(counter, "count", "double")

  return (
    <button onClick={counter.increment}>
      {count} / {double}
    </button>
  )
}
```

`useStore` subscribes only to the listed fields. Changes to other fields do not
re-render the component.

### Other hooks

```tsx
import { useAccessor, useComputed, useSignalEffect } from "@anthil/store/react"

function Component({ separator }: { separator: string }) {
  // subscribe to a single accessor
  const value = useAccessor(count)

  // derive a value; re-renders only when the result changes
  const name = useComputed(
    () => firstName() + separator + lastName(),
    [separator],
  )

  // run an effect for the lifetime of the component
  useSignalEffect(() => {
    document.title = name()
  })

  return <span>{value}</span>
}
```

The `deps` list of `useComputed` and `useSignalEffect` is for non-reactive
values used inside the callback, the same way as with `useMemo` and `useEffect`.
Reactive accessors are tracked automatically.
