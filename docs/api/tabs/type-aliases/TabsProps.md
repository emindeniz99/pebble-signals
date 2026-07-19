[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [tabs](../README.md) / TabsProps

# Type Alias: TabsProps

> **TabsProps** = `object`

Defined in: tabs.ts:53

Props for [Tabs](../functions/Tabs.md).

## Properties

### active

> **active**: `number` \| (() => `number`)

Defined in: tabs.ts:57

The active tab index. A thunk (`() => i`) makes the bar reactive; a bare number is static. Clamped to `[0, labels.length-1]`.

***

### activeColor?

> `optional` **activeColor?**: `Color`

Defined in: tabs.ts:65

Active tab text color. Defaults to `"white"`.

***

### activeFill?

> `optional` **activeFill?**: `Color`

Defined in: tabs.ts:67

Active tab background fill. Omitted = no background (the active tab is set apart by `activeColor` alone).

***

### color?

> `optional` **color?**: `Color`

Defined in: tabs.ts:63

Inactive tab text color. Defaults to `"#808080"`.

***

### height?

> `optional` **height?**: `number`

Defined in: tabs.ts:61

Bar height in px. Defaults to 24.

***

### labels

> **labels**: `string`[]

Defined in: tabs.ts:55

The tab captions, left to right. One equal-width cell per label.

***

### width?

> `optional` **width?**: `number`

Defined in: tabs.ts:59

Bar width in px. Defaults to the screen width (a width-less Row measures 0 — gotcha 16).
