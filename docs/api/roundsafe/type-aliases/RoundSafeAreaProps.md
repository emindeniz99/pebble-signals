[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [roundsafe](../README.md) / RoundSafeAreaProps

# Type Alias: RoundSafeAreaProps

> **RoundSafeAreaProps** = `object`

Defined in: roundsafe.ts:43

Props for [RoundSafeArea](../functions/RoundSafeArea.md).

## Properties

### children?

> `optional` **children?**: [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Defined in: roundsafe.ts:45

Children inset into the safe area. May be omitted (an empty area).

***

### inset?

> `optional` **inset?**: `number`

Defined in: roundsafe.ts:47

Round-screen inset in px on all sides. Defaults to the corner-safe inset (~0.29·radius, so a full content box clears the bezel). Ignored on a rect screen.
