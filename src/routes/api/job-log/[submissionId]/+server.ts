import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { submission, assignment, course } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireCourseAccess } from '$lib/server/access';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user!;

	const [sub] = await db
		.select({
			repoJobId: submission.repoJobId,
			repoJobStatus: submission.repoJobStatus,
			courseId: submission.courseId,
		})
		.from(submission)
		.where(eq(submission.id, params.submissionId));

	if (!sub) error(404, 'Submission not found');

	await requireCourseAccess(user.id, user.role, sub.courseId);

	if (!sub.repoJobId) {
		return json({ log: null, jobError: null, status: sub.repoJobStatus });
	}

	if (!env.REPO_MANAGER_URL) {
		return json({ log: null, jobError: 'Repo manager not configured', status: sub.repoJobStatus });
	}

	try {
		const res = await fetch(`${env.REPO_MANAGER_URL}/jobs/${sub.repoJobId}`);
		if (!res.ok) {
			return json({ log: null, jobError: `Repo manager returned ${res.status}`, status: sub.repoJobStatus });
		}
		const job = await res.json() as {
			status: string;
			result?: { log: string } | null;
			error?: string | null;
		};
		return json({
			log: job.result?.log ?? null,
			jobError: job.error ?? null,
			status: job.status,
		});
	} catch {
		return json({ log: null, jobError: 'Repo manager unavailable', status: sub.repoJobStatus });
	}
};
