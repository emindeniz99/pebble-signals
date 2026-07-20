[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [message](../README.md) / AppMessenger

# Interface: AppMessenger

Defined in: message.ts:113

What [useAppMessage](../functions/useAppMessage.md) returns: just an outbound `send`. Inbound messages
are delivered to the `handler` you passed, NOT surfaced here — hence no `last`
(contrast [Messenger](Messenger.md)).

## Properties

### send

> **send**: [`MessageSender`](../type-aliases/MessageSender.md)

Defined in: message.ts:115

Send an outbound message (see [MessageSender](../type-aliases/MessageSender.md)).
