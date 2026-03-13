package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func (app *App) startWorkers() {
	for range app.cfg.MaxConcurrentJobs {
		go func() {
			for jobID := range app.queue {
				job, ok := app.store.Get(jobID)
				if !ok {
					continue
				}
				app.processJob(job)
			}
		}()
	}
}

func (app *App) processJob(job *Job) {
	now := time.Now()
	job.StartedAt = &now
	job.Status = StatusRunning
	log.Printf("job %s: started (repo=%s)", job.ID, job.repoURL)

	jobDir := filepath.Join(app.cfg.DataDir, job.ID)
	repoDir := filepath.Join(jobDir, "repo")
	outDir := filepath.Join(jobDir, "out")

	if err := os.MkdirAll(outDir, 0777); err != nil {
		app.failJob(job, fmt.Sprintf("mkdir failed: %v", err))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(app.cfg.JobTimeout)*time.Second)
	defer cancel()

	// Clone the repo
	log.Printf("job %s: cloning %s", job.ID, job.repoURL)
	cloneCmd := exec.CommandContext(ctx, "git", "clone", "--depth=1", job.repoURL, repoDir)
	if out, err := cloneCmd.CombinedOutput(); err != nil {
		app.failJob(job, fmt.Sprintf("git clone failed: %v\n%s", err, out))
		return
	}

	// Base64-encode criteria JSON for passing to the container
	criteriaJSON, _ := json.Marshal(job.criteria)
	criteriaB64 := base64.StdEncoding.EncodeToString(criteriaJSON)

	// Build docker run args
	args := app.buildDockerArgs(job.ID, criteriaB64)
	log.Printf("job %s: running grader container", job.ID)

	dockerCmd := exec.CommandContext(ctx, "docker", args...)
	output, err := dockerCmd.CombinedOutput()
	if err != nil {
		app.failJob(job, fmt.Sprintf("docker run failed: %v\n%s", err, output))
		return
	}

	// Parse result
	result, err := app.parseResult(outDir)
	if err != nil {
		app.failJob(job, fmt.Sprintf("parse result failed: %v", err))
		return
	}
	if len(result.Criteria) == 0 {
		app.failJob(job, "grader produced no criteria results (Claude likely errored)")
		return
	}

	// Check for dist artifact
	distDir := filepath.Join(outDir, "dist")
	if info, err := os.Stat(distDir); err == nil && info.IsDir() {
		entries, _ := os.ReadDir(distDir)
		result.HasDist = len(entries) > 0
	}

	completedAt := time.Now()
	job.CompletedAt = &completedAt
	job.Status = StatusDone
	job.Result = result
	log.Printf("job %s: done (hasDist=%v, criteria=%d)", job.ID, result.HasDist, len(result.Criteria))

	app.sendWebhook(job)
}

func (app *App) buildDockerArgs(jobID, criteriaB64 string) []string {
	jobDir := filepath.Join(app.cfg.DataDir, jobID)

	args := []string{
		"run", "--rm",
		"-v", jobDir + "/repo:/repo",
		"-v", jobDir + "/out:/out",
		"--memory", "2g",
		"--cpus", "2",
		"--pids-limit", "512",
		"--tmpfs", "/tmp:size=512m",
		"--security-opt", "no-new-privileges",
	}

	if app.cfg.AnthropicAPIKey != "" {
		args = append(args, "-e", "CLAUDE_CODE_OAUTH_TOKEN="+app.cfg.AnthropicAPIKey)
	}

	args = append(args, app.cfg.DockerImage, "/run.sh", criteriaB64)
	return args
}

type graderOutput struct {
	Criteria []CriterionResult `json:"criteria"`
	Log      string            `json:"log"`
}

func (app *App) parseResult(outDir string) (*JobResult, error) {
	data, err := os.ReadFile(filepath.Join(outDir, "result.json"))
	if err != nil {
		return nil, fmt.Errorf("result.json not found: %w", err)
	}
	var out graderOutput
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("result.json parse error: %w", err)
	}
	return &JobResult{
		Criteria: out.Criteria,
		Log:      out.Log,
	}, nil
}

func (app *App) failJob(job *Job, errMsg string) {
	now := time.Now()
	job.CompletedAt = &now
	job.Status = StatusFailed
	job.Error = &errMsg

	// Attach whatever Claude logged before failing, so the UI can show it
	if logBytes, err := os.ReadFile(filepath.Join(app.cfg.DataDir, job.ID, "out", "claude.log")); err == nil {
		job.Result = &JobResult{Log: string(logBytes)}
	}

	log.Printf("job %s: failed — %s", job.ID, errMsg)
	app.sendWebhook(job)
}
