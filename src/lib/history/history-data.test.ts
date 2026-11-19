import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryRecord } from "#lib/sync/types.js";
import type { ProfileData } from "#lib/userdata/types.js";
import { HISTORY_PAGE_SIZE, pullEnrichedHistory } from "./history-data.ts";

const state = { historyPull: vi.fn() };

// Pages like the store does once clamped: the requested slice, newest first.
function nuvio(): ProfileData {
	return {
		library: async () => [],
		progress: async () => [],
		history: async () => [],
		historyOf: async () => [],
		historyPage: async (page, pageSize) => {
			const all: HistoryRecord[] = await state.historyPull();
			const start = (page - 1) * pageSize;
			return {
				records: all.slice(start, start + pageSize),
				total: all.length,
				page,
				pageCount: Math.max(1, Math.ceil(all.length / pageSize)),
			};
		},
	};
}

function row(over: Partial<HistoryRecord> = {}): HistoryRecord {
	return {
		id: "h1",
		contentId: "tt1",
		contentType: "movie",
		title: "",
		season: null,
		episode: null,
		watchedAt: 1000,
		...over,
	};
}

const lookup = (meta: Record<string, unknown> | null) =>
	vi.fn(async () => meta as never);

beforeEach(() => {
	state.historyPull = vi.fn(async () => []);
});

describe("pullEnrichedHistory", () => {
	it("enriches rows with art + name, one lookup per unique title", async () => {
		state.historyPull = vi.fn(async () => [row({ id: "a" }), row({ id: "b" })]);
		const lookupMeta = lookup({ name: "The Movie", poster: "p.jpg" });

		const { rows: out } = await pullEnrichedHistory(nuvio(), lookupMeta);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			id: "a",
			title: "The Movie",
			image: "p.jpg",
			watchedAt: 1000,
		});
		// one lookup covers both rows of the same title
		expect(lookupMeta).toHaveBeenCalledTimes(1);
	});

	it("prefers the row's own title over the meta name", async () => {
		state.historyPull = vi.fn(async () => [row({ title: "Stored Title" })]);
		const {
			rows: [item],
		} = await pullEnrichedHistory(nuvio(), lookup({ name: "Meta Name" }));
		expect(item.title).toBe("Stored Title");
	});

	it("falls back to the content id when the stored title is empty", async () => {
		state.historyPull = vi.fn(async () => [row({ contentId: "tt9" })]);
		const {
			rows: [item],
		} = await pullEnrichedHistory(nuvio(), lookup(null));
		expect(item).toMatchObject({ contentId: "tt9", title: "tt9" });
	});

	it("falls back to the content id when nothing names the title", async () => {
		state.historyPull = vi.fn(async () => [row({ contentId: "tt999" })]);
		const {
			rows: [item],
		} = await pullEnrichedHistory(nuvio(), lookup(null));
		expect(item.title).toBe("tt999");
		expect(item.image).toBeNull();
	});

	it("tolerates a meta lookup failure per title", async () => {
		state.historyPull = vi.fn(async () => [row()]);
		const {
			rows: [item],
		} = await pullEnrichedHistory(
			nuvio(),
			vi.fn(async () => {
				throw new Error("addon down");
			}),
		);
		expect(item.title).toBe("tt1");
	});

	it("never has more than a handful of lookups in flight at once", async () => {
		state.historyPull = vi.fn(async () =>
			Array.from({ length: 12 }, (_, i) =>
				row({ id: `h${i}`, contentId: `tt${i}` }),
			),
		);
		let active = 0;
		let peak = 0;
		const lookupMeta = vi.fn(async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((r) => setTimeout(r, 5));
			active -= 1;
			return { name: "M" } as never;
		});

		await pullEnrichedHistory(nuvio(), lookupMeta);
		expect(peak).toBeLessThanOrEqual(4);
	});

	it("returns one page and looks up only the titles on it", async () => {
		const total = HISTORY_PAGE_SIZE + 5;
		state.historyPull = vi.fn(async () =>
			Array.from({ length: total }, (_, i) =>
				row({ id: `h${i}`, contentId: `tt${i}` }),
			),
		);
		const lookupMeta = lookup({ name: "M" });

		const out = await pullEnrichedHistory(nuvio(), lookupMeta, 2);
		expect(out.total).toBe(total);
		expect(out.rows.map((item) => item.id)).toEqual([
			"h60",
			"h61",
			"h62",
			"h63",
			"h64",
		]);
		expect(lookupMeta).toHaveBeenCalledTimes(5);
	});

	it("names the episode and shows its still", async () => {
		state.historyPull = vi.fn(async () => [
			row({ contentType: "series", season: 1, episode: 2 }),
		]);
		const {
			rows: [item],
		} = await pullEnrichedHistory(
			nuvio(),
			lookup({
				name: "Show",
				background: "bg.jpg",
				videos: [
					{
						id: "tt1:1:2",
						title: "Cat's in the Bag",
						season: 1,
						episode: 2,
						thumbnail: "still.jpg",
					},
				],
			}),
		);
		expect(item).toMatchObject({
			episodeTitle: "Cat's in the Bag",
			image: "still.jpg",
		});
	});

	it("falls back to the backdrop, then the poster", async () => {
		state.historyPull = vi.fn(async () => [row({ id: "a" })]);
		const withBackdrop = await pullEnrichedHistory(
			nuvio(),
			lookup({ poster: "p.jpg", background: "bg.jpg" }),
		);
		expect(withBackdrop.rows[0].image).toBe("bg.jpg");
		const posterOnly = await pullEnrichedHistory(
			nuvio(),
			lookup({ poster: "p.jpg" }),
		);
		expect(posterOnly.rows[0].image).toBe("p.jpg");
	});
});
