// Read / write / delete / list over the app-private flash filesystem — the
// opt-in `runtime/files` module. OPT-IN & ZERO-COST: an app that never imports
// it never ships it (the manifest prunes to the import closure — README
// tree-shaking), and it constructs NOTHING at load time (no host module, no
// importNow, no module-scope state), so it adds nothing to the boot floor for
// anyone.
//
// SUBSTRATE (verified against the on-disk 4.17 host — build/devices/pebble/
// host/main.js plus modules/io/files/pebble/{manifest.json,files.js,
// files-pebble.js,files-pebble.c}):
//   * `device.files` is a LAZY GETTER on the frozen `device` global: the first
//     touch runs `importNow("embedded:storage/files")` and caches its default
//     export on host state (main.js — `state.files ??= …`), so an app that
//     never reaches in here never loads the host module either. Device-present
//     per the hostprobe receipt (gabbro 2026-07-29: `typeof device.files` is
//     "object").
//   * That default export is ONE `Directory` bootstrapped onto the APP-PRIVATE
//     PFS prefix `<app-id>xs/` (xs_directorypfs_bootstrap -> app_file_name_make),
//     so every path here is relative to it and no app can reach another's
//     files. Paths are VALIDATED: "..", a trailing "/" and a doubled "/" all
//     throw "bad path", and prefix + name must fit FILE_MAX_NAME_LEN or it
//     throws "path too long" — keep names SHORT, the prefix already spends part
//     of that budget.
//   * Directory: openFile({path, mode, size, round}) · delete(path) -> true
//     removed / FALSE absent (no throw) · status(path) -> Status (mode 1 file,
//     2 directory, 0 absent — also NO throw) · scan(path?) -> an ITERATOR of
//     top-level entry names · openDirectory / createDirectory (left unbound —
//     Rule 2, no speculative API). `move()` and `File.setSize()` exist but
//     throw "unsupported by PebbleOS".
//   * File: read(count, position) -> an ArrayBuffer truncated to the bytes
//     actually read (read(buffer, position) -> a byte count instead) ·
//     write(buffer, position) — a BUFFER, never a string · status() ->
//     {size, mode} · close() · flush() is a no-op. There is NO implicit cursor:
//     every read and write seeks to `position` first.
//
// FIXED SIZE + NOR WRITES — the two host rules that shape writeFile(). A PFS
// file is allocated at OPEN time from `size` (pfs_open THROWS for a new file
// when size is 0), and a write may only CLEAR bits: files-pebble.c re-reads
// every byte first and throws "NOR write would fail" unless
// `byte === (byte & existing)`. Changed content therefore can NEVER be written
// in place. writeFile() therefore DELETEs and re-creates at exactly the new byte
// length — a fresh PFS file is erased (0xFF), so every byte passes the verify —
// and delete() on an absent path is a no-throw `false`, so the first write
// needs no separate existence probe. The host ALSO offers a `mode: "overwrite"`
// (OP_FLAG_OVERWRITE) that would do this in one call and, being a PFS
// replace-on-close, would survive power loss mid-write where delete+create
// loses the old contents. It is NOT used here: only the moddable side of that
// flag is readable in the SDK (files-pebble.c line 295) — the firmware pfs is
// not — so the two-call path, whose every step IS provable from source, is the
// one bound until a device receipt says otherwise (Rule 1 / Rule 2).
//
// STRINGS ONLY, UTF-8 (mirrors runtime/localstorage): the host moves BYTES, so
// these helpers own the string<->ArrayBuffer conversion via XS's
// `ArrayBuffer.fromString` / `String.fromArrayBuffer` (xsDataView.c /
// xsString.c — XS extensions, not ECMA, hence the local casts). XS strings are
// UTF-8, so a file is sized from the BUFFER's byteLength and never from
// `text.length`: a non-ASCII character needs more bytes than characters and
// sizing from the string would truncate it. Callers that need structure own the
// JSON round-trip, exactly as runtime/kvstore layers it over localstorage.
//
// ERROR CONTRACT — deliberately ASYMMETRIC (Rule 12). Reading, deleting and
// listing are TOTAL: an absent file, or a host with no filesystem at all, is a
// normal answer (`undefined` / `false` / `[]`), because "not there yet" is the
// ordinary first-boot case and a throw at every call site would be noise.
// writeFile() is the one operation whose silent failure is DATA LOSS, so it is
// the one that THROWS — including when `device.files` is missing entirely.
// Genuine PFS failures (a full filesystem, a non-empty directory, a NOR-refused
// write) always propagate from every helper: the host's message IS the
// diagnostic, and swallowing it would hide the only receipt there is.

// The host `Status` subset used here (files-pebble.js `class Status`, fields
// filled by the natives): `mode` bit 0 = file, bit 1 = directory.
interface FileStatus {
	/** File length in bytes (`pfs_get_file_size`). */
	size: number;
	/** True when the path names a FILE (mode bit 0). */
	isFile(): boolean;
}

// The host `File` subset (files-pebble.js) — buffers in, buffers out.
interface HostFile {
	read(count: number, position: number): ArrayBuffer;
	write(buffer: ArrayBuffer, position: number): void;
	status(): FileStatus;
	close(): void;
}

// The host `Directory` subset — what `device.files` is bootstrapped as.
interface HostDirectory {
	openFile(options: { path: string; mode?: string; size?: number }): HostFile;
	delete(path: string): boolean;
	status(path: string): FileStatus;
	scan(path?: string): Iterable<string>;
}

