[**signal-piu**](../../../README.md)

***

[signal-piu](../../../README.md) / [runtime/flow](../README.md) / animate

# Function: animate()

> **animate**(`from`, `to`, `ms`, `easing?`): \{(): `number`; `stop`: `void`; \}

Defined in: src/tsx/globals.d.ts:148

Reanimated-style tween. Returns a getter eased from `from` to `to` over
`ms` (driven by one shared timer); `.stop()` cancels. Read it in a reactive
binding to animate a property: `string={() => Math.round(x())}`.

## Parameters

### from

`number`

### to

`number`

### ms

`number`

### easing?

(`t`) => `number`

optional easing `t => t'` over `t ∈ [0,1]` (default linear)

## Returns

\{(): `number`; `stop`: `void`; \}

### stop()

> **stop**(): `void`

#### Returns

`void`
