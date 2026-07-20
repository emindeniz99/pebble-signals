[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [anim](../README.md) / TweenOptions

# Type Alias: TweenOptions

> **TweenOptions** = `object`

Defined in: anim.ts:59

Options for [useTween](../functions/useTween.md).

## Properties

### duration?

> `optional` **duration?**: `number`

Defined in: anim.ts:64

Ease duration in ms. Defaults to 300. A value `<= 0` completes in a single
~30fps tick (flow's `animate` clamps the duration to 1ms).

***

### easing?

> `optional` **easing?**: (`t`) => `number`

Defined in: anim.ts:69

Progress curve mapping `t` in [0,1] to [0,1]. Defaults to linear. Pass a
`runtime/easing` curve (e.g. `quadInOut`) for RN-style timing.

#### Parameters

##### t

`number`

#### Returns

`number`
