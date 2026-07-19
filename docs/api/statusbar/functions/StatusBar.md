[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [statusbar](../README.md) / StatusBar

# Function: StatusBar()

> **StatusBar**(`props`): `Content`

Defined in: statusbar.ts:89

StatusBar — a top strip with a left title and a right time, on ONE Container.

  const time = () => clock();
  <StatusBar title="Inbox" time={time} />   // static title, live time
  <StatusBar title={() => `${n()} new`} />  // reactive title, no time

Hand-builds a full-width top-anchored Container with up to two Labels; thunk
props are driven by effects (idiom 5b). See the module header.

## Parameters

### props

[`StatusBarProps`](../type-aliases/StatusBarProps.md)

## Returns

`Content`
