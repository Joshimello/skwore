<script lang="ts">
	import { enhance } from '$app/forms';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import type { PageData } from './$types';
	import SubmissionsTable from '$lib/components/SubmissionsTable.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let { data }: { data: PageData } = $props();

	let activeTab = $state<'submissions' | 'assignments'>('submissions');
	let addDialogOpen = $state(false);
	let syncing = $state(false);
	let syncResult = $state<string | null>(null);

	const addManualSchema = z.object({
		studentId: z.string().min(1, 'Required'),
		studentName: z.string().min(1, 'Required'),
		assignmentId: z.string().optional(),
		repoUrl: z.string().url().optional().or(z.literal('')),
		pagesUrl: z.string().url().optional().or(z.literal('')),
		commitSha: z.string().optional(),
	});

	const { form, errors, enhance: sfEnhance, message } = superForm(data.addForm, {
		validators: zodClient(addManualSchema),
		onResult({ result }) {
			if (result.type === 'success') {
				addDialogOpen = false;
			}
		},
	});
</script>

<div class="space-y-4">
	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-2xl font-bold">{data.course.name}</h1>
			{#if data.course.description}
				<p class="text-muted-foreground mt-1">{data.course.description}</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<a
				href="/courses/{data.course.id}/export"
				class="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
			>
				Export CSV
			</a>
			{#if data.user?.role === 'admin'}
				<a
					href="/courses/{data.course.id}/settings"
					class="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
				>
					Settings
				</a>
			{/if}
		</div>
	</div>

	<!-- Tab bar -->
	<div class="border-b border-border flex gap-0">
		<button
			onclick={() => (activeTab = 'submissions')}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'submissions'
				? 'border-primary text-foreground'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Submissions
		</button>
		<button
			onclick={() => (activeTab = 'assignments')}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'assignments'
				? 'border-primary text-foreground'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Assignments ({data.assignments.length})
		</button>
	</div>

	{#if activeTab === 'submissions'}
		<div class="space-y-3">
			<!-- Toolbar -->
			<div class="flex items-center gap-2">
				<Dialog.Root bind:open={addDialogOpen}>
					<Dialog.Trigger
						class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium"
					>
						Add Submission
					</Dialog.Trigger>
					<Dialog.Content class="sm:max-w-md">
						<Dialog.Header>
							<Dialog.Title>Add Submission</Dialog.Title>
							<Dialog.Description>Manually add a student submission.</Dialog.Description>
						</Dialog.Header>
						<form method="post" action="?/addManual" use:sfEnhance class="space-y-4 pt-2">
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<label class="text-sm font-medium">Student ID *</label>
									<input
										name="studentId"
										bind:value={$form.studentId}
										class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
										placeholder="e.g. u1234567"
									/>
									{#if $errors.studentId}<p class="text-destructive text-xs">{$errors.studentId}</p>{/if}
								</div>
								<div class="space-y-1">
									<label class="text-sm font-medium">Student Name *</label>
									<input
										name="studentName"
										bind:value={$form.studentName}
										class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
										placeholder="Full name"
									/>
									{#if $errors.studentName}<p class="text-destructive text-xs">{$errors.studentName}</p>{/if}
								</div>
							</div>
							<div class="space-y-1">
								<label class="text-sm font-medium">Assignment (optional)</label>
								<select
									name="assignmentId"
									bind:value={$form.assignmentId}
									class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
								>
									<option value="">None</option>
									{#each data.assignments as a (a.id)}
										<option value={a.id}>{a.name}</option>
									{/each}
								</select>
							</div>
							<div class="space-y-1">
								<label class="text-sm font-medium">Repo URL (optional)</label>
								<input
									name="repoUrl"
									bind:value={$form.repoUrl}
									type="url"
									class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
									placeholder="https://gitlab.com/..."
								/>
								{#if $errors.repoUrl}<p class="text-destructive text-xs">{$errors.repoUrl}</p>{/if}
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<label class="text-sm font-medium">Pages URL</label>
									<input
										name="pagesUrl"
										bind:value={$form.pagesUrl}
										type="url"
										class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
										placeholder="https://..."
									/>
								</div>
								<div class="space-y-1">
									<label class="text-sm font-medium">Commit SHA</label>
									<input
										name="commitSha"
										bind:value={$form.commitSha}
										class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm font-mono"
										placeholder="abc1234"
									/>
								</div>
							</div>
							{#if $message}
								<p class="text-sm text-green-600">{$message}</p>
							{/if}
							<Dialog.Footer>
								<Dialog.Close class="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm">
									Cancel
								</Dialog.Close>
								<button
									type="submit"
									class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
								>
									Add
								</button>
							</Dialog.Footer>
						</form>
					</Dialog.Content>
				</Dialog.Root>

				{#if data.course.googleFormId}
					<form
						method="post"
						action="?/syncForm"
						use:enhance={() => {
							syncing = true;
							syncResult = null;
							return async ({ result, update }) => {
								syncing = false;
								if (result.type === 'success' && result.data) {
									syncResult = `Synced ${(result.data as any).synced} new response${(result.data as any).synced !== 1 ? 's' : ''}`;
								} else if (result.type === 'failure' && result.data) {
									syncResult = (result.data as any).syncError ?? 'Sync failed';
								}
								await update();
							};
						}}
					>
						<button
							type="submit"
							disabled={syncing}
							class="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
						>
							{syncing ? 'Syncing…' : 'Sync Google Form'}
						</button>
					</form>
					{#if syncResult}
						<span class="text-sm text-muted-foreground">{syncResult}</span>
					{/if}
				{/if}
			</div>

			<SubmissionsTable
				submissions={data.submissions}
				assignments={data.assignments}
				courseId={data.course.id}
			/>
		</div>
	{:else}
		<!-- Assignments tab -->
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground text-sm">
					{data.assignments.length} assignment{data.assignments.length !== 1 ? 's' : ''}
				</span>
				<a
					href="/courses/{data.course.id}/assignments/new"
					class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium"
				>
					New Assignment
				</a>
			</div>

			{#if data.assignments.length === 0}
				<p class="text-muted-foreground text-sm">No assignments yet.</p>
			{:else}
				<div class="space-y-2">
					{#each data.assignments as a (a.id)}
						<div class="border-border rounded-lg border p-4 hover:bg-muted/30">
							<a
								href="/courses/{data.course.id}/assignments/{a.id}"
								class="font-semibold hover:underline"
							>
								{a.name}
							</a>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
