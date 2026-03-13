import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { course, courseTA, user } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

const inviteSchema = z.object({
	email: z.string().email('Valid email required'),
});

const formConfigSchema = z.object({
	googleFormId: z.string().optional(),
	fieldStudentId: z.string().optional(),
	fieldStudentName: z.string().optional(),
	fieldAssignment: z.string().optional(),
	fieldRepoUrl: z.string().optional(),
	fieldPagesUrl: z.string().optional(),
	fieldCommitSha: z.string().optional(),
});

export const load: PageServerLoad = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin') {
		error(403, 'Admin access required');
	}

	const tas = await db
		.select({ id: user.id, name: user.name, email: user.email, image: user.image, joinedAt: courseTA.joinedAt })
		.from(courseTA)
		.innerJoin(user, eq(user.id, courseTA.userId))
		.where(eq(courseTA.courseId, params.courseId));

	const form = await superValidate(zod(inviteSchema));

	const [courseRow] = await db.select().from(course).where(eq(course.id, params.courseId));
	const existingMapping = JSON.parse(courseRow?.googleFormFieldMapping ?? '{}') as Record<string, string>;
	const formConfigForm = await superValidate(
		{
			googleFormId: courseRow?.googleFormId ?? '',
			fieldStudentId: existingMapping.studentId ?? '',
			fieldStudentName: existingMapping.studentName ?? '',
			fieldAssignment: existingMapping.assignment ?? '',
			fieldRepoUrl: existingMapping.repoUrl ?? '',
			fieldPagesUrl: existingMapping.pagesUrl ?? '',
			fieldCommitSha: existingMapping.commitSha ?? '',
		},
		zod(formConfigSchema)
	);

	return { tas, form, formConfigForm };
};

export const actions: Actions = {
	invite: async ({ request, params, locals }) => {
		if (locals.user?.role !== 'admin') {
			error(403, 'Admin access required');
		}

		const form = await superValidate(request, zod(inviteSchema));
		if (!form.valid) return fail(400, { form });

		const [invitee] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, form.data.email));

		if (!invitee) {
			return message(form, 'No user found with that email. They must sign in first.', { status: 400 });
		}

		await db
			.insert(courseTA)
			.values({ courseId: params.courseId, userId: invitee.id })
			.onConflictDoNothing();

		return message(form, 'TA added successfully');
	},

	remove: async ({ request, params, locals }) => {
		if (locals.user?.role !== 'admin') {
			error(403, 'Admin access required');
		}

		const formData = await request.formData();
		const userId = formData.get('userId')?.toString();
		if (!userId) return fail(400);

		await db
			.delete(courseTA)
			.where(and(eq(courseTA.courseId, params.courseId), eq(courseTA.userId, userId)));

		return { success: true };
	},

	saveFormConfig: async ({ request, params, locals }) => {
		if (locals.user?.role !== 'admin') {
			error(403, 'Admin access required');
		}

		const form = await superValidate(request, zod(formConfigSchema));
		if (!form.valid) return fail(400, { formConfigForm: form });

		const mapping = JSON.stringify({
			studentId: form.data.fieldStudentId || '',
			studentName: form.data.fieldStudentName || '',
			assignment: form.data.fieldAssignment || '',
			repoUrl: form.data.fieldRepoUrl || '',
			pagesUrl: form.data.fieldPagesUrl || '',
			commitSha: form.data.fieldCommitSha || '',
		});

		await db
			.update(course)
			.set({
				googleFormId: form.data.googleFormId || null,
				googleFormFieldMapping: mapping,
			})
			.where(eq(course.id, params.courseId));

		return message(form, 'Form config saved');
	},

	deleteCourse: async ({ params, locals }) => {
		if (locals.user?.role !== 'admin') {
			error(403, 'Admin access required');
		}

		await db.delete(course).where(eq(course.id, params.courseId));

		redirect(302, '/');
	},
};
