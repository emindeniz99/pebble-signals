[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [anim](../README.md) / yoyo

# Function: yoyo()

> **yoyo**(`steps`): [`SeqStep`](../type-aliases/SeqStep.md)[]

Defined in: anim.ts:373

yoyo(steps) — play a step list forward then reversed, so the motion returns to
where it began (a single out-and-back). Sugar for `withRepeat(steps, 2, true)`.
Pure — returns a `SeqStep[]` for [useSequence](useSequence.md).

  useSequence(yoyo([{ to: 100, ms: 250 }]), { loop: true });  // bounce forever

## Parameters

### steps

[`SeqStep`](../type-aliases/SeqStep.md)[]

## Returns

[`SeqStep`](../type-aliases/SeqStep.md)[]
