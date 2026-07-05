#!/usr/bin/env python3
"""Regenerate src/tsx/examples/lazyone/s1.tsx at a target size.

Same shape as the committed 176KB variant (22 fns x ~350 sum terms).
Knobs: N full fns + optional partial terms for the last fn — lets us hit
archive sizes between the 4.6KB/fn steps.

Usage: gen-lazyone.py <nfns> [last_fn_terms]
"""
import sys

nfns = int(sys.argv[1])
last_terms = int(sys.argv[2]) if len(sys.argv) > 2 else 350
TERMS = 350

lines = [f"// GENERATED: ONE lazy module, {nfns} fns (limit-bisect cell)."]
for i in range(1, nfns + 1):
    t = last_terms if i == nfns else TERMS
    terms = " + ".join(
        f"((x * {7 * i + j} + {13 * i + 3 * j}) % {89 + (j % 60)})" for j in range(t)
    )
    lines.append(f"const f{i} = (x: number): number => {terms};")
lines.append("")
lines.append("export default () => (")
lines.append("\t<Column>")
lines.append(f'\t\t<Label string="ONE module, {nfns} fns" />')
total = " + ".join(f"f{i}(3)" for i in range(1, nfns + 1))
lines.append(f'\t\t<Label string={{"sum(3) = " + ({total})}}/>')
lines.append("\t</Column>")
lines.append(");")

path = "src/tsx/examples/lazyone/s1.tsx"
src = "\n".join(lines) + "\n"
open(path, "w").write(src)
print(f"gen-lazyone: {nfns} fns (last={last_terms} terms), {len(src)} source bytes -> {path}")
