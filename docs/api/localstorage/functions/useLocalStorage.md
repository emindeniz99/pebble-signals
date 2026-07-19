[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [localstorage](../README.md) / useLocalStorage

# Function: useLocalStorage()

> **useLocalStorage**(`key`, `initial`): \[() => `string`, (`v`) => `void`\]

Defined in: localstorage.ts:46

A `useState`-shaped tuple over a string persisted in `localStorage`.

  const [name, setName] = useLocalStorage("name", "world");
  <Label string={() => "hi " + name()} />          // reactive read
  // later, from a button handler:
  setName("pebble");                                // updates + persists

On init the stored value (if any) wins over `initial`; a missing key seeds
with `initial`. The setter drops unchanged writes (Object.is), otherwise
updates the reactive getter and calls `localStorage.setItem(key, v)`. On a
host with no `localStorage`, it degrades to a plain in-memory signal (see the
module header). STRINGS only — store numbers as `String(n)` / read back with
`parseInt`.

## Parameters

### key

`string`

the localStorage key to read/write

### initial

`string`

the value used when the key is absent

## Returns

\[() => `string`, (`v`) => `void`\]

`[getter, setter]` — call `getter()` to read (reactive), `setter(v)` to write
