package main

import (
	"archive/zip"
	"bufio"
	"errors"
	"fmt"
	"io"
	"math"
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
	// 最多尝试的端口数。Windows 的端口保留段可能长达数百个端口（如 3000-3240），
	// 若只探测 200 个端口，扫完仍到不了可用端口会 fallback 回 3000 导致 EACCES。
	maxPortTries = 2000
	healthPath   = "/api/health"
	// Max sustained progress, reached asymptotically (never hits 100 during a
	// long-running task); jumps to 100 only when the command succeeds.
	progressCap = 95
	// Progress animation tick + total assumed duration to reach ~cap.
	progressTick   = 120 * time.Millisecond
)

// openBrowser is a package var so tests can replace it with a stub.
var openBrowser = func(url string) {
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

// pause is a package var so tests can replace it with a no-op.
var pause = func() {
	if runtime.GOOS != "windows" {
		return
	}
	fmt.Print("\n  按任意键继续...")
	var b [1]byte
	_, _ = os.Stdin.Read(b[:])
}

func main() {
	os.Exit(run())
}

// run returns the process exit code. All side-effectful entry points go
// through here so the failure paths (notably "do NOT open the browser and keep
// the window open when the server fails to start") are testable.
func run() int {
	initConsole() // set UTF-8 codepage on Windows

	// Determine app directory: folder containing this exe / bat.
	exe, err := os.Executable()
	if err != nil {
		fmt.Println("[错误] 无法定位程序目录:", err)
		pause()
		return 1
	}
	appDir := filepath.Dir(exe)

	// If running from scripts/launcher during dev, allow overriding via env.
	if cwd := os.Getenv("PET_APP_DIR"); cwd != "" {
		appDir = cwd
	}

	printBanner()

	// 1. Resolve Node.js: PATH → 随包便携版 → 自动下载便携版（真实进度条）
	rt, err := resolveNodeRuntime(appDir)
	if err != nil {
		stepErr("未检测到 Node.js", "自动下载失败："+err.Error()+"。可手动安装 Node.js 22.5+：https://nodejs.org 后重试")
		pause()
		return 1
	}

	// 2. Ensure dependencies. Check a known runtime dep (express) so that a
	//    partially-installed node_modules (e.g. only root devDeps) still
	//    triggers a full reinstall via npm workspaces.
	if !dirExists(filepath.Join(appDir, "node_modules", "express")) {
		fmt.Println()
		fmt.Println("  ▶ 首次运行：正在安装依赖（国内镜像源，需联网，约 1-3 分钟）...")
		fmt.Println()
		if err := npmInstall(rt, appDir); err != nil {
			stepErr("依赖安装失败", "请检查网络，或手动在项目目录执行：npm install")
			pause()
			return 1
		}
		fmt.Println()
	}

	// 3. Ensure build artifacts (if server/dist missing).
	if !fileExists(filepath.Join(appDir, "server", "dist", "index.js")) {
		fmt.Println()
		fmt.Println("  ▶ 首次运行：正在构建产物...")
		fmt.Println()
		if err := npmRunBuild(rt, appDir); err != nil {
			stepErr("构建失败", "请查看上方错误信息")
			fmt.Println()
			pause()
			return 1
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
		// 开机自检：杀掉上次运行残留的服务进程，避免端口/进程堆积。
		killStaleServer(appDir)
		done, err := startServer(rt, appDir, port)
		if err != nil {
			stepErr("服务启动失败", "")
			fmt.Println()
			pause()
			return 1
		}
		if !waitServerReady(port, 15*time.Second, done) {
			// 服务未能就绪：报错，保持窗口，绝不打开浏览器，也不直接退出。
			stepErr("服务启动失败（端口未就绪）", "请检查 'server/dist/index.js' 与端口 "+fmt.Sprint(port)+" 是否被占用；窗口将保持打开供你看日志。")
			fmt.Println()
			pause()
			return 1
		}
		fmt.Printf("  ✓ 服务地址：http://localhost:%d\n", port)
		fmt.Println("    本机其他设备（同一局域网）访问：http://本机IP:" + fmt.Sprint(port))
		fmt.Println("    按 Ctrl+C 或关闭本窗口即可停止服务。")
		fmt.Println()
	}

	// 5. Open browser — only reached when the server is confirmed ready.
	openBrowser(fmt.Sprintf("http://localhost:%d", port))
	// 浏览器打开后，把启动器终端切到后台（不最小化、不夺焦点），服务靠心跳维持。
	minToBackground()

	fmt.Println()
	fmt.Println("  ✓ 已在默认浏览器打开。关闭本窗口 / 按 Ctrl+C 将停止服务。")
	fmt.Println("    （服务随浏览器保活：关闭浏览器后，后端会自动停止。）")
	waitForExit(port)
	return 0
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

// ---------- Node.js 运行时解析与自动下载 ----------

// nodeVersion 固定的便携版 Node LTS 版本（三镜像均同步此版本）
const nodeVersion = "v22.18.0"
const nodeArchive = nodeVersion + "/node-" + nodeVersion + "-win-x64.zip"

// 下载源：国内优先（npmmirror → 华为云 → 官方）
var nodeMirrors = []string{
	"https://registry.npmmirror.com/-/binary/node/" + nodeArchive,
	"https://mirrors.huaweicloud.com/nodejs/" + nodeArchive,
	"https://nodejs.org/dist/" + nodeArchive,
}

// nodeRuntime 描述如何调用 node / npm（全局 PATH 或随包便携版）。
type nodeRuntime struct {
	nodeExe string // node 可执行文件（绝对路径或裸名）
	npmCmd  string // npm 入口（绝对路径 npm.cmd 或裸名 "npm"）
	portDir string // 便携版目录；空 = 全局安装
}

// childEnv 返回子进程环境：便携模式下把便携目录前置到 PATH，
// 保证 npm.cmd 内部调用的 node 也命中便携版。
func (rt *nodeRuntime) childEnv() []string {
	if rt.portDir == "" {
		return os.Environ()
	}
	env := os.Environ()
	for i, kv := range env {
		// Windows 上 os.Environ() 通常返回 "Path=..."，做大小写无关匹配
		if len(kv) > 5 && strings.EqualFold(kv[:5], "PATH=") && len(kv) >= 5 {
			env[i] = kv[:5] + rt.portDir + string(os.PathListSeparator) + kv[5:]
			return env
		}
	}
	return append(env, "PATH="+rt.portDir)
}

func portableRt(dir string) *nodeRuntime {
	return &nodeRuntime{
		nodeExe: filepath.Join(dir, "node.exe"),
		npmCmd:  filepath.Join(dir, "npm.cmd"),
		portDir: dir,
	}
}

func portableNodeOK(dir string) bool {
	return fileExists(filepath.Join(dir, "node.exe")) && fileExists(filepath.Join(dir, "npm.cmd"))
}

// nodeMinParts 应用所需的最低 Node 版本：node:sqlite 内建模块要求 22.5+。
var nodeMinParts = [3]int{22, 5, 0}

// nodeVersionOK 检查 exe 的版本是否 >= 22.5.0（解析 "v22.18.0"）。
func nodeVersionOK(exe string) bool {
	out, err := exec.Command(exe, "-v").Output()
	if err != nil {
		return false
	}
	v := strings.TrimSpace(string(out))
	v = strings.TrimPrefix(v, "v")
	parts := strings.Split(v, ".")
	if len(parts) < 3 {
		return false
	}
	nums := [3]int{}
	for i := 0; i < 3; i++ {
		n := 0
		for _, ch := range parts[i] {
			if ch < '0' || ch > '9' {
				break
			}
			n = n*10 + int(ch-'0')
		}
		nums[i] = n
	}
	for i := 0; i < 3; i++ {
		if nums[i] != nodeMinParts[i] {
			return nums[i] > nodeMinParts[i]
		}
	}
	return true
}

// resolveNodeRuntime 依次尝试：全局 PATH（需 22.5+）→ 已下载的便携版 → 自动下载便携 v22。
// 全局 node 存在但版本过旧时不打扰用户（不升级/不卸载），静默改用便携版。
func resolveNodeRuntime(appDir string) (*nodeRuntime, error) {
	if hasNode() && nodeVersionOK("node") {
		return &nodeRuntime{nodeExe: "node", npmCmd: "npm"}, nil
	}
	portable := filepath.Join(appDir, "runtime", "node")
	if portableNodeOK(portable) && nodeVersionOK(filepath.Join(portable, "node.exe")) {
		fmt.Println("  ✓ 使用随包 Node.js 便携版（runtime\node）")
		return portableRt(portable), nil
	}
	if hasNode() {
		out, _ := exec.Command("node", "-v").Output()
		fmt.Println("  ⚠ 检测到 Node.js " + strings.TrimSpace(string(out)) + "，但本系统需要 22.5+；将使用自动下载的便携版（不影响已安装的 Node）")
	} else {
		fmt.Println()
		fmt.Println("  ▶ 未检测到 Node.js，正在自动下载便携版（约 35 MB，国内镜像优先）...")
	}
	fmt.Println()
	if err := downloadPortableNode(portable); err != nil {
		return nil, err
	}
	if !portableNodeOK(portable) || !nodeVersionOK(filepath.Join(portable, "node.exe")) {
		return nil, errors.New("下载解压后未找到可用的 node.exe（可能磁盘已满或被杀软拦截）")
	}
	fmt.Println()
	fmt.Println("  ✓ Node.js " + nodeVersion + " 便携版就绪：" + portable)
	return portableRt(portable), nil
}

// downloadWithProgress 流式下载并按真实字节画进度条。失败返回错误（调用方换镜像）。
func downloadWithProgress(label, url, dest string) error {
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	total := resp.ContentLength // -1 = 未知
	tmp := dest + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	buf := make([]byte, 256*1024)
	var received int64
	start := time.Now()
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				return werr
			}
			received += int64(n)
			drawDownloadProgress(label, received, total, start)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			f.Close()
			return rerr
		}
	}
	f.Close()
	fmt.Println() // 结束进度条行
	return os.Rename(tmp, dest)
}

