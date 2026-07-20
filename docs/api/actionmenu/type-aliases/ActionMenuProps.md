[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [actionmenu](../README.md) / ActionMenuProps

# Type Alias: ActionMenuProps

> **ActionMenuProps** = `object`

Defined in: actionmenu.ts:81

Props for [ActionMenu](../functions/ActionMenu.md).

## Properties

### actions

> **actions**: `string`[]

Defined in: actionmenu.ts:83

The action captions, top to bottom. One `rowHeight`-tall Label per action.

***

### active

> **active**: `number` \| (() => `number`)

Defined in: actionmenu.ts:89

The active action index. A thunk (`() => i`) makes the sheet reactive — one
effect re-highlights on change (idiom 5b); a bare number is applied once at
construction (static). Clamped to `[0, actions.length-1]`.

***

### activeColor?

> `optional` **activeColor?**: `Color`

Defined in: actionmenu.ts:101

Active action text color — also the title color. Defaults to `"white"`.

***

### activeFill?

> `optional` **activeFill?**: `Color`

Defined in: actionmenu.ts:103

Active action background fill. Defaults to a dark teal (`"#1a4d4d"`).

***

### background?

> `optional` **background?**: `Color`

Defined in: actionmenu.ts:97

Backdrop fill color. Defaults to black (`"#000000"`).

***

### color?

> `optional` **color?**: `Color`

Defined in: actionmenu.ts:99

Inactive action text color. Defaults to `"#808080"`.

***

### font?

> `optional` **font?**: `string`

Defined in: actionmenu.ts:107

Action-row font — a valid Pebble system font key. Defaults to `"18px Gothic"`.

***

### height?

> `optional` **height?**: `number`

Defined in: actionmenu.ts:95

Backdrop height in px. Defaults to the screen height.

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: actionmenu.ts:109

Per-row height in px (the title and each action). Defaults to 30.

***

### title?

> `optional` **title?**: `string`

Defined in: actionmenu.ts:91

Optional bold sheet header, above the actions. STATIC — omit for no title Label.

***

### titleFont?

> `optional` **titleFont?**: `string`

Defined in: actionmenu.ts:105

Title font — a valid Pebble system font key. Defaults to `"bold 24px Gothic"`.

***

### width?

> `optional` **width?**: `number`

Defined in: actionmenu.ts:93

Backdrop width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16).
