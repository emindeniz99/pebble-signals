[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [message](../README.md) / Messenger

# Interface: Messenger

Defined in: [message.ts:97](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/message.ts#L97)

What [useMessage](../functions/useMessage.md) returns: a reactive INBOUND `last` plus an outbound
`send`.

## Properties

### last

> **last**: () => `Map`\<`string`, `unknown`\> \| `undefined`

Defined in: [message.ts:103](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/message.ts#L103)

The most recently RECEIVED message as a `Map` of key NAME -> value, or
`undefined` before the first inbound message. REACTIVE — read it inside a
jsx thunk / effect (`() => last()?.get("config")`) to repaint on arrival.

#### Returns

`Map`\<`string`, `unknown`\> \| `undefined`

***

### send

> **send**: [`MessageSender`](../type-aliases/MessageSender.md)

Defined in: [message.ts:105](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/message.ts#L105)

Send an outbound message (see [MessageSender](../type-aliases/MessageSender.md)).
