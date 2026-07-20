[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [anim](../README.md) / SeqStep

# Type Alias: SeqStep

> **SeqStep** = \{ `ease?`: (`t`) => `number`; `ms?`: `number`; `to`: `number`; \} \| \{ `hold`: `number`; \}

Defined in: anim.ts:130

A single [useSequence](../functions/useSequence.md) keyframe: either a MOVE (`to`, over `ms` with an
optional `ease` curve) or a HOLD (stay put for `hold` ms). The sequence walks
these in order, each move starting where the previous step left off.