// drawDownloadProgress 按真实字节数绘制进度（未知总长时退化为平滑动画）。
func drawDownloadProgress(label string, received, total int64, start time.Time) {
	const width = 30
	var pct int
	var right string
	if total > 0 {
		pct = int(float64(received) / float64(total) * 100)
		right = fmt.Sprintf(" %s/%s", mbStr(received), mbStr(total))
	} else {
		pct = progressPercent(time.Since(start))
		right = " " + mbStr(received)
	}
	filled := pct * width / 100
	bar := strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
	fmt.Printf("\r  %s [%s] %3d%%%s   ", label, bar, pct, right)
}

func mbStr(b int64) string {
	return fmt.Sprintf("%.1fMB", float64(b)/1024/1024)
}

// unzipStripTopLevel 解压 zip 到 dest，并剥掉压缩包内的顶层目录
// （node-vXX-win-x64/... → dest/...），让 node.exe 直接位于 dest 根部。
func unzipStripTopLevel(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		name := filepath.ToSlash(f.Name)
		i := strings.Index(name, "/")
		if i < 0 || i == len(name)-1 {
			continue // 顶层目录本身 / 空名跳过
		}
		rel := name[i+1:]
		if rel == "" {
			continue
		}
		target := filepath.Join(dest, filepath.FromSlash(rel))
		if !strings.HasPrefix(target, filepath.Clean(dest)+string(os.PathSeparator)) {
			return errors.New("zip 内出现越界路径: " + f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil {
			rc.Close()
			return err
		}
		if _, err := io.Copy(out, rc); err != nil {
			out.Close()
			rc.Close()
			return err
		}
		out.Close()
		rc.Close()
	}
	return nil
}

// downloadPortableNode 依次尝试多个镜像下载并解压便携版 Node。
func downloadPortableNode(destDir string) error {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}
	zipPath := filepath.Join(destDir, "..", "node-portable.zip")
	var lastErr error = errors.New("未尝试任何镜像")
	for _, url := range nodeMirrors {
		host := url
		if i := strings.Index(url, "//"); i >= 0 {
			if j := strings.Index(url[i+2:], "/"); j >= 0 {
				host = url[i+2 : i+2+j]
			}
		}
		fmt.Printf("  ▶ 镜像 %s ...\n", host)
		if err := downloadWithProgress("下载 Node.js", url, zipPath); err != nil {
			fmt.Printf("\n  ⚠ 该镜像失败（%v），换下一个...\n", err)
			lastErr = err
			continue
		}
		fmt.Println("  ▶ 正在解压 ...")
		if err := unzipStripTopLevel(zipPath, destDir); err != nil {
			fmt.Printf("\n  ⚠ 解压失败（%v），换下一个...\n", err)
			lastErr = err
			continue
		}
		_ = os.Remove(zipPath)
		return nil
	}
	return fmt.Errorf("所有镜像均失败（%v）", lastErr)
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

func npmInstall(rt *nodeRuntime, dir string) error {
	cmd := exec.Command(rt.npmCmd, "install", "--registry="+chinaMirror, "--no-audit", "--no-fund")
	cmd.Dir = dir
	cmd.Env = rt.childEnv()
	return runWithProgress("正在安装依赖（国内镜像源，需联网）", cmd)
}

func npmRunBuild(rt *nodeRuntime, dir string) error {
	cmd := exec.Command(rt.npmCmd, "run", "build")
	cmd.Dir = dir
	cmd.Env = rt.childEnv()
	return runWithProgress("正在构建产物", cmd)
}

// progressPercent returns the smoothed progress (0..progressCap) for a given
// elapsed duration. It decelerates: large jumps early, tiny steps later,
// asymptotically approaching progressCap so it never looks "stuck at 90"
// forever — it keeps creeping but slows down. Monotonic non-decreasing.
func progressPercent(elapsed time.Duration) int {
	// Normalize elapsed seconds; use a long decay so it gently crawls to cap.
	sec := elapsed.Seconds()
	// 1 - 1/(1 + t) approaches 1, so scale to cap. At t=1s -> ~47.5%,
	// t=3s -> ~71%, t=10s -> ~86%, t=30s -> ~92%, asymptote 95%.
	p := float64(progressCap) * (1.0 - 1.0/(1.0+sec))
	if p < 0 {
		p = 0
	}
	if p > float64(progressCap) {
		p = float64(progressCap)
	}
	return int(math.Round(p))
}

// runWithProgress runs cmd while drawing a smooth, decelerating progress bar.
// npm output is suppressed (avoid flooding the bar); we capture the "added N
// packages" summary and trailing error output.
func runWithProgress(label string, cmd *exec.Cmd) error {
	fmt.Println()
	fmt.Println("  " + label + " ...")
	fmt.Println()

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout

	start := time.Now()
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

	// Draw a decelerating progress bar (0 -> progressCap) until the command ends.
	go func() {
		ticker := time.NewTicker(progressTick)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				drawProgress(progressPercent(time.Since(start)))
			}
		}
	}()

	werr := cmd.Wait()

	if werr != nil {
		drawProgress(progressCap)
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
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	const width = 30
	filled := pct * width / 100
	bar := strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
	fmt.Printf("\r  [%s] %3d%%", bar, pct)
}

