<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
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
</script>

<div class="max-w-2xl space-y-2">
	<h1 class="text-2xl font-bold">New Assignment</h1>
	<AssignmentForm {sf} cancelHref="/courses/{data.course.id}/assignments" />
</div>
