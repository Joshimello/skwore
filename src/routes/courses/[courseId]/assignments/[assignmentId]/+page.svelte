<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { enhance } from '$app/forms';
	import { z } from 'zod';
	import AssignmentForm from '$lib/components/AssignmentForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const assignmentSchema = z.object({
		name: z.string().min(1, 'Name is required'),
		description: z.string().optional(),
		deadline: z.string().optional(),
		gitlabCiTemplate: z.string().optional(),
		googleSheetId: z.string().optional(),
		googleSheetRange: z.string().optional(),
		criteria: z.array(
			z.object({
				id: z.string().optional(),
				name: z.string().min(1, 'Criterion name is required'),
				description: z.string().optional(),
				points: z.number().int().min(0),
				order: z.number().int(),
			})
		).default([]),
	});

	const sf = superForm(data.form, {
		validators: zodClient(assignmentSchema),
		dataType: 'json',
	});

	const { message } = sf;
</script>

<div class="max-w-2xl space-y-2">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Edit Assignment</h1>
		<form method="post" action="?/delete" use:enhance>
			<button
				type="submit"
				class="text-destructive hover:text-destructive/80 text-sm"
				onclick={(e) => {
					if (!confirm('Delete this assignment and all its submissions and grades?')) e.preventDefault();
				}}
			>
				Delete Assignment
			</button>
		</form>
	</div>
	{#if $message}
		<p class="text-green-600 text-sm">{$message}</p>
	{/if}
	<AssignmentForm {sf} cancelHref="/courses/{data.course.id}/assignments" />
</div>
