[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [anim](../README.md) / yoyo

# Function: yoyo()

> **yoyo**(`steps`): [`SeqStep`](../type-aliases/SeqStep.md)[]

Defined in: [anim.ts:404](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L404)

yoyo(steps) — play a step list forward then reversed, so the motion returns to
where it began (a single out-and-back). Sugar for `withRepeat(steps, 2, true)`.
Pure — returns a `SeqStep[]` for [useSequence](useSequence.md).

  useSequence(yoyo([{ to: 100, ms: 250 }]), { loop: true });  // bounce forever

## Parameters

### steps

[`SeqStep`](../type-aliases/SeqStep.md)[]

## Returns

[`SeqStep`](../type-aliases/SeqStep.md)[]
