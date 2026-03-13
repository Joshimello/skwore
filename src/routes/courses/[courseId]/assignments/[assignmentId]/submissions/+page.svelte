<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const addOneSchema = z.object({
		studentId: z.string().min(1),
		studentName: z.string().min(1),
		repoUrl: z.string().url().optional().or(z.literal('')),
		pagesUrl: z.string().url().optional().or(z.literal('')),
	});

	const importSchema = z.object({
		csv: z.string().min(1, 'Paste CSV content'),
	});

	const addSf = superForm(data.addForm, {
		validators: zodClient(addOneSchema),
		dataType: 'form',
		onUpdated({ form }) {
			if (form.message) toast.success(form.message);
		},
	});
	const { form: addForm, errors: addErrors, enhance: addEnhance } = $derived(addSf);

	const importSf = superForm(data.importForm, {
		validators: zodClient(importSchema),
		dataType: 'form',
		onUpdated({ form }) {
			if (form.message) toast.success(form.message);
		},
	});
	const { form: importForm, errors: importErrors, enhance: importEnhance } = $derived(importSf);

	function gradeStatus(row: (typeof data.submissions)[number]) {
		if (!row.gradeId) return 'Ungraded';
		if (row.finalized) return 'Finalized';
		return 'Draft';
	}

	function jobStatusLabel(status: string | null) {
		if (status === 'queued') return 'Queued';
		if (status === 'running') return 'Running';
		if (status === 'done') return 'Done';
		if (status === 'failed') return 'Failed';
		return null;
	}

	function jobStatusClass(status: string | null) {
		if (status === 'done') return 'bg-green-100 text-green-800';
		if (status === 'failed') return 'bg-red-100 text-red-800';
		if (status === 'running') return 'bg-blue-100 text-blue-800';
		return 'bg-muted text-muted-foreground';
	}

	const draftCount = $derived(data.submissions.filter((s) => s.gradeId && !s.finalized).length);

	// Auto-refresh while any job is in progress
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	function schedulePoll() {
		const active = data.submissions.some(
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
	onDestroy(() => {
		if (pollTimer) clearTimeout(pollTimer);
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<a
				href="/courses/{data.course.id}/assignments"
				class="text-muted-foreground hover:text-foreground text-sm"
			>
				← Assignments
			</a>
			<h1 class="text-2xl font-bold">{data.assignment.name} — Submissions</h1>
		</div>
		<a
			href="/grade/{data.assignment.id}"
			class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
		>
			Grade this assignment →
		</a>
	</div>

	<div class="flex items-center justify-between">
		<p class="text-muted-foreground text-sm">{data.submissions.length} submission{data.submissions.length !== 1 ? 's' : ''}</p>
		{#if data.user?.role === 'admin' && draftCount > 0}
			<form method="post" action="?/bulkFinalize">
				<button
					type="submit"
					class="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
					onclick={(e) => {
						if (!confirm(`Finalize all ${draftCount} draft grade${draftCount !== 1 ? 's' : ''}?`)) e.preventDefault();
					}}
				>
					Finalize {draftCount} draft{draftCount !== 1 ? 's' : ''}
				</button>
			</form>
		{/if}
	</div>

	{#if data.submissions.length > 0}
		<div class="border-border rounded-lg border overflow-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b">
						<th class="px-4 py-2 text-left font-medium">Student ID</th>
						<th class="px-4 py-2 text-left font-medium">Name</th>
						<th class="px-4 py-2 text-left font-medium">Repo</th>
						<th class="px-4 py-2 text-left font-medium">Pages</th>
						<th class="px-4 py-2 text-left font-medium">Grade</th>
						<th class="px-4 py-2 text-left font-medium">AI</th>
						<th class="px-4 py-2 text-left font-medium">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.submissions as s (s.id)}
						<tr class="border-b last:border-0 hover:bg-muted/50">
							<td class="px-4 py-2 font-mono text-xs">{s.studentId}</td>
							<td class="px-4 py-2">{s.studentName}</td>
							<td class="px-4 py-2">
								{#if s.repoUrl}
									<a href={s.repoUrl} target="_blank" class="text-blue-600 hover:underline text-xs">Repo</a>
								{:else}
									<span class="text-muted-foreground text-xs">—</span>
								{/if}
							</td>
							<td class="px-4 py-2">
								{#if s.distUrl}
									<a href={s.distUrl} target="_blank" class="text-blue-600 hover:underline text-xs">Preview →</a>
								{:else if s.pagesUrl}
									<a href={s.pagesUrl} target="_blank" class="text-blue-600 hover:underline text-xs">Pages</a>
								{:else}
									<span class="text-muted-foreground text-xs">—</span>
								{/if}
							</td>
							<td class="px-4 py-2">
								<a
									href="/grade/{data.assignment.id}?submission={s.id}"
									class="rounded px-2 py-0.5 text-xs font-medium {gradeStatus(s) === 'Finalized'
										? 'bg-green-100 text-green-800'
										: gradeStatus(s) === 'Draft'
											? 'bg-yellow-100 text-yellow-800'
											: 'bg-muted text-muted-foreground'}"
								>
									{gradeStatus(s)}
								</a>
							</td>
							<td class="px-4 py-2">
								{#if jobStatusLabel(s.repoJobStatus)}
									<span class="rounded px-2 py-0.5 text-xs font-medium {jobStatusClass(s.repoJobStatus)}">
										{jobStatusLabel(s.repoJobStatus)}
									</span>
								{:else if s.repoUrl}
									<form method="post" action="?/analyze">
										<input type="hidden" name="submissionId" value={s.id} />
										<button type="submit" class="text-primary hover:underline text-xs font-medium">
											Analyze
										</button>
									</form>
								{:else}
									<span class="text-muted-foreground text-xs">—</span>
								{/if}
								{#if s.repoJobStatus === 'failed' && s.repoUrl}
									<form method="post" action="?/analyze" class="mt-1">
										<input type="hidden" name="submissionId" value={s.id} />
										<button type="submit" class="text-xs text-muted-foreground hover:underline">
											Retry
										</button>
									</form>
								{/if}
							</td>
							<td class="px-4 py-2">
								<form method="post" action="?/remove">
									<input type="hidden" name="id" value={s.id} />
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
				</tbody>
			</table>
		</div>
	{/if}

	<details class="border-border rounded-lg border p-4 space-y-3">
		<summary class="cursor-pointer font-medium text-sm">Import CSV</summary>
		<div class="pt-3 space-y-3">
			<p class="text-muted-foreground text-xs">
				Expected format: <code class="bg-muted rounded px-1">studentId,studentName,repoUrl,pagesUrl</code>
				(header row optional, repoUrl/pagesUrl optional)
			</p>
			<form method="post" action="?/importCsv" use:importEnhance class="space-y-3">
				<textarea
					name="csv"
					bind:value={$importForm.csv}
					rows="6"
					placeholder="s12345,Alice Smith,https://gitlab.com/...,https://..."
					class="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-xs"
				></textarea>
				{#if $importErrors.csv}<p class="text-destructive text-xs">{$importErrors.csv}</p>{/if}
				<button
					type="submit"
					class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
				>
					Import
				</button>
			</form>
		</div>
	</details>

	<details class="border-border rounded-lg border p-4 space-y-3">
		<summary class="cursor-pointer font-medium text-sm">Add Student Manually</summary>
		<div class="pt-3">
			<form method="post" action="?/addOne" use:addEnhance class="space-y-3">
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1">
						<label for="studentId" class="text-xs font-medium">Student ID</label>
						<input
							id="studentId"
							name="studentId"
							bind:value={$addForm.studentId}
							class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
							placeholder="s12345"
						/>
						{#if $addErrors.studentId}<p class="text-destructive text-xs">{$addErrors.studentId}</p>{/if}
					</div>
					<div class="space-y-1">
						<label for="studentName" class="text-xs font-medium">Student Name</label>
						<input
							id="studentName"
							name="studentName"
							bind:value={$addForm.studentName}
							class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
							placeholder="Alice Smith"
						/>
						{#if $addErrors.studentName}<p class="text-destructive text-xs">{$addErrors.studentName}</p>{/if}
					</div>
					<div class="space-y-1">
						<label for="repoUrl" class="text-xs font-medium">Repo URL (optional)</label>
						<input
							id="repoUrl"
							name="repoUrl"
							bind:value={$addForm.repoUrl}
							class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
							placeholder="https://gitlab.com/..."
						/>
						{#if $addErrors.repoUrl}<p class="text-destructive text-xs">{$addErrors.repoUrl}</p>{/if}
					</div>
					<div class="space-y-1">
						<label for="pagesUrl" class="text-xs font-medium">Pages URL (optional)</label>
						<input
							id="pagesUrl"
							name="pagesUrl"
							bind:value={$addForm.pagesUrl}
							class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
							placeholder="https://..."
						/>
						{#if $addErrors.pagesUrl}<p class="text-destructive text-xs">{$addErrors.pagesUrl}</p>{/if}
					</div>
				</div>
				<button
					type="submit"
					class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
				>
					Add Student
				</button>
			</form>
		</div>
	</details>
</div>
