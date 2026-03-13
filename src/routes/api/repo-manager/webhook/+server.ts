import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { submission, submissionGrade, criterionScore } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { createHmac } from 'crypto';

export async function POST({ request }) {
	const body = await request.text();
	const sig = request.headers.get('x-repo-manager-signature') ?? '';
	const expected = createHmac('sha256', env.REPO_MANAGER_WEBHOOK_SECRET ?? '').update(body).digest('hex');
	if (sig !== expected) error(401, 'Invalid signature');

	const payload = JSON.parse(body) as {
		jobId: string;
		submissionId: string;
		status: string;
		result?: {
			distUrl: string | null;
			criteria: { criterionId: string; suggestedScore: number; comment: string }[];
		} | null;
	};

	await db
		.update(submission)
		.set({ repoJobStatus: payload.status, distUrl: payload.result?.distUrl ?? null })
		.where(eq(submission.id, payload.submissionId));

	if (payload.status === 'done' && payload.result?.criteria) {
		const [grade] = await db
			.select({ id: submissionGrade.id })
			.from(submissionGrade)
			.where(eq(submissionGrade.submissionId, payload.submissionId));

		if (grade) {
			for (const c of payload.result.criteria) {
				await db
					.update(criterionScore)
					.set({ aiSuggestedScore: c.suggestedScore, aiReasoning: c.comment })
					.where(
						and(eq(criterionScore.gradeId, grade.id), eq(criterionScore.criterionId, c.criterionId))
					);
			}
		}
	}

	return json({ ok: true });
}
