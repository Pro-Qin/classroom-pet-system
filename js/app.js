// ===== 主应用入口 =====

const { createApp, reactive, ref, computed, onMounted, onBeforeUnmount } = Vue;

const App = {
  name: 'App',
  components: {
    LoginPage,
    StudentApp,
    TeacherApp,
    AdminApp,
    'login-page': LoginPage,
    'student-app': StudentApp,
    'teacher-app': TeacherApp,
    'admin-app': AdminApp,
  },
  data() {
    return {
      // 登录状态：null表示未登录，登录后为用户对象
      currentUser: null,
      isLoggedIn: false,
      appMode: 'student',  // 登录后的显示模式：student/teacher/admin
      debugMode: false,    // Debug模式开关
      modePanelExpanded: false,  // 系统模式面板展开状态
      showUserSwitcher: false,  // 用户切换面板
      appReady: false,    // Store 初始化完成后为 true
      teacherPreview: null, // 教师预览模式：保存原始教师用户，非 null 表示正在以学生视角预览
      _keyBuffer: '',       // Debug激活码输入缓存
      showDebugWin: false,  // Debug浮动窗口
      showWelcome: false,   // 欢迎引导窗口
      welcomeStep: 1,       // 引导步骤（1-4）
      totalWelcomeSteps: 4,
    };
  },
  computed: {
    // 当前显示的应用
    currentApp() {
      if (!this.isLoggedIn) return 'login';
      switch (this.appMode) {
        case 'admin':   return 'admin';
        case 'teacher': return 'teacher';
        default:        return 'student';
      }
    },
    // 当前用户信息
    userDisplay() {
      if (!this.currentUser) return '';
      const roleMap = {
        admin: '管理员',
        teacher: '教师',
        student: '学生'
      };
      return `${roleMap[this.currentUser.role] || '用户'}：${this.currentUser.name}`;
    },
    toasts() { return Store.state.toasts; },
  },
  methods: {
    // 登录成功处理
    onLoginSuccess(user) {
      this.currentUser = user;
      window.__currentUser = user; // 供日志系统使用
      this.isLoggedIn = true;
      
      // 根据用户角色设置显示模式
      switch (user.role) {
        case 'admin':
          this.appMode = 'admin';
          break;
        case 'teacher':
          this.appMode = 'teacher';
          break;
        default:
          this.appMode = 'student';
      }
      
      // 保存登录状态到localStorage
      localStorage.setItem('petSystemUser', JSON.stringify({
        id: user.id,
        role: user.role,
        name: user.name,
        username: user.username || user.name
      }));
    },
    
    // 退出登录
    logout() {
      // 如果是教师预览学生模式，返回教师端而非退出
      if (this.teacherPreview) {
        this.currentUser = this.teacherPreview;
        this.appMode = 'teacher';
        this.teacherPreview = null;
        return;
      }
      this.isLoggedIn = false;
      this.currentUser = null;
      this.appMode = 'student';
      localStorage.removeItem('petSystemUser');
    },

    // 教师/管理员以学生身份预览
    viewAsStudent(student) {
      this.teacherPreview = this.currentUser; // 保存当前教师身份
      this.currentUser = { ...student, role: 'student' };
      this.appMode = 'student';
      this.isLoggedIn = true;
    },
    
    // 切换显示模式
    switchMode(mode) {
      // 已登录用户可以切换查看不同角色的界面
      if (!this.isLoggedIn) return;
      
      // 只有对应角色的用户才能切换到该模式
      if (mode === 'admin' && this.currentUser.role !== 'admin') {
        Store.toast('只有管理员才能进入管理后台', 'warning');
        return;
      }
      
      this.appMode = mode;
    },
    
    // 切换用户
    switchUser() {
      this.showUserSwitcher = true;
    },
    
    // 确认切换用户
    confirmSwitchUser() {
      this.showUserSwitcher = false;
      this.logout();
    },
    
    spawnCoinFly(x, y) {
      const el = document.createElement('div');
      el.className = 'coin-fly';
      el.textContent = '⭐';
      const tx = (Math.random() - 0.5) * 200;
      const ty = -(Math.random() * 150 + 80);
      el.style.setProperty('--tx', tx + 'px');
      el.style.setProperty('--ty', ty + 'px');
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1500);
    },
    
    toggleDebugMode() {
      this.debugMode = !this.debugMode;
      if (this.debugMode) {
        this.loadDebugData();
      }
    },
    
    // ---- Debug 窗口：键盘输入检测 ----
    _onKeyDown(e) {
      this._keyBuffer += e.key.toLowerCase();
      if (this._keyBuffer.length > 10) this._keyBuffer = this._keyBuffer.slice(-10);
      if (this._keyBuffer.includes('qinzzq')) {
        this._keyBuffer = '';
        this.showDebugWin = !this.showDebugWin;
      }
    },

    // ---- 欢迎引导 ----
    startWelcome() {
      this.showWelcome = true;
      this.welcomeStep = 1;
    },
    nextWelcomeStep() {
      if (this.welcomeStep < this.totalWelcomeSteps) {
        this.welcomeStep++;
      } else {
        this.showWelcome = false;
        localStorage.setItem('_welcomeShown', '1');
      }
    },
    prevWelcomeStep() {
      if (this.welcomeStep > 1) this.welcomeStep--;
    },
    closeWelcome() {
      this.showWelcome = false;
      localStorage.setItem('_welcomeShown', '1');
    },

    // ---- 数据冲突处理 ----
    resolveConflictUseLocal() {
      Store.state._syncConflict = false;
      Store.cloudPush().then(r => {
        Store.toast('☁️ ' + r.msg, 'success');
      });
    },
    resolveConflictUseCloud() {
      Store.state._syncConflict = false;
      Store.cloudPull().then(r => {
        if (r.success) Store.toast('☁️ ' + r.msg, 'success');
      });
    },
    
    async loadDebugData() {
      // 示例学生数据
      const sampleStudents = [
        { id: 1, name: '小明', username: 'xiaoming', password: '123456', class: '高一一班', points: 320, money: 100, petType: 'dragon', petName: '小明的宠物', petExp: 220, petStage: 2, petStatus: { health: 75, hungry: 60, happy: 80, clean: 70 }, backpack: { apple: 3, cake: 1, soap: 2, ball: 1, medicine: 1 }, joinDate: '2026-02-01' },
        { id: 2, name: '小红', username: 'xiaohong', password: '123456', class: '高一一班', points: 580, money: 100, petType: 'cat', petName: '小红的宠物', petExp: 530, petStage: 3, petStatus: { health: 90, hungry: 70, happy: 95, clean: 85 }, backpack: { apple: 5, cake: 2, soap: 3, ball: 2, medicine: 0 }, joinDate: '2026-02-01' },
        { id: 3, name: '小刚', username: 'xiaogang', password: '123456', class: '高一一班', points: 180, money: 100, petType: 'bunny', petName: '小刚的宠物', petExp: 150, petStage: 1, petStatus: { health: 55, hungry: 30, happy: 40, clean: 50 }, backpack: { apple: 1, soap: 1, medicine: 2 }, joinDate: '2026-02-01' }
      ];
      
      // 示例任务数据
      const sampleTasks = [
        { id: 1737849600000, title: '完成数学作业', desc: '完成今日数学练习题（P45-P47）并提交照片', points: 50, icon: '📐', subject: '数学', deadline: '2026-03-14 18:00', status: 'active', createdBy: 100, createdAt: '2026-03-14 08:00', submissions: [] },
        { id: 1737849600001, title: '背诵古诗《静夜思》', desc: '背诵全文，明日课堂当场检查', points: 35, icon: '📝', subject: '语文', deadline: '2026-03-15 08:00', status: 'active', createdBy: 100, createdAt: '2026-03-14 08:00', submissions: [] }
      ];
      
      // 清空现有数据
      Store.state.students = [];
      Store.state.tasks = [];
      
      // 添加示例学生数据
      for (const student of sampleStudents) {
        Store.state.students.push(student);
      }
      
      // 添加示例任务数据
      for (const task of sampleTasks) {
        Store.state.tasks.push(task);
      }
      
      // 同步到IndexedDB
      await dbStorage.storeStudents(Store.state.students);
      await dbStorage.storeTasks(Store.state.tasks);
      
      Store.toast('🐛 Debug模式已启用，示例数据已载入', 'success');
    },
    
    // 恢复登录状态
    restoreLoginState() {
      const savedUser = localStorage.getItem('petSystemUser');
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          // 根据角色查找完整用户信息
          let user = null;
          if (userData.role === 'student') {
            user = Store.state.students.find(s => s.id === userData.id);
          } else if (userData.role === 'teacher') {
            user = TEACHER_ACCOUNTS.find(t => t.username === userData.username);
          } else if (userData.role === 'admin') {
            user = { ...ADMIN_ACCOUNT };
          }
          
        if (user) {
          this.currentUser = { ...user, role: userData.role };
          window.__currentUser = { ...user, role: userData.role };
          this.isLoggedIn = true;
          this.appMode = userData.role;
        }
        } catch (e) {
          localStorage.removeItem('petSystemUser');
        }
      }
    },
  },
  
  async mounted() {
    const statusEl = document.getElementById('loading-status');
    const barEl = document.getElementById('loading-bar');

    // 阶段1：触发 Store 初始化（本地 IndexedDB 加载，极快；云端后台同步不阻塞）
    if (statusEl) statusEl.textContent = '正在加载数据...';
    Store.init();  // 本地数据先就绪，云端后台静默同步

    // 阶段2：等待 Store 本地数据就绪（通常 < 500ms）
    let waited = 0;
    while (!Store.state._initialized && waited < 20000) {
      if (waited > 1000 && statusEl) statusEl.textContent = '加载本地数据...';
      if (waited > 5000 && statusEl) statusEl.textContent = '正在同步云端数据...';
      if (waited > 15000 && statusEl) statusEl.textContent = '加载较慢，请稍候...';
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }

    if (!Store.state._initialized && statusEl) {
      statusEl.textContent = '⚠️ 加载超时，部分数据可能不完整';
    }

    // 阶段3：检查更新（在加载画面中显示，5秒超时）
    if (statusEl) statusEl.textContent = '正在检查更新...';
    let hasUpdate = false;
    let timedOut = false;
    try {
      const timer = setTimeout(() => { timedOut = true; }, 5000);
      const updateResult = await Store.checkForUpdate();
      clearTimeout(timer);
      if (timedOut) {
        // 超时（理论上checkForUpdate内部有5秒超时，这里作为兜底）
        if (statusEl) statusEl.textContent = '⚠️ 更新检查超时，可稍后手动检查';
        await new Promise(r => setTimeout(r, 500));
      } else if (updateResult && updateResult.hasUpdate) {
        hasUpdate = true;
        if (statusEl) statusEl.textContent = `🔄 发现新版本 v${updateResult.remote}`;
        await new Promise(r => setTimeout(r, 800));
      } else {
        if (statusEl) statusEl.textContent = '已是最新版本 ✓';
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '⚠️ 更新检查失败，不影响使用';
      await new Promise(r => setTimeout(r, 500));
    }

    this.appReady = true;

    // 恢复登录状态（数据已就绪）
    this.restoreLoginState();

    // 首次使用显示欢迎引导
    if (!localStorage.getItem('_welcomeShown')) {
      setTimeout(() => this.startWelcome(), 600);
    }

    // 如果有更新，通过toast再提醒一次（让用户登录后也能看到）
    if (hasUpdate) {
      setTimeout(async () => {
        try {
          const result = await Store.checkForUpdate();
          if (result && result.hasUpdate) {
            Store.toast(`🔄 发现新版本 v${result.remote}，建议刷新页面获取更新`, 'info', 8000);
          }
        } catch(e) {}
      }, 5000);
    }

    // 淡出加载画面
    const splash = document.getElementById('loading-splash');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 500);
    }

    // 关闭/刷新页面时自动推送操作记录到云端，并确保IndexedDB写入完毕
    this._unloadHandler = () => {
      const logs = Store.state.auditLog;
      if (logs && logs.length > 0) {
        CloudSync.pushAuditLog(logs).catch(() => {});
      }
      // 强制立即写入IndexedDB（同步方式在beforeunload中不可靠，但尽力而为）
      try {
        if (Store._dbWritePending) {
          clearTimeout(Store._dbWriteTimer);
          Store._flushDbWrite();
        }
      } catch(e) {}
    };
    window.addEventListener('beforeunload', this._unloadHandler);

    // Debug 键盘监听
    this._keyHandler = (e) => this._onKeyDown(e);
    document.addEventListener('keydown', this._keyHandler);
  },

  beforeUnmount() {
    if (this._unloadHandler) {
      window.removeEventListener('beforeunload', this._unloadHandler);
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }
  },
  
  template: `
    <div id="root">
      <!-- 未就绪时 Vue 侧不渲染（由 index.html loading-splash 覆盖） -->
      <template v-if="appReady">
        <!-- 顶部导航（登录后显示）：系统类型标签 + 退出/返回按钮 -->
        <div v-if="isLoggedIn" style="position:fixed;top:20px;right:20px;z-index:1000;display:flex;align-items:center;gap:8px;">
          <!-- 系统类型标签 -->
          <div style="background:white;padding:7px 14px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
            <span style="font-size:14px;font-weight:700;color:var(--text-dark);" v-if="!teacherPreview">
              {{ appMode === 'admin' ? '🛡️ 管理后台' : appMode === 'teacher' ? '👩‍🏫 教师系统' : '👨‍🎓 学生系统' }}
            </span>
            <span style="font-size:14px;font-weight:700;color:var(--text-dark);" v-else>
              👁️ 预览：{{ currentUser.name }}
            </span>
          </div>
          <!-- 教师预览模式 → 返回按钮；否则 → 退出按钮 -->
          <button v-if="teacherPreview" class="btn btn-sm" style="color:var(--primary);border-color:var(--primary);background:white;box-shadow:0 4px 20px rgba(0,0,0,0.1);"
                  @click="logout" title="返回教师端">
            ↩️ 返回教师端
          </button>
          <button v-else class="btn btn-sm btn-ghost" style="color:#F44336;border-color:#F44336;background:white;box-shadow:0 4px 20px rgba(0,0,0,0.1);"
                  @click="logout" title="退出登录">
            🚪
          </button>
        </div>

        <!-- 登录页面 -->
        <login-page v-if="!isLoggedIn" @login-success="onLoginSuccess"></login-page>

        <!-- 学生端 -->
        <student-app v-else-if="appMode==='student'" :user="currentUser" @logout="logout"></student-app>

        <!-- 教师端 -->
        <teacher-app v-else-if="appMode==='teacher'" :user="currentUser" @logout="logout" @view-as-student="viewAsStudent"></teacher-app>

        <!-- 管理员端 -->
        <admin-app v-else-if="appMode==='admin'" :user="currentUser" @logout="logout" @view-as-student="viewAsStudent"></admin-app>

        <!-- Toast 通知 -->
        <div class="toast-container">
          <div v-for="toast in toasts" :key="toast.id" class="toast" :class="'toast-'+toast.type">
            <span>{{ {success:'✅', error:'❌', warning:'⚠️', info:'💬'}[toast.type] || '💬' }}</span>
            <span>{{ toast.msg }}</span>
          </div>
        </div>

        <!-- Debug 浮动窗口 -->
        <div v-if="showDebugWin" style="position:fixed;bottom:24px;left:24px;z-index:99998;background:rgba(15,15,20,0.92);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:16px;min-width:200px;box-shadow:0 8px 40px rgba(0,0,0,0.5);color:#fff;font-size:13px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-weight:700;font-size:14px;">🐛 Debug</span>
            <button @click="showDebugWin=false" style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:16px;">✕</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <button class="dbg-btn" @click="appMode='student'; showDebugWin=false" style="padding:6px 12px;background:rgba(76,175,80,0.2);border:1px solid rgba(76,175,80,0.3);border-radius:8px;color:#81C784;cursor:pointer;text-align:left;">👨‍🎓 切换到学生端</button>
            <button class="dbg-btn" @click="appMode='teacher'; showDebugWin=false" style="padding:6px 12px;background:rgba(33,150,243,0.2);border:1px solid rgba(33,150,243,0.3);border-radius:8px;color:#64B5F6;cursor:pointer;text-align:left;">👩‍🏫 切换到教师端</button>
            <button class="dbg-btn" @click="appMode='admin'; showDebugWin=false" style="padding:6px 12px;background:rgba(156,39,176,0.2);border:1px solid rgba(156,39,176,0.3);border-radius:8px;color:#CE93D8;cursor:pointer;text-align:left;">🛡️ 切换到管理端</button>
            <div style="border-top:1px solid rgba(255,255,255,0.08);margin:4px 0;"></div>
            <button class="dbg-btn" @click="loadDebugData(); showDebugWin=false" style="padding:6px 12px;background:rgba(255,152,0,0.2);border:1px solid rgba(255,152,0,0.3);border-radius:8px;color:#FFB74D;cursor:pointer;text-align:left;">📦 载入测试数据</button>
            <button class="dbg-btn" @click="Store.clearAllData().then(()=>Store.toast('✅ 数据已清空','success')); showDebugWin=false" style="padding:6px 12px;background:rgba(244,67,54,0.2);border:1px solid rgba(244,67,54,0.3);border-radius:8px;color:#EF9A9A;cursor:pointer;text-align:left;">🗑️ 清空所有数据</button>
            <button class="dbg-btn" @click="Store.cloudPush().then(()=>showDebugWin=false)" style="padding:6px 12px;background:rgba(0,188,212,0.2);border:1px solid rgba(0,188,212,0.3);border-radius:8px;color:#4DD0E1;cursor:pointer;text-align:left;">☁️ 推送云端</button>
            <button class="dbg-btn" @click="Store.cloudPull().then(()=>showDebugWin=false)" style="padding:6px 12px;background:rgba(0,188,212,0.2);border:1px solid rgba(0,188,212,0.3);border-radius:8px;color:#4DD0E1;cursor:pointer;text-align:left;">☁️ 拉取云端</button>
          </div>
        </div>

        <!-- 数据冲突弹窗 -->
        <div v-if="isLoggedIn && Store.state._syncConflict" style="position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;">
          <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:20px;padding:28px;max-width:380px;width:90%;color:#fff;border:1px solid rgba(255,255,255,0.1);box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="font-size:40px;text-align:center;margin-bottom:12px;">⚡</div>
            <h3 style="font-size:18px;font-weight:800;text-align:center;margin:0 0 8px;">检测到数据冲突</h3>
            <p style="font-size:13px;color:rgba(255,255,255,0.6);text-align:center;margin-bottom:20px;line-height:1.5;">
              本地数据和云端数据不一致，请选择如何处理：
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <button @click="resolveConflictUseLocal" style="padding:12px 20px;border-radius:12px;border:1px solid rgba(76,175,80,0.3);background:rgba(76,175,80,0.15);color:#81C784;font-weight:700;font-size:14px;cursor:pointer;transition:transform 0.1s;">
                📤 使用本地数据（推送覆盖云端）
              </button>
              <button @click="resolveConflictUseCloud" style="padding:12px 20px;border-radius:12px;border:1px solid rgba(33,150,243,0.3);background:rgba(33,150,243,0.15);color:#64B5F6;font-weight:700;font-size:14px;cursor:pointer;transition:transform 0.1s;">
                📥 使用云端数据（拉取覆盖本地）
              </button>
            </div>
            <div style="text-align:center;margin-top:12px;">
              <button @click="Store.state._syncConflict=false" style="background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:12px;">稍后处理</button>
            </div>
          </div>
        </div>

        <!-- 欢迎引导窗口 -->
        <div v-if="showWelcome" style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;">
          <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:24px;padding:36px;max-width:440px;width:90%;box-shadow:0 24px 80px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.08);color:#fff;">
            <!-- 步骤指示器 -->
            <div style="display:flex;justify-content:center;gap:8px;margin-bottom:24px;">
              <div v-for="i in totalWelcomeSteps" :key="i" :style="'width:32px;height:4px;border-radius:4px;'+(i===welcomeStep?'background:linear-gradient(90deg,#7C4DFF,#FF6B9D)':'background:rgba(255,255,255,0.15)')"></div>
            </div>

            <!-- 步骤1：欢迎 -->
            <div v-if="welcomeStep===1" style="text-align:center;">
              <div style="font-size:56px;margin-bottom:16px;">🐾</div>
              <h2 style="font-size:22px;font-weight:800;margin:0 0 12px;">欢迎使用课堂宠物系统</h2>
              <p style="font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;">把学习变成养宠物！<br>学生完成课堂任务赚积分 → 购买道具 → 养成专属宠物<br>让每节课都充满成就感！</p>
            </div>

            <!-- 步骤2：教师端 -->
            <div v-if="welcomeStep===2" style="text-align:center;">
              <div style="font-size:56px;margin-bottom:16px;">👩‍🏫</div>
              <h2 style="font-size:22px;font-weight:800;margin:0 0 12px;">教师端功能</h2>
              <div style="text-align:left;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.8;">
                <div>⭐ 发布与管理课堂任务</div>
                <div>⭐ 审核学生提交的作业</div>
                <div>⭐ 手动加减分操作</div>
                <div>⭐ 查看积分排行榜</div>
                <div>⭐ 批量管理和导出数据</div>
              </div>
            </div>

            <!-- 步骤3：学生端 -->
            <div v-if="welcomeStep===3" style="text-align:center;">
              <div style="font-size:56px;margin-bottom:16px;">👨‍🎓</div>
              <h2 style="font-size:22px;font-weight:800;margin:0 0 12px;">学生端功能</h2>
              <div style="text-align:left;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.8;">
                <div>🐾 领养并命名专属宠物</div>
                <div>📋 查看和提交课堂任务</div>
                <div>🏆 班级积分排行榜</div>
                <div>🎒 背包系统使用道具</div>
                <div>📷 上传自定义头像</div>
              </div>
            </div>

            <!-- 步骤4：宠物系统 -->
            <div v-if="welcomeStep===4" style="text-align:center;">
              <div style="font-size:56px;margin-bottom:16px;">🐉</div>
              <h2 style="font-size:22px;font-weight:800;margin:0 0 12px;">宠物养成说明</h2>
              <p style="font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;">宠物拥有<b>生命、饱食、心情、清洁</b>四项状态<br>使用道具可以提升状态<br>完成任务获得积分和经验<br>宠物会随经验值提升而进化成长！</p>
              <div style="margin-top:16px;font-size:13px;color:rgba(255,255,255,0.4);">💡 记得经常登录照料你的宠物哦~</div>
            </div>

            <!-- 底部按钮 -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:28px;">
              <button v-if="welcomeStep>1" @click="prevWelcomeStep" style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:14px;padding:8px;">← 上一步</button>
              <div v-else></div>
              <button @click="nextWelcomeStep" style="background:linear-gradient(135deg,#7C4DFF,#FF6B9D);border:none;color:#fff;padding:10px 28px;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer;transition:transform 0.15s;">
                {{ welcomeStep===totalWelcomeSteps ? '🚀 开始使用' : '下一步 →' }}
              </button>
            </div>
            <div style="text-align:center;margin-top:12px;">
              <button @click="closeWelcome" style="background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:12px;">跳过引导</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  `
};

// 挂载应用
const app = createApp(App);
app.mount('#app');
