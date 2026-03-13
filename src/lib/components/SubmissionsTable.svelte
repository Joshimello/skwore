<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
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

	function aiStatusClass(status: string | null) {
		if (status === 'done') return 'bg-green-100 text-green-800';
		if (status === 'failed') return 'bg-red-100 text-red-800';
		if (status === 'running') return 'bg-blue-100 text-blue-800';
		if (status === 'queued') return 'bg-muted text-muted-foreground';
		return '';
	}

	function statusBadgeClass(status: string) {
		if (status === 'late') return 'bg-yellow-100 text-yellow-800';
		if (status === 'missing') return 'bg-red-100 text-red-800';
		return 'bg-green-100 text-green-800';
	}
</script>

<div class="space-y-3">
	<!-- Filters -->
	<div class="flex flex-wrap gap-2">
		<input
			type="text"
			placeholder="Filter by student name or ID…"
			bind:value={nameFilter}
			oninput={() => (pageIndex = 0)}
			class="border-input bg-background rounded-md border px-3 py-1.5 text-sm w-64"
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
		<span class="text-muted-foreground self-center text-sm">{filtered.length} submission{filtered.length !== 1 ? 's' : ''}</span>
	</div>

	<!-- Table -->
	<div class="overflow-auto rounded-lg border border-border">
		<table class="w-full text-sm border-collapse">
			<thead>
				<tr class="bg-muted/50 border-b border-border">
					{#each ['studentId', 'studentName', 'assignmentName', 'status', 'repoUrl', 'gradeId', 'repoJobStatus', 'submittedAt'] as col}
						<th
							class="px-3 py-2 text-left font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/70"
							onclick={() => toggleSort(col)}
						>
							{col === 'studentId' ? 'Student ID' :
							 col === 'studentName' ? 'Student' :
							 col === 'assignmentName' ? 'Assignment' :
							 col === 'status' ? 'Status' :
							 col === 'repoUrl' ? 'Repo' :
							 col === 'gradeId' ? 'Grade' :
							 col === 'repoJobStatus' ? 'AI' :
							 'Submitted'}
							<span class="text-muted-foreground ml-1 text-xs">{sortIcon(col)}</span>
						</th>
					{/each}
					<th class="px-3 py-2 text-left font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each paged as sub (sub.id)}
					<tr class="border-b border-border last:border-0 hover:bg-muted/30">
						<td class="px-3 py-2 font-mono text-xs">{sub.studentId}</td>
						<td class="px-3 py-2 whitespace-nowrap">{sub.studentName}</td>
						<td class="px-3 py-2">
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
						<td class="px-3 py-2">
							<span class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadgeClass(sub.status)}">
								{sub.status}
							</span>
						</td>
						<td class="px-3 py-2">
							{#if sub.repoUrl}
								<a href={sub.repoUrl} target="_blank" rel="noopener" class="text-primary hover:underline text-xs font-mono truncate max-w-[120px] block">
									{sub.repoUrl.replace(/^https?:\/\//, '').slice(0, 30)}{sub.repoUrl.length > 40 ? '…' : ''}
								</a>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</td>
						<td class="px-3 py-2">
							{#if sub.assignmentId}
								{#if sub.gradeId}
									<button
										type="button"
										onclick={() => openGradeDialog(sub)}
										class="rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer {sub.gradeFinalized ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'}"
									>
										{sub.gradeFinalized ? 'Finalized' : 'Draft'}
									</button>
								{:else}
									<button
										type="button"
										onclick={() => openGradeDialog(sub)}
										class="text-primary hover:underline text-xs font-medium"
									>
										Grade
									</button>
								{/if}
							{:else}
								<span class="text-muted-foreground text-xs">—</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-xs">
							<div class="flex items-center gap-2">
							{#if sub.repoJobStatus && sub.repoJobStatus !== 'failed'}
								<span class="rounded-full px-2 py-0.5 text-xs font-medium {aiStatusClass(sub.repoJobStatus)}">
									{sub.repoJobStatus}
								</span>
							{:else if sub.repoUrl && sub.assignmentId}
								<form method="post" action="?/analyze" use:enhance>
									<input type="hidden" name="submissionId" value={sub.id} />
									<button type="submit" class="text-primary hover:underline text-xs font-medium">
										{sub.repoJobStatus === 'failed' ? 'Retry' : 'Analyze'}
									</button>
								</form>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
							{#if sub.repoJobId}
								<button
									type="button"
									onclick={() => openLogDialog(sub)}
									class="text-muted-foreground hover:text-foreground text-xs underline"
								>
									Logs
								</button>
							{/if}
							</div>
						</td>
						<td class="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
							{new Date(sub.submittedAt).toLocaleDateString()}
						</td>
						<td class="px-3 py-2">
							<form method="post" action="?/removeSubmission" use:enhance>
								<input type="hidden" name="submissionId" value={sub.id} />
								<button
									type="submit"
									class="text-destructive hover:text-destructive/80 text-xs"
									onclick={(e) => {
										if (!confirm('Remove this submission?')) e.preventDefault();
									}}
								>
									Remove
								</button>
							</form>
						</td>
					</tr>
				{/each}
				{#if paged.length === 0}
					<tr>
						<td colspan="9" class="px-3 py-8 text-center text-muted-foreground text-sm">
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