// startServer launches `node server/dist/index.js` in the app dir. It returns
// the process-started signal, the child's done channel (closed the moment the
// process exits), and any start error. The done channel lets the caller detect
// an early crash below instead of swallowing it.
func startServer(rt *nodeRuntime, dir string, port int) (<-chan struct{}, error) {
	script := filepath.Join("server", "dist", "index.js")
	cmd := exec.Command(rt.nodeExe, script)
	cmd.Dir = dir
	env := append(rt.childEnv(), "PET_PORT="+fmt.Sprint(port), "PORT="+fmt.Sprint(port))
	cmd.Env = env
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	// 记录我们启动的服务进程 PID，供下次开机杀残留进程用。
	recordServerPid(dir, cmd.Process.Pid)
	done := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		clearServerPid(dir)
		close(done)
	}()
	return done, nil
}

// killStaleServer 杀掉上一次运行时记录到 pid 文件的服务进程（开机自检：清掉残留后台进程）。
func killStaleServer(dir string) {
	pidFile := filepath.Join(dir, ".pet_server.pid")
	raw, err := os.ReadFile(pidFile)
	if err != nil {
		return
	}
	pid := strings.TrimSpace(string(raw))
	if pid == "" {
		return
	}
	// taskkill /PID x /F —— 只杀我们自己记录的服务进程。
	_ = exec.Command("taskkill", "/PID", pid, "/F").Run()
	_ = os.Remove(pidFile)
}

