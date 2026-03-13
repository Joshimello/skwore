import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { desc, eq, and, sql } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { submission, assignment, submissionGrade, criterionScore, course, account, rubricCriterion } from '$lib/server/db/schema';
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

const addManualSchema = z.object({
	studentId: z.string().min(1, 'Required'),
	studentName: z.string().min(1, 'Required'),
	assignmentId: z.string().optional(),
	repoUrl: z.string().url().optional().or(z.literal('')),
	pagesUrl: z.string().url().optional().or(z.literal('')),
	commitSha: z.string().optional(),
});

export const load: PageServerLoad = async ({ params }) => {
	const subs = await db
		.select({
			id: submission.id,
			studentId: submission.studentId,
			studentName: submission.studentName,
			repoUrl: submission.repoUrl,
			pagesUrl: submission.pagesUrl,
			commitSha: submission.commitSha,
			origin: submission.origin,
			status: submission.status,
			submittedAt: submission.submittedAt,
			formResponseId: submission.formResponseId,
			repoJobId: submission.repoJobId,
			repoJobStatus: submission.repoJobStatus,
			assignmentId: submission.assignmentId,
			assignmentName: assignment.name,
			gradeId: submissionGrade.id,
			gradeFinalized: submissionGrade.finalized,
		})
		.from(submission)
		.leftJoin(assignment, eq(submission.assignmentId, assignment.id))
		.leftJoin(submissionGrade, eq(submissionGrade.submissionId, submission.id))
		.where(eq(submission.courseId, params.courseId))
		.orderBy(desc(submission.submittedAt));

	const addForm = await superValidate(zod(addManualSchema));

	return { submissions: subs, addForm };
};

