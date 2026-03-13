<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Courses</h1>
		{#if data.user?.role === 'admin'}
			<a
				href="/courses/new"
				class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium"
			>
				New Course
			</a>
		{/if}
	</div>

	{#if data.courses.length === 0}
		<p class="text-muted-foreground text-sm">
			{data.user?.role === 'admin'
				? 'No courses yet. Create one to get started.'
				: 'You have not been assigned to any courses.'}
		</p>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.courses as c (c.id)}
				<a
					href="/courses/{c.id}"
					class="border-border bg-card hover:border-primary/50 block rounded-lg border p-4 transition"
				>
					<h2 class="font-semibold">{c.name}</h2>
					{#if c.description}
						<p class="text-muted-foreground mt-1 text-sm">{c.description}</p>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>
