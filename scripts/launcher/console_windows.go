//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

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

// minToBackground sends the console window to the background WITHOUT minimizing
// to the taskbar, so it sits behind the browser and doesn't steal focus.
// ShowWindow(hwnd, SW_SHOWNA=8) shows the window without activating it.
func minToBackground() {
	user32 := syscall.NewLazyDLL("user32.dll")
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	hwnd, _, _ := kernel32.NewProc("GetConsoleWindow").Call()
	if hwnd != 0 {
		user32.NewProc("ShowWindow").Call(hwnd, 8) // SW_SHOWNA
		user32.NewProc("SetWindowPos").Call(hwnd, 1 /*HWND_BOTTOM*/, 0, 0, 0, 0, 0x0001|0x0002|0x0010) // SWP_NOMOVE|NOSIZE|NOACTIVATE
	}
}

// noNewConsole 为子进程设置属性：不创建新控制台、不显示新窗口。
// 子进程默认继承父控制台；此标志仅防御边缘场景（如 npm.cmd 调用链）突然弹出新终端。
func noNewConsole(cmd *exec.Cmd) {
	// CREATE_NO_WINDOW = 0x08000000（父进程已有控制台时无副作用）
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
