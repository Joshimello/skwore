import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;

		// Bootstrap admin role for users listed in ADMIN_EMAILS
		const adminEmails = (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
		const userWithRole = session.user as typeof session.user & { role?: string | null };
		if (adminEmails.includes(session.user.email) && userWithRole.role !== 'admin') {
			await db.update(userTable).set({ role: 'admin' }).where(eq(userTable.id, session.user.id));
			event.locals.user = { ...session.user, role: 'admin' };
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
