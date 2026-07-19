[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [card](../README.md) / Card

# Function: Card()

> **Card**(`props`): `Content`

Defined in: card.ts:81

Card — a titled content box: a bold title bar over a body holding children.

  <Card title="Weather" width={140}>
    <Label string="Sunny 72°" />
  </Card>
  <Card title={() => "Steps " + steps()} />   // reactive title bar

A fill-skinned Container wraps a Column stacking the title Label over a body
Container; `children` mount into the body. See the module header for the
composition + reactivity (idiom 5b) contract.

## Parameters

### props

[`CardProps`](../type-aliases/CardProps.md)

## Returns

`Content`
