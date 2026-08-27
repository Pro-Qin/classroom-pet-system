//go:build !windows

package main

import "os/exec"

// initConsole is a no-op on non-Windows platforms.
func initConsole() {}

// minToBackground is a no-op on non-Windows platforms.
func minToBackground() {}

// noNewConsole is a no-op on non-Windows platforms.
func noNewConsole(cmd *exec.Cmd) {}
