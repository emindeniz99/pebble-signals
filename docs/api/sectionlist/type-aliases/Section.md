[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [sectionlist](../README.md) / Section

# Type Alias: Section\<H, R\>

> **Section**\<`H`, `R`\> = `object`

Defined in: [sectionlist.ts:77](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L77)

One section: a `header` datum plus its item `rows`.

## Type Parameters

### H

`H` = `unknown`

### R

`R` = `unknown`

## Properties

### header

> **header**: `H`

Defined in: [sectionlist.ts:79](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L79)

The section header datum — passed to `renderHeader`; rendered bold + non-selectable.

***

### rows

> **rows**: `R`[]

Defined in: [sectionlist.ts:81](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L81)

The section's item data — each passed to `renderRow` and independently selectable.
