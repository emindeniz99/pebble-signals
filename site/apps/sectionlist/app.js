// src/tsx/examples/sectionlist.tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { SectionList } from "runtime/sectionlist";
import { jsx } from "runtime/jsx-runtime";
var bg = new Skin({ fill: "black" });
var base = new Style({ font: "18px Gothic", color: "white" });
var SECTIONS = [
  { header: "Fruit", rows: ["Apple", "Banana", "Cherry"] },
  { header: "Veg", rows: ["Carrot", "Kale"] },
  { header: "Grain", rows: ["Rice", "Oats"] }
];
var TOTAL = SECTIONS.reduce((n, s) => n + s.rows.length, 0);
var [sel, setSel] = useState(0);
var next = () => setSel((s) => (s + 1) % TOTAL);
var prev = () => setSel((s) => (s - 1 + TOTAL) % TOTAL);
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
      children: /* @__PURE__ */ jsx(
        SectionList,
        {
          sections: () => SECTIONS,
          renderHeader: (h) => h,
          renderRow: (r) => r,
          selected: sel,
          rows: 5,
          height: 170
        }
      )
    }
  ),
  { skin: bg, style: base }
);
