import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { course, courseTA, assignment } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const user = locals.user!;

	const [courseRow] = await db
		.select()
		.from(course)
		.where(eq(course.id, params.courseId));

	if (!courseRow) {
		error(404, 'Course not found');
	}

	if (user.role !== 'admin') {
		const [membership] = await db
			.select()
			.from(courseTA)
			.where(and(eq(courseTA.courseId, params.courseId), eq(courseTA.userId, user.id)));

		if (!membership) {
			error(403, 'Access denied');
		}
	}

	const assignments = await db
		.select({ id: assignment.id, name: assignment.name })
		.from(assignment)
		.where(eq(assignment.courseId, params.courseId));

	return { course: courseRow, assignments };
};
