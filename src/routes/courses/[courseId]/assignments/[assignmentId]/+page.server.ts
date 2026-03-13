import { error, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { assignment, rubricCriterion } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

const assignmentSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional(),
	deadline: z.string().optional(),
	gitlabCiTemplate: z.string().optional(),
	googleSheetId: z.string().optional(),
	googleSheetRange: z.string().optional(),
	criteria: z.array(
		z.object({
			id: z.string().optional(),
			name: z.string().min(1, 'Criterion name is required'),
			description: z.string().optional(),
			points: z.number().int().min(0),
			order: z.number().int(),
		})
	).default([]),
});

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) error(401);

	const [a] = await db
		.select()
		.from(assignment)
		.where(and(eq(assignment.id, params.assignmentId), eq(assignment.courseId, params.courseId)));

	if (!a) error(404, 'Assignment not found');

	const criteria = await db
		.select()
		.from(rubricCriterion)
		.where(eq(rubricCriterion.assignmentId, a.id));

	const form = await superValidate(
		{
			name: a.name,
			description: a.description ?? '',
			deadline: a.deadline ? new Date(a.deadline).toISOString().slice(0, 16) : '',
			gitlabCiTemplate: a.gitlabCiTemplate ?? '',
			googleSheetId: a.googleSheetId ?? '',
			googleSheetRange: a.googleSheetRange ?? '',
			criteria: criteria.map((c) => ({
				id: c.id,
				name: c.name,
				description: c.description ?? '',
				points: c.points,
				order: c.order,
			})),
		},
		zod(assignmentSchema)
	);

	return { form, assignment: a };
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) error(401);

		const form = await superValidate(request, zod(assignmentSchema));
		if (!form.valid) return { form };

		try {
			await db
				.update(assignment)
				.set({
					name: form.data.name,
					description: form.data.description || null,
					deadline: form.data.deadline ? new Date(form.data.deadline) : null,
					gitlabCiTemplate: form.data.gitlabCiTemplate || null,
					googleSheetId: form.data.googleSheetId || null,
					googleSheetRange: form.data.googleSheetRange || null,
				})
				.where(eq(assignment.id, params.assignmentId));

			// Delete all existing criteria and re-insert
			await db.delete(rubricCriterion).where(eq(rubricCriterion.assignmentId, params.assignmentId));

			if (form.data.criteria.length > 0) {
				await db.insert(rubricCriterion).values(
					form.data.criteria.map((c, i) => ({
						assignmentId: params.assignmentId,
						name: c.name,
						description: c.description || null,
						points: c.points,
						order: c.order ?? i,
					}))
				);
			}
		} catch (e) {
			throw e;
		}

		return message(form, 'Assignment saved');
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) error(401);

		await db
			.delete(assignment)
			.where(and(eq(assignment.id, params.assignmentId), eq(assignment.courseId, params.courseId)));

		redirect(302, `/courses/${params.courseId}/assignments`);
	},
};
