// src/tsx/examples/counter.tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { jsx } from "runtime/jsx-runtime";
var bg = new Skin({ fill: "black" });
var base = new Style({ font: "28px Gothic", color: "white" });
var [count, setCount] = useState(0);
render(() => /* @__PURE__ */ jsx(
  Container,
  {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    focus: true,
    onPressUp: () => setCount((c) => c + 1),
    onPressDown: () => setCount((c) => c - 1),
    children: /* @__PURE__ */ jsx(Column, { children: /* @__PURE__ */ jsx(Label, { string: () => "Count: " + count() }) })
  }
), { skin: bg, style: base });
