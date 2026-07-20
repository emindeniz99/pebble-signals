[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [connection](../README.md) / ConnectionState

# Interface: ConnectionState

Defined in: connection.ts:79

The phone-link connection state returned by [useConnection](../functions/useConnection.md) — a copy of
the host `watch.connected` snapshot. The two booleans are independent channels.

## Properties

### app

> **app**: `boolean`

Defined in: connection.ts:81

True while the Pebble phone app is connected over bluetooth (the phone link).

***

### pebblekit

> **pebblekit**: `boolean`

Defined in: connection.ts:83

True while a companion PebbleKit app is connected.
