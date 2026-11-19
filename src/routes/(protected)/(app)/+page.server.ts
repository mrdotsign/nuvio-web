import { homeCatalogSlots, titleMeta } from "#lib/addons/server.js";
import { pullLibraryItems } from "#lib/library/library-data.js";
import { profileData } from "#lib/userdata/server.js";
import { pullContinueWatching } from "#lib/watch/watch-data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, fetch }) => {
	// Nothing is awaited: every pull is streamed to the page as a promise so
	// the navigation completes on the shell and each row fills in behind its
	// own skeleton. All three are self-recovering (empty on failure).
	//
	// The catalog rows and the continue-watching enrichment run here rather
	// than in client queries : the browser would otherwise have to wait for
	// the page, hydrate, and only then start the round trip that fetches the
	// content, and continue-watching cards would show their raw content ids
	// until it landed.
	const data = profileData(locals, fetch);
	const metaLookup = async (type: string, id: string) =>
		(await titleMeta(type, id))?.meta ?? null;
	return {
		library: pullLibraryItems(data),
		resume: pullContinueWatching(data, metaLookup).catch(() => []),
		// Row headers as soon as the (cached) addon registry is up, each row's
		// titles as their own nested promise: a row paints when its addon
		// answers, not when the slowest one does. `[]` is "no catalogs" (add an
		// addon), `null` is "couldn't reach the addons" (retry).
		rows: homeCatalogSlots().catch(() => null),
	};
};
