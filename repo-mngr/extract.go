package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type extractedCriteria struct {
	Criteria []criterionExtract `json:"criteria"`
}

type criterionExtract struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Points      float64 `json:"points"`
}

var criteriaJSONRe = regexp.MustCompile(`(?s)\{"criteria"\s*:\s*\[.*?\]\}`)

func (app *App) handleExtractCriteria(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "failed to parse form", http.StatusBadRequest)
		return
	}

	text := strings.TrimSpace(r.FormValue("text"))

	var tmpDir string
	hasPDF := false

	file, _, err := r.FormFile("pdf")
	if err == nil {
		defer file.Close()
		tmpDir, err = os.MkdirTemp(app.cfg.DataDir, "extract-*")
		if err != nil {
			http.Error(w, "failed to create temp dir", http.StatusInternalServerError)
			return
		}
		defer os.RemoveAll(tmpDir)

		data, readErr := io.ReadAll(file)
		if readErr != nil {
			http.Error(w, "failed to read PDF", http.StatusBadRequest)
			return
		}
		pdfPath := filepath.Join(tmpDir, "assignment.pdf")
		if writeErr := os.WriteFile(pdfPath, data, 0644); writeErr != nil {
			http.Error(w, "failed to write PDF", http.StatusInternalServerError)
			return
		}
		hasPDF = true
	}

	if !hasPDF && text == "" {
		http.Error(w, "provide a PDF file or assignment text", http.StatusBadRequest)
		return
	}

	prompt := buildExtractPrompt(hasPDF, text)

	args := []string{
		"run", "--rm",
		"--memory", "512m",
		"--cpus", "1",
		"--pids-limit", "128",
		"--security-opt", "no-new-privileges",
	}

	if app.cfg.AnthropicAPIKey != "" {
		args = append(args, "-e", "CLAUDE_CODE_OAUTH_TOKEN="+app.cfg.AnthropicAPIKey)
	}

	if hasPDF {
		args = append(args, "-v", tmpDir+":/input:ro")
	}

	args = append(args, app.cfg.DockerImage,
		"claude", "--dangerously-skip-permissions", "--print", "--max-turns", "20", prompt)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	log.Printf("extract-criteria: running claude container (hasPDF=%v)", hasPDF)
	cmd := exec.CommandContext(ctx, "docker", args...)
	output, cmdErr := cmd.CombinedOutput()
	if cmdErr != nil {
		log.Printf("extract-criteria: docker run failed: %v\n%s", cmdErr, output)
		http.Error(w, fmt.Sprintf("extraction failed: %v", cmdErr), http.StatusBadGateway)
		return
	}

	result, ok := parseExtractedCriteria(string(output))
	if !ok {
		log.Printf("extract-criteria: no valid JSON in output:\n%s", output)
		http.Error(w, "no valid criteria JSON found in model output", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func buildExtractPrompt(hasPDF bool, text string) string {
	var sb strings.Builder

	if hasPDF {
		sb.WriteString("Your ONLY task: read /input/assignment.pdf using the Read tool, extract rubric criteria, then output JSON.\n\n")
		sb.WriteString("Rules:\n- Use ONLY the Read tool to read the file\n- Do NOT run bash commands\n- Do NOT write any files\n- Output ONLY the JSON below with no explanation\n\n")
		if text != "" {
			sb.WriteString(fmt.Sprintf("Also consider this additional context:\n%s\n\n", text))
		}
	} else {
		sb.WriteString("Your ONLY task: extract rubric criteria from the assignment text below and output JSON.\n\n")
		sb.WriteString("Rules:\n- Do NOT use any tools\n- Do NOT run any commands\n- Do NOT write any files\n- Output ONLY the JSON below immediately with no explanation\n\n")
		sb.WriteString(fmt.Sprintf("Assignment text:\n%s\n\n", text))
	}

	sb.WriteString(`Output format (no markdown, no fences, just JSON): {"criteria":[{"name":"...","description":"...","points":N}]}`)
	return sb.String()
}

func parseExtractedCriteria(output string) (*extractedCriteria, bool) {
	matches := criteriaJSONRe.FindAllString(output, -1)
	for i := len(matches) - 1; i >= 0; i-- {
		var result extractedCriteria
		if err := json.Unmarshal([]byte(matches[i]), &result); err == nil {
			return &result, true
		}
	}
	return nil, false
}
