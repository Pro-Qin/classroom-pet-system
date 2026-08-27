package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestLiveDownloadPortableNode(t *testing.T) {
	if os.Getenv("PET_LIVE_DL") != "1" {
		t.Skip("set PET_LIVE_DL=1 to run live download")
	}
	dest := filepath.Join(t.TempDir(), "runtime", "node")
	start := time.Now()
	if err := downloadPortableNode(dest); err != nil {
		t.Fatalf("download: %v", err)
	}
	t.Logf("download+unzip took %s", time.Since(start))
	out, err := exec.Command(filepath.Join(dest, "node.exe"), "-v").Output()
	if err != nil {
		t.Fatalf("node -v: %v", err)
	}
	t.Logf("node -v = %s", string(out))
	if !portableNodeOK(dest) {
		t.Fatal("portable layout incomplete")
	}
}
