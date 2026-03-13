package main

import (
	"os/exec"
	"sync"
	"time"
)

type JobStatus string

const (
	StatusQueued  JobStatus = "queued"
	StatusRunning JobStatus = "running"
	StatusDone    JobStatus = "done"
	StatusFailed  JobStatus = "failed"
)

type CriterionInput struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MaxPoints   int    `json:"maxPoints"`
}

type CriterionResult struct {
	CriterionID    string `json:"criterionId"`
	Status         string `json:"status"` // pass | unsure | fail
	SuggestedScore int    `json:"suggestedScore"`
	Comment        string `json:"comment"`
}

type JobResult struct {
	HasDist    bool              `json:"hasDist"`
	PreviewURL *string           `json:"previewUrl"`
	Criteria   []CriterionResult `json:"criteria"`
	Log        string            `json:"log"`
}

// JobResponse is the serialized view returned by the API.
type JobResponse struct {
	JobID        string     `json:"jobId"`
	SubmissionID string     `json:"submissionId"`
	Status       JobStatus  `json:"status"`
	CreatedAt    time.Time  `json:"createdAt"`
	StartedAt    *time.Time `json:"startedAt"`
	CompletedAt  *time.Time `json:"completedAt"`
	Result       *JobResult `json:"result"`
	Error        *string    `json:"error"`
}

// Job holds full runtime state. Unexported fields are not serialized.
type Job struct {
	// exported → serialized via toResponse()
	ID           string
	SubmissionID string
	Status       JobStatus
	CreatedAt    time.Time
	StartedAt    *time.Time
	CompletedAt  *time.Time
	Result       *JobResult
	Error        *string

	// internal — not exposed via API
	repoURL     string
	criteria    []CriterionInput
	callbackURL string

	// preview state — protected by mu
	mu           sync.Mutex
	previewBun   *exec.Cmd
	previewCF    *exec.Cmd
	previewTimer *time.Timer
}

func (j *Job) toResponse() JobResponse {
	return JobResponse{
		JobID:        j.ID,
		SubmissionID: j.SubmissionID,
		Status:       j.Status,
		CreatedAt:    j.CreatedAt,
		StartedAt:    j.StartedAt,
		CompletedAt:  j.CompletedAt,
		Result:       j.Result,
		Error:        j.Error,
	}
}

// Store is a thread-safe in-memory job store.
type Store struct {
	mu   sync.RWMutex
	jobs map[string]*Job
}

func NewStore() *Store {
	return &Store{jobs: make(map[string]*Job)}
}

func (s *Store) Set(job *Job) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[job.ID] = job
}

func (s *Store) Get(id string) (*Job, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	j, ok := s.jobs[id]
	return j, ok
}

func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.jobs, id)
}
