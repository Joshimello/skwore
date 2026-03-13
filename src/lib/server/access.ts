import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { courseTA } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export async function requireCourseAccess(
	userId: string,
	role: string | null | undefined,
	courseId: string
): Promise<void> {
	if (role === 'admin') return;
	const [row] = await db
		.select()
		.from(courseTA)
		.where(and(eq(courseTA.courseId, courseId), eq(courseTA.userId, userId)));
	if (!row) error(403, 'Access denied');
}
