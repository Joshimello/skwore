<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import type { z } from 'zod';

	type CriterionData = {
		name: string;
		description?: string;
		points: number;
		order: number;
	};

	type FormData = {
		name: string;
		description?: string;
		deadline?: string;
		gitlabCiTemplate?: string;
		googleSheetId?: string;
		googleSheetRange?: string;
		criteria: CriterionData[];
	};

	let { sf, cancelHref }: { sf: SuperForm<FormData>; cancelHref: string } = $props();

	const { form, errors, enhance } = $derived(sf);

	function addCriterion() {
		$form.criteria = [
			...$form.criteria,
			{ name: '', description: '', points: 0, order: $form.criteria.length },
		];
	}

	function removeCriterion(index: number) {
		$form.criteria = $form.criteria.filter((_, i) => i !== index).map((c, i) => ({ ...c, order: i }));
	}

	let aiFile = $state<File | null>(null);
	let aiText = $state('');
	let aiLoading = $state(false);
	let aiError = $state<string | null>(null);

	async function extractCriteria() {
		aiError = null;
		aiLoading = true;
		try {
			const fd = new FormData();
			if (aiFile) fd.append('pdf', aiFile);
			if (aiText.trim()) fd.append('text', aiText);
			const res = await fetch('/api/extract-criteria', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			const incoming = (data.criteria ?? []).map((c: any, i: number) => ({
				name: c.name ?? '',
				description: c.description ?? '',
				points: Number(c.points) || 0,
				order: $form.criteria.length + i,
			}));
			$form.criteria = [...$form.criteria, ...incoming];
		} catch (e: any) {
			aiError = e.message ?? 'Extraction failed';
		} finally {
			aiLoading = false;
		}
	}
</script>

<form method="post" action="?/save" use:enhance class="space-y-6">
	<div class="space-y-4">
		<h2 class="text-lg font-semibold">Assignment Details</h2>

		<div class="space-y-1">
			<label for="name" class="text-sm font-medium">Name</label>
			<input
				id="name"
				name="name"
				bind:value={$form.name}
				class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
				placeholder="e.g. Assignment 1: Hello World"
			/>
			{#if $errors.name}<p class="text-destructive text-xs">{$errors.name}</p>{/if}
		</div>

		<div class="space-y-1">
			<label for="description" class="text-sm font-medium">Description (optional)</label>
			<textarea
				id="description"
				name="description"
				bind:value={$form.description}
				class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
				rows="2"
			></textarea>
		</div>

		<div class="space-y-1">
			<label for="deadline" class="text-sm font-medium">Deadline (optional)</label>
			<input
				id="deadline"
				name="deadline"
				type="datetime-local"
				bind:value={$form.deadline}
				class="border-input bg-background rounded-md border px-3 py-2 text-sm"
			/>
		</div>

		<details class="space-y-3">
			<summary class="cursor-pointer text-sm font-medium">Advanced options</summary>
			<div class="space-y-3 pt-2">
				<div class="space-y-1">
					<label for="googleSheetId" class="text-sm font-medium">Google Sheet ID</label>
					<input
						id="googleSheetId"
						name="googleSheetId"
						bind:value={$form.googleSheetId}
						class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>
				<div class="space-y-1">
					<label for="googleSheetRange" class="text-sm font-medium">Google Sheet Range</label>
					<input
						id="googleSheetRange"
						name="googleSheetRange"
						bind:value={$form.googleSheetRange}
						class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
						placeholder="e.g. Sheet1!A1:Z100"
					/>
				</div>
				<div class="space-y-1">
					<label for="gitlabCiTemplate" class="text-sm font-medium">GitLab CI Template</label>
					<textarea
						id="gitlabCiTemplate"
						name="gitlabCiTemplate"
						bind:value={$form.gitlabCiTemplate}
						class="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
						rows="4"
					></textarea>
				</div>
			</div>
		</details>
	</div>

	<details class="space-y-3">
		<summary class="cursor-pointer text-sm font-medium">AI Extract Rubric</summary>
		<div class="space-y-3 pt-2">
			<div class="space-y-1">
				<label for="ai-pdf" class="text-xs font-medium">Assignment PDF (optional)</label>
				<input
					id="ai-pdf"
					type="file"
					accept=".pdf"
					onchange={(e) => { aiFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null; }}
					class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
				/>
			</div>
			<div class="space-y-1">
				<label for="ai-text" class="text-xs font-medium">Or paste assignment text</label>
				<textarea
					id="ai-text"
					bind:value={aiText}
					placeholder="Or paste assignment text…"
					class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
					rows="4"
				></textarea>
			</div>
			<button
				type="button"
				onclick={extractCriteria}
				disabled={aiLoading}
				class="border-border hover:bg-muted rounded-md border px-3 py-1 text-sm disabled:opacity-50"
			>
				{#if aiLoading}Extracting…{:else}Extract with AI{/if}
			</button>
			{#if aiError}<p class="text-destructive text-xs">{aiError}</p>{/if}
		</div>
	</details>

	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold">Rubric Criteria</h2>
			<button
				type="button"
				onclick={addCriterion}
				class="border-border hover:bg-muted rounded-md border px-3 py-1 text-sm"
			>
				+ Add Criterion
			</button>
		</div>

		{#if $form.criteria.length === 0}
			<p class="text-muted-foreground text-sm">No criteria yet. Add some to define the rubric.</p>
		{:else}
			<div class="space-y-3">
				{#each $form.criteria as criterion, i (i)}
					<div class="border-border rounded-lg border p-4 space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium">Criterion {i + 1}</span>
							<button
								type="button"
								onclick={() => removeCriterion(i)}
								class="text-destructive hover:text-destructive/80 text-xs"
							>
								Remove
							</button>
						</div>

						<input type="hidden" name="criteria[{i}].order" value={i} />

						<div class="grid grid-cols-3 gap-3">
							<div class="col-span-2 space-y-1">
								<label for="criteria-{i}-name" class="text-xs font-medium">Name</label>
								<input
									id="criteria-{i}-name"
									name="criteria[{i}].name"
									bind:value={$form.criteria[i].name}
									class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
									placeholder="e.g. Code Quality"
								/>
								{#if $errors.criteria?.[i]?.name}
									<p class="text-destructive text-xs">{$errors.criteria[i].name}</p>
								{/if}
							</div>
							<div class="space-y-1">
								<label for="criteria-{i}-points" class="text-xs font-medium">Points</label>
								<input
									id="criteria-{i}-points"
									name="criteria[{i}].points"
									type="number"
									min="0"
									bind:value={$form.criteria[i].points}
									class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
								/>
							</div>
						</div>

						<div class="space-y-1">
							<label for="criteria-{i}-desc" class="text-xs font-medium">Description (optional)</label>
							<input
								id="criteria-{i}-desc"
								name="criteria[{i}].description"
								bind:value={$form.criteria[i].description}
								class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
							/>
						</div>
					</div>
				{/each}
			</div>

			<div class="text-muted-foreground text-sm">
				Total: {$form.criteria.reduce((sum, c) => sum + (c.points || 0), 0)} points
			</div>
		{/if}
	</div>

	<div class="flex gap-3">
		<button
			type="submit"
			class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
		>
			Save
		</button>
		<a href={cancelHref} class="text-muted-foreground hover:text-foreground rounded-md px-4 py-2 text-sm">
			Cancel
		</a>
	</div>
</form>
