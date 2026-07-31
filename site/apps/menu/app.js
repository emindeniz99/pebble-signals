// src/tsx/examples/menu.tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Menu } from "runtime/menu";
import { jsx } from "runtime/jsx-runtime";
var bg = new Skin({ fill: "black" });
var base = new Style({ font: "18px Gothic", color: "white" });
var ITEMS = ["Alarms", "Timers", "Stopwatch", "Music", "Weather", "Settings", "About", "Reset"];
var [sel, setSel] = useState(0);
var next = () => setSel((s) => (s + 1) % ITEMS.length);
var prev = () => setSel((s) => (s - 1 + ITEMS.length) % ITEMS.length);
render(
  () => /* @__PURE__ */ jsx(
    Container,
    {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      focus: true,
      onPressUp: prev,
      onPressDown: next,
      children: /* @__PURE__ */ jsx(Menu, { items: ITEMS, selected: sel, height: 132, rowHeight: 28, activeFill: "#1a4d4d" })
    }
  ),
  { skin: bg, style: base }
);
