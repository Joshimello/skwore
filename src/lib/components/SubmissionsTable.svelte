<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import GradeDialog from '$lib/components/GradeDialog.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	type Submission = {
		id: string;
		studentId: string;
		studentName: string;
		repoUrl: string | null;
		pagesUrl: string | null;
		commitSha: string | null;
		origin: string | null;
		status: string;
		submittedAt: Date;
		formResponseId: string | null;
		repoJobId: string | null;
		repoJobStatus: string | null;
		distUrl: string | null;
		assignmentId: string | null;
		assignmentName: string | null;
		gradeId: string | null;
		gradeFinalized: boolean | null;
	};

	type Assignment = { id: string; name: string };

	let { submissions, assignments, courseId }: {
		submissions: Submission[];
		assignments: Assignment[];
		courseId: string;
	} = $props();

	let nameFilter = $state('');
	let assignmentFilter = $state('');
	let sorting = $state<{ id: string; desc: boolean }[]>([]);
	let pageIndex = $state(0);
	const PAGE_SIZE = 50;

	const filtered = $derived(
		submissions.filter((s) => {
			const matchesName = !nameFilter ||
				s.studentName.toLowerCase().includes(nameFilter.toLowerCase()) ||
				s.studentId.toLowerCase().includes(nameFilter.toLowerCase());
			const matchesAssignment = !assignmentFilter ||
				(assignmentFilter === '__unassigned__' ? !s.assignmentId : s.assignmentId === assignmentFilter);
			return matchesName && matchesAssignment;
		})
	);

	const sorted = $derived(() => {
		if (sorting.length === 0) return filtered;
		const col = sorting[0];
		return [...filtered].sort((a, b) => {
			let av: any = (a as any)[col.id];
			let bv: any = (b as any)[col.id];
			if (av === null || av === undefined) av = '';
			if (bv === null || bv === undefined) bv = '';
			if (av < bv) return col.desc ? 1 : -1;
			if (av > bv) return col.desc ? -1 : 1;
			return 0;
		});
	});

	const totalPages = $derived(Math.ceil(sorted().length / PAGE_SIZE));
	const paged = $derived(sorted().slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE));

	function toggleSort(col: string) {
		if (sorting.length > 0 && sorting[0].id === col) {
			if (sorting[0].desc) {
				sorting = [];
			} else {
				sorting = [{ id: col, desc: true }];
			}
		} else {
			sorting = [{ id: col, desc: false }];
		}
		pageIndex = 0;
	}

	function sortIcon(col: string) {
		if (sorting.length === 0 || sorting[0].id !== col) return '↕';
		return sorting[0].desc ? '↓' : '↑';
	}

	let previewUrls = $state<Map<string, string>>(new Map());
	let previewLoading = $state<Set<string>>(new Set());

	async function startPreview(submissionId: string) {
		previewLoading = new Set([...previewLoading, submissionId]);
		try {
			const res = await fetch(`/api/preview/${submissionId}`, { method: 'POST' });
			if (res.ok) {
				const { previewUrl } = await res.json();
				previewUrls = new Map([...previewUrls, [submissionId, previewUrl]]);
			}
		} finally {
			previewLoading = new Set([...previewLoading].filter((id) => id !== submissionId));
		}
	}

	async function stopPreview(submissionId: string) {
		await fetch(`/api/preview/${submissionId}`, { method: 'DELETE' });
		const next = new Map(previewUrls);
		next.delete(submissionId);
		previewUrls = next;
	}

	onMount(() => {
		for (const sub of submissions) {
			if (sub.distUrl && sub.repoJobStatus === 'done') {
				fetch(`/api/preview/${sub.id}`)
					.then(r => r.ok ? r.json() : null)
					.then(data => {
						if (data?.previewUrl) {
							previewUrls = new Map([...previewUrls, [sub.id, data.previewUrl]]);
						}
					})
					.catch(() => {});
			}
		}
	});

	let gradeDialogOpen = $state(false);
	let gradeDialogSubmission = $state<Submission | null>(null);

	function openGradeDialog(sub: Submission) {
		gradeDialogSubmission = sub;
		gradeDialogOpen = true;
	}

	let logDialogOpen = $state(false);
	let logDialogSubmission = $state<Submission | null>(null);
	let logContent = $state<{ log: string | null; jobError: string | null; status: string } | null>(null);
	let logLoading = $state(false);

	async function openLogDialog(sub: Submission) {
		logDialogSubmission = sub;
		logContent = null;
		logLoading = true;
		logDialogOpen = true;
		try {
			const res = await fetch(`/api/job-log/${sub.id}`);
			logContent = await res.json();
		} catch {
			logContent = { log: null, jobError: 'Failed to fetch log', status: sub.repoJobStatus ?? '' };
		} finally {
			logLoading = false;
		}
	}

	// Auto-poll while any job is queued/running
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	function schedulePoll() {
		const active = submissions.some(
			(s) => s.repoJobStatus === 'queued' || s.repoJobStatus === 'running'
		);
		if (active) {
			pollTimer = setTimeout(async () => {
				await invalidateAll();
				schedulePoll();
			}, 5000);
		}
	}
	$effect(() => {
		if (pollTimer) clearTimeout(pollTimer);
		schedulePoll();
	});
	onDestroy(() => { if (pollTimer) clearTimeout(pollTimer); });

	function statusBadgeClass(status: string) {
		if (status === 'late') return 'bg-yellow-100 text-yellow-800';
		if (status === 'missing') return 'bg-red-100 text-red-800';
		return 'bg-green-100 text-green-800';
	}
