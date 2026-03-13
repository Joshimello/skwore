import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCourseGradeData } from '$lib/server/queries/courseGrades';
import { requireCourseAccess } from '$lib/server/access';
import { db } from '$lib/server/db';
import { course } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user!;

	const [c] = await db.select().from(course).where(eq(course.id, params.courseId));
	if (!c) error(404, 'Course not found');

	await requireCourseAccess(user.id, user.role, params.courseId);

	const finalizedOnly = url.searchParams.get('finalized') === 'true';

	const { assignments, students, grid } = await getCourseGradeData(params.courseId);

	// Header row
	const headers = [
		'studentId',
		'studentName',
		...assignments.flatMap((a) => [csvEscape(a.name), `${csvEscape(a.name)}/max`]),
		'Total',
		'Total/Max',
	];

	const totalMax = assignments.reduce((s, a) => s + a.maxScore, 0);

	const rows = students.map((s) => {
		let totalEarned = 0;
		const cells = assignments.flatMap((a) => {
			const cell = grid[s.studentId]?.[a.id] ?? null;
			if (!cell || !cell.hasGrade) return ['', String(a.maxScore)];
			if (finalizedOnly && !cell.finalized) return ['', String(a.maxScore)];
			totalEarned += cell.earned;
			return [String(cell.earned), String(a.maxScore)];
		});
		return [s.studentId, csvEscape(s.studentName), ...cells, String(totalEarned), String(totalMax)];
	});

	const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

	const filename = `${c.name.replace(/[^a-z0-9]/gi, '_')}_grades.csv`;

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
};

function csvEscape(value: string): string {
	if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
	return value;
}
