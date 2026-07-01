// Ownership & disposal — every effect created while building a subtree is
// registered on the current owner; disposing the owner disposes the subtree.

let owner = null;

export function createRoot(fn) {
	const o = { d: [] };
	const prev = owner;
	owner = o;
	try {
		return [fn(), () => {
			for (let i = o.d.length - 1; i >= 0; i--)
				o.d[i]();
			o.d.length = 0;
		}];
	} finally {
		owner = prev;
	}
}

export function onCleanup(fn) {
	if (owner)
		owner.d.push(fn);
}

// Register an effect disposer with the current owner so tearing down the
// subtree tears down the effect. Leaked effects are the #1 correctness risk.
export function track(disposer) {
	if (owner)
		owner.d.push(disposer);
	return disposer;
}
