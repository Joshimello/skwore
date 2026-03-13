import { error, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { course } from '$lib/server/db/schema';

const courseSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional(),
});

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') {
		error(403, 'Admin access required');
	}
	const form = await superValidate(zod(courseSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') {
			error(403, 'Admin access required');
		}

		const form = await superValidate(request, zod(courseSchema));
		if (!form.valid) return { form };

		const [created] = await db
			.insert(course)
			.values({
				name: form.data.name,
				description: form.data.description || null,
				createdById: locals.user.id,
			})
			.returning({ id: course.id });

		redirect(302, `/courses/${created.id}`);
	}
};
