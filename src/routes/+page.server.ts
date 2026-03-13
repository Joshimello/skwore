import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { course, courseTA } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;

	let courses;
	if (user.role === 'admin') {
		courses = await db.select().from(course);
	} else {
		courses = await db
			.select({ id: course.id, name: course.name, description: course.description, createdAt: course.createdAt, createdById: course.createdById })
			.from(course)
			.innerJoin(courseTA, eq(courseTA.courseId, course.id))
			.where(eq(courseTA.userId, user.id));
	}

	return { courses };
};
