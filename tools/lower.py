#!/usr/bin/env python3
"""Compile-time useState lowering (packed core Stage 2).

Rewrites the generated app JS (post-tsc, pre-esbuild):

    const [x, setX] = useState(init);     ->  const x = S.sig(init);
    x()                                   ->  S.get(x)
    setX(expr)                            ->  S.set(x, expr)

so the per-state getter/setter closures and the Signal object never exist
at runtime — authoring DX is unchanged (you still write useState). The
reactive graph itself stays fully runtime (ids are allocated at runtime;
S.set keeps the functional-update contract).

SAFETY: a pair is lowered only when EVERY use of both names is a direct
call. If a getter/setter is aliased or passed as a value anywhere in the
file, that pair is left on the object-API useState (Svelte-style bail) —
semantics are never changed, only representation.

Usage: lower.py FILE...     (rewrites in place; prints a per-file summary)
       lower.py --selftest
"""
import re
import sys

DECL = re.compile(
    r'(?:const|let|var)\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]'
    r'\s*=\s*useState\s*\(')


def balanced(src, open_idx):
    """Index just past the ')' matching src[open_idx] == '(' (string-aware)."""
    depth, i, quote = 0, open_idx, None
    while i < len(src):
        c = src[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise ValueError("unbalanced parens in useState init")


def lower(src):
    """Returns (lowered_source, pairs_lowered, pairs_bailed)."""
    pairs, pos = [], 0
    while True:
        m = DECL.search(src, pos)
        if not m:
            break
        close = balanced(src, m.end() - 1)
        pairs.append((m.group(1), m.group(2), m.start(), close,
                      src[m.end():close - 1]))
        pos = close
    if not pairs:
        return src, 0, 0
    # bail analysis on the source with declarations masked out
    masked = list(src)
    for _, _, a, b, _ in pairs:
        for i in range(a, b):
            masked[i] = " "
    masked = "".join(masked)
    ok = []
    for g, s, _, _, _ in pairs:
        good = True
        for n in (g, s):
            if re.search(r"(?<![.\w$])" + re.escape(n) + r"\b(?!\s*\()", masked):
                good = False   # aliased / passed as a value -> keep useState
        ok.append(good)
    # rewrite declarations back-to-front (indices stay valid)
    out = src
    for (g, s, a, b, init), good in reversed(list(zip(pairs, ok))):
        if good:
            out = out[:a] + "const " + g + " = S.sig(" + init + ")" + out[b:]
    # rewrite call sites (names are unique per scope in our examples;
    # collisions would have failed the bail scan anyway)
    for (g, s, _, _, _), good in zip(pairs, ok):
        if not good:
            continue
        # (?<![.\w$]) — NEVER touch property access like st.count(): the
        # binding name as an object member is a different thing entirely
        out = re.sub(r"(?<![.\w$])" + re.escape(g) + r"\s*\(\s*\)", "S.get(" + g + ")", out)
        out = re.sub(r"(?<![.\w$])" + re.escape(s) + r"\s*\(", "S.set(" + g + ", ", out)
    n_ok = sum(ok)
    if n_ok and 'from "runtime/signals"' in out:
        out = 'import { S } from "runtime/signals";\n' + out
    return out, n_ok, len(pairs) - n_ok


def selftest():
    src = (
        'import { useState } from "runtime/signals";\n'
        'const [count, setCount] = useState(st.count());\n'
        'const [label, setLabel] = useState("hi(" + ")");\n'
        'const alias = label;\n'                       # aliased -> bail
        'render(() => x(Label, { string: () => "c" + count() }));\n'
        'setCount(c => c + 1);\n'
        'setCount(5);\n'
        'obj.setCount(1);\n')
    out, n_ok, n_bail = lower(src)
    assert n_ok == 1 and n_bail == 1, (n_ok, n_bail)
    assert "const count = S.sig(st.count())" in out, out          # .count() untouched
    assert "obj.setCount(1)" in out, out                           # property call untouched
    assert 'S.get(count)' in out, out
    assert "S.set(count, c => c + 1)" in out, out
    assert "S.set(count, 5)" in out, out
    assert 'useState("hi(" + ")")' in out, out         # bailed pair untouched
    assert out.startswith('import { S } from "runtime/signals";'), out
    # no useState at all -> untouched
    plain = "const a = 1;"
    assert lower(plain) == (plain, 0, 0)
    print("lower.py selftest OK")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        selftest()
        sys.exit(0)
    for path in sys.argv[1:]:
        src = open(path).read()
        out, n_ok, n_bail = lower(src)
        if out != src:
            open(path, "w").write(out)
        print("lower: %s  %d lowered, %d bailed" % (path, n_ok, n_bail))
