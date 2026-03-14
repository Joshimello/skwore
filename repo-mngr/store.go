package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
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
	mu                  sync.Mutex
	previewHTTP         *http.Server
	previewCF           *exec.Cmd
	previewLastAccessed int64
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

// MigrateFromDisk synthesizes job.json for old job dirs that have out/result.json
// but were created before job persistence was added. Safe to call multiple times.
func MigrateFromDisk(dataDir string) {
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return
	}
	n := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(dataDir, entry.Name())
		jobFile := filepath.Join(dir, "job.json")
		if _, err := os.Stat(jobFile); err == nil {
			continue // already migrated
		}
		resultFile := filepath.Join(dir, "out", "result.json")
		data, err := os.ReadFile(resultFile)
		if err != nil {
			continue
		}
		var out graderOutput
		if err := json.Unmarshal(data, &out); err != nil {
			continue
		}
		resp := JobResponse{
			JobID:  entry.Name(),
			Status: StatusDone,
			Result: &JobResult{Criteria: out.Criteria, Log: out.Log},
		}
		if info, err := entry.Info(); err == nil {
			resp.CreatedAt = info.ModTime()
		}
		migrated, err := json.Marshal(resp)
		if err != nil {
			continue
		}
		if err := os.WriteFile(jobFile, migrated, 0644); err != nil {
			log.Printf("store: migration write failed for %s: %v", entry.Name(), err)
			continue
		}
		n++
	}
	if n > 0 {
		log.Printf("store: migrated %d legacy job dirs to job.json", n)
	}
}

// LoadFromDisk scans dataDir for job.json files written by persistJob and
// restores completed/failed jobs into the store. Called once at startup.
func (s *Store) LoadFromDisk(dataDir string) {
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return
	}
	n := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dataDir, entry.Name(), "job.json"))
		if err != nil {
			continue
		}
		var resp JobResponse
		if err := json.Unmarshal(data, &resp); err != nil {
			log.Printf("store: skipping malformed job.json in %s: %v", entry.Name(), err)
			continue
		}
		s.Set(&Job{
			ID:           resp.JobID,
			SubmissionID: resp.SubmissionID,
			Status:       resp.Status,
			CreatedAt:    resp.CreatedAt,
			StartedAt:    resp.StartedAt,
			CompletedAt:  resp.CompletedAt,
			Result:       resp.Result,
			Error:        resp.Error,
		})
		n++
	}
	if n > 0 {
		log.Printf("store: loaded %d jobs from disk", n)
	}
}
