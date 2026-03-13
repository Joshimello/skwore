package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

func (app *App) sendWebhook(job *Job) {
	if job.callbackURL == "" {
		return
	}

	body, err := json.Marshal(job.toResponse())
	if err != nil {
		log.Printf("webhook: marshal failed for job %s: %v", job.ID, err)
		return
	}

	mac := hmac.New(sha256.New, []byte(app.cfg.WebhookSecret))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req, err := http.NewRequest(http.MethodPost, job.callbackURL, bytes.NewReader(body))
	if err != nil {
		log.Printf("webhook: build request failed for job %s: %v", job.ID, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Repo-Manager-Signature", sig)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("webhook: delivery failed for job %s: %v", job.ID, err)
		return
	}
	defer resp.Body.Close()
	log.Printf("webhook: delivered for job %s, status %d", job.ID, resp.StatusCode)
}
