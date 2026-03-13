import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { auth } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		redirect(302, '/');
	}
	return {};
};

export const actions: Actions = {
	signIn: async (event) => {
		const result = await auth.api.signInSocial({
			body: {
				provider: 'google',
				callbackURL: '/'
			}
		});

		if (result.url) {
			redirect(302, result.url);
		}
		return fail(400, { message: 'Sign-in failed' });
	}
};
