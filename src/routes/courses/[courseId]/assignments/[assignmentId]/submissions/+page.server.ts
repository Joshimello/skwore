import { error, fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { assignment, submission, submissionGrade, rubricCriterion } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

const addOneSchema = z.object({
	studentId: z.string().min(1),
	studentName: z.string().min(1),
	repoUrl: z.string().url().optional().or(z.literal('')),
	pagesUrl: z.string().url().optional().or(z.literal('')),
});

const importSchema = z.object({
	csv: z.string().min(1, 'Paste CSV content'),
});

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401);

	const [a] = await db
		.select()
		.from(assignment)
		.where(and(eq(assignment.id, params.assignmentId), eq(assignment.courseId, params.courseId)));

	if (!a) error(404, 'Assignment not found');

	const submissions = await db
		.select({
			id: submission.id,
			studentId: submission.studentId,
			studentName: submission.studentName,
			repoUrl: submission.repoUrl,
			pagesUrl: submission.pagesUrl,
			repoJobStatus: submission.repoJobStatus,
			distUrl: submission.distUrl,
			gradeId: submissionGrade.id,
			finalized: submissionGrade.finalized,
			gradedAt: submissionGrade.gradedAt,
		})
		.from(submission)
		.leftJoin(submissionGrade, eq(submissionGrade.submissionId, submission.id))
		.where(eq(submission.assignmentId, params.assignmentId));

	const [addForm, importForm] = await Promise.all([
		superValidate(zod(addOneSchema)),
		superValidate(zod(importSchema)),
	]);

	return { assignment: a, submissions, addForm, importForm };
};

export const actions: Actions = {
	addOne: async ({ request, params, locals }) => {
		if (!locals.user) error(401);

		const form = await superValidate(request, zod(addOneSchema));
		if (!form.valid) return { addForm: form };

		await db
			.insert(submission)
			.values({
				courseId: params.courseId,
				assignmentId: params.assignmentId,
				studentId: form.data.studentId,
				studentName: form.data.studentName,
				repoUrl: form.data.repoUrl || null,
				pagesUrl: form.data.pagesUrl || null,
				origin: 'manual',
			});

		return message(form, 'Student added');
	},

	importCsv: async ({ request, params, locals }) => {
		if (!locals.user) error(401);

		const form = await superValidate(request, zod(importSchema));
		if (!form.valid) return { importForm: form };

		const lines = form.data.csv
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);

		const rows: { studentId: string; studentName: string; repoUrl: string | null; pagesUrl: string | null }[] = [];

		for (const line of lines) {
			const cells = line.split(/[,\t]/).map((c) => c.trim());
			const [studentId, studentName, repoUrl, pagesUrl] = cells;
			// Skip header row
			if (studentId?.toLowerCase() === 'studentid') continue;
			if (!studentId || !studentName) continue;
			rows.push({
				studentId,
				studentName,
				repoUrl: repoUrl || null,
				pagesUrl: pagesUrl || null,
			});
		}

		if (rows.length === 0) {
			return message(form, 'No valid rows found', { status: 400 });
		}

		await db
			.insert(submission)
			.values(rows.map((r) => ({
				courseId: params.courseId,
				assignmentId: params.assignmentId,
				origin: 'csv',
				...r,
			})));

		return message(form, `Imported ${rows.length} submission${rows.length !== 1 ? 's' : ''}`);
	},

	remove: async ({ request, params, locals }) => {
		if (!locals.user) error(401);

		const data = await request.formData();
		const id = data.get('id') as string;
		if (!id) error(400, 'Missing id');

		await db
			.delete(submission)
			.where(and(eq(submission.id, id), eq(submission.courseId, params.courseId)));

		return { success: true };
	},

	analyze: async ({ request, params, locals }) => {
		if (!locals.user) error(401);

		const formData = await request.formData();
		const submissionId = formData.get('submissionId')?.toString();
		if (!submissionId) return fail(400);

		const [sub] = await db
			.select()
			.from(submission)
			.where(and(eq(submission.id, submissionId), eq(submission.assignmentId, params.assignmentId)));
		if (!sub || !sub.repoUrl) return fail(400, { error: 'No repo URL' });

		const criteria = await db
			.select()
			.from(rubricCriterion)
			.where(eq(rubricCriterion.assignmentId, params.assignmentId));

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

		return { success: true };
	},

	bulkFinalize: async ({ params, locals }) => {
		if (!locals.user) error(401);
		if (locals.user.role !== 'admin') error(403, 'Admins only');

		// Get all submission IDs for this assignment that have a draft grade
		const draftSubmissions = await db
			.select({ submissionId: submissionGrade.submissionId, gradeId: submissionGrade.id })
			.from(submissionGrade)
			.innerJoin(submission, eq(submission.id, submissionGrade.submissionId))
			.where(
				and(
					eq(submission.assignmentId, params.assignmentId),
					eq(submissionGrade.finalized, false)
				)
			);

		if (draftSubmissions.length === 0) {
			return { success: true, count: 0 };
		}

		await db
			.update(submissionGrade)
			.set({ finalized: true })
			.where(
				inArray(
					submissionGrade.id,
					draftSubmissions.map((s) => s.gradeId)
				)
			);

		return { success: true, count: draftSubmissions.length };
	},
};
