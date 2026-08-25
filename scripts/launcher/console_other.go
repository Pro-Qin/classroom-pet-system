//go:build !windows

package main

// initConsole is a no-op on non-Windows platforms.
func initConsole() {}

// minimizeConsole is a no-op on non-Windows platforms.
func minimizeConsole() {}
