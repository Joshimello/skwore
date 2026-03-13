<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const courseSchema = z.object({
		name: z.string().min(1, 'Name is required'),
		description: z.string().optional(),
	});

	const { form, errors, enhance } = superForm(data.form, {
		validators: zodClient(courseSchema),
	});
</script>

<div class="max-w-lg space-y-6">
	<h1 class="text-2xl font-bold">New Course</h1>

	<form method="post" use:enhance class="space-y-4">
		<div class="space-y-1">
			<label for="name" class="text-sm font-medium">Name</label>
			<input
				id="name"
				name="name"
				bind:value={$form.name}
				class="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
				placeholder="e.g. CS101 Spring 2026"
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
				rows="3"
				placeholder="Brief description of the course"
			></textarea>
		</div>

		<div class="flex gap-3">
			<button
				type="submit"
				class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
			>
				Create Course
			</button>
			<a href="/" class="text-muted-foreground hover:text-foreground rounded-md px-4 py-2 text-sm">
				Cancel
			</a>
		</div>
	</form>
</div>
