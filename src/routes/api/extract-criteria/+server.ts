import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401);
	if (!env.REPO_MANAGER_URL) error(503, 'Repo manager not configured');

	const formData = await request.formData();
	const res = await fetch(`${env.REPO_MANAGER_URL}/extract-criteria`, {
		method: 'POST',
		body: formData,
	});

	if (!res.ok) error(res.status as Parameters<typeof error>[0], await res.text());
	return json(await res.json());
};
