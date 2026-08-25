package main

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const (
	appName      = "校园宠物乐园"
	chinaMirror  = "https://registry.npmmirror.com"
	startPort    = 3000 // 起始端口；若被占用/系统保留会自动递增
	maxPortTries = 200  // 最多尝试 200 个端口
	healthPath   = "/api/health"
)

func main() {
	initConsole() // set UTF-8 codepage on Windows

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

	printBanner()

	// 1. Check Node.js
	if !hasNode() {
		stepErr("未检测到 Node.js", "请先安装 Node.js 18 或更高版本：https://nodejs.org")
		pause()
		os.Exit(1)
	}

	// 2. Ensure dependencies. Check a known runtime dep (express) so that a
	//    partially-installed node_modules (e.g. only root devDeps) still
	//    triggers a full reinstall via npm workspaces.
	if !dirExists(filepath.Join(appDir, "node_modules", "express")) {
		fmt.Println()
		fmt.Println("  ▶ 首次运行：正在安装依赖（国内镜像源，需联网，约 1-3 分钟）...")
		fmt.Println()
		if err := npmInstall(appDir); err != nil {
			stepErr("依赖安装失败", "请检查网络，或手动在项目目录执行：npm install")
			pause()
			os.Exit(1)
		}
		fmt.Println()
	}

	// 3. Ensure build artifacts (if server/dist missing).
	if !fileExists(filepath.Join(appDir, "server", "dist", "index.js")) {
		fmt.Println()
		fmt.Println("  ▶ 首次运行：正在构建产物...")
		fmt.Println()
		if err := npmRunBuild(appDir); err != nil {
			stepErr("构建失败", "请查看上方错误信息")
			fmt.Println()
			pause()
			os.Exit(1)
		}
		fmt.Println()
	}

	// 4. Pick a free port (skip in-use AND OS-reserved ranges, e.g. Windows
	//    may reserve 3000-3240 causing EACCES). Pass it to node via PET_PORT.
	port := findFreePort(startPort, maxPortTries)

	if serverAlreadyRunning(port) {
		fmt.Printf("\n  ✓ 服务已在运行：http://localhost:%d\n", port)
	} else {
		fmt.Println()
		fmt.Printf("  ▶ 正在启动服务（端口 %d）...\n", port)
		if err := startServer(appDir, port); err != nil {
			stepErr("服务启动失败", "")
			fmt.Println()
			pause()
			os.Exit(1)
		}
		waitServerReady(port, 15*time.Second)
		fmt.Printf("  ✓ 服务地址：http://localhost:%d\n", port)
		fmt.Println("    本机其他设备（同一局域网）访问：http://本机IP:" + fmt.Sprint(port))
		fmt.Println("    按 Ctrl+C 或关闭本窗口即可停止服务。")
		fmt.Println()
	}

	// 5. Open browser.
	openBrowser(fmt.Sprintf("http://localhost:%d", port))

	fmt.Println()
	fmt.Println("  ✓ 已在默认浏览器打开。关闭本窗口 / 按 Ctrl+C 将停止服务。")
	waitForExit(port)
}

// printBanner renders an ASCII banner with a clean, professional look.
func printBanner() {
	line := "=================================================="
	fmt.Println(line)
	fmt.Println("           校园宠物乐园 · 班级激励系统")
	fmt.Println("           积 分 管 理  ·  宠 物 养 成")
	fmt.Println(line)
	fmt.Println("        ( start.exe · Web 启动器 )")
	fmt.Println()
}

func stepErr(title string, hint string) {
	fmt.Println()
	fmt.Println("  ✗ " + title)
	if hint != "" {
		fmt.Println("    " + hint)
	}
	fmt.Println()
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
	return runWithProgress("正在安装依赖（国内镜像源，需联网）", cmd)
}

func npmRunBuild(dir string) error {
	cmd := exec.Command("npm", "run", "build")
	cmd.Dir = dir
	return runWithProgress("正在构建产物", cmd)
}

// runWithProgress runs cmd while drawing a simple progress bar in the console.
// npm emits lots of output; we suppress it (avoid flooding the bar) and instead
// show a smooth progress bar, capturing the "added N packages" summary and any
// trailing error output.
func runWithProgress(label string, cmd *exec.Cmd) error {
	fmt.Println()
	fmt.Println("  " + label + " ...")
	fmt.Println()

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return err
	}

	var summary strings.Builder
	var addedLine string
	done := make(chan struct{})

	go func() {
		defer close(done)
		sc := bufio.NewScanner(stdout)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			line := sc.Text()
			if m := addedRe.FindStringSubmatch(line); m != nil {
				addedLine = line
			}
			if summary.Len() < 8192 {
				summary.WriteString(line + "\n")
			}
		}
	}()

	// Smooth progress bar up to 90%; jump to 100% on success.
	pct := 0
	step := 2
	go func() {
		ticker := time.NewTicker(120 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				if pct < 90 {
					pct += step
					if pct > 90 {
						pct = 90
					}
				}
				drawProgress(pct)
			}
		}
	}()

	werr := cmd.Wait()

	if werr != nil {
		drawProgress(100)
		fmt.Println()
		tail := strings.TrimSpace(summary.String())
		if tail != "" {
			fmt.Println(tail)
		}
		return werr
	}

	drawProgress(100)
	fmt.Println()
	if addedLine != "" {
		fmt.Println("  " + addedLine)
	} else {
		fmt.Println("  ✓ 依赖已就绪")
	}
	return nil
}

var addedRe = regexp.MustCompile(`added\s+\d+\s+packages`)

func drawProgress(pct int) {
	const width = 30
	filled := pct * width / 100
	bar := strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
	fmt.Printf("\r  [%s] %3d%%", bar, pct)
}

// startServer launches `node server/dist/index.js` in the app dir and returns.
// The chosen port is passed to node via PET_PORT (falling back to PORT).
// The child is started independent of the parent so it keeps running.
func startServer(dir string, port int) error {
	script := filepath.Join("server", "dist", "index.js")
	nodeExe := "node"
	if runtime.GOOS == "windows" {
		nodeExe = "node.exe"
	}
	cmd := exec.Command(nodeExe, script)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "PET_PORT="+fmt.Sprint(port), "PORT="+fmt.Sprint(port))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	// Detach: let it keep running after we exit (Windows GUI case).
	go func() { _ = cmd.Wait() }()
	return nil
}

// findFreePort returns the first port (from `from` upward) that we can bind.
// A successful bind proves the port is neither in use nor Windows-reserved
// (reserved ports return permission denied / EACCES on bind).
func findFreePort(from, tries int) int {
	for p := from; p < from+tries; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			_ = ln.Close()
			return p
		}
	}
	return from // fallback: let node try (will surface a clear error)
}

func serverAlreadyRunning(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 300*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func waitServerReady(port int, timeout time.Duration) {
	client := &http.Client{Timeout: 2 * time.Second}
	url := fmt.Sprintf("http://localhost:%d%s", port, healthPath)
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

// waitForExit blocks until the server is stopped by the user.
func waitForExit(port int) {
	client := &http.Client{Timeout: 2 * time.Second}
	url := fmt.Sprintf("http://localhost:%d%s", port, healthPath)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		resp, err := client.Get(url)
		if err != nil {
			fmt.Println()
			fmt.Println("  ✗ 服务已停止。")
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
	fmt.Print("\n  按任意键继续...")
	var b [1]byte
	_, _ = os.Stdin.Read(b[:])
}
