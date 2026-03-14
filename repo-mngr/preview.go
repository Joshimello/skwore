package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// startPreview starts a Go static file server + cloudflared tunnel for a completed job.
// Caller must hold job.mu.
func (app *App) startPreview(job *Job) (string, error) {
	distDir := filepath.Join(app.cfg.DataDir, job.ID, "out", "dist")

	port, err := findFreePort(app.cfg.PreviewPortMin, app.cfg.PreviewPortMax)
	if err != nil {
		return "", fmt.Errorf("no free port available: %w", err)
	}

	// Start Go's own static file server so we can track last-access time
	mux := http.NewServeMux()
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		job.mu.Lock()
		job.previewLastAccessed = time.Now().Unix()
		job.mu.Unlock()
		http.FileServer(http.Dir(distDir)).ServeHTTP(w, r)
	}))
	httpServer := &http.Server{Addr: fmt.Sprintf(":%d", port), Handler: mux}
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("preview: file server error for job %s: %v", job.ID, err)
		}
	}()
	log.Printf("preview: started static server for job %s on port %d", job.ID, port)

	// Start cloudflared tunnel for this specific subdomain
	hostname := fmt.Sprintf("preview-%s.%s", job.ID, app.cfg.PreviewDomain)
	localURL := fmt.Sprintf("http://localhost:%d", port)

	cfCmd := exec.Command(
		"cloudflared", "tunnel",
		"--credentials-file", "/etc/cloudflared/tunnel.json",
		"run", "--url", localURL,
		app.cfg.CloudflareTunnelName,
	)

	stderr, err := cfCmd.StderrPipe()
	if err != nil {
		httpServer.Shutdown(context.Background())
		return "", fmt.Errorf("cloudflared stderr pipe failed: %w", err)
	}
	if err := cfCmd.Start(); err != nil {
		httpServer.Shutdown(context.Background())
		return "", fmt.Errorf("cloudflared start failed: %w", err)
	}

	// Wait for cloudflared to establish the tunnel connection
	connected := make(chan bool, 1)
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			log.Printf("cloudflared [%s]: %s", job.ID, line)
			if strings.Contains(line, "Registered tunnel connection") ||
				strings.Contains(line, "Connection registered") ||
				strings.Contains(line, "connsReady=1") {
				connected <- true
				return
			}
		}
		connected <- false
	}()

	select {
	case ok := <-connected:
		if !ok {
			httpServer.Shutdown(context.Background())
			cfCmd.Process.Kill()
			return "", fmt.Errorf("cloudflared failed to connect")
		}
	case <-time.After(30 * time.Second):
		httpServer.Shutdown(context.Background())
		cfCmd.Process.Kill()
		return "", fmt.Errorf("cloudflared connection timeout")
	}

	previewURL := fmt.Sprintf("https://%s", hostname)
	job.previewHTTP = httpServer
	job.previewCF = cfCmd
	job.previewLastAccessed = time.Now().Unix()
	if job.Result != nil {
		job.Result.PreviewURL = &previewURL
	}

	// Inactivity watcher — shuts down after PreviewTTLSeconds of no requests
	inactivitySeconds := app.cfg.PreviewTTLSeconds
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			job.mu.Lock()
			idle := time.Since(time.Unix(job.previewLastAccessed, 0))
			running := job.previewHTTP != nil
			job.mu.Unlock()
			if !running {
				return
			}
			if idle > time.Duration(inactivitySeconds)*time.Second {
				log.Printf("preview: inactivity timeout for job %s", job.ID)
				job.mu.Lock()
				app.stopPreview(job)
				job.mu.Unlock()
				return
			}
		}
	}()

	log.Printf("preview: tunnel live for job %s at %s", job.ID, previewURL)
	return previewURL, nil
}

// stopPreview shuts down the file server and kills cloudflared.
// Caller must hold job.mu.
func (app *App) stopPreview(job *Job) {
	if job.previewHTTP != nil {
		job.previewHTTP.Shutdown(context.Background())
		job.previewHTTP = nil
	}
	if job.previewCF != nil && job.previewCF.Process != nil {
		job.previewCF.Process.Kill()
		job.previewCF = nil
	}
	if job.Result != nil {
		job.Result.PreviewURL = nil
	}
}

func findFreePort(min, max int) (int, error) {
	for port := min; port <= max; port++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
		if err == nil {
			ln.Close()
			return port, nil
		}
	}
	return 0, fmt.Errorf("no free port in range %d-%d", min, max)
}
