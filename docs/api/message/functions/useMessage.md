[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [message](../README.md) / useMessage

# Function: useMessage()

> **useMessage**(`keys`): [`Messenger`](../interfaces/Messenger.md)

Defined in: [message.ts:155](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/message.ts#L155)

useMessage(keys) — open a reactive AppMessage channel on the given key NAMES.

  const { last, send } = useMessage(["config"]);
  <Label string={() => "in: " + String(last()?.get("config") ?? "…")} />
  // from a button: send({ config: "spdev: hi from the watch" });

The first key is AppMessage code 10000, the second 10001, … (host mapping).
Each inbound message writes the reactive `last` signal (read it in a thunk to
repaint); `send` serializes an object to a `Map` and writes it, swallowing a
throwing write. The channel is `close()`d when the owning screen is disposed,
so CALL THIS INSIDE THE render() BUILD / a component body (Rule 5) — at module
scope onCleanup is a no-op and the channel lives for the app's life.

## Parameters

### keys

`string`[]

the string key NAMES to open on (index -> code 10000 + i)

## Returns

[`Messenger`](../interfaces/Messenger.md)

a [Messenger](../interfaces/Messenger.md) — `{ last, send }`
