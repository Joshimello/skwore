import { error, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { assignment, rubricCriterion } from '$lib/server/db/schema';

const assignmentSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional(),
	deadline: z.string().optional(),
	gitlabCiTemplate: z.string().optional(),
	googleSheetId: z.string().optional(),
	googleSheetRange: z.string().optional(),
	criteria: z.array(
		z.object({
			name: z.string().min(1, 'Criterion name is required'),
			description: z.string().optional(),
			points: z.number().int().min(0, 'Points must be non-negative'),
			order: z.number().int(),
		})
	).default([]),
});

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401);
	const form = await superValidate(zod(assignmentSchema));
	return { form };
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) error(401);

		const form = await superValidate(request, zod(assignmentSchema));
		if (!form.valid) return { form };

		const [created] = await db
			.insert(assignment)
			.values({
				courseId: params.courseId,
				name: form.data.name,
				description: form.data.description || null,
				deadline: form.data.deadline ? new Date(form.data.deadline) : null,
				gitlabCiTemplate: form.data.gitlabCiTemplate || null,
				googleSheetId: form.data.googleSheetId || null,
				googleSheetRange: form.data.googleSheetRange || null,
			})
			.returning({ id: assignment.id });

		if (form.data.criteria.length > 0) {
			await db.insert(rubricCriterion).values(
				form.data.criteria.map((c, i) => ({
					assignmentId: created.id,
					name: c.name,
					description: c.description || null,
					points: c.points,
					order: c.order ?? i,
				}))
			);
		}

		redirect(302, `/courses/${params.courseId}/assignments/${created.id}`);
	}
};
