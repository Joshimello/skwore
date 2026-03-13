import { error } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import {
	assignment,
	course,
	rubricCriterion,
	submission,
	submissionGrade,
	criterionScore,
} from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { requireCourseAccess } from '$lib/server/access';
import { env } from '$env/dynamic/private';

const gradeSchema = z.object({
	submissionId: z.string(),
	comment: z.string().default(''),
	finalized: z.boolean().default(false),
	scores: z.array(
		z.object({
			criterionId: z.string(),
			score: z.number().int().min(0),
			comment: z.string().default(''),
		})
	),
});

export const load: PageServerLoad = async ({ params, locals, url }) => {
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

	const submissionsRaw = await db
		.select({
			id: submission.id,
			studentId: submission.studentId,
			studentName: submission.studentName,
			repoUrl: submission.repoUrl,
			pagesUrl: submission.pagesUrl,
			repoJobId: submission.repoJobId,
			repoJobStatus: submission.repoJobStatus,
			gradeId: submissionGrade.id,
			finalized: submissionGrade.finalized,
			gradedAt: submissionGrade.gradedAt,
		})
		.from(submission)
		.leftJoin(submissionGrade, eq(submissionGrade.submissionId, submission.id))
		.where(eq(submission.assignmentId, params.assignmentId));

	const submissions = submissionsRaw.map((s) => ({
		...s,
		gradeStatus: !s.gradeId ? 'ungraded' : s.finalized ? 'finalized' : 'draft',
	}));

	const submissionId = url.searchParams.get('submission');

	let activeSubmission: typeof submissionsRaw[number] | null = null;
	let form;
	let aiScores: Record<string, { suggestedScore: number; reasoning: string; status: string }> = {};

	if (submissionId) {
		const found = submissionsRaw.find((s) => s.id === submissionId);
		if (!found) error(404, 'Submission not found');
		activeSubmission = found;

		let existingScores: { criterionId: string; score: number; comment: string }[] = [];

		if (found.gradeId) {
			const scores = await db
				.select()
				.from(criterionScore)
				.where(eq(criterionScore.gradeId, found.gradeId));
			existingScores = scores.map((sc) => ({
				criterionId: sc.criterionId,
				score: sc.score,
				comment: sc.comment,
			}));
			for (const sc of scores) {
				if (sc.aiSuggestedScore !== null && sc.aiReasoning !== null) {
					aiScores[sc.criterionId] = {
						suggestedScore: sc.aiSuggestedScore,
						reasoning: sc.aiReasoning,
						status: '',
					};
				}
			}
		}

		// No grade yet but job is done — fetch AI results from repo manager directly
		if (!found.gradeId && found.repoJobId && found.repoJobStatus === 'done' && env.REPO_MANAGER_URL) {
			try {
				const res = await fetch(`${env.REPO_MANAGER_URL}/jobs/${found.repoJobId}`);
				if (res.ok) {
					const job = await res.json() as { result?: { criteria?: { criterionId: string; suggestedScore: number; comment: string }[] } };
					for (const c of job.result?.criteria ?? []) {
						aiScores[c.criterionId] = { suggestedScore: c.suggestedScore, reasoning: c.comment, status: '' };
					}
				}
			} catch { /* repo manager unavailable — degrade gracefully */ }
		}

		// Fill in any missing criteria scores with defaults
		const scoreMap = new Map(existingScores.map((s) => [s.criterionId, s]));
		const scores = criteria.map((cr) => scoreMap.get(cr.id) ?? { criterionId: cr.id, score: 0, comment: '' });

		form = await superValidate(
			{
				submissionId: found.id,
				comment: found.gradeId
					? ((await db.select({ comment: submissionGrade.comment }).from(submissionGrade).where(eq(submissionGrade.id, found.gradeId)))[0]?.comment ?? '')
					: '',
				finalized: found.finalized ?? false,
				scores,
			},
			zod(gradeSchema)
		);
	} else {
		form = await superValidate(
			{
				submissionId: '',
				comment: '',
				finalized: false,
				scores: criteria.map((cr) => ({ criterionId: cr.id, score: 0, comment: '' })),
			},
			zod(gradeSchema)
		);
	}

	return {
		assignment: a,
		course: c,
		criteria,
		submissions,
		activeSubmission,
		form,
		aiScores: submissionId ? aiScores : {},
	};
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const user = locals.user!;

		const form = await superValidate(request, zod(gradeSchema));
		if (!form.valid) return { form };

		const data = form.data;

		// Verify submission belongs to this assignment
		const [sub] = await db
			.select()
			.from(submission)
			.where(eq(submission.id, data.submissionId));
		if (!sub || sub.assignmentId !== params.assignmentId) error(404, 'Submission not found');

		// Upsert submission grade
		const [grade] = await db
			.insert(submissionGrade)
			.values({
				submissionId: data.submissionId,
				gradedById: user.id,
				comment: data.comment || null,
				finalized: data.finalized,
			})
			.onConflictDoUpdate({
				target: submissionGrade.submissionId,
				set: {
					comment: data.comment || null,
					finalized: data.finalized,
					gradedById: user.id,
					gradedAt: new Date(),
				},
			})
			.returning({ id: submissionGrade.id });

		// Upsert criterion scores
		if (data.scores.length > 0) {
			await db
				.insert(criterionScore)
				.values(
					data.scores.map((s) => ({
						gradeId: grade.id,
						criterionId: s.criterionId,
						score: s.score,
						comment: s.comment,
					}))
				)
				.onConflictDoUpdate({
					target: [criterionScore.gradeId, criterionScore.criterionId],
					set: {
						score: sql`EXCLUDED.score`,
						comment: sql`EXCLUDED.comment`,
					},
				});
		}

		return message(form, data.finalized ? 'Grade finalized' : 'Draft saved');
	},

	unfinalize: async ({ request, locals }) => {
		const user = locals.user!;
		if (user.role !== 'admin') error(403, 'Admins only');

		const data = await request.formData();
		const gradeId = data.get('gradeId') as string;
		if (!gradeId) error(400, 'Missing gradeId');

		await db
			.update(submissionGrade)
			.set({ finalized: false })
			.where(eq(submissionGrade.id, gradeId));

		return { success: true };
	},
};
