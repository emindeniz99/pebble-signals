# Core concepts — the model in one page

The five ideas everything else builds on. Deep dives are linked; this page is
the map. Coming from React: read the first two twice.

## 1. Components run ONCE

There is no re-render. A component is a plain function that executes a single
time, builds real Piu nodes, and returns. Updates never re-run it — they flow
through *signals* into individual property writes. Consequences:

- State can live at module scope OR inside a component — identical cost
  (created once either way). Reusable components need it inside;
  single-screen apps read cleaner with module scope
  ([tutorial part 3](../tutorials/build-a-watchface/part3-live-complication.md)).
- There is no hooks-order rule. `useState` is an ordinary function call.
- Props are values captured at build time — pass a *thunk* when the child
  must see changes.

## 2. Signals: read by CALLING, subscribe by reading

```tsx
const [count, setCount] = useState(0);   // Solid semantics: [getter, setter]
count()                                   // read (and subscribe, inside a binding)
setCount((c) => c + 1)                    // write (functional update supported)
```

`signal(v)`/`computed(fn)` are the lower-level pair — read those with
`.value` (three read syntaxes total; the build's lint catches misuse).
Same-value writes are FREE: the signal dedupes, so a clock that sets HH:MM
every second repaints that label once a minute.

## 3. Bindings: the thunk is the subscription

```tsx
<Label string={() => "c" + count()} />   // re-runs when count changes
<Label string={"c" + count()} />         // same — the build auto-thunks bare reactive reads
<Label string={count} />                 // NOT reactive (no call) — deliberate
```

A function-valued prop becomes a live effect that assigns ONE Piu property on
change. No diffing, no tree walk — the signal graph knows exactly which label
reads it. Coordinates (`left/top/width/height`) are construction-time statics
on this port — reposition post-mount with [`<Move>`](handbook.md#architecture) instead.

## 4. Ownership: subtrees clean up themselves

Every dynamic region (`Show` side, `For` row, `Navigator` screen) runs under
its own *root*; removing it disposes every effect created inside — heap
returns to its floor, measured. Register custom cleanup with `track()`;
details in [lifecycle.md](lifecycle.md). Errors ride the same tree: the
nearest `<ErrorBoundary>` catches, else `render()`'s default paints a crash
screen on the watch ([debugging](debugging.md)).

## 5. The 32KB arena is the design constraint

The JS heap is firmware-fixed at 32KB, and two more budgets are just as
fatal and just as silent: the ~150-symbol boot floor and the 384-slot value
stack. The library's shape follows from them — bytes not objects
(`createStore`), recycling not churn (`VirtualList`), one screen at a time
(`Navigator`), lazy modules for everything not needed at first paint. The
full measured trick inventory: [the XS heap playbook](xs-heap-playbook.md);
the short version for app authors: **main = first paint only**, and
boot-verify on the emulator after every change (`pnpm run smoke:device`).
