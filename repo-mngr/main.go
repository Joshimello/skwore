package main

import (
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"time"
)

func timeNow() time.Time { return time.Now() }

type App struct {
	cfg   Config
	store *Store
	queue chan string // buffered channel of job IDs
}

func main() {
	cfg := loadConfig()

	app := &App{
		cfg:   cfg,
		store: NewStore(),
		queue: make(chan string, 1000),
	}

	MigrateFromDisk(cfg.DataDir)
	app.store.LoadFromDisk(cfg.DataDir)
	app.startWorkers()

	mux := http.NewServeMux()
	mux.HandleFunc("POST /jobs", app.handleCreateJob)
	mux.HandleFunc("GET /jobs/{jobId}", app.handleGetJob)
	mux.HandleFunc("POST /jobs/{jobId}/preview", app.handleStartPreview)
	mux.HandleFunc("DELETE /jobs/{jobId}/preview", app.handleStopPreview)
	mux.HandleFunc("DELETE /jobs/{jobId}", app.handleDeleteJob)
	mux.HandleFunc("POST /extract-criteria", app.handleExtractCriteria)

	addr := ":" + cfg.Port
	log.Printf("repo-mngr listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func newJob(submissionID, repoURL string, criteria []CriterionInput, callbackURL string) *Job {
	return &Job{
		ID:           newUUID(),
		SubmissionID: submissionID,
		Status:       StatusQueued,
		CreatedAt:    timeNow(),
		repoURL:      repoURL,
		criteria:     criteria,
		callbackURL:  callbackURL,
	}
}

func newUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
