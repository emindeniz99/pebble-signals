[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [sectionlist](../README.md) / Section

# Type Alias: Section\<H, R\>

> **Section**\<`H`, `R`\> = `object`

Defined in: sectionlist.ts:96

One section: a `header` datum plus its item `rows`.

## Type Parameters

### H

`H` = `unknown`

### R

`R` = `unknown`

## Properties

### header

> **header**: `H`

Defined in: sectionlist.ts:98

The section header datum — passed to `renderHeader`; rendered bold + non-selectable.

***

### rows

> **rows**: `R`[]

Defined in: sectionlist.ts:100

The section's item data — each passed to `renderRow` and independently selectable.
