import { pgTable, text, integer, timestamp, boolean, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const nanoid = customAlphabet(alphabet, 8);

export * from './auth.schema';
import { user } from './auth.schema';

export const course = pgTable('course', {
	id: text('id').primaryKey().$defaultFn(() => nanoid()),
	name: text('name').notNull(),
	description: text('description'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	createdById: text('created_by_id').notNull().references(() => user.id),
	googleFormId: text('google_form_id'),
	googleFormFieldMapping: text('google_form_field_mapping'),
});

export const courseTA = pgTable('course_ta', {
	courseId: text('course_id').notNull().references(() => course.id, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.courseId, table.userId] })]);

export const assignment = pgTable('assignment', {
	id: text('id').primaryKey().$defaultFn(() => nanoid()),
	courseId: text('course_id').notNull().references(() => course.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),
	deadline: timestamp('deadline'),
	gitlabCiTemplate: text('gitlab_ci_template'),
	googleSheetId: text('google_sheet_id'),
	googleSheetRange: text('google_sheet_range'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rubricCriterion = pgTable('rubric_criterion', {
	id: text('id').primaryKey().$defaultFn(() => nanoid()),
	assignmentId: text('assignment_id').notNull().references(() => assignment.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),
	points: integer('points').notNull(),
	order: integer('order').notNull(),
});

export const submission = pgTable('submission', {
	id: text('id').primaryKey().$defaultFn(() => nanoid()),
	courseId: text('course_id').notNull().references(() => course.id, { onDelete: 'cascade' }),
	assignmentId: text('assignment_id').references(() => assignment.id, { onDelete: 'set null' }),
	studentName: text('student_name').notNull(),
	studentId: text('student_id').notNull(),
	repoUrl: text('repo_url'),
	pagesUrl: text('pages_url'),
	commitSha: text('commit_sha'),
	origin: text('origin'),
	status: text('status').default('submitted').notNull(),
	submittedAt: timestamp('submitted_at').defaultNow().notNull(),
	formResponseId: text('form_response_id'),
	repoJobId: text('repo_job_id'),
	repoJobStatus: text('repo_job_status'),
	distUrl: text('dist_url'),
});

export const submissionGrade = pgTable('submission_grade', {
	id: text('id').primaryKey().$defaultFn(() => nanoid()),
	submissionId: text('submission_id').notNull().unique().references(() => submission.id, { onDelete: 'cascade' }),
	gradedById: text('graded_by_id').notNull().references(() => user.id),
	gradedAt: timestamp('graded_at').defaultNow().notNull(),
	comment: text('comment'),
	finalized: boolean('finalized').default(false).notNull(),
});

export const criterionScore = pgTable('criterion_score', {
	id: text('id').primaryKey().$defaultFn(() => nanoid()),
	gradeId: text('grade_id').notNull().references(() => submissionGrade.id, { onDelete: 'cascade' }),
	criterionId: text('criterion_id').notNull().references(() => rubricCriterion.id, { onDelete: 'cascade' }),
	score: integer('score').notNull(),
	aiSuggestedScore: integer('ai_suggested_score'),
	aiReasoning: text('ai_reasoning'),
	comment: text('comment').notNull().default(''),
}, (table) => [
	uniqueIndex('criterion_score_grade_criterion_idx').on(table.gradeId, table.criterionId),
]);

// Relations

export const courseRelations = relations(course, ({ one, many }) => ({
	createdBy: one(user, { fields: [course.createdById], references: [user.id] }),
	courseTAs: many(courseTA),
	assignments: many(assignment),
}));

export const courseTARelations = relations(courseTA, ({ one }) => ({
	course: one(course, { fields: [courseTA.courseId], references: [course.id] }),
	user: one(user, { fields: [courseTA.userId], references: [user.id] }),
}));

export const assignmentRelations = relations(assignment, ({ one, many }) => ({
	course: one(course, { fields: [assignment.courseId], references: [course.id] }),
	rubricCriteria: many(rubricCriterion),
	submissions: many(submission),
}));

export const rubricCriterionRelations = relations(rubricCriterion, ({ one, many }) => ({
	assignment: one(assignment, { fields: [rubricCriterion.assignmentId], references: [assignment.id] }),
	scores: many(criterionScore),
}));

export const submissionRelations = relations(submission, ({ one }) => ({
	course: one(course, { fields: [submission.courseId], references: [course.id] }),
	assignment: one(assignment, { fields: [submission.assignmentId], references: [assignment.id] }),
	grade: one(submissionGrade, { fields: [submission.id], references: [submissionGrade.submissionId] }),
}));

export const submissionGradeRelations = relations(submissionGrade, ({ one, many }) => ({
	submission: one(submission, { fields: [submissionGrade.submissionId], references: [submission.id] }),
	gradedBy: one(user, { fields: [submissionGrade.gradedById], references: [user.id] }),
	criterionScores: many(criterionScore),
}));

export const criterionScoreRelations = relations(criterionScore, ({ one }) => ({
	grade: one(submissionGrade, { fields: [criterionScore.gradeId], references: [submissionGrade.id] }),
	criterion: one(rubricCriterion, { fields: [criterionScore.criterionId], references: [rubricCriterion.id] }),
}));
