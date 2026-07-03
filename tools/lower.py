#!/usr/bin/env python3
"""Compile-time useState lowering (packed core Stage 2).

Rewrites the generated app JS (post-tsc, pre-esbuild):

    const [x, setX] = useState(init);     ->  const x = __sp.sig(init);
    x()                                   ->  __sp.get(x)
    setX(expr)                            ->  __sp.set(x, expr)
    setX()                                ->  __sp.set(x, undefined)

(`__sp` is `import { S as __sp } from "runtime/signals"` — aliased so a
user variable named `S` can never be shadowed or collided with.) The
per-state getter/setter closures and the Signal object never exist at
runtime; authoring DX is unchanged. The reactive graph stays runtime.

SAFETY RAILS (each selftest-covered):
 - whole-file skip unless `useState` is imported from "runtime/signals"
 - whole-file skip if the reserved name `__sp` already appears
 - per-pair bail unless EVERY use of both names is a direct call — this
   also catches shadowing declarations (params/destructures are not calls)
 - per-pair bail when the getter is ever called WITH arguments (the object
   getter tolerated that; an id would not)
 - scans and rewrites ignore string literals, template-literal text
   (interpolation code inside ${...} IS processed) and comments — a Label
   string "count()" is data, not a call site
 - property access is never touched (st.count() vs a state named count)
 - idempotent: a second pass finds no useState declarations and injects
   nothing

Usage: lower.py FILE...     (rewrites in place; prints a per-file summary)
       lower.py --selftest
"""
import re
import sys

RT = "__sp"		# reserved runtime alias
DECL = re.compile(
    r'(?:const|let|var)\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]'
    r'\s*=\s*useState\s*\(')
IMPORT_RE = re.compile(
    r'import\s*\{[^}]*\buseState\b[^}]*\}\s*from\s*["\']runtime/signals["\']')


def code_mask(src):
    """True per char when it is CODE — string bodies, template text and
    comments are False. Template ${...} interiors are code (brace-counted);
    nested templates inside interpolations are handled via a state stack.
    Regex literals are NOT lexed (none in this repo's tsc output)."""
    n = len(src)
    mask = [True] * n
    stack = []		# template nesting: brace depth per open template
    i = 0
    state = None	# None | "'" | '"' | "`" | "//" | "/*"
    while i < n:
        c = src[i]
        if state is None:
            if c in "'\"":
                state = c
                mask[i] = False
            elif c == "`":
                state = "`"
                mask[i] = False
            elif c == "/" and i + 1 < n and src[i + 1] == "/":
                state = "//"
                mask[i] = mask[i + 1] = False
                i += 1
            elif c == "/" and i + 1 < n and src[i + 1] == "*":
                state = "/*"
                mask[i] = mask[i + 1] = False
                i += 1
            elif c == "}" and stack:
                # closing an interpolation? only when depth balances
                if stack[-1] == 0:
                    stack.pop()
                    state = "`"
                    mask[i] = False
                else:
                    stack[-1] -= 1
            elif c == "{" and stack:
                stack[-1] += 1
        elif state in ("'", '"'):
            mask[i] = False
            if c == "\\":
                if i + 1 < n:
                    mask[i + 1] = False
                    i += 1
            elif c == state:
                state = None
        elif state == "`":
            mask[i] = False
            if c == "\\":
                if i + 1 < n:
                    mask[i + 1] = False
                    i += 1
            elif c == "$" and i + 1 < n and src[i + 1] == "{":
                mask[i + 1] = False
                stack.append(0)
                state = None
                i += 1
            elif c == "`":
                state = None
        elif state == "//":
            if c == "\n":
                state = None
            else:
                mask[i] = False
        elif state == "/*":
            mask[i] = False
            if c == "*" and i + 1 < n and src[i + 1] == "/":
                mask[i + 1] = False
                state = None
                i += 1
        i += 1
    return mask


def masked_copy(src, mask):
    return "".join(c if m else " " for c, m in zip(src, mask))


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


def sub_code(pattern, repl, src, mask):
    """re.sub that only rewrites matches lying fully in CODE positions."""
    out, last = [], 0
    for m in re.finditer(pattern, src):
        if all(mask[m.start():m.end()]):
            out.append(src[last:m.start()])
            out.append(m.expand(repl))
            last = m.end()
    out.append(src[last:])
    return "".join(out)


