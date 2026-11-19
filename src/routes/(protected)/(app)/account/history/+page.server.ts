import { titleMeta } from "#lib/addons/server.js";
import { pullEnrichedHistory } from "#lib/history/history-data.js";
import { profileData } from "#lib/userdata/server.js";
import type { PageServerLoad } from "./$types";

// Streamed, never awaited. The addon enrichment (posters / clean titles) runs
// here rather than in a client query, so rows arrive named instead of showing
// raw content ids until a second round trip lands. One page at a time: a
// profile with years of history would otherwise look up every title it holds.
export const load: PageServerLoad = ({ locals, fetch, url }) => {
	const page = Number(url.searchParams.get("page") ?? 1);
	return {
		page,
		history: pullEnrichedHistory(
			profileData(locals, fetch),
			async (type, id) => (await titleMeta(type, id))?.meta ?? null,
			page,
		).catch(() => ({ rows: [], total: 0, page: 1, pageCount: 1 })),
	};
};
