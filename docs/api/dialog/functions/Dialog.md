[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [dialog](../README.md) / Dialog

# Function: Dialog()

> **Dialog**(`props`): `Content`

Defined in: dialog.ts:183

Dialog — a centered modal card: a bold title over a wrapping message and an
optional dismiss hint, on ONE fill-skinned Container.

  <Dialog title="Alert" message="Battery low" hint="SELECT to dismiss" />
  <Dialog title={() => `${n()} left`} message={() => status()} />  // reactive

A fill-skinned Container (explicit width + height, centered via computed
left/top — gotcha 16) wraps a Column of Labels; thunk props are driven by
effects (idiom 5b). See the module header.

## Parameters

### props

[`DialogProps`](../type-aliases/DialogProps.md)

## Returns

`Content`
