package main

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// startPreview starts a bun static server + cloudflared tunnel for a completed job.
// Caller must hold job.mu.
func (app *App) startPreview(job *Job) (string, error) {
	distDir := filepath.Join(app.cfg.DataDir, job.ID, "out", "dist")

	port, err := findFreePort(app.cfg.PreviewPortMin, app.cfg.PreviewPortMax)
	if err != nil {
		return "", fmt.Errorf("no free port available: %w", err)
	}

	// Start serve (pre-installed globally in the image)
	bunCmd := exec.Command("serve", "-s", distDir, "-l", strconv.Itoa(port))
	if err := bunCmd.Start(); err != nil {
		return "", fmt.Errorf("serve start failed: %w", err)
	}
	log.Printf("preview: started static server for job %s on port %d", job.ID, port)

	// Start cloudflared tunnel for this specific subdomain
	hostname := fmt.Sprintf("preview-%s.%s", job.ID, app.cfg.PreviewDomain)
	localURL := fmt.Sprintf("http://localhost:%d", port)

	cfCmd := exec.Command(
		"cloudflared", "tunnel",
		"--credentials-file", "/etc/cloudflared/tunnel.json",
		"--hostname", hostname,
		"--url", localURL,
		"run", app.cfg.CloudflareTunnelName,
	)

	stderr, err := cfCmd.StderrPipe()
	if err != nil {
		bunCmd.Process.Kill()
		return "", fmt.Errorf("cloudflared stderr pipe failed: %w", err)
	}
	if err := cfCmd.Start(); err != nil {
		bunCmd.Process.Kill()
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
			bunCmd.Process.Kill()
			cfCmd.Process.Kill()
			return "", fmt.Errorf("cloudflared failed to connect")
		}
	case <-time.After(30 * time.Second):
		bunCmd.Process.Kill()
		cfCmd.Process.Kill()
		return "", fmt.Errorf("cloudflared connection timeout")
	}

	previewURL := fmt.Sprintf("https://%s", hostname)
	job.previewBun = bunCmd
	job.previewCF = cfCmd
	if job.Result != nil {
		job.Result.PreviewURL = &previewURL
	}

	// Auto-kill after TTL
	if app.cfg.PreviewTTLSeconds > 0 {
		ttl := time.Duration(app.cfg.PreviewTTLSeconds) * time.Second
		job.previewTimer = time.AfterFunc(ttl, func() {
			job.mu.Lock()
			defer job.mu.Unlock()
			log.Printf("preview: TTL expired for job %s", job.ID)
			app.stopPreview(job)
		})
	}

	log.Printf("preview: tunnel live for job %s at %s", job.ID, previewURL)
	return previewURL, nil
}

// stopPreview kills the bun server and cloudflared subprocess.
// Caller must hold job.mu.
func (app *App) stopPreview(job *Job) {
	if job.previewTimer != nil {
		job.previewTimer.Stop()
		job.previewTimer = nil
	}
	if job.previewBun != nil && job.previewBun.Process != nil {
		job.previewBun.Process.Kill()
		job.previewBun = nil
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
