[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [signals](../README.md) / setSink

# Function: setSink()

> **setSink**(`s`): `void`

Defined in: [signals.ts:298](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L298)

Install the top-level error sink — the jsx-runtime's `render()` calls this;
apps normally never do. A function receives every escalated error (plus the
formatted message) and owns what happens next; `true` means "log fully,
then rethrow"; `null` restores the bare log-and-contain default.

## Parameters

### s

`true` \| ((`err`, `msg`) => `void`) \| `null`

## Returns

`void`
