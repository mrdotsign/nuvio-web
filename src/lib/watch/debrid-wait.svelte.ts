import { debridStatus } from "./watch.remote.ts";

// How often a source downloading on debrid is asked about again.
const RECHECK_MS = 5000;

/**
 * A source still to download on the addon's debrid service: opening its link
 * sends the torrent there. Asks where it stands every few seconds while it
 * downloads; the player holds playback (mpv included) on a "sending to debrid"
 * screen while `waiting`. A failure stops the wait, so playing the link
 * surfaces the error.
 */
export function createDebridWait(
	source: () => {
		url: string | null;
		requestHeaders?: Record<string, string>;
	} | null,
) {
	const query = $derived.by(() => {
		const stream = source();
		return stream?.url
			? debridStatus({ url: stream.url, headers: stream.requestHeaders })
			: undefined;
	});
	const waiting = $derived(
		query !== undefined &&
			query.error === undefined &&
			query.current !== "ready" &&
			query.current !== "failed",
	);

	$effect(() => {
		const current = query;
		if (!(current && waiting)) {
			return;
		}
		const timer = setInterval(() => {
			if (!current.loading) {
				void current.refresh();
			}
		}, RECHECK_MS);
		return () => clearInterval(timer);
	});

	return {
		get waiting() {
			return waiting;
		},
		/** The addon confirmed it was sent and is downloading, past the first ask. */
		get downloading() {
			return query?.current === "downloading";
		},
	};
}
