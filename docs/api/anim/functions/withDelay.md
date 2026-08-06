[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [anim](../README.md) / withDelay

# Function: withDelay()

> **withDelay**(`ms`, `steps`): [`SeqStep`](../type-aliases/SeqStep.md)[]

Defined in: [anim.ts:354](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L354)

withDelay(ms, steps) — prepend a `{ hold: ms }` pause before a step list, so a
[useSequence](useSequence.md) starts after a delay (RN Reanimated `withDelay`). Pure — no
timer, no signal; it returns a fresh `SeqStep[]` to hand to `useSequence`.

  useSequence(withDelay(500, [{ to: 100, ms: 300 }]));  // wait 500ms, then move

## Parameters

### ms

`number`

### steps

[`SeqStep`](../type-aliases/SeqStep.md)[]

## Returns

[`SeqStep`](../type-aliases/SeqStep.md)[]
