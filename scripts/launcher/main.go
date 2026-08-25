package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

const (
	appName     = "校园宠物乐园"
	chinaMirror = "https://registry.npmmirror.com"
	serverPort  = 3000
	healthPath  = "/api/health"
)

func main() {
	// Determine app directory: folder containing this exe / bat.
	exe, err := os.Executable()
	if err != nil {
		fmt.Println("[错误] 无法定位程序目录:", err)
		pause()
		os.Exit(1)
	}
	appDir := filepath.Dir(exe)

	// If running from scripts/launcher during dev, allow overriding via env.
	if cwd := os.Getenv("PET_APP_DIR"); cwd != "" {
		appDir = cwd
	}

	fmt.Println("============================================")
	fmt.Println("  校园宠物乐园  启动器 (start.exe)")
	fmt.Println("  积分 + 宠物养成 班级激励系统")
	fmt.Println("============================================")
	fmt.Println()

	// 1. Check Node.js
	if !hasNode() {
		fmt.Println("[错误] 未检测到 Node.js。")
		fmt.Println("       请先安装 Node.js 18 或更高版本：https://nodejs.org")
		fmt.Println()
		pause()
		os.Exit(1)
	}

	// 2. Ensure dependencies (only if node_modules missing).
	if !dirExists(filepath.Join(appDir, "node_modules")) {
		fmt.Println("[首次运行] 未找到依赖，正在安装（国内镜像源，需联网，约 1-3 分钟）...")
		fmt.Println()
		if err := npmInstall(appDir); err != nil {
			fmt.Println("[错误] 依赖安装失败：", err)
			fmt.Println("       请检查网络，或手动在项目目录执行：npm install")
			fmt.Println()
			pause()
			os.Exit(1)
		}
		fmt.Println()
	}

	// 3. Ensure build artifacts (if server/dist missing).
	if !fileExists(filepath.Join(appDir, "server", "dist", "index.js")) {
		fmt.Println("[首次运行] 未找到构建产物，正在构建...")
		fmt.Println()
		if err := npmRunBuild(appDir); err != nil {
			fmt.Println("[错误] 构建失败：", err)
			fmt.Println()
			pause()
			os.Exit(1)
		}
		fmt.Println()
	}

	// 4. Start server.
	if serverAlreadyRunning() {
		fmt.Printf("[启动] 服务已运行：http://localhost:%d\n", serverPort)
	} else {
		fmt.Println("[启动] 正在启动服务...")
		if err := startServer(appDir); err != nil {
			fmt.Println("[错误] 服务启动失败：", err)
			fmt.Println()
			pause()
			os.Exit(1)
		}
		waitServerReady(15 * time.Second)
		fmt.Printf("[启动] 服务地址：http://localhost:%d\n", serverPort)
		fmt.Println("       本机其他设备（同一局域网）访问：http://本机IP:3000")
		fmt.Println("       按 Ctrl+C 或关闭本窗口即可停止服务。")
		fmt.Println()
	}

	// 5. Open browser.
	openBrowser(fmt.Sprintf("http://localhost:%d", serverPort))

	fmt.Println("已在默认浏览器打开。关闭本窗口 / 按 Ctrl+C 将停止服务。")
	waitForExit()
}

// hasNode reports whether node is on PATH.
func hasNode() bool {
	for _, bin := range []string{"node", "node.exe"} {
		_, err := exec.LookPath(bin)
		if err == nil {
			return true
		}
	}
	return false
}

func npmInstall(dir string) error {
	cmd := exec.Command("npm", "install", "--registry="+chinaMirror, "--no-audit", "--no-fund")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func npmRunBuild(dir string) error {
	cmd := exec.Command("npm", "run", "build")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// startServer launches `node server/dist/index.js` in the app dir and returns.
// The child is started independent of the parent so it keeps running.
func startServer(dir string) error {
	script := filepath.Join("server", "dist", "index.js")
	nodeExe := "node"
	if runtime.GOOS == "windows" {
		nodeExe = "node.exe"
	}
	cmd := exec.Command(nodeExe, script)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	// Detach: let it keep running after we exit (Windows GUI case).
	go func() { _ = cmd.Wait() }()
	return nil
}

func serverAlreadyRunning() bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", serverPort), 300*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func waitServerReady(timeout time.Duration) {
	client := &http.Client{Timeout: 2 * time.Second}
	url := fmt.Sprintf("http://localhost:%d%s", serverPort, healthPath)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

// waitForExit blocks until the server process list can no longer be distinguished
// (the user closes the launcher / stops the server). We simply hold the window open
// so Ctrl+C works; on Windows the node child keeps running independently.
func waitForExit() {
	// Use a simplistic approach: keep running until the service is stopped by user.
	client := &http.Client{Timeout: 2 * time.Second}
	url := fmt.Sprintf("http://localhost:%d%s", serverPort, healthPath)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		resp, err := client.Get(url)
		if err != nil {
			fmt.Println("[停止] 服务已停止。")
			return
		}
		_ = resp.Body.Close()
	}
}

func dirExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

// pause waits for a keypress on Windows when stdin is a console.
func pause() {
	if runtime.GOOS != "windows" {
		return
	}
	fmt.Print("按任意键继续...")
	var b [1]byte
	_, _ = os.Stdin.Read(b[:])
}
