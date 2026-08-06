[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [message](../README.md) / useAppMessage

# Function: useAppMessage()

> **useAppMessage**(`keys`, `handler`): [`AppMessenger`](../interfaces/AppMessenger.md)

Defined in: [message.ts:182](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/message.ts#L182)

useAppMessage(keys, handler) — the CALLBACK form of [useMessage](useMessage.md): every
inbound message is passed to `handler` (a `Map` of key NAME -> value) instead
of into a reactive signal.

  const { send } = useAppMessage(["cmd"], (msg) => runCommand(msg.get("cmd")));

Same code mapping (first key -> 10000), same guarded `send`, same dispose-time
`close()` (call inside a reactive owner — Rule 5) as useMessage. Use this when
inbound traffic should DO something (an imperative side effect) rather than be
rendered; use [useMessage](useMessage.md) when you want to render it.

## Parameters

### keys

`string`[]

the string key NAMES to open on (index -> code 10000 + i)

### handler

(`msg`) => `void`

invoked with `this.read()` on every inbound message

## Returns

[`AppMessenger`](../interfaces/AppMessenger.md)

an [AppMessenger](../interfaces/AppMessenger.md) — `{ send }`
