[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [message](../README.md) / AppMessenger

# Interface: AppMessenger

Defined in: [message.ts:113](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/message.ts#L113)

What [useAppMessage](../functions/useAppMessage.md) returns: just an outbound `send`. Inbound messages
are delivered to the `handler` you passed, NOT surfaced here — hence no `last`
(contrast [Messenger](Messenger.md)).

## Properties

### send

> **send**: [`MessageSender`](../type-aliases/MessageSender.md)

Defined in: [message.ts:115](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/message.ts#L115)

Send an outbound message (see [MessageSender](../type-aliases/MessageSender.md)).
