package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestProgressPercentMonotonicAndCapped(t *testing.T) {
	prev := -1
	var got []int
	for sec := 0; sec <= 60; sec++ {
		p := progressPercent(time.Duration(sec) * time.Second)
		got = append(got, p)
		if p < 0 {
			t.Fatalf("neg value at %ds: %d", sec, p)
		}
		if p > progressCap {
			t.Fatalf("exceeded cap at %ds: %d > %d", sec, p, progressCap)
		}
		if p < prev {
			t.Fatalf("not monotonic at %ds: %d < %d", sec, p, prev)
		}
		prev = p
	}
	if got[0] != 0 {
		t.Fatalf("start should be 0, got %d", got[0])
	}
	// Should approach the cap but never exceed it; at 60s it should be well past
	// 50% but still < cap.
	if prev > progressCap {
		t.Fatalf("should not exceed cap %d, got %d", progressCap, prev)
	}
	if prev < 50 {
		t.Fatalf("after 60s should be past 50%%, got %d", prev)
	}
}

func TestProgressPercentDecelerates(t *testing.T) {
	// Increments should get smaller as time grows (deceleration):
	// early (1s->2s) increment > late (30s->31s) increment.
	early := progressPercent(2*time.Second) - progressPercent(1*time.Second)
	late := progressPercent(31*time.Second) - progressPercent(30*time.Second)
	if early <= late {
		t.Fatalf("expected deceleration: early increment %d should be > late increment %d", early, late)
	}
	if early <= 0 {
		t.Fatalf("early increment should be positive, got %d", early)
	}
}

func TestWaitServerReadyFalseOnNoListener(t *testing.T) {
	// No server listening on this port -> should return false.
	port := findFreePort(40000, 50)
	done := make(chan struct{})
	close(done) // "child already exited" — forces fast false
	ok := waitServerReady(port, 700*time.Millisecond, done)
	if ok {
		t.Fatalf("expected false when nothing listens on %d and child exited", port)
	}
}

func TestWaitServerReadyFalseWhenChildExits(t *testing.T) {
	// A port that's free but not serving, with a child that exits immediately.
	port := findFreePort(40100, 50)
	done := make(chan struct{})
	close(done)
	start := time.Now()
	ok := waitServerReady(port, 5*time.Second, done)
	if ok {
		t.Fatal("expected false")
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("child-exit path should return quickly, not wait full timeout")
	}
}

// TestRunFailureDoesNotOpenBrowser verifies the core requirement: when the
// server cannot be started / never becomes ready, run() must NOT call
// openBrowser and must return a non-zero exit code.
func TestRunFailureDoesNotOpenBrowser(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("node/launcher path is Windows-specific")
	}

	// Build a fake app dir that passes dependency + build checks but whose
	// server/dist/index.js exits immediately with a non-zero code (simulated
	// crash), so waitServerReady sees the child die and returns false.
	tmp := t.TempDir()
	mustMkdir(t, filepath.Join(tmp, "node_modules", "express"))
	mustMkdir(t, filepath.Join(tmp, "server", "dist"))
	// A script that exits with code 1 right away.
	crashJS := "console.error('boom'); process.exit(1);\n"
	err := os.WriteFile(filepath.Join(tmp, "server", "dist", "index.js"), []byte(crashJS), 0o644)
	if err != nil {
		t.Fatal(err)
	}

	// Stub the browser opener + pause so the test can observe behavior without
	// a real browser or stdin block.
	opened := ""
	openBrowser = func(url string) { opened = url }
	pauseStub := func() { /* no-op */ }
	pause = pauseStub
	// Restore after test.
	defer func() {
		openBrowser = func(url string) { _ = url }
		pause = func() { _ = 0 }
	}()

	t.Setenv("PET_APP_DIR", tmp)
	// Also reduce the wait so the unit test is fast; but run() uses a fixed 15s
	// timeout with the child-exit fast path, so it returns quickly anyway.
	prevExit := run()

	if opened != "" {
		t.Fatalf("openBrowser must NOT be called on server-start failure; got url=%q", opened)
	}
	if prevExit == 0 {
		t.Fatalf("expected non-zero exit code on server-start failure, got 0")
	}
}

func TestWaitServerReadyTrueWhenServing(t *testing.T) {
	// A real HTTP server answering /api/health should make waitServerReady
	// return true (the success-detection half of c9).
	port := findFreePort(42000, 50)
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == healthPath {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})}
	defer srv.Close()
	go func() { _ = srv.Serve(ln) }()

	// done == nil (children never "exit"); we expect true because the stub is up.
	ok := waitServerReady(port, 2*time.Second, nil)
	if !ok {
		t.Fatalf("expected true when a server answers %s on %d", healthPath, port)
	}
}

func mustMkdir(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
}

