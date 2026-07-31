// src/tsx/examples/pulse.tsx
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { jsx, jsxs } from "runtime/jsx-runtime";
var bg = new Skin({ fill: "black" });
var accents = [
  new Skin({ fill: "white" }),
  new Skin({ fill: "#55ffaa" }),
  new Skin({ fill: "#ffaa55" })
];
var clockStyle = new Style({ font: "bold 32px LiberationSerif", color: "white" });
var lineStyle = new Style({ font: "18px Gothic", color: "white" });
var dimStyle = new Style({ font: "14px Gothic", color: "#aaaaaa" });
var [theme, setTheme] = useState(Number(localStorage.getItem("pulse-theme")) || 0);
var cycleTheme = (d) => setTheme((t) => {
  const n = (t + d + accents.length) % accents.length;
  localStorage.setItem("pulse-theme", String(n));
  return n;
});
var two = (n) => (n < 10 ? "0" : "") + n;
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var [on, setOn] = useState(false);
var [hhmm, setHhmm] = useState("");
var [sub, setSub] = useState("");
var tick = () => {
  const d = /* @__PURE__ */ new Date();
  setOn((v) => !v);
  setHhmm(`${two(d.getHours())}:${two(d.getMinutes())}`);
  setSub(`${DAYS[d.getDay()]} ${two(d.getDate())}.${two(d.getMonth() + 1)}  \xB7  :${two(d.getSeconds())}`);
};
tick();
setInterval(tick, 1e3);
var [name, setName] = useState(localStorage.getItem("pulse-name") || "");
setTimeout(() => {
  importNow("app/boot").default({
    // WRAPPED on purpose: useState setters are LOWERED AWAY (packed S.set)
    // — passing one as a bare VALUE emits a dangling identifier (found by
    // this app dying at the 400ms timer). An arrow keeps it a CALL, which
    // the lowering rewrites. (lint-reads rule 5 now catches the escape.)
    setName: (v) => setName(v)
  });
}, 400);
render(() => /* @__PURE__ */ jsx(
  Container,
  {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    focus: true,
    onPressUp: () => cycleTheme(1),
    onPressDown: () => cycleTheme(-1),
    children: /* @__PURE__ */ jsxs(Column, { top: screen.round ? 30 : 12, children: [
      /* @__PURE__ */ jsx(Label, { style: dimStyle, string: () => name() ? `hi ${name()}` : "pulse" }),
      /* @__PURE__ */ jsx(Label, { style: clockStyle, string: () => hhmm() }),
      /* @__PURE__ */ jsx(Label, { style: lineStyle, string: () => sub() }),
      /* @__PURE__ */ jsx(Content, { top: 6, width: 12, height: 12, skin: () => on() ? accents[theme()] : bg })
    ] })
  }
), { skin: bg, style: lineStyle });
