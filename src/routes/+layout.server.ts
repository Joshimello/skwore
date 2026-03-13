import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { course, courseTA } from '$lib/server/db/schema';
import { eq, or } from 'drizzle-orm';

export const load: LayoutServerLoad = async (event) => {
	const { url, locals } = event;

	// Bypass auth for login, BetterAuth API paths, and internal webhooks
	if (url.pathname.startsWith('/login') || url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/repo-manager')) {
		return { user: null, courses: [] };
	}

	if (!locals.user) {
		redirect(302, '/login');
	}

	const allowedEmails = (env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
	if (allowedEmails.length > 0 && !allowedEmails.includes(locals.user.email)) {
		error(403, 'Access denied');
	}

	// Load courses for sidebar: all for admin, assigned for TA
	let courses: { id: string; name: string }[] = [];
	if (locals.user.role === 'admin') {
		courses = await db.select({ id: course.id, name: course.name }).from(course);
	} else {
		courses = await db
			.select({ id: course.id, name: course.name })
			.from(course)
			.innerJoin(courseTA, eq(courseTA.courseId, course.id))
			.where(eq(courseTA.userId, locals.user.id));
	}

	return { user: locals.user, courses };
};
