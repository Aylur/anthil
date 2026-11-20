import {
  checkDirty,
  DIRTY,
  link,
  type Link,
  MUTABLE,
  type Node,
  NONE,
  PENDING,
  propagate,
  RECURSED_CHECK,
  shallowPropagate,
  unlink,
  WATCHING,
} from "./graph.js"

// Low-level reactive graph nodes and scope bookkeeping. The public API in
// reactive.ts wraps these; the graph algorithm itself lives in graph.ts.

export type Fn = () => void
export type Equals<T> = (a: T, b: T) => boolean

let cycle = 0
let batchDepth = 0
let runDepth = 0
let activeSub: Node | null = null
let activeScope: Scope | null = null

const QUEUED = 64
const UNSET = 128
const ERROR = 256

const renderQueue: Array<{ run: Fn }> = []
const userQueue: Array<{ run: Fn }> = []

function runAll<T>(items: T[], fn: (item: T) => void, reverse: boolean): void {
  let threw = false
  let error: unknown
  const n = items.length
  for (let i = 0; i < n; i++) {
    try {
      fn(items[reverse ? n - 1 - i : i])
    } catch (e) {
      if (!threw) {
        threw = true
        error = e
      }
    }
  }
  if (threw) throw error
}

function setActiveSub(sub: Node | null) {
  const prevSub = activeSub
  activeSub = sub
  return prevSub
}

function setActiveScope(scope: Scope | null) {
  const prevScope = activeScope
  activeScope = scope
  return prevScope
}

function flush() {
  let threw = false
  let error: unknown
  ++batchDepth
  while (renderQueue.length > 0 || userQueue.length > 0) {
    try {
      const job = renderQueue.shift() ?? userQueue.shift()
      job!.run()
    } catch (e) {
      if (!threw) {
        threw = true
        error = e
      }
    }
  }
  --batchDepth
  if (threw) throw error
}

/**
 * Group multiple updates so downstream computations run once after the batch
 * completes instead of after each individual update.
 *
 * @example
 *
 * ```
 * const [count, setCount] = createSignal(0);
 * const [total, setTotal] = createSignal(0);
 *
 * effect(() => console.log(`${count()} / ${total()}`)); // logs "0 / 0"
 *
 * setCount(1); // logs "1 / 0"
 * setTotal(5); // logs "1 / 5"
 *
 * batch(() => {
 *   setCount(2);
 *   setTotal(10);
 * }); // logs "2 / 10"
 * ```
 */
export function batch<T>(fn: () => T): T {
  ++batchDepth
  try {
    return fn()
  } finally {
    if (--batchDepth === 0) {
      flush()
    }
  }
}

/**
 * Lets you read values without tracking them.
 *
 * @example
 *
 * ```
 * let a: Accessor<number>
 * let b: Accessor<number>
 *
 * effect(() => {
 *  // will re-run when `a` changes but not when `b` changes
 *   print(a(), untrack(() => b()))
 * })
 * ```
 */
export function untrack<Args extends Array<any>, T>(
  fn: (...args: Args) => T,
  ...args: Args
): T {
  const prevSub = setActiveSub(null)
  try {
    return fn(...args)
  } finally {
    activeSub = prevSub
  }
}

export interface Scope {
  parent: Scope | null
  children?: Scope[]
  cleanups?: Fn[]
  disposed?: boolean

  dispose(): void
}

export interface Context<T> {
  defaultValue: T
}

function attachScope(scope: Scope): void {
  if (scope.parent) {
    scope.parent.children ??= []
    scope.parent.children.push(scope)
  }
}

export function runScope<T>(scope: Scope, fn: () => T): T {
  if (scope.disposed) throw new Error("scope is disposed")
  return batch(() => {
    const prevScope = setActiveScope(scope)
    try {
      return fn()
    } catch (e) {
      cancelMounts(scope)
      throw e
    } finally {
      activeScope = prevScope
    }
  })
}

class MountJob {
  owner = activeScope
  fn: Fn

  constructor(fn: Fn) {
    this.fn = fn
  }

