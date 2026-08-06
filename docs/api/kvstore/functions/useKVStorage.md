[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [kvstore](../README.md) / useKVStorage

# Function: useKVStorage()

> **useKVStorage**\<`T`\>(`key`, `initial`): \[() => `T`, (`v`) => `void`\]

Defined in: [kvstore.ts:62](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/kvstore.ts#L62)

A `useState`-shaped tuple over a STRUCTURED value persisted in `localStorage`
as JSON — the structured sibling of useLocalStorage.

  const [state, setState] = useKVStorage("prefs", { count: 0 });
  <Label string={() => "count " + state().count} />        // reactive read
  // later, from a button handler:
  setState({ count: state().count + 1 });                  // updates + persists

On init the stored JSON (if any) is parsed and wins over `initial`; a missing
key seeds with `initial`; a corrupt / non-JSON stored value falls back to
`initial` WITHOUT throwing. The setter Object.is-skips only a same-REFERENCE
write (structured values aren't deep-compared — a new object always
persists), otherwise updates the reactive getter and calls
`localStorage.setItem(key, JSON.stringify(v))`. On a host with no
`localStorage`, it degrades to a plain in-memory signal (see the module
header). Values must be JSON-serializable (no functions/cycles).

## Type Parameters

### T

`T`

## Parameters

### key

`string`

the localStorage key to read/write

### initial

`T`

the value used when the key is absent or corrupt

## Returns

\[() => `T`, (`v`) => `void`\]

`[getter, setter]` — call `getter()` to read (reactive), `setter(v)` to write