func recordServerPid(dir string, pid int) {
	_ = os.WriteFile(filepath.Join(dir, ".pet_server.pid"), []byte(fmt.Sprint(pid)), 0o644)
}

func clearServerPid(dir string) {
	_ = os.Remove(filepath.Join(dir, ".pet_server.pid"))
}

// findFreePort returns the first port (from `from` upward) that we can bind.
// It listens on ":port" (0.0.0.0) — the same address express binds with
// app.listen(PORT) — so a port that passes this probe is guaranteed to be one
// node can actually bind. Windows may reserve whole port ranges for
// Hyper-V/WSL/Docker; binding those returns permission denied (EACCES) and we
// skip them. The try count must exceed the reserved range, or we'd fall back to
// a reserved port and crash with EACCES.
func findFreePort(from, tries int) int {
	for p := from; p < from+tries; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", p))
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

// waitServerReady polls the health endpoint until it returns OK, the timeout
// elapses, or the child process exits early (crashed). Returns false if the
// server never became ready.
func waitServerReady(port int, timeout time.Duration, done <-chan struct{}) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	url := fmt.Sprintf("http://localhost:%d%s", port, healthPath)
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return true
			}
		}
		// If the child already exited (crash), stop waiting for it.
		select {
		case <-done:
			return false
		case <-time.After(500 * time.Millisecond):
		}
	}
	return false
}

// waitForExit blocks until the server is no longer reachable (user closed it).
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
