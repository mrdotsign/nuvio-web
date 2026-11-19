<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import FilmIcon from "@lucide/svelte/icons/film";
	import PlayIcon from "@lucide/svelte/icons/play";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import TvIcon from "@lucide/svelte/icons/tv";
	import { SvelteSet } from "svelte/reactivity";
	import { toast } from "svelte-sonner";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import type { EnrichedHistoryRow } from "#lib/history/history-data.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { resolve } from "$app/paths";

	let { data } = $props();

	pageTitle.set(m.nav_watch_history());

	// Paged in SQLite and joined to addon meta by the load : the page renders
	// what it gets. Rows removed here hide at once; the undo brings them back.
	const historyStream = streamed(() => data.history, {
		rows: [] as EnrichedHistoryRow[],
		total: 0,
		page: 1,
		pageCount: 1,
	});
	const removed = new SvelteSet<string>();
	const rows = $derived(
		historyStream.current.rows.filter((item) => !removed.has(item.id)),
	);
	const total = $derived(
		historyStream.current.total -
			(historyStream.current.rows.length - rows.length),
	);
	const page = $derived(historyStream.current.page);
	const pageCount = $derived(historyStream.current.pageCount);

	function pageHref(target: number): string {
		return target === 1
			? resolve("account/history")
			: `${resolve("account/history")}?page=${target}`;
	}

	function dayLabel(ts: number): string {
		const date = new Date(ts);
		const now = new Date();
		const startOfToday = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();
		const dayMs = 86_400_000;
		if (ts >= startOfToday) {
			return m.account_today();
		}
		if (ts >= startOfToday - dayMs) {
			return m.account_yesterday();
		}
		if (ts >= startOfToday - 6 * dayMs) {
			return date.toLocaleDateString(getLocale(), { weekday: "long" });
		}
		return date.toLocaleDateString(getLocale(), {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	}

	const groups = $derived.by(() => {
		const map = new Map<string, EnrichedHistoryRow[]>();
		for (const item of rows) {
			const label = dayLabel(item.watchedAt);
			const bucket = map.get(label);
			if (bucket) {
				bucket.push(item);
			} else {
				map.set(label, [item]);
			}
		}
		return [...map.entries()];
	});

	function episodeTag(season: number | null, episode: number | null): string {
		if (season == null || episode == null) {
			return "";
		}
		return `S${season}E${episode}`;
	}

	function watchHref(item: EnrichedHistoryRow): string {
		const videoId =
			item.type === "series" && item.season != null && item.episode != null
				? `${item.contentId}:${item.season}:${item.episode}`
				: item.contentId;
		return resolve(
			`player/${encodeURIComponent(item.type)}/${encodeURIComponent(videoId)}`,
		);
	}

	function remove(item: EnrichedHistoryRow) {
		sync.deleteHistory(item);
		removed.add(item.id);
		toast(m.common_removed_title({ title: item.title }), {
			action: {
				label: m.common_undo(),
				onClick: () => {
					removed.delete(item.id);
					sync.restoreHistory({
						id: item.id,
						contentId: item.contentId,
						contentType: item.type,
						title: item.title,
						season: item.season,
						episode: item.episode,
						watchedAt: item.watchedAt,
					});
				},
			},
		});
	}
</script>

<div class="flex flex-col gap-8">
  <p class="text-sm text-muted-foreground">
    {m.account_history_count({ count: total })}
  </p>

  {#if !historyStream.ready}
    <div class="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2200px]:grid-cols-6">
      {#each { length: 14 } as _skeleton, i (i)}
        <div class="flex flex-col gap-2.5">
          <div class="skeleton aspect-video rounded-xl"></div>
          <div class="skeleton h-3.5 w-3/4 rounded"></div>
          <div class="skeleton h-3 w-2/5 rounded"></div>
        </div>
      {/each}
    </div>
  {:else if groups.length === 0}
    <EmptyState
      icon={ClockIcon}
      title={m.account_history_empty_title()}
      description={m.account_history_empty_description()}
    >
      {#snippet actions()}
        <Button href={resolve("discover")} variant="outline"
          >{m.account_find_something()}</Button
        >
      {/snippet}
    </EmptyState>
  {:else}
    {#each groups as [label, groupRows] (label)}
      <section class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <h2
            class="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {label}
          </h2>
          <span
            class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
          >
            {groupRows.length}
          </span>
          <span class="h-px flex-1 bg-border" aria-hidden="true"></span>
        </div>
        <div class="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2200px]:grid-cols-6">
          {#each groupRows as item (item.id)}
            {@const tag = episodeTag(item.season, item.episode)}
            <div class="group/poster flex min-w-0 flex-col gap-2.5">
              <div
                class="relative transition-transform duration-300 ease-out group-hover/poster:-translate-y-1"
              >
                <a
                  href={watchHref(item)}
                  aria-label={[
                    item.type === "series"
                      ? m.account_rewatch_episode()
                      : m.account_rewatch(),
                    item.title,
                    tag,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  class="relative block aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-border transition-shadow duration-300 group-hover/poster:shadow-[0_24px_50px_-16px] group-hover/poster:shadow-black/70 group-hover/poster:ring-primary/60 dark:ring-white/10"
                >
                  <span
                    class="absolute inset-0 flex items-center justify-center bg-linear-to-br from-muted via-muted to-background"
                  >
                    {#if item.type === "series"}
                      <TvIcon class="size-7 text-muted-foreground/50" />
                    {:else}
                      <FilmIcon class="size-7 text-muted-foreground/50" />
                    {/if}
                  </span>
                  {#if item.image}
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      class="relative size-full object-cover transition-transform duration-200 ease-out group-hover/poster:scale-[1.06]"
                    />
                  {/if}
                  <span
                    class="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100"
                  ></span>
                  <span
                    class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100"
                  >
                    <span
                      class="flex size-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md"
                    >
                      <PlayIcon class="size-5 translate-x-px fill-white" />
                    </span>
                  </span>
                  {#if tag}
                    <span
                      class="absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums ring-1 ring-white/15 backdrop-blur-md"
                    >
                      {tag}
                    </span>
                  {/if}
                </a>
                <button
                  type="button"
                  aria-label={m.account_remove_from_history()}
                  onclick={() => remove(item)}
                  class="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-destructive sm:opacity-0 sm:group-hover/poster:opacity-100 sm:focus-visible:opacity-100"
                >
                  <Trash2Icon class="size-4" />
                </button>
              </div>
              <div class="flex min-w-0 flex-col gap-0.5 px-0.5">
                <a
                  href={resolve(
                    `detail/${encodeURIComponent(item.type)}/${encodeURIComponent(item.contentId)}`,
                  )}
                  class="truncate text-sm font-medium transition-colors hover:text-primary"
                  >{item.title}</a
                >
                <p class="truncate text-xs text-muted-foreground tabular-nums">
                  {[
                    item.episodeTitle,
                    new Date(item.watchedAt).toLocaleTimeString(getLocale(), {
                      hour: "numeric",
                      minute: "2-digit",
                    }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/each}

    {#if pageCount > 1}
      <nav
        class="flex items-center justify-center gap-3"
        aria-label={m.common_page({
          page: page,
          count: pageCount,
        })}
      >
        <Button
          variant="outline"
          size="icon"
          class="rounded-full"
          href={page > 1 ? pageHref(page - 1) : undefined}
          disabled={page === 1}
          aria-label={m.common_page_previous()}
        >
          <ChevronLeftIcon />
        </Button>
        <span class="text-sm text-muted-foreground tabular-nums">
          {m.common_page({ page: page, count: pageCount })}
        </span>
        <Button
          variant="outline"
          size="icon"
          class="rounded-full"
          href={page < pageCount
            ? pageHref(page + 1)
            : undefined}
          disabled={page === pageCount}
          aria-label={m.common_page_next()}
        >
          <ChevronRightIcon />
        </Button>
      </nav>
    {/if}
  {/if}
</div>
