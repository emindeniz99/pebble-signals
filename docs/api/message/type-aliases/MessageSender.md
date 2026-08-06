[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [message](../README.md) / MessageSender

# Type Alias: MessageSender

> **MessageSender** = (`obj`) => `void`

Defined in: [message.ts:91](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/message.ts#L91)

A guarded outbound sender — the `send` on [Messenger](../interfaces/Messenger.md) / [AppMessenger](../interfaces/AppMessenger.md). Serializes `obj` to a `Map` and `channel.write`s it; a throwing
write (a full outbox) is SWALLOWED, so a failed send never crashes the app
(examples/devlog.tsx). Values must be `string | number | boolean`.

## Parameters

### obj

`Record`\<`string`, `string` \| `number` \| `boolean`\>

## Returns

`void`
