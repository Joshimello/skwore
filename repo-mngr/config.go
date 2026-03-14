package main

import (
	"os"
	"strconv"
)

type Config struct {
	Port              string
	AnthropicAPIKey   string
	DockerImage       string
	MaxConcurrentJobs int
	JobTimeout        int // seconds
	WebhookSecret     string
	DataDir           string

	CloudflareTunnelName string
	PreviewDomain        string
	PreviewPortMin       int
	PreviewPortMax       int
	PreviewTTLSeconds    int
}

func loadConfig() Config {
	return Config{
		Port:              getEnv("PORT", "8080"),
		AnthropicAPIKey:   os.Getenv("ANTHROPIC_API_KEY"),
		DockerImage:       getEnv("DOCKER_IMAGE", "grader-image:latest"),
		MaxConcurrentJobs: getEnvInt("MAX_CONCURRENT_JOBS", 4),
		JobTimeout:        getEnvInt("JOB_TIMEOUT", 300),
		WebhookSecret:     os.Getenv("WEBHOOK_SECRET"),
		DataDir:           getEnv("DATA_DIR", "/data/jobs"),

		CloudflareTunnelName: os.Getenv("CLOUDFLARE_TUNNEL_NAME"),
		PreviewDomain:        os.Getenv("PREVIEW_DOMAIN"),
		PreviewPortMin:       getEnvInt("PREVIEW_PORT_MIN", 30000),
		PreviewPortMax:       getEnvInt("PREVIEW_PORT_MAX", 39999),
		PreviewTTLSeconds:    getEnvInt("PREVIEW_TTL_SECONDS", 300),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
