import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { submission } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

async function getJobId(submissionId: string): Promise<string> {
	if (!env.REPO_MANAGER_URL) error(503, 'Repo manager not configured');

	const [sub] = await db
		.select({ repoJobId: submission.repoJobId })
		.from(submission)
		.where(eq(submission.id, submissionId));

	if (!sub?.repoJobId) error(404, 'No job for this submission');
	return sub.repoJobId;
}

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const jobId = await getJobId(params.submissionId);

	const res = await fetch(`${env.REPO_MANAGER_URL}/jobs/${jobId}`);
	if (!res.ok) error(502, 'Repo manager error');

	const job = await res.json();
	return json({
		previewUrl: job.result?.previewUrl ?? null,
		hasDist: job.result?.hasDist ?? false,
	});
};

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const jobId = await getJobId(params.submissionId);

	const res = await fetch(`${env.REPO_MANAGER_URL}/jobs/${jobId}/preview`, { method: 'POST' });
	// 409 means already running — return the existing URL
	if (res.ok || res.status === 409) {
		const data = await res.json();
		return json({ previewUrl: data.previewUrl });
	}

	const text = await res.text();
	error(502, text || 'Failed to start preview');
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const jobId = await getJobId(params.submissionId);

	await fetch(`${env.REPO_MANAGER_URL}/jobs/${jobId}/preview`, { method: 'DELETE' });
	return new Response(null, { status: 204 });
};
