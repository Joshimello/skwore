<script lang="ts">
	import { tick } from 'svelte';
	import type { SuperForm } from 'sveltekit-superforms';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';

	type ScoreData = {
		criterionId: string;
		score: number;
		comment: string;
	};

	type GradeFormData = {
		submissionId: string;
		comment: string;
		finalized: boolean;
		scores: ScoreData[];
	};

	type Criterion = {
		id: string;
		name: string;
		description: string | null;
		points: number;
		order: number;
	};

	type AiScore = { suggestedScore: number; reasoning: string; status: string };

	let {
		sf,
		criteria,
		isAdmin,
		gradeId,
		aiScores = {},
	}: {
		sf: SuperForm<GradeFormData>;
		criteria: Criterion[];
		isAdmin: boolean;
		gradeId: string | null | undefined;
		aiScores?: Record<string, AiScore>;
	} = $props();

	const { form, enhance } = $derived(sf);

	const isFinalized = $derived($form.finalized);
	const total = $derived($form.scores.reduce((s, sc) => s + (Number(sc.score) || 0), 0));
	const maxTotal = $derived(criteria.reduce((s, c) => s + c.points, 0));

	let showFinalizeDialog = $state(false);
	let formEl: HTMLFormElement;

	function saveDraft() {
		$form.finalized = false;
		formEl.requestSubmit();
	}

	function openFinalizeDialog() {
		showFinalizeDialog = true;
	}

	async function confirmFinalize() {
		showFinalizeDialog = false;
		$form.finalized = true;
		await tick();
		formEl.requestSubmit();
	}
</script>

<form method="post" action="?/save" use:enhance bind:this={formEl} class="space-y-6">
	<div class="space-y-4">
		{#each criteria as criterion, i (criterion.id)}
			<div class="border-border rounded-lg border p-4 space-y-3">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="font-medium text-sm">{criterion.name}</p>
						{#if criterion.description}
							<p class="text-muted-foreground text-xs mt-0.5">{criterion.description}</p>
						{/if}
					</div>
					<div class="flex items-center gap-2 shrink-0">
						<input
							type="number"
							min="0"
							max={criterion.points}
							bind:value={$form.scores[i].score}
							disabled={isFinalized}
							class="border-input bg-background w-20 rounded-md border px-2 py-1 text-sm text-right disabled:opacity-60"
						/>
						<span class="text-muted-foreground text-sm">/ {criterion.points}</span>
					</div>
				</div>
				{#if aiScores[criterion.id]}
					{@const ai = aiScores[criterion.id]}
					<div class="bg-muted/50 rounded-md px-3 py-2 text-xs space-y-0.5">
						<span class="font-medium text-muted-foreground">AI:</span>
						<span class={ai.status === 'pass' ? 'text-green-600' : ai.status === 'fail' ? 'text-destructive' : 'text-yellow-600'}>
							{ai.status ? `${ai.status} — ` : ''}suggested {ai.suggestedScore}pts
						</span>
						<p class="text-muted-foreground">{ai.reasoning}</p>
					</div>
				{/if}
				<div class="space-y-1">
					<label for="score-comment-{i}" class="text-xs text-muted-foreground">Comment (optional)</label>
					<input
						id="score-comment-{i}"
						type="text"
						bind:value={$form.scores[i].comment}
						disabled={isFinalized}
						class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm disabled:opacity-60"
						placeholder="Notes for this criterion..."
					/>
				</div>
			</div>
		{/each}
	</div>

	<div class="space-y-2">
		<label for="overall-comment" class="text-sm font-medium">Overall Comment</label>
		<textarea
			id="overall-comment"
			bind:value={$form.comment}
			disabled={isFinalized}
			rows="3"
			class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
			placeholder="Overall feedback..."
		></textarea>
	</div>

	<div class="flex items-center justify-between">
		<div class="text-sm font-medium">
			Total: <span class="text-lg font-bold">{total}</span>
			<span class="text-muted-foreground">/ {maxTotal}</span>
		</div>
		<div class="flex gap-3">
			{#if !isFinalized}
				<button
					type="button"
					onclick={saveDraft}
					class="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm"
				>
					Save Draft
				</button>
				<button
					type="button"
					onclick={openFinalizeDialog}
					class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
				>
					Finalize
				</button>
			{:else}
				<span class="text-muted-foreground text-sm italic">Grade is finalized</span>
			{/if}
		</div>
	</div>
</form>

{#if isAdmin && isFinalized && gradeId}
	<form method="post" action="?/unfinalize" class="mt-4">
		<input type="hidden" name="gradeId" value={gradeId} />
		<button type="submit" class="text-destructive hover:text-destructive/80 text-sm underline">
			Unfinalize (admin)
		</button>
	</form>
{/if}

<AlertDialog.Root bind:open={showFinalizeDialog}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Finalize grade?</AlertDialog.Title>
				<AlertDialog.Description>
					This will lock the grade. Only admins can unfinalize it.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel onclick={() => (showFinalizeDialog = false)}>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action onclick={confirmFinalize}>Finalize</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
