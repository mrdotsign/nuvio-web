import type { Meta } from "#lib/addons/index.js";
import { pooledMap } from "#lib/core/pool.js";
import type { ContentType, HistoryRecord } from "#lib/sync/types.js";
import type { ProfileData } from "#lib/userdata/types.js";

export interface HistoryRow {
	id: string;
	contentId: string;
	type: ContentType;
	title: string;
	season: number | null;
	episode: number | null;
	watchedAt: number;
}

/** Injected so this module stays free of `$app/server` (and unit-testable). */
export type MetaLookup = (type: string, id: string) => Promise<Meta | null>;

// The same burst risk as continue-watching: one `getMeta` per unique title,
// each fanning out to every meta addon. Unbounded, some time out and the row
// falls back to showing a bare content id.
const HISTORY_META_CONCURRENCY = 4;

function historyRow(item: HistoryRecord): HistoryRow {
	return {
		id: item.id,
		contentId: item.contentId,
		type: item.contentType,
		title: item.title || item.contentId,
		season: item.season,
		episode: item.episode,
		watchedAt: item.watchedAt,
	};
}

export type EnrichedHistoryRow = HistoryRow & {
	/** 16:9 art: the episode's still, else the title's backdrop, else its poster. */
	image: string | null;
	episodeTitle: string | null;
};

export const HISTORY_PAGE_SIZE = 60;

export interface EnrichedHistoryPage {
	rows: EnrichedHistoryRow[];
	total: number;
	page: number;
	pageCount: number;
}

/**
 * One page of history (paged in SQLite), enriched from the addons with
 * landscape art, clean title and episode name. One lookup covers every row
 * of the same title, and only the titles on this page are looked up. Called
 * from the load (streamed).
 */
export async function pullEnrichedHistory(
	data: ProfileData,
	lookupMeta: MetaLookup,
	requestedPage = 1,
): Promise<EnrichedHistoryPage> {
	const { records, total, page, pageCount } = await data.historyPage(
		requestedPage,
		HISTORY_PAGE_SIZE,
	);
	const rows = records.map(historyRow);
	const unique = [...new Map(rows.map((row) => [row.contentId, row])).values()];
	const looked = await pooledMap(
		unique,
		HISTORY_META_CONCURRENCY,
		async (row) =>
			[
				row.contentId,
				await lookupMeta(row.type, row.contentId).catch(() => null),
			] as const,
	);
	const metas = new Map(looked);

	return {
		total,
		page,
		pageCount,
		rows: rows.map((row) => {
			const meta = metas.get(row.contentId) ?? null;
			// `historyRow` already substitutes the content id for a row with no
			// stored title, so "still just the id" is what "unnamed" looks like.
			const stored =
				row.title && row.title !== row.contentId ? row.title : null;
			const video = meta?.videos?.find(
				(entry) => entry.season === row.season && entry.episode === row.episode,
			);
			return {
				...row,
				title: stored ?? meta?.name ?? row.contentId,
				image: video?.thumbnail ?? meta?.background ?? meta?.poster ?? null,
				episodeTitle: row.season == null ? null : (video?.title ?? null),
			};
		}),
	};
}
