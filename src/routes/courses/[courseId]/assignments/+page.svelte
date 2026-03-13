<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Assignments</h1>
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
		<div class="space-y-3">
			{#each data.assignments as a (a.id)}
				<div class="border-border rounded-lg border p-4">
					<div class="flex items-start justify-between">
						<div>
							<a href="/courses/{data.course.id}/assignments/{a.id}" class="font-semibold hover:underline">
								{a.name}
							</a>
							{#if a.description}
								<p class="text-muted-foreground mt-0.5 text-sm">{a.description}</p>
							{/if}
							{#if a.deadline}
								<p class="text-muted-foreground mt-1 text-xs">
									Due {new Date(a.deadline).toLocaleDateString()}
								</p>
							{/if}
						</div>
						<div class="flex items-center gap-4">
							<span class="text-muted-foreground text-sm">
								{a.criteria.length} criterion{a.criteria.length !== 1 ? 'a' : ''}
								·
								{a.criteria.reduce((sum, c) => sum + c.points, 0)} pts
							</span>
							<a
								href="/courses/{data.course.id}/assignments/{a.id}/submissions"
								class="text-primary hover:underline text-sm"
							>
								Submissions
							</a>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
