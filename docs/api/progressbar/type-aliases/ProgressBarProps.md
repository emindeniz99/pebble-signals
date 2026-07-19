[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [progressbar](../README.md) / ProgressBarProps

# Type Alias: ProgressBarProps

> **ProgressBarProps** = `object`

Defined in: progressbar.ts:28

Props for [ProgressBar](../functions/ProgressBar.md).

## Properties

### fill?

> `optional` **fill?**: `Color`

Defined in: progressbar.ts:36

Filled-portion color. Defaults to `"#1560bd"`.

***

### height?

> `optional` **height?**: `number`

Defined in: progressbar.ts:34

Bar height in px. Defaults to 10.

***

### radius?

> `optional` **radius?**: `number`

Defined in: progressbar.ts:40

Corner radius in px. Defaults to `height / 2` (a pill).

***

### track?

> `optional` **track?**: `Color`

Defined in: progressbar.ts:38

Track (background) color. Defaults to `"#404040"`.

***

### value

> **value**: `number` \| (() => `number`)

Defined in: progressbar.ts:30

Progress in `0..1` (clamped). A thunk (`() => v`) makes the bar reactive; a bare number is static.

***

### width?

> `optional` **width?**: `number`

Defined in: progressbar.ts:32

Bar width in px. Defaults to 100.
