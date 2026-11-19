import { readJsonCapped, safeFetch } from "#lib/server/safe-fetch.js";

export type DebridLinkStatus = "ready" | "downloading" | "failed";

// The addon polls its debrid service for a few seconds before it answers.
const CHECK_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 4096;

/**
 * Where a debrid link an addon flagged `debridDownload` stands. Opening it sends
 * the torrent to the debrid service; until the file is there the addon answers
 * 202 `{"status":"downloading"}`, then it redirects to the file. One byte of
 * the file is asked for, so the redirect is followed to a link that works.
 * Not a 503: a reverse proxy's error pages (Homerun's) replace a 5xx body.
 */
export async function debridLinkStatus(
	url: string,
	fetchImpl: typeof fetch,
	requestHeaders: Record<string, string> = {},
): Promise<DebridLinkStatus> {
	let response: Response;
	try {
		response = await safeFetch(
			url,
			fetchImpl,
			{
				headers: { ...requestHeaders, range: "bytes=0-0" },
				signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
			},
			{ allowHttp: true },
		);
	} catch {
		return "failed";
	}
	if (response.status === 202) {
		const body = await readJsonCapped(response, MAX_BODY_BYTES).catch(
			() => null,
		);
		if ((body as { status?: unknown } | null)?.status === "downloading") {
			return "downloading";
		}
		return "failed";
	}
	if (response.ok) {
		await response.body?.cancel().catch(() => undefined);
		return "ready";
	}
	await response.body?.cancel().catch(() => undefined);
	return "failed";
}
