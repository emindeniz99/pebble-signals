[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [anim](../README.md) / SeqStep

# Type Alias: SeqStep

> **SeqStep** = \{ `ease?`: (`t`) => `number`; `home?`: `true`; `ms?`: `number`; `to`: `number`; \} \| \{ `hold`: `number`; \}

Defined in: [anim.ts:130](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L130)

A single [useSequence](../functions/useSequence.md) keyframe: either a MOVE (`to`, over `ms` with an
optional `ease` curve) or a HOLD (stay put for `hold` ms). The sequence walks
these in order, each move starting where the previous step left off.

## Union Members

### Type Literal

\{ `ease?`: (`t`) => `number`; `home?`: `true`; `ms?`: `number`; `to`: `number`; \}

#### ease?

> `optional` **ease?**: (`t`) => `number`

##### Parameters

###### t

`number`

##### Returns

`number`

#### home?

> `optional` **home?**: `true`

INTERNAL (set by [yoyo](../functions/yoyo.md)/[withRepeat](../functions/withRepeat.md)'s reverse pass): re-aim
this move at the sequence's own start value instead of `to`. The reverse
of the FIRST move has no earlier target to return to, and hard-coding 0
made `useSequence(yoyo([{ to: 100 }]), { from: 50 })` finish at 0 —
breaking the out-and-back contract and making every loop jump (codex P2).

#### ms?

> `optional` **ms?**: `number`

#### to

> **to**: `number`

***

### Type Literal

\{ `hold`: `number`; \}
