import { db } from '$lib/server/db';
import { assignment, rubricCriterion, submission, submissionGrade, criterionScore } from '$lib/server/db/schema';
import { eq, inArray, asc, and, isNotNull } from 'drizzle-orm';

export type CellData = {
	submissionId: string;
	earned: number;
	finalized: boolean;
	hasGrade: boolean;
} | null; // null = no submission for this student/assignment

export type GridData = {
	assignments: { id: string; name: string; maxScore: number }[];
	students: { studentId: string; studentName: string }[];
	grid: Record<string, Record<string, CellData>>; // grid[studentId][assignmentId]
};

export async function getCourseGradeData(courseId: string): Promise<GridData> {
	const assignments = await db
		.select({ id: assignment.id, name: assignment.name })
		.from(assignment)
		.where(eq(assignment.courseId, courseId))
		.orderBy(asc(assignment.createdAt));

	if (assignments.length === 0) {
		return { assignments: [], students: [], grid: {} };
	}

	const assignmentIds = assignments.map((a) => a.id);

	// Rubric criteria — to compute maxScore per assignment
	const criteria = await db
		.select({ assignmentId: rubricCriterion.assignmentId, points: rubricCriterion.points })
		.from(rubricCriterion)
		.where(inArray(rubricCriterion.assignmentId, assignmentIds));

	const maxScoreByAssignment = new Map<string, number>();
	for (const c of criteria) {
		maxScoreByAssignment.set(c.assignmentId, (maxScoreByAssignment.get(c.assignmentId) ?? 0) + c.points);
	}

	// Submissions + grade status
	const submissionsRaw = await db
		.select({
			id: submission.id,
			assignmentId: submission.assignmentId,
			studentId: submission.studentId,
			studentName: submission.studentName,
			gradeId: submissionGrade.id,
			finalized: submissionGrade.finalized,
		})
		.from(submission)
		.leftJoin(submissionGrade, eq(submissionGrade.submissionId, submission.id))
		.where(and(isNotNull(submission.assignmentId), inArray(submission.assignmentId, assignmentIds)));

	// Criterion scores — to compute earned totals per grade
	const gradeIds = submissionsRaw.flatMap((s) => (s.gradeId ? [s.gradeId] : []));
	const scores =
		gradeIds.length > 0
			? await db
					.select({ gradeId: criterionScore.gradeId, score: criterionScore.score })
					.from(criterionScore)
					.where(inArray(criterionScore.gradeId, gradeIds))
			: [];

	const earnedByGrade = new Map<string, number>();
	for (const s of scores) {
		earnedByGrade.set(s.gradeId, (earnedByGrade.get(s.gradeId) ?? 0) + s.score);
	}

	// Build grid
	const studentsMap = new Map<string, string>(); // studentId → studentName
	const grid: Record<string, Record<string, CellData>> = {};

	for (const sub of submissionsRaw) {
		if (!sub.assignmentId) continue;
		studentsMap.set(sub.studentId, sub.studentName);
		if (!grid[sub.studentId]) grid[sub.studentId] = {};
		grid[sub.studentId][sub.assignmentId] = {
			submissionId: sub.id,
			earned: sub.gradeId ? (earnedByGrade.get(sub.gradeId) ?? 0) : 0,
			finalized: sub.finalized ?? false,
			hasGrade: !!sub.gradeId,
		};
	}

	const students = Array.from(studentsMap.entries())
		.map(([studentId, studentName]) => ({ studentId, studentName }))
		.sort((a, b) => a.studentId.localeCompare(b.studentId));

	const assignmentsWithMax = assignments.map((a) => ({
		id: a.id,
		name: a.name,
		maxScore: maxScoreByAssignment.get(a.id) ?? 0,
	}));

	return { assignments: assignmentsWithMax, students, grid };
}
