import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { assignment, rubricCriterion } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
	const assignments = await db
		.select()
		.from(assignment)
		.where(eq(assignment.courseId, params.courseId));

	const assignmentIds = assignments.map((a) => a.id);
	const criteria = assignmentIds.length > 0
		? await db
				.select()
				.from(rubricCriterion)
				.where(inArray(rubricCriterion.assignmentId, assignmentIds))
		: [];

	const criteriaByAssignment = criteria.reduce<Record<string, typeof criteria>>(
		(acc, c) => {
			(acc[c.assignmentId] ??= []).push(c);
			return acc;
		},
		{}
	);

	return {
		assignments: assignments.map((a) => ({
			...a,
			criteria: criteriaByAssignment[a.id] ?? [],
		})),
	};
};
