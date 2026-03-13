import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	assignment,
	course,
	rubricCriterion,
	submission,
	submissionGrade,
	criterionScore,
} from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireCourseAccess } from '$lib/server/access';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user!;

	const [a] = await db.select().from(assignment).where(eq(assignment.id, params.assignmentId));
	if (!a) error(404, 'Assignment not found');

	const [c] = await db.select().from(course).where(eq(course.id, a.courseId));
	if (!c) error(404, 'Course not found');

	await requireCourseAccess(user.id, user.role, c.id);

	const criteria = await db
		.select()
		.from(rubricCriterion)
		.where(eq(rubricCriterion.assignmentId, params.assignmentId))
		.orderBy(asc(rubricCriterion.order));

	const [sub] = await db
		.select({
			id: submission.id,
			repoJobId: submission.repoJobId,
			repoJobStatus: submission.repoJobStatus,
			gradeId: submissionGrade.id,
			finalized: submissionGrade.finalized,
			comment: submissionGrade.comment,
		})
		.from(submission)
		.leftJoin(submissionGrade, eq(submissionGrade.submissionId, submission.id))
		.where(eq(submission.id, params.submissionId));

	if (!sub) error(404, 'Submission not found');

	let scores: { criterionId: string; score: number; comment: string }[] = [];
	let aiScores: Record<string, { suggestedScore: number; reasoning: string }> = {};

	if (sub.gradeId) {
		const rows = await db
			.select()
			.from(criterionScore)
			.where(eq(criterionScore.gradeId, sub.gradeId));

		scores = rows.map((r) => ({ criterionId: r.criterionId, score: r.score, comment: r.comment ?? '' }));
		for (const r of rows) {
			if (r.aiSuggestedScore !== null && r.aiReasoning !== null) {
				aiScores[r.criterionId] = { suggestedScore: r.aiSuggestedScore, reasoning: r.aiReasoning };
			}
		}
	}

	// No grade yet but job done — fetch AI results from repo manager
	if (!sub.gradeId && sub.repoJobId && sub.repoJobStatus === 'done' && env.REPO_MANAGER_URL) {
		try {
			const res = await fetch(`${env.REPO_MANAGER_URL}/jobs/${sub.repoJobId}`);
			if (res.ok) {
				const job = await res.json() as { result?: { criteria?: { criterionId: string; suggestedScore: number; comment: string }[] } };
				for (const cr of job.result?.criteria ?? []) {
					aiScores[cr.criterionId] = { suggestedScore: cr.suggestedScore, reasoning: cr.comment };
				}
			}
		} catch { /* repo manager unavailable */ }
	}

	// Fill missing scores with defaults
	const scoreMap = new Map(scores.map((s) => [s.criterionId, s]));
	const defaultedScores = criteria.map((cr) => scoreMap.get(cr.id) ?? { criterionId: cr.id, score: 0, comment: '' });

	return json({
		criteria,
		gradeId: sub.gradeId ?? null,
		finalized: sub.finalized ?? false,
		comment: sub.comment ?? '',
		scores: defaultedScores,
		aiScores,
	});
};
