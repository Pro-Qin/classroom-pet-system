//go:build !windows

package main

// initConsole is a no-op on non-Windows platforms.
func initConsole() {}

// minToBackground is a no-op on non-Windows platforms.
func minToBackground() {}