// The app-private Directory, or undefined on a host without one. `device` is
// its own compartment global — typed only as the "embedded:provider/builtin"
// module — so it is reached through globalThis, the same access watchinfo uses
// for device.info, and the `?.` covers a host with no `device` at all (the Node
// test sandbox). Resolved PER CALL, never at module scope: `device.files` is a
// lazy getter whose first touch LOADS the host module, and a preloaded module
// that touched it at load time would freeze broken (gotcha 13).
function root(): HostDirectory | undefined {
	return (globalThis as { device?: { files?: HostDirectory } }).device?.files;
}

/**
 * Read a whole file as a UTF-8 string.
 *
 *   const notes = readFile("notes.txt") ?? "";
 *
 * Returns `undefined` when the path names no FILE — a missing file, a
 * directory, or a host with no `device.files` — and NEVER throws for absence
 * (see the module header's error contract). A genuine PFS failure still throws.
 *
 * @param path app-private path, e.g. `"notes.txt"` (validated by the host; keep
 *   it short — see the module header)
 * @returns the file's contents, or `undefined` when there is no such file
 */
export function readFile(path: string): string | undefined {
	const d = root();
	if (!d) return undefined;
	// status() is the NO-THROW absence probe (xs_directorypfs_status reports
	// mode 0 for "not a file, directory or link" instead of throwing) — gate on
	// it so a first-boot missing file is a plain `undefined`. openFile would
	// throw here, which is exactly what the contract promises not to do.
	if (!d.status(path).isFile()) return undefined;
	const f = d.openFile({ path }); // no mode -> OP_FLAG_READ
	try {
		// The OPEN file's own status() is the authority on length
		// (pfs_get_file_size on the live fd — the directory's status skips `size`
		// for a busy file). read() seeks to `position` on every call (no cursor)
		// and truncates the returned buffer to the bytes actually read.
		const S = String as unknown as { fromArrayBuffer(b: ArrayBuffer): string };
		return S.fromArrayBuffer(f.read(f.status().size, 0));
	} finally {
		// The fd is a PFS handle: leaking it holds the file BUSY (E_BUSY) for the
		// rest of the boot, so close it even when the read throws.
		f.close();
	}
}

/**
 * Write a whole file as UTF-8, replacing any previous contents.
 *
 *   writeFile("notes.txt", "hello");
 *
 * THROWS on any failure — including a host with no `device.files` — because a
 * write that silently does nothing is data loss (module header, error
 * contract). The file is re-created at exactly the encoded byte length: PFS
 * files are fixed-size and NOR flash only lets a write clear bits, so an
 * in-place rewrite of changed content is impossible. An EMPTY string therefore
 * throws too (pfs_open refuses a 0-byte new file) — write a single space, or
 * `deleteFile` instead.
 *
 * @param path app-private path to (re)create
 * @param text contents; encoded UTF-8, so the file may be longer than
 *   `text.length` bytes
 */
export function writeFile(path: string, text: string): void {
	const d = root();
	if (!d) throw new Error("no device.files");
	const AB = ArrayBuffer as unknown as { fromString(s: string): ArrayBuffer };
	const buffer = AB.fromString(text);
	// Delete first: a PFS file is sized at create time and a NOR write may only
	// clear bits, so re-creating is the ONLY way to store changed content. An
	// absent path makes delete() a no-throw `false`, so this also covers the
	// very first write.
	d.delete(path);
	// size is the BUFFER's byteLength, never text.length — XS strings are UTF-8,
	// so a non-ASCII character needs more bytes than characters and sizing from
	// the string would allocate a file too short to hold it.
	const f = d.openFile({ path, mode: "w+", size: buffer.byteLength });
	try {
		f.write(buffer, 0);
	} finally {
		f.close(); // never leak the fd — a leaked handle stays BUSY all boot
	}
}

/**
 * Delete a file.
 *
 *   deleteFile("notes.txt");
 *
 * Returns `true` when a file was removed and `false` when the path was already
 * absent (xs_directorypfs_delete maps E_DOES_NOT_EXIST to `false`, not an
 * error) or when the host has no `device.files`. A real PFS failure — notably
 * deleting a NON-EMPTY directory — still throws.
 *
 * @param path app-private path to remove
 * @returns whether something was actually removed
 */
export function deleteFile(path: string): boolean {
	const d = root();
	if (!d) return false;
	return d.delete(path);
}

/**
 * List the entry NAMES directly under `path` — the app's own root when omitted.
 *
 *   <Label string={`${listFiles().length} files`} />
 *
 * Names are top-level and DEDUPED: the host truncates each match at the first
 * "/" and skips a name it already pushed, so a nested "a/b" surfaces once, as
 * "a". Returns a real array because the host hands back a bare ITERATOR, which
 * has no length and cannot be indexed. `[]` on a host with no `device.files`.
 *
 * @param path optional sub-path to scan; omit for the app's root
 * @returns the entry names, in host scan order
 */
export function listFiles(path?: string): string[] {
	const d = root();
	if (!d) return [];
	const out: string[] = [];
	// Pass NO argument when the caller passed none: xs_directorypfs_scan
	// branches on `xsmcArgc > 0`, so a literal `scan(undefined)` would stringify
	// to the path "undefined" and scan nothing (the same arity care as
	// watchinfo's backlight() / exitApp()).
	for (const name of path === undefined ? d.scan() : d.scan(path)) out.push(name);
	return out;
}
