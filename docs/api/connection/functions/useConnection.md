[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [connection](../README.md) / useConnection

# Function: useConnection()

> **useConnection**(): () => [`ConnectionState`](../interfaces/ConnectionState.md)

Defined in: connection.ts:105

Reactive bluetooth / phone-link state — the RN `NetInfo` analog. Returns a
getter for the latest `{ app, pebblekit }`; reading it inside a Label binding /
effect subscribes, so the UI repaints when the connection changes.

  const conn = useConnection();
  <Label string={() => (conn().app ? "Connected" : "Disconnected")} />

Seeds immediately from `watch.connected` (a copy), then re-reads it on every
host "connected" event (the callback takes no argument — it re-reads both
booleans, since either channel may have flipped). Uses the bare `watch` global
directly (no importNow); the host refcounts the native subscription, so no
shared singleton is needed — each call owns one listener, removed via
onCleanup when its owner is disposed. Call inside a render root / component
body so onCleanup can bind (Rule 5). On a host without `watch` it degrades to
a constant disconnected reading and never throws.

## Returns

a getter `() => { app, pebblekit }` — reactive; seeded from `watch.connected`

() => [`ConnectionState`](../interfaces/ConnectionState.md)
