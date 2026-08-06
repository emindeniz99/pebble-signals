[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [config](../README.md) / useConfig

# Function: useConfig()

> **useConfig**\<`T`\>(`initial`): () => `T`

Defined in: [config.ts:132](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/config.ts#L132)

useConfig(initial) — a reactive, persisted Clay-settings store.

  interface Cfg { text: string; invert: number; }
  const config = useConfig<Cfg>({ text: "hi", invert: 0 });
  <Label string={() => config().text} />                        // reactive read
  <Container skin={() => (config().invert ? inv : normal)}>…     // reactive style

Returns a single reactive GETTER for the current config object. On boot the
value is seeded from the persisted "config" JSON in flash (or `initial` when
absent / corrupt — never throws). When the wearer saves new settings, the
phone forwards the JSON to the watch (src/pkjs/index.ts, AppMessage code
10000) and useConfig MERGES it over the current value (`{ ...current,
...inbound }` — unspecified keys are PRESERVED), persists the result to flash,
and notifies subscribers so the UI repaints. A malformed inbound payload is
IGNORED (try/catch around JSON.parse) — it never crashes the app.

The inbound channel is opened via `importNow("pebble/message")` INSIDE the hook
(Rule 1) and `close()`d on dispose (Rule 5), so CALL THIS INSIDE the render()
build / a component body — at module scope the cleanup is a no-op and the
channel lives for the app's life. Values must be JSON-serializable (the
kvstore contract — no functions / cycles). The app author supplies the
settings-PAGE URL in src/pkjs/index.ts's showConfiguration handler; useConfig
needs no change there. Call ONCE per app (a single config store).

## Type Parameters

### T

`T` *extends* `object`

## Parameters

### initial

`T`

the config object used when flash has no stored value

## Returns

a reactive getter — call `config()` to read the current config (subscribes)

() => `T`
