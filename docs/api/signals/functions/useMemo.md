[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / useMemo

# Function: useMemo()

> **useMemo**\<`T`\>(`fn`): [`ReadonlySignal`](../interfaces/ReadonlySignal.md)\<`T`\>

Defined in: signals.ts:929

Memoized derived value — [computed](computed.md) under the React-flavored name:
`const total = useMemo(() => a() + b()); total.value`. Read via `.value`,
exactly like computed — ONE contract across the runtime, the packed
lowering and auto-thunk (which all treat useMemo as computed). A
call-style read is not a function and lint-reads flags it loudly.

## Type Parameters

### T

`T`

## Parameters

### fn

() => `T`

## Returns

[`ReadonlySignal`](../interfaces/ReadonlySignal.md)\<`T`\>
