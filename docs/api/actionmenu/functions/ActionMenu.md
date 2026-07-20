[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [actionmenu](../README.md) / ActionMenu

# Function: ActionMenu()

> **ActionMenu**(`props`): `Content`

Defined in: actionmenu.ts:126

ActionMenu — a reactive modal action sheet, display-only.

  const [act] = useState(0);
  <ActionMenu actions={["Reply", "Archive", "Delete"]} active={act} title="Message" />  // reactive
  <ActionMenu actions={opts} active={1} width={130} height={140} background="#202020" /> // static

DISPLAY-ONLY — the app owns `active` and drives it; ActionMenu highlights the
row. Hand-builds a backdrop Container over a content-height Column (Piu centers
it) holding an optional title Label and one action Label per action; the active
row is restyled + skinned by ONE effect when `active` is a thunk (idiom 5b), or
once at construction for a bare number. `active` clamps to `[0, actions.length-1]`.
See the module header for the composition + reactivity + gotcha-16 contract.

## Parameters

### props

[`ActionMenuProps`](../type-aliases/ActionMenuProps.md)

## Returns

`Content`
