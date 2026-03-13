<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { invalidateAll } from '$app/navigation';

	type Submission = {
		id: string;
		studentId: string;
		studentName: string;
		repoUrl: string | null;
		pagesUrl: string | null;
		assignmentId: string | null;
		gradeId: string | null;
		gradeFinalized: boolean | null;
	};

	type Criterion = {
		id: string;
		name: string;
		description: string | null;
		points: number;
		order: number;
	};

	type AiScore = { suggestedScore: number; reasoning: string };

	type GradeData = {
		criteria: Criterion[];
		gradeId: string | null;
		finalized: boolean;
		comment: string;
		scores: { criterionId: string; score: number; comment: string }[];
		aiScores: Record<string, AiScore>;
	};

	let {
		submission,
		open = $bindable(false),
		courseId,
	}: {
		submission: Submission | null;
		open: boolean;
		courseId: string;
	} = $props();

	let gradeData = $state<GradeData | null>(null);
	let loading = $state(false);
	let scores = $state<{ criterionId: string; score: number; comment: string }[]>([]);
	let comment = $state('');
	let finalized = $state(false);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let showFinalizeConfirm = $state(false);

	$effect(() => {
		if (open && submission) {
			loadGradeData();
		} else if (!open) {
			gradeData = null;
			saveError = null;
		}
	});

	async function loadGradeData() {
		loading = true;
		gradeData = null;
		try {
			const res = await fetch(`/api/grade-data/${submission!.assignmentId}/${submission!.id}`);
			if (!res.ok) throw new Error(await res.text());
			const data: GradeData = await res.json();
			gradeData = data;
			const hasExistingScores = data.scores.some((s) => s.score > 0 || s.comment);
			scores = data.scores.map((s) => {
				if (!hasExistingScores && data.aiScores[s.criterionId]) {
					const ai = data.aiScores[s.criterionId];
					return { criterionId: s.criterionId, score: ai.suggestedScore, comment: ai.reasoning };
				}
				return { ...s };
			});
			comment = data.comment;
			finalized = data.finalized;
		} catch (e) {
			saveError = 'Failed to load grade data';
		} finally {
			loading = false;
		}
	}

	const total = $derived(scores.reduce((s, sc) => s + (Number(sc.score) || 0), 0));
	const maxTotal = $derived(gradeData?.criteria.reduce((s, c) => s + c.points, 0) ?? 0);

	async function save(isFinalizing: boolean) {
		if (!submission || !gradeData) return;
		saving = true;
		saveError = null;
		try {
			const body = {
				submissionId: submission.id,
				comment,
				finalized: isFinalizing,
				scores,
			};
			const res = await fetch(`/courses/${courseId}?/gradeSubmission`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text);
			}
			finalized = isFinalizing;
			gradeData = { ...gradeData, finalized: isFinalizing };
			await invalidateAll();
			if (isFinalizing) open = false;
		} catch {
			saveError = 'Failed to save grade';
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			{#if submission}
				<Dialog.Title>{submission.studentName}</Dialog.Title>
				<Dialog.Description class="flex gap-3 text-xs">
					<span class="font-mono">{submission.studentId}</span>
					{#if submission.repoUrl}
						<a href={submission.repoUrl} target="_blank" rel="noopener" class="text-primary hover:underline">
							Repo ↗
						</a>
					{/if}
					{#if submission.pagesUrl}
						<a href={submission.pagesUrl} target="_blank" rel="noopener" class="text-primary hover:underline">
							Pages ↗
						</a>
					{/if}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if loading}
			<div class="py-8 text-center text-muted-foreground text-sm">Loading…</div>
		{:else if gradeData}
			<div class="space-y-3 py-2">
				{#each gradeData.criteria as criterion, i (criterion.id)}
					<div class="border-border rounded-lg border p-3 space-y-2">
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
									bind:value={scores[i].score}
									disabled={finalized}
									class="border-input bg-background w-20 rounded-md border px-2 py-1 text-sm text-right disabled:opacity-60"
								/>
								<span class="text-muted-foreground text-sm">/ {criterion.points}</span>
							</div>
						</div>
						{#if gradeData.aiScores[criterion.id]}
							{@const ai = gradeData.aiScores[criterion.id]}
							<div class="bg-muted/50 rounded-md px-3 py-2 text-xs space-y-0.5">
								<span class="font-medium text-muted-foreground">AI suggestion: </span>
								<span class="text-yellow-600">{ai.suggestedScore} pts</span>
								<p class="text-muted-foreground mt-0.5">{ai.reasoning}</p>
							</div>
						{/if}
						<input
							type="text"
							bind:value={scores[i].comment}
							disabled={finalized}
							placeholder="Comment (optional)"
							class="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm disabled:opacity-60"
						/>
					</div>
				{/each}

				<div class="space-y-1">
					<label for="grade-dialog-comment" class="text-sm font-medium">Overall Comment</label>
					<textarea
						id="grade-dialog-comment"
						bind:value={comment}
						disabled={finalized}
						rows="2"
						class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
						placeholder="Overall feedback…"
					></textarea>
				</div>

				{#if saveError}
					<p class="text-destructive text-xs">{saveError}</p>
				{/if}

				<div class="flex items-center justify-between pt-1">
					<span class="text-sm font-medium">
						Total: <span class="text-lg font-bold">{total}</span>
						<span class="text-muted-foreground">/ {maxTotal}</span>
					</span>
					{#if finalized}
						<span class="text-muted-foreground text-sm italic">Grade finalized</span>
					{:else}
						<div class="flex gap-2">
							<button
								type="button"
								onclick={() => save(false)}
								disabled={saving}
								class="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
							>
								Save Draft
							</button>
							<button
								type="button"
								onclick={() => (showFinalizeConfirm = true)}
								disabled={saving}
								class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
							>
								Finalize
							</button>
						</div>
					{/if}
				</div>
			</div>
		{:else if saveError}
			<p class="py-4 text-destructive text-sm">{saveError}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={showFinalizeConfirm}>
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
				<AlertDialog.Cancel onclick={() => (showFinalizeConfirm = false)}>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action onclick={() => { showFinalizeConfirm = false; save(true); }}>Finalize</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