  run(): void {
    const owner = this.owner
    if (owner?.disposed) return
    const prevScope = setActiveScope(owner)
    try {
      untrack(this.fn)
    } finally {
      activeScope = prevScope
    }
  }
}

function cancelMounts(scope: Scope): void {
  for (let i = userQueue.length - 1; i >= 0; i--) {
    const job = userQueue[i]
    if (!(job instanceof MountJob)) continue

    for (const s of ancestors(job.owner)) {
      if (s === scope) {
        userQueue.splice(i, 1)
        break
      }
    }
  }
}

function resetScope(scope: Scope): void {
  const children = scope.children
  const cleanups = scope.cleanups
  scope.children = []
  scope.cleanups = []
  try {
    if (children) runAll(children, disposeChildScope, true)
  } finally {
    if (cleanups) runAll(cleanups, untrack, true)
  }
}

function disposeChildScope(scope: Scope): void {
  scope.dispose()
}

function disposeScope(scope: Scope): boolean {
  if (scope.disposed) return false
  scope.disposed = true
  try {
    resetScope(scope)
  } finally {
    if (scope.parent && scope.parent.children) {
      const siblings = scope.parent.children
      const i = siblings.indexOf(scope)
      if (i !== -1) siblings.splice(i, 1)
    }
  }
  return true
}

export function createScope(parent = activeScope): Scope {
  const scope: Scope = {
    parent,
    dispose: () => disposeScope(scope),
  }

  attachScope(scope)
  return scope
}

export function getScope(): Scope | null {
  return activeScope
}

function* ancestors(scope: Scope | null) {
  for (let s = scope; s; s = s.parent) yield s
}

/**
 * Attach a cleanup callback to the current {@link Scope}.
 *
 * Cleanups run in reverse registration order, when the scope is disposed.
 *
 * @throws when called outside of a scope.
 */
export function onCleanup(fn: Fn): void {
  if (!activeScope) throw new Error("onCleanup called outside of a scope")
  activeScope.cleanups ??= []
  activeScope.cleanups.push(fn)
}

/**
 * Schedule a callback to run after the outermost {@link Scope} or batch returns.
 * Outside of a scope or batch the callback runs immediately. Mount callbacks
 * run untracked and are skipped when their scope is disposed before they run.
 */
export function onMount(fn: Fn): void {
  const job = new MountJob(fn)
  if (batchDepth > 0) userQueue.push(job)
  else job.run()
}

abstract class ReactiveNode implements Node {
  deps: Link | null = null
  depsTail: Link | null = null
  subs: Link | null = null
  subsTail: Link | null = null
  flags: number

  constructor(flags: number) {
    this.flags = flags
  }

  protected shouldUpdate() {
    if (this.flags & DIRTY) {
      return true
    }
    if (this.flags & PENDING) {
      if (checkDirty(this.deps!, this)) {
        return true
      }
      this.flags &= ~PENDING
    }
    return false
  }

  protected purgeDeps(): void {
    let toRemove = this.depsTail ? (this.depsTail as Link).nextDep : this.deps
    while (toRemove) toRemove = unlink(toRemove, this)
  }

  protected unlinkAllDeps(): void {
    let dep = this.deps
    while (dep) dep = unlink(dep, this)
  }
}

export class Signal<T> extends ReactiveNode {
  value: T
  pendingValue: T
  isEqual: Equals<T>

  constructor(value: T, isEqual: Equals<NoInfer<T>> = Object.is) {
    super(MUTABLE)
    this.pendingValue = this.value = value
    this.isEqual = isEqual
  }

  update() {
    this.flags = MUTABLE
    const prev = this.value
    return !this.isEqual(prev, (this.value = this.pendingValue))
  }

  get(): T {
    if (this.shouldUpdate() && this.update()) {
      const subs = this.subs
      if (subs) shallowPropagate(subs)
    }
    if (activeSub) {
      link(this, activeSub, cycle)
    }
    return this.value
  }

