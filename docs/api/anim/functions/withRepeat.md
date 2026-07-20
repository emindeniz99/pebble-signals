[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [anim](../README.md) / withRepeat

# Function: withRepeat()

> **withRepeat**(`steps`, `count`, `yoyo?`): [`SeqStep`](../type-aliases/SeqStep.md)[]

Defined in: anim.ts:336

withRepeat(steps, count, yoyo?) — repeat a step list `count` times (RN Reanimated
`withRepeat`). With `yoyo`, every other pass plays REVERSED so the motion bounces
back and forth instead of jumping to the start. Pure — expands into one flat
`SeqStep[]` for [useSequence](useSequence.md) (so it shares the one sequence timer, not N).

  useSequence(withRepeat([{ to: 100, ms: 200 }], 3, true));  // out, back, out

## Parameters

### steps

[`SeqStep`](../type-aliases/SeqStep.md)[]

### count

`number`

### yoyo?

`boolean`

## Returns

[`SeqStep`](../type-aliases/SeqStep.md)[]
