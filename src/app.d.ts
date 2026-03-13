import type { auth } from '$lib/server/auth';

type AuthSession = typeof auth.$Infer.Session;
type AuthUser = AuthSession['user'] & { role?: string | null };

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: AuthUser;
			session?: AuthSession['session'];
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