export const actions: Actions = {
	syncForm: async ({ locals, params }) => {
		const user = locals.user!;

		const [account_row] = await db
			.select({ accessToken: account.accessToken })
			.from(account)
			.where(and(eq(account.userId, user.id), eq(account.providerId, 'google')));

		if (!account_row?.accessToken) {
			return fail(401, { syncError: 'No Google account linked' });
		}

		const [c] = await db.select().from(course).where(eq(course.id, params.courseId));
		if (!c.googleFormId) {
			return fail(400, { syncError: 'No form configured for this course' });
		}

		const mapping = JSON.parse(c.googleFormFieldMapping ?? '{}') as Record<string, string>;

		const res = await fetch(
			`https://forms.googleapis.com/v1/forms/${c.googleFormId}/responses`,
			{ headers: { Authorization: `Bearer ${account_row.accessToken}` } }
		);

		if (!res.ok) {
			const text = await res.text();
			console.error('Google Forms API error:', text);
			return fail(502, { syncError: 'Google Forms API error' });
		}

		const { responses = [] } = await res.json() as { responses?: any[] };

		const existing = await db
			.select({ formResponseId: submission.formResponseId })
			.from(submission)
			.where(eq(submission.courseId, params.courseId));

		const existingIds = new Set(existing.map((e) => e.formResponseId).filter(Boolean));

		// Load course assignments for name-based matching
		const courseAssignments = await db
			.select({ id: assignment.id, name: assignment.name })
			.from(assignment)
			.where(eq(assignment.courseId, params.courseId));

		function getAnswer(r: any, entryId: string | undefined): string {
			if (!entryId) return '';
			// Prefill URL uses decimal "entry.307610969"; API returns hex question IDs "1255c559"
			const decimal = parseInt(entryId.replace(/^entry\./, ''), 10);
			const hexId = isNaN(decimal) ? entryId : decimal.toString(16);
			return r.answers?.[hexId]?.textAnswers?.answers?.[0]?.value ?? '';
		}

		function matchAssignment(name: string): string | null {
			if (!name) return null;
			const lower = name.toLowerCase().trim();
			return courseAssignments.find((a) => a.name.toLowerCase().trim() === lower)?.id ?? null;
		}

		const newSubmissions = responses
			.filter((r: any) => !existingIds.has(r.responseId))
			.map((r: any) => {
				const assignmentName = getAnswer(r, mapping.assignment);
				return {
					courseId: params.courseId,
					assignmentId: matchAssignment(assignmentName),
					studentId: getAnswer(r, mapping.studentId),
					studentName: getAnswer(r, mapping.studentName),
					repoUrl: getAnswer(r, mapping.repoUrl) || null,
					pagesUrl: getAnswer(r, mapping.pagesUrl) || null,
					commitSha: getAnswer(r, mapping.commitSha) || null,
					formResponseId: r.responseId,
					origin: 'form',
					submittedAt: new Date(r.lastSubmittedTime),
				};
			});

		if (newSubmissions.length > 0) {
			await db.insert(submission).values(newSubmissions);
		}

		return { synced: newSubmissions.length };
	},

	addManual: async ({ request, params }) => {
		const form = await superValidate(request, zod(addManualSchema));
		if (!form.valid) return fail(400, { addForm: form });

		await db.insert(submission).values({
			courseId: params.courseId,
			assignmentId: form.data.assignmentId || null,
			studentId: form.data.studentId,
			studentName: form.data.studentName,
			repoUrl: form.data.repoUrl || null,
			pagesUrl: form.data.pagesUrl || null,
			commitSha: form.data.commitSha || null,
			origin: 'manual',
		});

		return message(form, 'Submission added');
	},

	removeSubmission: async ({ request, params }) => {
		const data = await request.formData();
		const id = data.get('submissionId')?.toString();
		if (!id) return fail(400, { error: 'Missing id' });

		await db
			.delete(submission)
			.where(and(eq(submission.id, id), eq(submission.courseId, params.courseId)));

		return { removed: true };
	},

	analyze: async ({ request, params }) => {
		const data = await request.formData();
		const submissionId = data.get('submissionId')?.toString();
		if (!submissionId) return fail(400);

		const [sub] = await db
			.select()
			.from(submission)
			.where(and(eq(submission.id, submissionId), eq(submission.courseId, params.courseId)));
		if (!sub || !sub.repoUrl) return fail(400, { error: 'No repo URL' });
		if (!sub.assignmentId) return fail(400, { error: 'No assignment — assign first' });

		const criteria = await db
			.select()
			.from(rubricCriterion)
			.where(eq(rubricCriterion.assignmentId, sub.assignmentId));

		const callbackUrl = `${env.WEBHOOK_BASE_URL ?? env.ORIGIN}/api/repo-manager/webhook`;

		const res = await fetch(`${env.REPO_MANAGER_URL}/jobs`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				submissionId,
				repoUrl: sub.repoUrl,
				criteria: criteria.map((c) => ({
					id: c.id,
					name: c.name,
					description: c.description,
					maxPoints: c.points,
				})),
				callbackUrl,
			}),
		});

		if (!res.ok) return fail(502, { error: 'Repo manager unavailable' });

		const { jobId } = await res.json();

		await db
			.update(submission)
			.set({ repoJobId: jobId, repoJobStatus: 'queued' })
			.where(eq(submission.id, submissionId));

		return { analyzed: true };
	},

	assignSubmission: async ({ request, params }) => {
		const data = await request.formData();
		const submissionId = data.get('submissionId')?.toString();
		const assignmentId = data.get('assignmentId')?.toString() || null;
		if (!submissionId) return fail(400, { error: 'Missing submissionId' });

		await db
			.update(submission)
			.set({ assignmentId })
			.where(and(eq(submission.id, submissionId), eq(submission.courseId, params.courseId)));

		return { assigned: true };
	},

	gradeSubmission: async ({ request, locals, params }) => {
		const user = locals.user!;
		const form = await superValidate(request, zod(gradeSchema));
		if (!form.valid) return fail(400, { gradeForm: form });

		const data = form.data;

		const [sub] = await db
			.select()
			.from(submission)
			.where(and(eq(submission.id, data.submissionId), eq(submission.courseId, params.courseId)));
		if (!sub) return fail(404, { error: 'Submission not found' });

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

		if (data.scores.length > 0) {
			await db
				.insert(criterionScore)
				.values(data.scores.map((s) => ({
					gradeId: grade.id,
					criterionId: s.criterionId,
					score: s.score,
					comment: s.comment,
				})))
				.onConflictDoUpdate({
					target: [criterionScore.gradeId, criterionScore.criterionId],
					set: {
						score: sql`EXCLUDED.score`,
						comment: sql`EXCLUDED.comment`,
					},
				});
		}

		return { gradeSaved: true, finalized: data.finalized };
	},
};
