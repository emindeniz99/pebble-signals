// src/tsx/examples/card.tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Card } from "runtime/card";
import { jsx, jsxs } from "runtime/jsx-runtime";
var bg = new Skin({ fill: "black" });
var base = new Style({ font: "18px Gothic", color: "white" });
var [temp, setTemp] = useState(72);
var warmer = () => setTemp(temp() + 1);
var cooler = () => setTemp(temp() - 1);
render(
  () => /* @__PURE__ */ jsx(Container, { left: 0, right: 0, top: 0, bottom: 0, focus: true, onPressUp: warmer, onPressDown: cooler, children: /* @__PURE__ */ jsxs(Column, { children: [
    /* @__PURE__ */ jsx(Card, { title: "Weather", width: 150, children: /* @__PURE__ */ jsx(Label, { string: "Sunny skies" }) }),
    /* @__PURE__ */ jsx(Card, { title: () => temp() + "\xB0F", width: 150, fill: "#003355", bodyColor: "#00507f", children: /* @__PURE__ */ jsx(Label, { string: "tap up/down" }) })
  ] }) }),
  { skin: bg, style: base }
);
