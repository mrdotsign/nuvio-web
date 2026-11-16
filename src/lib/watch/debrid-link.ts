import { readJsonCapped, safeFetch } from "#lib/server/safe-fetch.js";

export type DebridLinkStatus = "ready" | "downloading" | "failed";

// The addon polls its debrid service for a few seconds before it answers.
const CHECK_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 4096;

/**
 * Where a debrid link an addon flagged `debridDownload` stands. Opening it sends
 * the torrent to the debrid service; until the file is there the addon answers
 * 503 `{"status":"downloading"}`, then it redirects to the file. One byte of
 * the file is asked for, so the redirect is followed to a link that works.
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
	if (response.ok) {
		await response.body?.cancel().catch(() => undefined);
		return "ready";
	}
	if (response.status === 503) {
		const body = await readJsonCapped(response, MAX_BODY_BYTES).catch(
			() => null,
		);
		if ((body as { status?: unknown } | null)?.status === "downloading") {
			return "downloading";
		}
		return "failed";
	}
	await response.body?.cancel().catch(() => undefined);
	return "failed";
}
