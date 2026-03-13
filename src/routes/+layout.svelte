<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	let { children, data } = $props();

	const isLoginPage = $derived(page.url.pathname.startsWith('/login'));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if !data.user || isLoginPage}
	{@render children()}
	<Toaster />
{:else}
	<Sidebar.Provider>
		<Sidebar.Root>
			<Sidebar.Header>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton size="lg">
							{#snippet child({ props })}
								<a href="/" {...props}>
									<span class="font-bold text-base">Skwore</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Header>

			<Sidebar.Content>
				<Sidebar.Group>
					<Sidebar.GroupLabel>Courses</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each data.courses as c (c.id)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={page.url.pathname.startsWith(`/courses/${c.id}`)}>
										{#snippet child({ props })}
											<a href="/courses/{c.id}" {...props}>{c.name}</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
							{#if data.courses.length === 0}
								<Sidebar.MenuItem>
									<span class="text-muted-foreground px-2 py-1 text-sm">No courses yet</span>
								</Sidebar.MenuItem>
							{/if}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>

				{#if data.user.role === 'admin'}
					<Sidebar.Group>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={page.url.pathname === '/courses/new'}>
										{#snippet child({ props })}
											<a href="/courses/new" {...props}>+ New Course</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				{/if}
			</Sidebar.Content>

			<Sidebar.Footer>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<div class="flex items-center gap-2 px-2 py-1">
							{#if data.user.image}
								<img src={data.user.image} alt={data.user.name} class="h-8 w-8 rounded-full" />
							{/if}
							<div class="flex flex-col min-w-0 flex-1">
								<span class="text-sm font-medium truncate">{data.user.name}</span>
								<span class="text-muted-foreground text-xs truncate">{data.user.email}</span>
							</div>
							<form method="post" action="/api/auth/sign-out" use:enhance>
								<button type="submit" class="text-muted-foreground hover:text-foreground text-xs">
									Sign out
								</button>
							</form>
						</div>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Footer>
		</Sidebar.Root>

		<Sidebar.Inset>
			<header class="flex h-12 items-center gap-2 border-b px-4">
				<Sidebar.Trigger class="-ml-1" />
			</header>
			<main class="p-4">
				{@render children()}
			</main>
			<Toaster />
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