def lower(src):
    """Returns (lowered_source, pairs_lowered, pairs_bailed)."""
    # rail: only touch files that import useState from OUR runtime,
    # and never touch a file that already uses the reserved alias
    if not IMPORT_RE.search(src) or re.search(r"\b" + RT + r"\b", src):
        return src, 0, 0
    mask = code_mask(src)
    code = masked_copy(src, mask)
    pairs, pos = [], 0
    while True:
        m = DECL.search(code, pos)	# declarations found in CODE only
        if not m:
            break
        close = balanced(src, m.end() - 1)
        pairs.append((m.group(1), m.group(2), m.start(), close,
                      src[m.end():close - 1]))
        pos = close
    if not pairs:
        return src, 0, 0
    # bail analysis on CODE with the declarations blanked out
    scan = list(code)
    for _, _, a, b, _ in pairs:
        for i in range(a, b):
            scan[i] = " "
    scan = "".join(scan)
    ok = []
    for g, s, _, _, _ in pairs:
        good = True
        for n in (g, s):
            # any non-call use (incl. shadowing declarations, aliasing,
            # object shorthand, computed access) -> keep the object API
            if re.search(r"(?<![.\w$])" + re.escape(n) + r"\b(?!\s*\()", scan):
                good = False
        # the object getter tolerated arguments; an integer id would not
        if re.search(r"(?<![.\w$])" + re.escape(g) + r"\s*\(\s*[^)\s]", scan):
            good = False
        ok.append(good)
    # rewrite declarations back-to-front (indices stay valid)
    out = src
    for (g, s, a, b, init), good in reversed(list(zip(pairs, ok))):
        if good:
            out = out[:a] + "const " + g + " = " + RT + ".sig(" + init + ")" + out[b:]
    # rewrite call sites, string/comment-aware (mask recomputed: the
    # declaration rewrites shifted positions)
    for (g, s, _, _, _), good in zip(pairs, ok):
        if not good:
            continue
        mk = code_mask(out)
        out = sub_code(r"(?<![.\w$])" + re.escape(g) + r"\s*\(\s*\)",
                       RT + ".get(" + g + ")", out, mk)
        mk = code_mask(out)
        out = sub_code(r"(?<![.\w$])" + re.escape(s) + r"\s*\(\s*\)",
                       RT + ".set(" + g + ", undefined)", out, mk)
        mk = code_mask(out)
        out = sub_code(r"(?<![.\w$])" + re.escape(s) + r"\s*\(",
                       RT + ".set(" + g + ", ", out, mk)
    n_ok = sum(ok)
    if n_ok:
        out = 'import { S as ' + RT + ' } from "runtime/signals";\n' + out
    return out, n_ok, len(pairs) - n_ok


def selftest():
    IMP = 'import { useState } from "runtime/signals";\n'
    # happy path + property protection + functional/plain/empty set
    out, n_ok, n_bail = lower(
        IMP +
        'const [count, setCount] = useState(st.count());\n'
        'render(() => x(Label, { string: () => "c" + count() }));\n'
        'setCount(c => c + 1);\nsetCount(5);\nsetCount();\n'
        'obj.setCount(1);\n')
    assert (n_ok, n_bail) == (1, 0), (n_ok, n_bail)
    assert "const count = __sp.sig(st.count())" in out, out
    assert "__sp.get(count)" in out, out
    assert "__sp.set(count, c => c + 1)" in out, out
    assert "__sp.set(count, 5)" in out, out
    assert "__sp.set(count, undefined)" in out, out
    assert "obj.setCount(1)" in out, out
    assert out.startswith('import { S as __sp } from "runtime/signals";'), out
    # aliasing bails; shadowing (a non-call use) bails
    out, n_ok, n_bail = lower(
        IMP +
        'const [a, setA] = useState(1);\nconst p = setA;\n'
        'const [b, setB] = useState(2);\nfunction f(b) { return b * 2; }\n')
    assert (n_ok, n_bail) == (0, 2), out
    # getter called WITH args bails (object getter tolerated it)
    out, n_ok, n_bail = lower(IMP + 'const [g1, sG1] = useState(0);\ng1(42);\n')
    assert (n_ok, n_bail) == (0, 1), out
    # strings/comments are data: not rewritten, and not bail-triggering
    out, n_ok, n_bail = lower(
        IMP +
        'const [n, setN] = useState(0);\n'
        'const t = "call n() and setN now";  // n() setN\n'
        'const u = `tpl n() ${n()} end`;\n'
        'setN(1);\n')
    assert (n_ok, n_bail) == (1, 0), out
    assert '"call n() and setN now"' in out, out          # string untouched
    assert "// n() setN" in out, out                       # comment untouched
    assert "${__sp.get(n)}" in out, out                    # interpolation IS code
    assert "`tpl n() ${" in out, out                       # template text untouched
    # foreign useState (not our runtime) -> whole file untouched
    foreign = 'import { useState } from "react";\nconst [x, sX] = useState(0);\nsX(1);\n'
    assert lower(foreign) == (foreign, 0, 0)
    # reserved alias already present -> whole file untouched
    taken = IMP + 'const __sp = 1;\nconst [y, sY] = useState(0);\nsY(2);\n'
    assert lower(taken) == (taken, 0, 0)
    # idempotent: run twice == run once
    once, _, _ = lower(IMP + 'const [z, sZ] = useState(0);\nsZ(z() + 1);\n')
    twice, n2, _ = lower(once)
    assert n2 == 0 and twice == once
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
