<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const inviteSchema = z.object({
		email: z.string().email('Valid email required'),
	});

	const formConfigSchema = z.object({
		googleFormId: z.string().optional(),
		fieldStudentId: z.string().optional(),
		fieldStudentName: z.string().optional(),
		fieldAssignment: z.string().optional(),
		fieldRepoUrl: z.string().optional(),
		fieldPagesUrl: z.string().optional(),
		fieldCommitSha: z.string().optional(),
	});

	// Field order matches the expected prefilled URL order:
	// studentId, studentName, assignment, repoUrl, commitSha, pagesUrl
	const FIELD_ORDER = ['fieldStudentId', 'fieldStudentName', 'fieldAssignment', 'fieldRepoUrl', 'fieldCommitSha', 'fieldPagesUrl'] as const;

	const { form, errors, enhance: sfEnhance, message } = superForm(data.form, {
		validators: zodClient(inviteSchema),
	});

	const {
		form: configForm,
		enhance: configEnhance,
		message: configMessage,
	} = superForm(data.formConfigForm, {
		validators: zodClient(formConfigSchema),
	});

	let prefillUrl = $state('');
	let parseError = $state('');

	function parsePrefillUrl() {
		parseError = '';
		try {
			const url = new URL(prefillUrl.trim());

			// Extract form response ID from path: /forms/d/e/{id}/viewform
			const pathMatch = url.pathname.match(/\/forms\/d\/e\/([^/]+)\//);
			if (pathMatch) {
				// This is the response ID — note it's different from the API form ID
				// We set it but add a note in the UI
				$configForm.googleFormId = pathMatch[1];
			}

			// Extract entry params in order (preserving their position in the URL)
			const entries: string[] = [];
			url.searchParams.forEach((_, key) => {
				if (key.startsWith('entry.')) entries.push(key);
			});

			// Map entries by position to field slots
			FIELD_ORDER.forEach((fieldKey, i) => {
				if (entries[i]) {
					($configForm as any)[fieldKey] = entries[i];
				}
			});

			if (entries.length === 0) parseError = 'No entry.* fields found in URL';
		} catch {
			parseError = 'Invalid URL';
		}
	}
</script>

<div class="max-w-lg space-y-8">
	<div>
		<h1 class="text-2xl font-bold">{data.course.name} — Settings</h1>
	</div>

	<section class="space-y-4">
		<h2 class="text-lg font-semibold">Teaching Assistants</h2>

		{#if data.tas.length > 0}
			<ul class="divide-border divide-y rounded-lg border">
				{#each data.tas as ta (ta.id)}
					<li class="flex items-center justify-between px-4 py-3">
						<div class="flex items-center gap-3">
							{#if ta.image}
								<img src={ta.image} alt={ta.name} class="h-8 w-8 rounded-full" />
							{/if}
							<div>
								<p class="text-sm font-medium">{ta.name}</p>
								<p class="text-muted-foreground text-xs">{ta.email}</p>
							</div>
						</div>
						<form method="post" action="?/remove" use:enhance>
							<input type="hidden" name="userId" value={ta.id} />
							<button type="submit" class="text-destructive hover:text-destructive/80 text-xs">
								Remove
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-muted-foreground text-sm">No TAs assigned yet.</p>
		{/if}

		<form method="post" action="?/invite" use:sfEnhance class="space-y-3">
			<h3 class="text-sm font-medium">Invite TA by email</h3>
			{#if $message}
				<p class="text-sm {$message.startsWith('TA added') ? 'text-green-600' : 'text-destructive'}">
					{$message}
				</p>
			{/if}
			<div class="flex gap-2">
				<input
					name="email"
					type="email"
					bind:value={$form.email}
					placeholder="ta@example.com"
					class="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
				/>
				<button
					type="submit"
					class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
				>
					Invite
				</button>
			</div>
			{#if $errors.email}<p class="text-destructive text-xs">{$errors.email}</p>{/if}
		</form>
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-semibold">Google Forms Sync</h2>
		<p class="text-muted-foreground text-sm">Configure a Google Form to auto-import responses as submissions.</p>

		<!-- Prefill URL parser -->
		<div class="bg-muted/40 rounded-lg border p-4 space-y-2">
			<p class="text-sm font-medium">Quick setup — paste a prefilled form link</p>
			<p class="text-muted-foreground text-xs">
				Open the form → pre-fill all fields with dummy values → copy the URL. Entry IDs will be extracted automatically in order:
				Student ID, Student Name, Assignment, Repo URL, Commit SHA, Pages URL.
			</p>
			<div class="flex gap-2">
				<input
					type="url"
					bind:value={prefillUrl}
					placeholder="https://docs.google.com/forms/d/e/…/viewform?entry.123=…"
					class="border-input bg-background flex-1 rounded-md border px-3 py-1.5 text-sm font-mono"
				/>
				<button
					type="button"
					onclick={parsePrefillUrl}
					class="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap"
				>
					Extract fields
				</button>
			</div>
			{#if parseError}
				<p class="text-destructive text-xs">{parseError}</p>
			{/if}
		</div>

		<form method="post" action="?/saveFormConfig" use:configEnhance class="space-y-3">
			<div class="space-y-1">
				<label for="googleFormId" class="text-sm font-medium">API Form ID</label>
				<input
					id="googleFormId"
					name="googleFormId"
					bind:value={$configForm.googleFormId}
					class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm font-mono"
					placeholder="1FAIpQLSe… or the ID from the edit URL"
				/>
				<p class="text-muted-foreground text-xs">
					For the Forms API, use the ID from the <strong>edit</strong> URL:
					docs.google.com/forms/d/<strong>FORM_ID</strong>/edit
					(different from the viewform URL).
					The prefill parser above fills this from the viewform URL as a starting point.
				</p>
			</div>

			<div class="space-y-2">
				<p class="text-sm font-medium">Field Mappings</p>
				{#each [
					{ name: 'fieldStudentId', label: 'Student ID', key: 'fieldStudentId' as const },
					{ name: 'fieldStudentName', label: 'Student Name', key: 'fieldStudentName' as const },
					{ name: 'fieldAssignment', label: 'Assignment', key: 'fieldAssignment' as const },
					{ name: 'fieldRepoUrl', label: 'Repo URL', key: 'fieldRepoUrl' as const },
					{ name: 'fieldCommitSha', label: 'Commit SHA', key: 'fieldCommitSha' as const },
					{ name: 'fieldPagesUrl', label: 'Pages URL', key: 'fieldPagesUrl' as const },
				] as field}
					<div class="flex items-center gap-3">
						<label for={field.name} class="text-sm w-32 shrink-0 text-right">{field.label}</label>
						<input
							id={field.name}
							name={field.name}
							bind:value={$configForm[field.key]}
							class="border-input bg-background flex-1 rounded-md border px-3 py-1.5 text-sm font-mono"
							placeholder="entry.123456"
						/>
					</div>
				{/each}
			</div>

			{#if $configMessage}
				<p class="text-sm text-green-600">{$configMessage}</p>
			{/if}

			<button
				type="submit"
				class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
			>
				Save Form Config
			</button>
		</form>
	</section>

	<section class="space-y-4">
		<h2 class="text-lg font-semibold text-destructive">Danger Zone</h2>
		<div class="border-destructive/40 rounded-lg border p-4 space-y-2">
			<p class="text-sm font-medium">Delete this course</p>
			<p class="text-muted-foreground text-xs">
				Permanently deletes the course, all assignments, submissions, and grades. This cannot be undone.
			</p>
			<form method="post" action="?/deleteCourse" use:enhance>
				<button
					type="submit"
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-4 py-2 text-sm font-medium"
					onclick={(e) => {
						if (!confirm('Delete this course and ALL its data? This cannot be undone.')) e.preventDefault();
					}}
				>
					Delete Course
				</button>
			</form>
		</div>
	</section>
</div>
