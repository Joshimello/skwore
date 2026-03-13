<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { invalidateAll, beforeNavigate } from '$app/navigation';
	import GradeForm from '$lib/components/GradeForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const gradeSchema = z.object({
		submissionId: z.string(),
		comment: z.string().default(''),
		finalized: z.boolean().default(false),
		scores: z.array(
			z.object({
				criterionId: z.string(),
				score: z.number().int().min(0),
				comment: z.string().default(''),
			})
		),
	});

	const sf = superForm(data.form, {
		validators: zodClient(gradeSchema),
		dataType: 'json',
		async onUpdated({ form }) {
			if (form.message) toast.success(form.message);
			await invalidateAll();
		},
	});

	const { tainted } = $derived(sf);

	beforeNavigate(({ cancel }) => {
		if ($tainted && !confirm('You have unsaved changes. Leave anyway?')) {
			cancel();
		}
	});

	const activeSubmission = $derived(data.activeSubmission);

	// Compute prev/next ungraded for navigation
	const currentIndex = $derived(
		activeSubmission ? data.submissions.findIndex((s) => s.id === activeSubmission!.id) : -1
	);

	const prevUngraded = $derived(() => {
		if (currentIndex < 0) return null;
		for (let i = currentIndex - 1; i >= 0; i--) {
			if (data.submissions[i].gradeStatus !== 'finalized') return data.submissions[i];
		}
		return null;
	});

	const nextUngraded = $derived(() => {
		if (currentIndex < 0) return null;
		for (let i = currentIndex + 1; i < data.submissions.length; i++) {
			if (data.submissions[i].gradeStatus !== 'finalized') return data.submissions[i];
		}
		return null;
	});

	function submissionUrl(id: string) {
		return `/grade/${data.assignment.id}?submission=${id}`;
	}

	function queueUrl() {
		return `/grade/${data.assignment.id}`;
	}

	const totalPoints = $derived(data.criteria.reduce((s, c) => s + c.points, 0));

	function statusBadgeClass(status: string) {
		if (status === 'finalized') return 'bg-green-100 text-green-800';
		if (status === 'draft') return 'bg-yellow-100 text-yellow-800';
		return 'bg-muted text-muted-foreground';
	}

	function statusLabel(status: string) {
		if (status === 'finalized') return 'Finalized';
		if (status === 'draft') return 'Draft';
		return 'Ungraded';
	}
</script>

{#if !activeSubmission}
	<!-- Queue view -->
	<div class="space-y-6">
		<div class="flex items-center justify-between">
			<div>
				<a href="/courses/{data.course.id}/assignments" class="text-muted-foreground hover:text-foreground text-sm">
					← {data.course.name}
				</a>
				<h1 class="text-2xl font-bold mt-1">{data.assignment.name}</h1>
				<div class="text-muted-foreground text-sm mt-0.5 flex gap-4">
					{#if data.assignment.deadline}
						<span>Due {new Date(data.assignment.deadline).toLocaleDateString()}</span>
					{/if}
					<span>{totalPoints} pts total</span>
					<span>{data.submissions.length} submissions</span>
				</div>
			</div>
		</div>

		{#if data.submissions.length === 0}
			<p class="text-muted-foreground text-sm">No submissions yet.</p>
		{:else}
			<div class="border-border rounded-lg border overflow-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b">
							<th class="px-4 py-2 text-left font-medium">Student ID</th>
							<th class="px-4 py-2 text-left font-medium">Name</th>
							<th class="px-4 py-2 text-left font-medium">Repo</th>
							<th class="px-4 py-2 text-left font-medium">Pages</th>
							<th class="px-4 py-2 text-left font-medium">Status</th>
							<th class="px-4 py-2 text-left font-medium">Action</th>
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
									{#if s.pagesUrl}
										<a href={s.pagesUrl} target="_blank" class="text-blue-600 hover:underline text-xs">Pages</a>
									{:else}
										<span class="text-muted-foreground text-xs">—</span>
									{/if}
								</td>
								<td class="px-4 py-2">
									<span class="rounded px-2 py-0.5 text-xs font-medium {statusBadgeClass(s.gradeStatus)}">
										{statusLabel(s.gradeStatus)}
									</span>
								</td>
								<td class="px-4 py-2">
									<a
										href={submissionUrl(s.id)}
										class="text-primary hover:underline text-xs font-medium"
									>
										Grade →
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{:else}
	<!-- Grading view -->
	<div class="space-y-6 max-w-2xl">
		<div class="flex items-center justify-between">
			<a href={queueUrl()} class="text-muted-foreground hover:text-foreground text-sm">
				← Back to queue
			</a>
			<div class="flex gap-3 text-sm">
				{#if prevUngraded()}
					<a href={submissionUrl(prevUngraded()!.id)} class="text-primary hover:underline">
						← Prev Ungraded
					</a>
				{/if}
				{#if nextUngraded()}
					<a href={submissionUrl(nextUngraded()!.id)} class="text-primary hover:underline">
						Next Ungraded →
					</a>
				{/if}
			</div>
		</div>

		<div class="border-border rounded-lg border p-4 space-y-2">
			<div class="flex items-baseline gap-3">
				<h2 class="text-xl font-bold">{activeSubmission.studentName}</h2>
				<span class="text-muted-foreground font-mono text-sm">{activeSubmission.studentId}</span>
			</div>
			<div class="flex gap-4 text-sm">
				{#if activeSubmission.repoUrl}
					<a href={activeSubmission.repoUrl} target="_blank" class="text-blue-600 hover:underline">
						Repo ↗
					</a>
				{/if}
				{#if activeSubmission.pagesUrl}
					<a href={activeSubmission.pagesUrl} target="_blank" class="text-blue-600 hover:underline">
						Pages ↗
					</a>
				{/if}
			</div>
		</div>

		<GradeForm
			{sf}
			criteria={data.criteria}
			isAdmin={data.user?.role === 'admin'}
			gradeId={activeSubmission.gradeId}
			aiScores={data.aiScores}
		/>
	</div>
{/if}
