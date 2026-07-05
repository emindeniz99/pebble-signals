[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / setSink

# Function: setSink()

> **setSink**(`s`): `void`

Defined in: signals.ts:283

Install the top-level error sink — the jsx-runtime's `render()` calls this;
apps normally never do. A function receives every escalated error (plus the
formatted message) and owns what happens next; `true` means "log fully,
then rethrow"; `null` restores the bare log-and-contain default.

## Parameters

### s

`true` \| ((`err`, `msg`) => `void`) \| `null`

## Returns

`void`
