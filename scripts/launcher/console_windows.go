//go:build windows

package main

import "syscall"

// initConsole switches the console codepage to UTF-8 so that box-drawing
// Unicode characters (═ ║ ╔ ╗ ╚ ╝) render correctly regardless of the user's
// default codepage (e.g. GBK/936 on Chinese Windows, which garbles UTF-8).
func initConsole() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	// SetConsoleOutputCP(65001) — affects output
	kernel32.NewProc("SetConsoleOutputCP").Call(65001)
	// SetConsoleCP(65001) — affects input
	kernel32.NewProc("SetConsoleCP").Call(65001)
}

// minimizeConsole minimizes the current console window so it drops to the
// taskbar once the browser opens (user only needs the web UI afterwards).
func minimizeConsole() {
	user32 := syscall.NewLazyDLL("user32.dll")
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	hwnd, _, _ := kernel32.NewProc("GetConsoleWindow").Call()
	if hwnd != 0 {
		// 6 = SW_MINIMIZE
		user32.NewProc("ShowWindow").Call(hwnd, 6)
	}
}
