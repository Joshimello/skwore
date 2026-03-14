package main

import (
	"encoding/json"
	"net/http"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// POST /jobs
func (app *App) handleCreateJob(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SubmissionID string           `json:"submissionId"`
		RepoURL      string           `json:"repoUrl"`
		Criteria     []CriterionInput `json:"criteria"`
		CallbackURL  string           `json:"callbackUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SubmissionID == "" || req.RepoURL == "" {
		writeError(w, http.StatusBadRequest, "submissionId and repoUrl are required")
		return
	}

	job := newJob(req.SubmissionID, req.RepoURL, req.Criteria, req.CallbackURL)
	app.store.Set(job)

	select {
	case app.queue <- job.ID:
	default:
		// Queue full — still accepted, will process when a worker is free
		// (queue is buffered to 1000, this is a safety valve)
		app.store.Delete(job.ID)
		writeError(w, http.StatusServiceUnavailable, "job queue full, try again later")
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"jobId":  job.ID,
		"status": job.Status,
	})
}

// GET /jobs/{jobId}
func (app *App) handleGetJob(w http.ResponseWriter, r *http.Request) {
	job, ok := app.store.Get(r.PathValue("jobId"))
	if !ok {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	writeJSON(w, http.StatusOK, job.toResponse())
}

// POST /jobs/{jobId}/preview
func (app *App) handleStartPreview(w http.ResponseWriter, r *http.Request) {
	job, ok := app.store.Get(r.PathValue("jobId"))
	if !ok {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}

	job.mu.Lock()
	defer job.mu.Unlock()

	if job.Status != StatusDone {
		writeError(w, http.StatusBadRequest, "job is not done")
		return
	}
	if job.Result == nil || !job.Result.HasDist {
		writeError(w, http.StatusNotFound, "job has no dist artifact")
		return
	}
	if app.cfg.CloudflareTunnelName == "" || app.cfg.PreviewDomain == "" {
		writeError(w, http.StatusServiceUnavailable, "preview not configured (missing CLOUDFLARE_TUNNEL_NAME or PREVIEW_DOMAIN)")
		return
	}

	// Already running — return existing URL
	if job.previewHTTP != nil {
		if job.Result.PreviewURL != nil {
			writeJSON(w, http.StatusConflict, map[string]string{"previewUrl": *job.Result.PreviewURL})
		} else {
			writeError(w, http.StatusConflict, "preview already starting")
		}
		return
	}

	url, err := app.startPreview(job)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"previewUrl": url})
}

// DELETE /jobs/{jobId}/preview
func (app *App) handleStopPreview(w http.ResponseWriter, r *http.Request) {
	job, ok := app.store.Get(r.PathValue("jobId"))
	if !ok {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}

	job.mu.Lock()
	app.stopPreview(job)
	job.mu.Unlock()

	w.WriteHeader(http.StatusNoContent)
}

// DELETE /jobs/{jobId}
func (app *App) handleDeleteJob(w http.ResponseWriter, r *http.Request) {
	job, ok := app.store.Get(r.PathValue("jobId"))
	if !ok {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}

	job.mu.Lock()
	app.stopPreview(job)
	job.mu.Unlock()

	app.store.Delete(job.ID)
	w.WriteHeader(http.StatusNoContent)
}