  set(value: T) {
    this.pendingValue = value
    this.flags = MUTABLE | DIRTY
    const subs = this.subs
    if (subs) {
      propagate(subs, runDepth > 0)
      if (batchDepth === 0) {
        flush()
      }
    }
  }
}

export class Computed<T> extends ReactiveNode implements Scope {
  parent: Scope | null
  children: Scope[] = []
  cleanups: Fn[] = []
  context: Map<object, unknown> | null = null
  disposed = false

  value!: T
  getter: (prev?: T) => T
  isEqual: Equals<T>
  error: unknown

  constructor(
    getter: (prev?: T) => T,
    isEqual: Equals<NoInfer<T>> = Object.is,
    parent: Scope | null = activeScope,
  ) {
    super(MUTABLE | DIRTY | UNSET)
    this.getter = getter
    this.isEqual = isEqual
    this.parent = parent
    attachScope(this)
  }

  get(): T {
    if (!this.disposed && this.shouldUpdate() && this.update()) {
      const subs = this.subs
      if (subs) shallowPropagate(subs)
    }
    if (activeSub) {
      link(this, activeSub, cycle)
    }
    if (this.flags & ERROR) throw this.error
    return this.value
  }

  update(): boolean {
    const flags = this.flags
    this.flags = MUTABLE
    try {
      resetScope(this)
    } catch (error) {
      return this.fail(error)
    }
    if (this.disposed) return false
    ++cycle
    this.depsTail = null
    this.flags = MUTABLE | RECURSED_CHECK
    const prevSub = setActiveSub(this)
    try {
      return runScope(this, () => {
        const prev = this.value
        const next = (this.value = this.getter(prev))
        return (flags & (UNSET | ERROR)) !== NONE || !this.isEqual(prev, next)
      })
    } catch (error) {
      return this.fail(error)
    } finally {
      activeSub = prevSub
      this.flags &= ~RECURSED_CHECK
      this.purgeDeps()
    }
  }

  fail(error: unknown): true {
    this.error = error
    this.flags |= ERROR
    return true
  }

  unwatched(): void {
    if (this.disposed) return
    resetScope(this)
    this.unlinkAllDeps()
    this.flags = MUTABLE | DIRTY
  }

  dispose(): void {
    if (this.disposed) return
    try {
      disposeScope(this)
    } finally {
      this.unlinkAllDeps()
      this.flags = MUTABLE | (this.flags & ERROR)
    }
  }
}

export class Effect<T> extends ReactiveNode implements Scope {
  parent: Scope | null = activeScope
  children: Scope[] = []
  cleanups: Fn[] = []
  context: Map<object, unknown> | null = null
  disposed = false

  value?: T
  fn: (prev?: T) => T
  queue: "user" | "render"

  /**
   * @param queue user effects re-run after every render effect of the flush
   */
  constructor(queue: "user" | "render", fn: (prev?: T) => T) {
    super(WATCHING)
    this.fn = fn
    this.queue = queue
    attachScope(this)
  }

  notify(): void {
    if (!(this.flags & QUEUED)) {
      this.flags |= QUEUED
      if (this.queue === "user") userQueue.push(this)
      else renderQueue.push(this)
    }
  }

  run() {
    this.flags &= ~QUEUED
    if (this.disposed) return
    if (this.deps && !this.shouldUpdate()) {
      return
    }

    // Clean before cleanups run: if one throws, this run is skipped but the
    // effect stays subscribed through its existing deps.
    this.flags = WATCHING
    resetScope(this)
    if (this.disposed) return
    ++cycle
    this.depsTail = null
    this.flags = WATCHING | RECURSED_CHECK
    const prevSub = setActiveSub(this)
    ++runDepth
    try {
      runScope(this, () => {
        this.value = this.fn(this.value)
      })
    } finally {
      --runDepth
      activeSub = prevSub
      this.flags &= ~RECURSED_CHECK
      this.purgeDeps()
    }
  }

  dispose(): void {
    if (this.disposed) return
    try {
      disposeScope(this)
    } finally {
      this.unlinkAllDeps()
      this.flags = NONE
    }
  }
}