</script>

<div class="space-y-3">
	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-2">
		<input
			type="text"
			placeholder="Search student…"
			bind:value={nameFilter}
			oninput={() => (pageIndex = 0)}
			class="border-input bg-background rounded-md border px-3 py-1.5 text-sm w-48"
		/>
		<select
			bind:value={assignmentFilter}
			onchange={() => (pageIndex = 0)}
			class="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
		>
			<option value="">All assignments</option>
			<option value="__unassigned__">Unassigned</option>
			{#each assignments as a (a.id)}
				<option value={a.id}>{a.name}</option>
			{/each}
		</select>
		<span class="text-muted-foreground text-sm">{filtered.length} submission{filtered.length !== 1 ? 's' : ''}</span>
	</div>

	<!-- Table -->
	<div class="overflow-auto rounded-lg border border-border">
		<table class="w-full text-sm border-collapse">
			<thead>
				<tr class="bg-muted/50 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
					{#each ['studentName', 'assignmentName', 'gradeId', 'repoJobStatus'] as col}
						<th
							class="px-4 py-2.5 text-left font-medium cursor-pointer select-none hover:text-foreground whitespace-nowrap"
							onclick={() => toggleSort(col)}
						>
							{col === 'studentName' ? 'Student' :
							 col === 'assignmentName' ? 'Assignment' :
							 col === 'gradeId' ? 'Grade' : 'AI'}
							<span class="ml-1">{sortIcon(col)}</span>
						</th>
					{/each}
					<th class="px-4 py-2.5 text-left font-medium">Preview</th>
					<th class="px-4 py-2.5 text-right font-medium">Links</th>
				</tr>
			</thead>
			<tbody>
				{#each paged as sub (sub.id)}
					<tr class="border-b border-border last:border-0 hover:bg-muted/20 group">

						<!-- Student: name + ID + status badge -->
						<td class="px-4 py-3">
							<div class="font-medium text-foreground leading-tight">{sub.studentName}</div>
							<div class="flex items-center gap-1.5 mt-0.5">
								<span class="text-xs text-muted-foreground font-mono">{sub.studentId}</span>
								<span class="rounded-full px-1.5 py-px text-[10px] font-medium leading-tight {statusBadgeClass(sub.status)}">
									{sub.status}
								</span>
							</div>
						</td>

						<!-- Assignment -->
						<td class="px-4 py-3">
							{#if sub.assignmentId}
								<span class="text-sm">{sub.assignmentName}</span>
							{:else}
								<form method="post" action="?/assignSubmission" use:enhance class="inline">
									<input type="hidden" name="submissionId" value={sub.id} />
									<select
										name="assignmentId"
										class="border-input bg-background rounded border px-2 py-0.5 text-xs"
										onchange={(e) => {
											const form = (e.target as HTMLSelectElement).closest('form') as HTMLFormElement;
											form.requestSubmit();
										}}
									>
										<option value="">Assign…</option>
										{#each assignments as a (a.id)}
											<option value={a.id}>{a.name}</option>
										{/each}
									</select>
								</form>
							{/if}
						</td>

						<!-- Grade -->
						<td class="px-4 py-3">
							{#if sub.assignmentId}
								{#if sub.gradeFinalized}
									<button
										type="button"
										onclick={() => openGradeDialog(sub)}
										class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer"
									>
										<span>✓</span> Finalized
									</button>
								{:else if sub.gradeId}
									<button
										type="button"
										onclick={() => openGradeDialog(sub)}
										class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200 cursor-pointer"
									>
										Draft
									</button>
								{:else}
									<button
										type="button"
										onclick={() => openGradeDialog(sub)}
										class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary cursor-pointer"
									>
										Grade
									</button>
								{/if}
							{:else}
								<span class="text-muted-foreground text-xs">—</span>
							{/if}
						</td>

						<!-- AI: status + analyze/retry + logs -->
						<td class="px-4 py-3">
							<div class="flex flex-col gap-1">
								{#if sub.repoJobStatus === 'done'}
									<span class="inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">done</span>
								{:else if sub.repoJobStatus === 'running'}
									<span class="inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">running…</span>
								{:else if sub.repoJobStatus === 'queued'}
									<span class="inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">queued</span>
								{:else if sub.repoUrl && sub.assignmentId}
									<form method="post" action="?/analyze" use:enhance>
										<input type="hidden" name="submissionId" value={sub.id} />
										<button type="submit" class="text-xs text-primary hover:underline font-medium">
											{sub.repoJobStatus === 'failed' ? '↺ Retry' : 'Analyze'}
										</button>
									</form>
								{:else}
									<span class="text-muted-foreground text-xs">—</span>
								{/if}
								{#if sub.repoJobId}
									<button
										type="button"
										onclick={() => openLogDialog(sub)}
										class="text-[11px] text-muted-foreground hover:text-foreground w-fit"
									>
										Logs
									</button>
								{/if}
							</div>
						</td>

						<!-- Preview -->
						<td class="px-4 py-3">
							{#if sub.distUrl === null || sub.repoJobStatus !== 'done'}
								<span class="text-muted-foreground text-xs">—</span>
							{:else if previewLoading.has(sub.id)}
								<span class="text-muted-foreground text-xs">Starting…</span>
							{:else if previewUrls.has(sub.id)}
								<div class="flex items-center gap-2">
									<a
										href={previewUrls.get(sub.id)}
										target="_blank"
										rel="noopener"
										class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20"
									>
										Open ↗
									</a>
									<button
										type="button"
										onclick={() => stopPreview(sub.id)}
										class="text-xs text-muted-foreground hover:text-destructive"
									>
										Stop
									</button>
								</div>
							{:else}
								<button
									type="button"
									onclick={() => startPreview(sub.id)}
									class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border border-border hover:border-primary hover:text-primary"
								>
									Preview
								</button>
							{/if}
						</td>

						<!-- Links + remove -->
						<td class="px-4 py-3">
							<div class="flex items-center justify-end gap-2">
								{#if sub.repoUrl}
									<a
										href={sub.repoUrl}
										target="_blank"
										rel="noopener"
										title="Repository"
										class="text-muted-foreground hover:text-foreground text-xs"
									>
										Repo ↗
									</a>
								{/if}
								{#if sub.pagesUrl}
									<a
										href={sub.pagesUrl}
										target="_blank"
										rel="noopener"
										title="Pages"
										class="text-muted-foreground hover:text-foreground text-xs"
									>
										Pages ↗
									</a>
								{/if}
								<form method="post" action="?/removeSubmission" use:enhance>
									<input type="hidden" name="submissionId" value={sub.id} />
									<button
										type="submit"
										title="Remove submission"
										class="text-muted-foreground hover:text-destructive text-xs opacity-0 group-hover:opacity-100 transition-opacity"
										onclick={(e) => {
											if (!confirm('Remove this submission?')) e.preventDefault();
										}}
									>
										✕
									</button>
								</form>
							</div>
						</td>
					</tr>
				{/each}
				{#if paged.length === 0}
					<tr>
						<td colspan="6" class="px-4 py-10 text-center text-muted-foreground text-sm">
							No submissions found.
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="flex items-center gap-2 text-sm">
			<button
				onclick={() => (pageIndex = Math.max(0, pageIndex - 1))}
				disabled={pageIndex === 0}
				class="rounded border px-3 py-1 disabled:opacity-40"
			>
				Previous
			</button>
			<span class="text-muted-foreground">
				Page {pageIndex + 1} of {totalPages}
			</span>
			<button
				onclick={() => (pageIndex = Math.min(totalPages - 1, pageIndex + 1))}
				disabled={pageIndex >= totalPages - 1}
				class="rounded border px-3 py-1 disabled:opacity-40"
			>
				Next
			</button>
		</div>
	{/if}
</div>

<GradeDialog
	submission={gradeDialogSubmission}
	bind:open={gradeDialogOpen}
	{courseId}
/>

<Dialog.Root bind:open={logDialogOpen}>
	<Dialog.Content class="sm:max-w-2xl max-h-[80vh] flex flex-col">
		<Dialog.Header>
			<Dialog.Title>
				AI Grading Log
				{#if logDialogSubmission}
					— <span class="font-normal text-muted-foreground">{logDialogSubmission.studentName}</span>
				{/if}
			</Dialog.Title>
			{#if logContent}
				<Dialog.Description class="text-xs">
					Status: <span class="font-mono">{logContent.status}</span>
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		<div class="flex-1 overflow-y-auto min-h-0">
			{#if logLoading}
				<p class="text-muted-foreground text-sm py-4">Loading…</p>
			{:else if logContent}
				{#if logContent.jobError}
					<div class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs font-mono mb-3">
						Error: {logContent.jobError}
					</div>
				{/if}
				{#if logContent.log}
					<pre class="bg-muted rounded-md p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">{logContent.log}</pre>
				{:else}
					<p class="text-muted-foreground text-sm py-4">No log output available.</p>
				{/if}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
