// ===== 全局状态管理 Store（本地存储版）=====
// 数据存储于 IndexedDB 本地数据库
// 全程使用本地存储，不产生任何网络请求

// ===== IndexedDB 相关功能 =====
class IndexedDBStorage {
  constructor() {
    this.dbName = 'classroom-pet-system';
    this.dbVersion = 2; // v2: 新增 meta ObjectStore（云端同步时间戳）
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject('IndexedDB 初始化失败');
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 创建学生存储
        if (!db.objectStoreNames.contains('students')) {
          db.createObjectStore('students', { keyPath: 'id' });
        }
        
        // 创建任务存储
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
        
        // 创建备份存储
        if (!db.objectStoreNames.contains('backups')) {
          db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
        }
        
        // 创建元数据存储（记录同步时间戳）
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
    });
  }

  // ---- 元数据读写（云端同步时间戳）----
  async getMeta(key) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction('meta', 'readonly');
      const store = transaction.objectStore('meta');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => resolve(null);
    });
  }

  async storeMeta(key, value) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction('meta', 'readwrite');
      const store = transaction.objectStore('meta');
      store.put({ key, value, updatedAt: new Date().toISOString() });
      transaction.oncomplete = () => resolve();
    });
  }

  async storeStudents(students) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction('students', 'readwrite');
      const store = transaction.objectStore('students');

      // 先清空旧数据（避免已删除的学生残留在 IndexedDB）
      store.clear();

      // 深拷贝去除 Vue 响应式代理，确保可以序列化到 IndexedDB
      const plain = JSON.parse(JSON.stringify(students));
      plain.forEach(student => {
        store.put(student);
      });

      transaction.oncomplete = () => resolve();
    });
  }

  async getStudents() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction('students', 'readonly');
      const store = transaction.objectStore('students');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
  }

  async storeTasks(tasks) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction('tasks', 'readwrite');
      const store = transaction.objectStore('tasks');

      // 先清空旧数据
      store.clear();

      // 深拷贝去除 Vue 响应式代理
      const plain = JSON.parse(JSON.stringify(tasks));
      plain.forEach(task => {
        store.put(task);
      });

      transaction.oncomplete = () => resolve();
    });
  }

  async getTasks() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction('tasks', 'readonly');
      const store = transaction.objectStore('tasks');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
  }

  async clearAllData() {
    if (!this.db) await this.init();
    const stores = ['students', 'tasks', 'backups'];
    for (const storeName of stores) {
      if (!this.db.objectStoreNames.contains(storeName)) continue;
      await new Promise((resolve) => {
        const transaction = this.db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.clear();
        transaction.oncomplete = () => resolve();
      });
    }
  }

  async createBackup() {
    if (!this.db) await this.init();
    const students = await this.getStudents();
    const tasks = await this.getTasks();
    
    return new Promise((resolve) => {
      const transaction = this.db.transaction('backups', 'readwrite');
      const store = transaction.objectStore('backups');
      const backup = {
        timestamp: new Date().toISOString(),
        data: {
          students,
          tasks
        }
      };
      const request = store.add(backup);
      request.onsuccess = () => resolve({ id: request.result, ...backup });
      request.onerror = () => resolve(null);
    });
  }

  async getBackups() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction('backups', 'readonly');
      const store = transaction.objectStore('backups');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
  }

  async restoreBackup(backupId) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction(['backups', 'students', 'tasks'], 'readwrite');
      const backupStore = transaction.objectStore('backups');
      const request = backupStore.get(backupId);
      
      request.onsuccess = () => {
        const backup = request.result;
        if (backup) {
          const studentStore = transaction.objectStore('students');
          const taskStore = transaction.objectStore('tasks');
          
          // 清空现有数据
          studentStore.clear();
          taskStore.clear();
          
          // 恢复数据
          backup.data.students.forEach(student => studentStore.put(student));
          backup.data.tasks.forEach(task => taskStore.put(task));
          
          transaction.oncomplete = () => resolve(true);
        } else {
          resolve(false);
        }
      };
      
      request.onerror = () => resolve(false);
    });
  }

  async clear() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const transaction = this.db.transaction(['students', 'tasks'], 'readwrite');
      transaction.objectStore('students').clear();
      transaction.objectStore('tasks').clear();
      transaction.oncomplete = () => resolve();
    });
  }
}

// 初始化 IndexedDB 存储
const dbStorage = new IndexedDBStorage();
dbStorage.init().catch(err => console.warn('IndexedDB 初始化失败:', err));

// Debug 模式：通过 URL 参数 ?debug=1 开启
// Debug 模式下加载演示数据，但所有改动不持久化到 IndexedDB
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1';
if (DEBUG_MODE) console.log('[Store] DEBUG 模式已开启，演示数据不持久化');

// 本地存储操作函数
// 所有数据操作均通过 IndexedDB 实现，不产生网络请求

const Store = {
  // ---- 状态（用 Vue.reactive 包裹，让 Vue 能追踪所有属性变化）----
  state: Vue.reactive({
    students: [],
    tasks: [],
    toasts: [],
    toastTimer: null,
    inviteCodes: [],
    _initialized: false,
    taskRev: 0,      // 每次 tasks 刷新后递增，驱动老师端 computed 重新计算
    studentRev: 0,   // 每次 students 刷新后递增
    achievements: [], // 成就列表
    auditLog: [],     // 操作记录日志
    auditLogRev: 0,   // 操作记录版本号（驱动响应式）
    _syncConflict: false,       // 自动检测到云端冲突
    _syncConflictCloudTime: null, // 云端数据时间
    _syncConflictLocalTime: null, // 本地数据时间
  }),
  
  // ---- SHA-256 哈希（用于管理员密码验证）----
  async _sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  },

  // ---- 操作日志：写入一条（增强版）----
  _logAudit(action, detail, snapshot) {
    // 获取当前登录用户信息（从 app.js 的 currentUser 或 Store.state）
    const currentUser = window.__currentUser || {};
    const entry = {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleString('zh-CN'),
      isoTime: new Date().toISOString(),
      action,           // 操作类型，如 '删除学生'
      detail,           // 操作详情，如 '删除了 小明（id:123）'
      snapshot,         // 快照数据（用于回退），可为 null
      operatorId: currentUser.id || null,
      operatorRole: currentUser.role || 'system',
      operatorName: currentUser.name || '系统',
      deviceInfo: navigator.userAgent ? navigator.userAgent.slice(0, 120) : 'unknown',
    };
    this.state.auditLog.unshift(entry);
    if (this.state.auditLog.length > 1000) this.state.auditLog.pop();
    this.state.auditLogRev++;
    try {
      localStorage.setItem('auditLog', JSON.stringify(this.state.auditLog.slice(0, 200)));
    } catch(e) {}
    CloudSync.pushAuditLog(this.state.auditLog).catch(() => {});
  },

  // ---- 自动同步到云端（异步，不阻塞主操作）----
  _autoSyncToCloud() {
    // 异步推送到云端，静默失败
    CloudSync.pushToCloud().catch(err => {
      console.warn('[Store] 自动同步到云端失败:', err.message);
    });
  },

  // ---- 操作日志：从云端拉取（优先），降级到 localStorage ----
  async _loadAuditLog() {
    // 优先从云端拉取（1000条完整记录）
    try {
      const cloudLogs = await CloudSync.pullAuditLog();
      if (cloudLogs && cloudLogs.length > 0) {
        this.state.auditLog = cloudLogs;
        this.state.auditLogRev++;
        // 同步更新本地 localStorage 缓存
        try { localStorage.setItem('auditLog', JSON.stringify(cloudLogs.slice(0, 200))); } catch(e) {}
        console.log('[Store] 操作记录从云端加载，条数:', cloudLogs.length);
        return;
      }
    } catch(e) {}
    // 降级：从 localStorage 读取
    try {
      const raw = localStorage.getItem('auditLog');
      if (raw) {
        this.state.auditLog = JSON.parse(raw);
        this.state.auditLogRev++;
        console.log('[Store] 操作记录从本地加载，条数:', this.state.auditLog.length);
      }
    } catch(e) {}
  },

  // ---- 操作日志：回退单条操作 ----
  async revertAudit(entryId) {
    const entry = this.state.auditLog.find(e => e.id === entryId);
    if (!entry || !entry.snapshot) return { success: false, msg: '无法回退：该操作没有快照' };
    const { type, data } = entry.snapshot;
    try {
      if (type === 'student_delete') {
        // 恢复被删除的学生
        const exists = this.state.students.some(s => s.id === data.id);
        if (!exists) {
          this.state.students.push(data);
          this.state.students.sort((a, b) => a.id - b.id);
          this.state.studentRev++;
          await dbStorage.storeStudents(this.state.students);
          this._scheduleCloudPush();        }
        this._logAudit('回退操作', `恢复了学生「${data.name}」`, null);
        return { success: true, msg: `已恢复学生「${data.name}」` };
      }
      if (type === 'student_update') {
        const idx = this.state.students.findIndex(s => s.id === data.id);
        if (idx >= 0) {
          Vue.set(this.state.students, idx, { ...data });
          this.state.studentRev++;
          await dbStorage.storeStudents(this.state.students);
          this._scheduleCloudPush();        }
        this._logAudit('回退操作', `恢复了学生「${data.name}」的数据`, null);
        return { success: true, msg: `已恢复学生「${data.name}」的数据` };
      }
      if (type === 'task_delete') {
        const exists = this.state.tasks.some(t => t.id === data.id);
        if (!exists) {
          this.state.tasks.push(data);
          this.state.taskRev++;
          await dbStorage.storeTasks(this.state.tasks);
          this._scheduleCloudPush();        }
        this._logAudit('回退操作', `恢复了任务「${data.title}」`, null);
        return { success: true, msg: `已恢复任务「${data.title}」` };
      }
      if (type === 'points_change') {
        const student = this.state.students.find(s => s.id === data.id);
        if (student) {
          student.points = data.points;
          // 强制响应式更新：替换数组引用
          this.state.students = [...this.state.students];
          this.state.studentRev++;
          await dbStorage.storeStudents(this.state.students);
          this._scheduleCloudPush();        }
        this._logAudit('回退操作', `恢复了学生「${data.name}」的积分为 ${data.points}`, null);
        return { success: true, msg: `已恢复学生「${data.name}」积分为 ${data.points}` };
      }
      return { success: false, msg: '未知操作类型，无法回退' };
    } catch(e) {
      return { success: false, msg: '回退失败: ' + e.message };
    }
  },

  // ---- 操作日志：清空全部 ----
  clearAuditLog() {
    this.state.auditLog = [];
    this.state.auditLogRev++;
    localStorage.removeItem('auditLog');
    // 同步清空云端
    CloudSync.clearCloudAuditLog().catch(() => {});
  },

  // ---- 初始化成就列表 ----
  initAchievements() {
    this.state.achievements = ACHIEVEMENTS;
  },

  // ---- 初始化：从本地存储加载数据，若为空则填入初始演示数据 ----
  async init() {
    try {
      // 从 IndexedDB 读取数据
      const [cachedStudents, cachedTasks] = await Promise.all([
        dbStorage.getStudents(),
        dbStorage.getTasks()
      ]);
      
      if (cachedStudents.length > 0) {
        // 用 splice 替换数组内容，确保 Vue 响应式正确追踪
        this.state.students.splice(0, this.state.students.length, ...cachedStudents);
        console.log('从本地存储加载学生数据');

        // 如果本地有真实数据但时间戳未初始化，设为当前时间保护本地数据
        const hasRealStudents = cachedStudents.some(s => !s._isPlaceholder);
        if (hasRealStudents) {
          const meta = await dbStorage.getMeta('studentsUpdatedAt');
          if (!meta) {
            await dbStorage.storeMeta('studentsUpdatedAt', new Date().toISOString());
            console.log('[Store] 初始化 studentsUpdatedAt 时间戳（保护本地数据）');
          }
        }
      } else {
        // 首次使用，无缓存数据
        if (DEBUG_MODE) {
          // Debug 模式：加载演示数据（不持久化）
          this.state.students = JSON.parse(JSON.stringify(INITIAL_STUDENTS));
          console.log('DEBUG 模式：加载演示学生数据（不保存）');
        } else {
          // 正常模式：写入占位学生
          this.state.students = [JSON.parse(JSON.stringify(PLACEHOLDER_STUDENT))];
          await dbStorage.storeStudents(this.state.students);
          this._scheduleCloudPush();          console.log('写入占位学生数据');
        }
      }
      
      if (cachedTasks.length > 0) {
        this.state.tasks.splice(0, this.state.tasks.length, ...cachedTasks);
        console.log('从本地存储加载任务数据');
      } else {
        if (DEBUG_MODE) {
          this.state.tasks = JSON.parse(JSON.stringify(INITIAL_TASKS));
          console.log('DEBUG 模式：加载演示任务数据（不保存）');
        } else {
          this.state.tasks = [];
          await dbStorage.storeTasks(this.state.tasks);
          this._scheduleCloudPush();          console.log('写入空任务数据');
        }
      }
      
      // 初始化成就系统 & 操作日志
      this.initAchievements();
      await this._loadAuditLog();
      this.state._initialized = true;
      
      // 后台检测云端同步状态（不阻塞加载）
      this._autoSyncCheck().catch(() => {});
      
      console.log('本地存储初始化完成');
    } catch (e) {
      console.error('[Store] 初始化失败:', e);
      // 回退到占位学生
      this.state.students = [JSON.parse(JSON.stringify(PLACEHOLDER_STUDENT))];
      this.state.tasks    = [];
      this.initAchievements();
      this.state._initialized = true;
      console.log('初始化使用占位学生');
    }
  },

  // ---- 批量发放宠物经验（基于积分排名） ----
  async batchGrantPetExp(options) {
    try {
      const { baseExp = 50, topMultiplier = 2.0, bottomMultiplier = 0.5, moodLink = true } = options || {};
      const students = this.state.students.filter(s => s.petType && !s.petDead);
      if (students.length === 0) return { success: false, msg: '没有可发放经验的学生' };
      const ranked = [...students].sort((a, b) => (b.points || 0) - (a.points || 0));
      const total = ranked.length;
      let levelUps = 0;
      for (let i = 0; i < ranked.length; i++) {
        const s = ranked[i];
        const ratio = total === 1 ? topMultiplier :
          bottomMultiplier + (topMultiplier - bottomMultiplier) * ((total - 1 - i) / (total - 1));
        const exp = Math.round(baseExp * ratio);
        const oldLevel = getLevelInfo(s.petExp || 0).level;
        s.petExp = (s.petExp || 0) + exp;
        const newLevel = getLevelInfo(s.petExp).level;
        if (newLevel > oldLevel) levelUps++;
        if (moodLink) {
          const mood = getStudentMood(s.petStatus, s);
          if (mood === PET_MOODS.excited || mood === PET_MOODS.happy) {
            s.petExp += Math.round(exp * 0.1);
          }
        }
      }
      await dbStorage.storeStudents(this.state.students);
      this._scheduleCloudPush();
      this.state.studentRev++;
      this._logAudit('批量发放经验', `为 ${students.length} 名学生发放宠物经验`, null);
      return { success: true, total: students.length, levelUps };
    } catch (e) {
      return { success: false, msg: e.message };
    }
  },

  // ---- 每日自动经验发放日期记录 ----
  async getDailyGrantDate() {
    try {
      const val = await dbStorage.getMeta('dailyGrantDate');
      return val || '';
    } catch (e) { return ''; }
  },
  async setDailyGrantDate(dateStr) {
    try {
      await dbStorage.storeMeta('dailyGrantDate', dateStr);
    } catch (e) {}
  },

  // ---- 获取学生排名经验倍率（排名越高倍率越高）----
  _getRankMultiplier(studentId) {
    const ranked = [...this.state.students]
      .filter(s => !s._isPlaceholder)
      .sort((a, b) => (b.points || 0) - (a.points || 0));
    const total = ranked.length;
    if (total <= 1) return 1.5;
    const idx = ranked.findIndex(s => s.id === studentId);
    if (idx === -1) return 1.0;
    // topMultiplier=2.0（第1名）, bottomMultiplier=0.5（末名）
    const topM = 2.0, bottomM = 0.5;
    const ratio = bottomM + (topM - bottomM) * ((total - 1 - idx) / (total - 1));
    return Math.round(ratio * 100) / 100;
  },

  // ---- 防抖云端推送（每次数据变更后调度，3秒内多次变更只推一次）----
  _pushTimer: null,
  _scheduleCloudPush() {
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this.cloudPush().catch(e => console.warn('[Store] 自动推送失败:', e));
    }, 3000);
  },

  // ---- 防抖 IndexedDB 写入（500ms内多次变更只写一次）----
  _dbWriteTimer: null,
  _dbWritePending: false,
  _scheduleDbWrite(immediate = false) {
    if (immediate) {
      // 关键数据：立即写入
      clearTimeout(this._dbWriteTimer);
      this._dbWritePending = false;
      this._flushDbWrite();
      return;
    }
    if (!this._dbWritePending) {
      this._dbWritePending = true;
      this._dbWriteTimer = setTimeout(() => {
        this._dbWritePending = false;
        this._flushDbWrite();
      }, 500);
    }
  },
  async _flushDbWrite() {
    try {
      if (this.state.students.length > 0) {
        await dbStorage.storeStudents(this.state.students);
      }
      if (this.state.tasks.length > 0) {
        await dbStorage.storeTasks(this.state.tasks);
      }
    } catch (e) {
      console.warn('[Store] IndexedDB写入失败:', e);
    }
  },

  // ---- 后台自动检测云端同步冲突（页面加载时调用，不阻塞）----
  async _autoSyncCheck() {
    try {
      const ping = await CloudSync.ping();
      if (!ping.ok) return; // 无网络或无 Supabase

      const cloudTimes = await CloudSync.getCloudLastUpdateTime();
      if (!cloudTimes || !cloudTimes.students) return; // 云端无数据

      const localTime = await dbStorage.getMeta('studentsUpdatedAt');
      if (!localTime) return; // 从未同步过

      const diff = Math.abs(new Date(cloudTimes.students).getTime() - new Date(localTime).getTime());
      if (diff <= 2000) {
        // 一致 → 静默推送本地到云端
        await this.cloudPush();
        console.log('[AutoSync] 云端数据一致，已静默推送');
      } else {
        // 不一致 → 设置冲突标志，AdminCloud 打开时自动弹窗
        this.state._syncConflict = true;
        this.state._syncConflictCloudTime = cloudTimes.students.toISOString();
        this.state._syncConflictLocalTime = localTime;
        console.log('[AutoSync] ⚠️ 检测到数据冲突（本地:', localTime, '云端:', cloudTimes.students.toISOString(), '）');
      }
    } catch (e) {
      console.warn('[AutoSync] 后台检测失败（不影响使用）:', e.message || e);
    }
  },

  // ---- 刷新任务列表（学生端轮询用） ----
  async refreshTasks() {
    // 从本地存储加载任务数据
    try {
      const cachedTasks = await dbStorage.getTasks();
      if (cachedTasks.length > 0) {
        this.state.tasks = cachedTasks;
        this.state.taskRev++;   // 通知所有依赖 taskRev 的 computed 重新计算
        console.log('从本地存储刷新任务数据');
      }
    } catch (err) {
      console.warn('从本地存储刷新任务数据失败:', err);
    }
  },

  // ---- 刷新学生列表 ----
  async refreshStudents() {
    // 从本地存储加载学生数据
    try {
      const cachedStudents = await dbStorage.getStudents();
      if (cachedStudents.length > 0) {
        this.state.students = cachedStudents;
        this.state.studentRev++;
        console.log('从本地存储刷新学生数据');
      }
    } catch (err) {
      console.warn('从本地存储刷新学生数据失败:', err);
    }
  },

  // ---- 刷新单个学生 ----
  async refreshStudent(studentId) {
    // 从本地存储加载学生数据
    try {
      const cachedStudents = await dbStorage.getStudents();
      const student = cachedStudents.find(s => s.id === studentId);
      if (student) {
        const idx = this.state.students.findIndex(s => s.id === studentId);
        if (idx >= 0) {
          this.state.students[idx] = student;
          this.state.students = [...this.state.students]; // 触发 Vue 响应式
          console.log('从本地存储刷新单个学生数据');
        }
      }
    } catch (err) {
      console.warn('从本地存储刷新单个学生数据失败:', err);
    }
  },

  // ---- 已废弃的 save()，保留空实现避免报错 ----
  save() { /* 数据已由本地存储持久化，无需 localStorage */ },



  // ---- 更新学生数据（通用） ----
  async updateStudent(id, updates) {
    // 先更新本地（即时响应）
    const idx = this.state.students.findIndex(s => s.id === id);
    if (idx >= 0) {
      Object.assign(this.state.students[idx], updates);
      // 同步到本地存储（DEBUG 模式不保存）
      if (!DEBUG_MODE) {
        try {
          await dbStorage.storeStudents(this.state.students);
          this._scheduleCloudPush();          console.log('学生数据已同步到本地存储');
        } catch (err) {
          console.warn('同步学生数据到本地存储失败:', err);
        }
      } else {
        console.log('DEBUG 模式：数据变更不持久化');
      }
    }
  },

  // ---- 领取宠物 ----
  async adoptPet(studentId, petTypeId, petName) {
    const petType = PET_TYPES.find(p => p.id === petTypeId);
    if (!petType) return { success: false, msg: '宠物类型不存在' };

    // 更新本地学生数据
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return { success: false, msg: '学生不存在' };
    
    student.petType = petTypeId;
    student.petName = petName || petType.name;
    student.petExp = 0;
    student.petStage = 1;
    student.petStatus = {
      health: 100,
      hungry: 100,
      happy: 100,
      clean: 100
    };
    student.petDead = false;

    // 同步到本地存储（DEBUG 模式不保存）
    if (!DEBUG_MODE) {
      await dbStorage.storeStudents(this.state.students);
      this._scheduleCloudPush();      console.log('宠物领养数据已同步到本地存储');
      return { success: true };
    } else {
      console.log('DEBUG 模式：宠物领养不持久化');
      return { success: true };
    }
  },

  // ---- 更新宠物信息（改名/改类型）----
  async updatePet(studentId, updates) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return { success: false, msg: '学生不存在' };
    if (!student.petType) return { success: false, msg: '还没有宠物，请先领取' };

    // 应用更新
    if (updates.petName !== undefined) {
      student.petName = updates.petName.trim() || student.petName;
    }
    if (updates.petType !== undefined) {
      const petType = PET_TYPES.find(p => p.id === updates.petType);
      if (!petType) return { success: false, msg: '宠物类型不存在' };
      student.petType = updates.petType;
    }

    try {
      if (!DEBUG_MODE) {
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();        console.log('宠物信息已更新并同步');
      } else {
        console.log('DEBUG 模式：宠物更新不持久化');
      }
      return { success: true };
    } catch (err) {
      return { success: false, msg: '保存失败' };
    }
  },

  // ---- 复活宠物（喂食复活，经验清零，状态全满）----
  async revivePet(studentId) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return { success: false, msg: '学生不存在' };
    if (!student.petDead) return { success: false, msg: '宠物还活着，不需要复活' };

    // 复活宠物
    student.petDead = false;
    student.petExp = 0;           // 经验清零
    student.petStage = 0;         // 等级重置
    student.deathTime = null;      // 清除死亡时间
    
    // 恢复状态
    student.petStatus = {
      health: 100,
      hungry: 100,
      happy: 100,
      clean: 100
    };

    // 记录复活日志
    this._logAudit('复活宠物', `复活了「${student.name}」的宠物「${student.petName}」（经验已重置）`, null);

    try {
      if (!DEBUG_MODE) {
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();        console.log('宠物复活数据已同步到本地存储');
        // 自动同步到云端
        this._autoSyncToCloud();
      } else {
        console.log('DEBUG 模式：宠物复活不持久化');
      }
      return { success: true, student };
    } catch (err) {
      return { success: false, msg: '复活失败' };
    }
  },

  // ---- 内部：写积分日志（本地） ----
  _logPoints(student, delta, reason, icon) {
    if (!student.pointsLog) student.pointsLog = [];
    student.pointsLog.push({
      icon: icon || (delta > 0 ? '⭐' : '📉'),
      label: reason || (delta > 0 ? '获得积分' : '扣除积分'),
      delta,
      time: new Date().toLocaleString('zh-CN'),
      total: student.points,
    });
  },

  // ---- 添加积分（积分与宠物经验完全解耦，积分不再转化为宠物经验）----
  addPoints(studentId, pts, reason, icon) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return { levelUp: false };
    const oldPoints = student.points || 0;
    student.points = oldPoints + pts;
    this._logPoints(student, pts, reason, icon);
    // 记录快照用于回退
    this._logAudit(
      pts > 0 ? '发放积分' : '扣除积分',
      `学生「${student.name}」积分 ${pts > 0 ? '+' : ''}${pts}（${reason || '无说明'}）`,
      { type: 'points_change', data: { id: student.id, name: student.name, points: oldPoints } }
    );
    // 积分不再给宠物加经验，经验只通过喂食/洗澡/玩耍等护理行为获得
    this._scheduleCloudPush();
    return { levelUp: false };
  },

  // ---- 消耗积分（本地更新） ----
  async spendPoints(studentId, pts, reason) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return { success: false, msg: '学生不存在' };
    if (student.points < pts) return { success: false, msg: '积分不足' };
    const oldPoints = student.points;
    student.points -= pts;
    const reasonStr = reason || `消耗了 ${pts} 积分`;
    this._logPoints(student, -pts, reasonStr, '🎁');
    // 记录快照用于回退
    this._logAudit(
      '消费积分',
      `学生「${student.name}」消费 ${pts}（${reasonStr}）`,
      { type: 'points_change', data: { id: student.id, name: student.name, points: oldPoints } }
    );
    if (!DEBUG_MODE) await dbStorage.storeStudents(this.state.students);
    this._scheduleCloudPush();    return { success: true, remaining: student.points };
  },

  // ---- 使用道具 ----
  async useItem(studentId, itemId) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return { success: false, msg: '学生不存在' };
    if (!student.backpack[itemId] || student.backpack[itemId] <= 0)
      return { success: false, msg: '背包中没有该道具！' };
    const item = ITEMS.find(i => i.id === itemId);
    if (!item) return { success: false, msg: '道具不存在' };

    // ===== 新增：状态满值检查（达到100时禁止使用对应道具）=====
    if (!student.petDead) {
      const status = student.petStatus || {};
      if (item.type === 'food' && (status.hungry || 0) >= 100) {
        return { success: false, msg: '宠物已经吃饱了！饱食度满值时不能再喂食 🍗' };
      }
      if (item.type === 'clean' && (status.clean || 0) >= 100) {
        return { success: false, msg: '宠物已经很干净了！清洁度满值时不需要洗澡 🛁' };
      }
      // 心情满时不再限制使用玩具
      if (item.type === 'heal' && (status.health || 0) >= 100) {
        return { success: false, msg: '宠物身体很健康！生命值满值时不需要治疗 ❤️' };
      }
    }
    // ===== 结束状态满值检查 =====

    // 本地处理道具使用逻辑
    try {
      // 减少背包中的道具数量
      student.backpack[itemId]--;
      if (student.backpack[itemId] === 0) {
        delete student.backpack[itemId];
      }


      let levelUp = false;
      let newStage = student.petStage || 1;
      let recovered = false;

      // 宠物死亡状态下，喂食复活（经验清零）
      if (student.petDead) {
        if (item.type === 'food') {
          recovered = true;
          student.petDead = false;
          student.petExp = 0;           // 经验清零
          student.petStage = 0;         // 等级重置
          student.deathTime = null;     // 清除死亡时间
          student.petStatus = {
            health: 100,
            hungry: 100,
            happy: 100,
            clean: 100
          };
        }
      } else {
        // 宠物存活状态下，应用道具效果
        const status = student.petStatus || {
          health: 100,
          hungry: 100,
          happy: 100,
          clean: 100
        };

        // 应用道具效果
        if (item.effect.hungry) status.hungry = Math.min(100, status.hungry + item.effect.hungry);
        if (item.effect.health) status.health = Math.min(100, status.health + item.effect.health);
        if (item.effect.happy) status.happy = Math.min(100, status.happy + item.effect.happy);
        if (item.effect.clean) status.clean = Math.min(100, status.clean + item.effect.clean);

        student.petStatus = status;

        // 增加宠物经验（按排名加成）
        if (item.effect.exp) {
          const rankMultiplier = this._getRankMultiplier(student.id);
          const bonusExp = Math.round(item.effect.exp * rankMultiplier);
          student.petExp = (student.petExp || 0) + bonusExp;
          // 检查是否升级
          const levelInfo = getLevelInfo(student.petExp);
          if (levelInfo.level > (student.petStage || 1)) {
            levelUp = true;
            newStage = levelInfo.level;
            student.petStage = newStage;
          }
        }
      }

      // 同步到本地存储（DEBUG 模式不保存）
      if (!DEBUG_MODE) {
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();        console.log('道具使用数据已同步到本地存储');
        // 自动同步到云端
        this._autoSyncToCloud();
      } else {
        console.log('DEBUG 模式：道具使用不持久化');
      }

      // 返回更新后的学生数据（避免 refreshStudent 重新读 IndexedDB 的时序问题）
      return {
        success: true,
        levelUp,
        newStage,
        recovered,
        item,
        expMsg: '',
        student,   // ← 直接返回最新的学生对象
      };
    } catch (err) {
      console.warn('使用道具失败:', err);
      return { success: false, msg: '使用道具失败' };
    }
  },

  // ---- 购买道具 ----
  async buyItem(studentId, itemId) {
    const item = ITEMS.find(i => i.id === itemId);
    if (!item) return { success: false, msg: '道具不存在' };
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return { success: false, msg: '学生不存在' };
    const money = student.money || 0;
    if (money < item.cost) return { success: false, msg: `金币不足，需要${item.cost}金币` };

    // 本地处理购买逻辑
    try {
      // 扣除金币
      student.money = money - item.cost;

      // 增加背包中的道具数量
      if (!student.backpack) {
        student.backpack = {};
      }
      if (!student.backpack[itemId]) {
        student.backpack[itemId] = 0;
      }
      student.backpack[itemId]++;

      // 同步到本地存储（DEBUG 模式不保存）
      if (!DEBUG_MODE) {
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();        console.log('道具购买数据已同步到本地存储');
      } else {
        console.log('DEBUG 模式：道具购买不持久化');
      }

      return { success: true, item };
    } catch (err) {
      console.warn('购买道具失败:', err);
      return { success: false, msg: '购买道具失败' };
    }
  },

  // ---- 计算日收入（金币）----
  // 公式：base 10 + points*5%，最低1金币（积分再低也有收入）
  calcDailyIncome(points) {
    return Math.max(1, Math.floor((points || 0) * 0.05) + 10);
  },

  // ---- 发放日收入 ----
  async grantDailyIncome(studentId) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return null;
    const income = this.calcDailyIncome(student.points);
    if (!student.money) student.money = 0;
    student.money += income;
    if (!DEBUG_MODE) {
      await dbStorage.storeStudents(this.state.students);
      this._scheduleCloudPush();    }
    return income;
  },

  // ---- 提交任务 ----
  async submitTask(taskId, studentId, content) {
    try {
      // 本地更新
      const task = this.state.tasks.find(t => t.id === taskId);
      if (task) {
        const existing = task.submissions.find(s => s.studentId === studentId);
        if (existing) {
          existing.status      = 'submitted';
          existing.content     = content;
          existing.submittedAt = new Date().toLocaleString('zh-CN');
          existing.resubmitted = true;
          delete existing.reviewedAt;
        } else {
          task.submissions.push({ studentId, status: 'submitted', submittedAt: new Date().toLocaleString('zh-CN'), content });
        }
        
        // 同步到本地存储（DEBUG 模式不保存）
        if (!DEBUG_MODE) {
          await dbStorage.storeTasks(this.state.tasks);
          this._scheduleCloudPush();          console.log('任务提交数据已同步到本地存储');
        } else {
          console.log('DEBUG 模式：任务提交不持久化');
        }
        
        return { success: true };
      } else {
        return { success: false, msg: '任务不存在' };
      }
    } catch (err) {
      console.warn('提交任务失败:', err);
      return { success: false, msg: '提交任务失败' };
    }
  },

  // ---- 重新提交任务 ----
  async resubmitTask(taskId, studentId, content) {
    return this.submitTask(taskId, studentId, content);
  },

  // ---- 教师审核任务 ----
  async reviewTask(taskId, studentId, approved) {
    try {
      // 本地同步任务状态
      const task = this.state.tasks.find(t => t.id === taskId);
      if (!task) return { success: false, msg: '任务不存在' };
      const sub = task.submissions.find(s => s.studentId === studentId);
      if (!sub) return { success: false, msg: '该学生未提交此任务' };
      
      sub.status     = approved ? 'completed' : 'rejected';
      sub.reviewedAt = new Date().toLocaleString('zh-CN');
      
      // 同步任务数据到本地存储（DEBUG 模式不保存）
      if (!DEBUG_MODE) {
        await dbStorage.storeTasks(this.state.tasks);
        this._scheduleCloudPush();      } else {
        console.log('DEBUG 模式：任务审核不持久化');
      }
      
      // 本地同步学生积分（任务审核只给积分，不给宠物经验）
      if (approved) {
        const student = this.state.students.find(s => s.id === studentId);
        if (student) {
          // 增加积分
          student.points = (student.points || 0) + task.points;
          // 记录积分变动原因
          student._lastGrantReason = `完成任务「${task.title}」获得奖励`;
          // 写入积分日志
          this._logPoints(student, task.points, `完成任务「${task.title}」`, task.icon || '📝');
          
          // 同步学生数据到本地存储（DEBUG 模式不保存）
          if (!DEBUG_MODE) {
            await dbStorage.storeStudents(this.state.students);
            this._scheduleCloudPush();            console.log('任务审核数据已同步到本地存储');
            // 自动同步到云端
            this._autoSyncToCloud();
          }
        }
        return { success: true, awarded: true };
      }
      if (!DEBUG_MODE) {
        console.log('任务审核数据已同步到本地存储');
        // 自动同步到云端
        this._autoSyncToCloud();
      }
      return { success: true, awarded: false };
    } catch (err) {
      console.warn('审核任务失败:', err);
      return { success: false, msg: '审核任务失败，请重试' };
    }
  },

  // ---- 发布任务 ----
  async createTask(taskData) {
    try {
      // 创建新任务对象
      const newTask = {
        id: Date.now(), // 使用时间戳作为任务ID
        ...taskData,
        status: 'active',
        createdBy: 100, // 默认创建者ID
        createdAt: new Date().toLocaleString('zh-CN'),
        submissions: []
      };
      
      // 添加到本地任务列表
      this.state.tasks.push(newTask);
      
      // 同步到本地存储（DEBUG 模式不保存）
      if (!DEBUG_MODE) {
        await dbStorage.storeTasks(this.state.tasks);
        this._scheduleCloudPush();        console.log('任务创建数据已同步到本地存储');
      } else {
        console.log('DEBUG 模式：任务创建不持久化');
      }
      
      return { success: true, task: newTask };
    } catch (err) {
      console.warn('创建任务失败:', err);
      return { success: false, msg: '创建任务失败' };
    }
  },

  // ---- 删除任务 ----
  async deleteTask(taskId) {
    try {
      const task = this.state.tasks.find(t => t.id === taskId);
      if (!task) return { success: false };

      // 记录快照（用于回退）
      const snapshot = JSON.parse(JSON.stringify(task));
      this._logAudit('删除任务', `删除了任务「${task.title}」（积分：${task.points}，科目：${task.subject || '-'}）`,
        { type: 'task_delete', data: snapshot });

      this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);

      if (!DEBUG_MODE) {
        await dbStorage.storeTasks(this.state.tasks);
        this._scheduleCloudPush();      }
      return { success: true };
    } catch (err) {
      console.warn('删除任务失败:', err);
      return { success: false, msg: '删除任务失败' };
    }
  },

  // ---- 更新任务 ----
  async updateTask(taskId, updates) {
    try {
      // 找到并更新任务
      const task = this.state.tasks.find(t => t.id === taskId);
      if (task) {
        Object.assign(task, updates);
        
        // 同步到本地存储（DEBUG 模式不保存）
        if (!DEBUG_MODE) {
          await dbStorage.storeTasks(this.state.tasks);
          this._scheduleCloudPush();          console.log('任务更新数据已同步到本地存储');
        } else {
          console.log('DEBUG 模式：任务更新不持久化');
        }
        return { success: true };
      } else {
        return { success: false, msg: '任务不存在' };
      }
    } catch (err) {
      console.warn('更新任务失败:', err);
      return { success: false, msg: '更新任务失败' };
    }
  },

  // ---- 添加学生（教师端）：自动删除占位学生 ----
  async addStudent(studentData) {
    try {
      // 创建新学生对象
      const newStudent = {
        id: Date.now(), // 使用时间戳作为学生ID
        ...studentData,
        points: 100, // 初始积分100分
        money: 100,  // 初始金币100
        petType: null,
        petName: null,
        petExp: 0,
        petStage: 1,
        petStatus: {
          health: 100,
          hungry: 100,
          happy: 100,
          clean: 100
        },
        petDead: false,
        backpack: {},
        joinDate: new Date().toLocaleString('zh-CN')
      };
      
      // 自动删除占位学生（只要存在就删）
      const placeholderIdx = this.state.students.findIndex(s => s._isPlaceholder);
      if (placeholderIdx >= 0) {
        this.state.students.splice(placeholderIdx, 1);
        console.log('创建真实学生，自动删除占位学生');
      }
      
      // 添加到本地学生列表
      this.state.students.push(newStudent);

      // 操作日志
      this._logAudit('添加学生', `添加了学生「${newStudent.name}」（账号：${newStudent.username}，班级：${newStudent.class || '-'}）`, null);

      // 同步到本地存储（DEBUG 模式不保存）
      if (!DEBUG_MODE) {
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();      }

      this._scheduleCloudPush();
      return { success: true, student: newStudent };
    } catch (err) {
      console.warn('添加学生失败:', err);
      return { success: false, msg: '添加学生失败' };
    }
  },

  // ---- 删除学生 ----
  async deleteStudent(studentId) {
    try {
      const student = this.state.students.find(s => s.id === studentId);
      if (!student) return { success: false, msg: '学生不存在' };

      // 记录快照（用于回退）
      const snapshot = JSON.parse(JSON.stringify(student));
      this._logAudit('删除学生', `删除了学生「${student.name}」（账号：${student.username}，班级：${student.class || '-'}，积分：${student.points}）`, { type: 'student_delete', data: snapshot });

      // 从内存删除
      this.state.students = this.state.students.filter(s => s.id !== studentId);
      // 同步到本地存储
      await dbStorage.storeStudents(this.state.students);
      // 通知 Vue 响应式更新
      this.state.studentRev++;

      this._scheduleCloudPush();
      return { success: true };
    } catch (err) {
      console.warn('删除学生失败:', err);
      return { success: false, msg: '删除学生失败' };
    }
  },

  // ---- 手动发放积分 ----
  async grantPoints(studentId, pts, reason) {
    try {
      const reasonStr = reason || `老师奖励了 ${pts} 积分`;
      const student = this.state.students.find(s => s.id === studentId);
      if (!student) return { success: false, msg: '学生不存在' };

      const oldPoints = student.points || 0;
      // 增加积分
      student.points = oldPoints + pts;
      student._lastGrantReason = reasonStr;
      this._logPoints(student, pts, reasonStr, '⭐');

      // 操作日志（含快照，支持回退）
      if (!reasonStr.includes('每日成长') && !reasonStr.includes('离线惩罚')) {
        this._logAudit('发放积分', `给「${student.name}」发放 ${pts} 积分（${reasonStr}），积分 ${oldPoints} → ${student.points}`,
          { type: 'points_change', data: { id: student.id, name: student.name, points: oldPoints } });
      }

      if (!DEBUG_MODE) {
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();      }
      this._scheduleCloudPush();
      return { success: true };
    } catch (err) {
      console.warn('发放积分失败:', err);
      return { success: false, msg: '发放积分失败，请重试' };
    }
  },

  // ---- 扣除积分 ----
  async deductPoints(studentId, pts, reason) {
    try {
      const reasonStr = reason || `老师扣除了 ${pts} 积分`;
      const student = this.state.students.find(s => s.id === studentId);
      if (student) {
        if ((student.points || 0) >= pts) {
          const oldPoints = student.points;
          student.points -= pts;
          student._lastGrantReason = reasonStr;
          this._logPoints(student, -pts, reasonStr, '📉');

          // 操作日志
          this._logAudit('扣除积分', `从「${student.name}」扣除 ${pts} 积分（${reasonStr}），积分 ${oldPoints} → ${student.points}`,
            { type: 'points_change', data: { id: student.id, name: student.name, points: oldPoints } });

          if (!DEBUG_MODE) {
            await dbStorage.storeStudents(this.state.students);
            this._scheduleCloudPush();          }
          return { success: true, deducted: pts };
        } else {
          return { success: false, msg: '积分不足' };
        }
      } else {
        return { success: false, msg: '学生不存在' };
      }
    } catch (err) {
      console.warn('扣除积分失败:', err);
      return { success: false, msg: '扣除积分失败' };
    }
  },

  // ---- 重置演示数据 ----
  async resetDemo() {
    try {
      if (DEBUG_MODE) {
        // Debug 模式：重置为演示数据（不保存）
        this.state.students = JSON.parse(JSON.stringify(INITIAL_STUDENTS));
        this.state.tasks    = JSON.parse(JSON.stringify(INITIAL_TASKS));
        this.state.taskRev++;
        this.state.studentRev++;
        console.log('DEBUG 模式：演示数据已重置（不保存）');
      } else {
        // 正常模式：清空数据，写入占位学生
        await dbStorage.clear();
        this.state.students = [JSON.parse(JSON.stringify(PLACEHOLDER_STUDENT))];
        this.state.tasks    = [];
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();        await dbStorage.storeTasks(this.state.tasks);
        this._scheduleCloudPush();        this.state.taskRev++;
        this.state.studentRev++;
        console.log('演示数据已重置');
      }
    } catch (err) {
      console.warn('重置演示数据失败:', err);
    }
  },

  // ---- 登出（清除会话状态，数据保留在 IndexedDB） ----
  logout() {
    // 纯前端系统：登出只需清除内存中的会话状态，数据保留在 IndexedDB
    console.log('用户已登出');
  },

  // ========= 教师账号持久化 =========
  // 教师账号存于 localStorage，key='teacherAccounts'，首次加载时用 TEACHER_ACCOUNTS 兜底

  _getTeacherAccounts() {
    try {
      const raw = localStorage.getItem('teacherAccounts');
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    // 首次：从 data.js 的 TEACHER_ACCOUNTS 初始化
    const defaults = (typeof TEACHER_ACCOUNTS !== 'undefined') ? TEACHER_ACCOUNTS : [];
    localStorage.setItem('teacherAccounts', JSON.stringify(defaults));
    return defaults;
  },

  _saveTeacherAccounts(accounts) {
    try { localStorage.setItem('teacherAccounts', JSON.stringify(accounts)); } catch(e) {}
  },

  // ========= 管理员专用方法 =========

  async getTeachers() {
    return this._getTeacherAccounts().map(t => ({ ...t, password: undefined }));
  },

  async deleteTeacher(teacherId) {
    const accounts = this._getTeacherAccounts().filter(t => t.id !== teacherId);
    this._saveTeacherAccounts(accounts);
    return { success: true };
  },

  async resetTeacherPassword(teacherId, newPassword) {
    const accounts = this._getTeacherAccounts();
    const idx = accounts.findIndex(t => t.id === teacherId);
    if (idx < 0) return { success: false, msg: '教师不存在' };
    accounts[idx].password = newPassword;
    this._saveTeacherAccounts(accounts);
    // 同步更新 data.js 中的 TEACHER_ACCOUNTS（内存），下次页面刷新前生效
    if (typeof TEACHER_ACCOUNTS !== 'undefined') {
      const orig = TEACHER_ACCOUNTS.find(t => t.id === teacherId);
      if (orig) orig.password = newPassword;
    }
    return { success: true };
  },

  async getInviteCodes() {
    // 本地实现：返回空数组，因为本地存储版不需要邀请码
    return [];
  },

  async addInviteCode(code, note) {
    // 本地实现：返回成功，因为本地存储版不需要邀请码
    return { success: true };
  },

  async removeInviteCode(code) {
    // 本地实现：返回成功，因为本地存储版不需要邀请码
    return { success: true };
  },

  async validateInviteCode(code) {
    // 本地实现：返回true，因为本地存储版不需要邀请码验证
    return true;
  },

  async resetStudentPassword(studentId, newPassword) {
    try {
      // 本地实现：更新学生密码
      const student = this.state.students.find(s => s.id === studentId);
      if (student) {
        student.password = newPassword;
        // 同步到本地存储（DEBUG 模式不保存）
        if (!DEBUG_MODE) {
          await dbStorage.storeStudents(this.state.students);
          this._scheduleCloudPush();          console.log('学生密码重置数据已同步到本地存储');
          // 自动同步到云端
          this._autoSyncToCloud();
        }
        return { success: true };
      } else {
        return { success: false, msg: '学生不存在' };
      }
    } catch (err) {
      console.warn('重置学生密码失败:', err);
      return { success: false, msg: '重置学生密码失败' };
    }
  },

  async nukeAll() {
    try {
      // 清空本地存储数据
      await dbStorage.clear();
      // 重新初始化
      await this.init();
      console.log('所有数据已清空');
    } catch (err) {
      console.warn('清空所有数据失败:', err);
    }
  },



  // ---- Toast通知 ----
  toast(msg, type = 'info') {
    const id = Date.now();
    this.state.toasts.push({ id, msg, type });
    setTimeout(() => {
      this.state.toasts = this.state.toasts.filter(t => t.id !== id);
    }, 3000);
  },

  // ---- 数据备份和恢复功能 ----
  async createBackup() {
    try {
      // 先同步最新数据到 IndexedDB
      await dbStorage.storeStudents(this.state.students);
      this._scheduleCloudPush();      await dbStorage.storeTasks(this.state.tasks);
      this._scheduleCloudPush();      // 创建备份
      const backup = await dbStorage.createBackup();
      if (backup) {
        this.toast('💾 数据备份成功', 'success');
        return backup;
      } else {
        this.toast('备份创建失败', 'error');
        return null;
      }
    } catch (err) {
      console.error('创建备份失败:', err);
      this.toast('备份创建失败', 'error');
      return null;
    }
  },

  async getBackups() {
    try {
      const backups = await dbStorage.getBackups();
      return backups;
    } catch (err) {
      console.error('获取备份列表失败:', err);
      return [];
    }
  },

  async restoreBackup(backupId) {
    try {
      const success = await dbStorage.restoreBackup(backupId);
      if (success) {
        // 从 IndexedDB 加载恢复后的数据
        const [students, tasks] = await Promise.all([
          dbStorage.getStudents(),
          dbStorage.getTasks()
        ]);
        
        if (students.length > 0) this.state.students = students;
        if (tasks.length > 0) this.state.tasks = tasks;
        
        this.initAchievements();
        this.state.taskRev++;
        this.state.studentRev++;
        this.toast('🔄 数据恢复成功', 'success');
        return true;
      } else {
        this.toast('恢复失败：备份不存在', 'error');
        return false;
      }
    } catch (err) {
      console.error('恢复备份失败:', err);
      this.toast('恢复失败', 'error');
      return false;
    }
  },

  // ---- 导出全量 JSON 数据到文件 ----
  async exportJSON() {
    try {
      await dbStorage.storeStudents(this.state.students);
      this._scheduleCloudPush();      await dbStorage.storeTasks(this.state.tasks);
      this._scheduleCloudPush();      const students = await dbStorage.getStudents();
      const tasks    = await dbStorage.getTasks();
      const payload  = {
        version:   1,
        exportedAt: new Date().toISOString(),
        students,
        tasks,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `classroom-pet-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast('📦 数据已导出为 JSON 文件', 'success');
    } catch (err) {
      console.error('导出 JSON 失败:', err);
      this.toast('导出失败', 'error');
    }
  },

  // ---- 从 JSON 文件导入数据（覆盖当前数据）----
  async importJSON(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload.students || !Array.isArray(payload.students)) {
        this.toast('文件格式错误，请选择正确的备份文件', 'error');
        return false;
      }
      // 写入 IndexedDB
      await dbStorage.storeStudents(payload.students);
      this._scheduleCloudPush();      await dbStorage.storeTasks(payload.tasks || []);
      this._scheduleCloudPush();      // 更新内存状态
      this.state.students.splice(0, this.state.students.length, ...payload.students);
      this.state.tasks.splice(0, this.state.tasks.length, ...(payload.tasks || []));
      this.state.taskRev++;
      this.state.studentRev++;
      this.toast(`✅ 导入成功！学生 ${payload.students.length} 条，任务 ${(payload.tasks||[]).length} 条`, 'success');
      return true;
    } catch (err) {
      console.error('导入 JSON 失败:', err);
      this.toast('导入失败：文件解析错误', 'error');
      return false;
    }
  },

  // ---- 更新学生头像（base64）----
  async updateAvatar(studentId, base64) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return false;
    if (base64) {
      student.avatar = base64;
    } else {
      // 用 Vue.delete 确保删除属性触发响应式更新
      Vue.delete(student, 'avatar');
    }
    if (!DEBUG_MODE) await dbStorage.storeStudents(this.state.students);
    this._scheduleCloudPush();    // 自动同步到云端
    this._autoSyncToCloud();
    return true;
  },

  async clearLocalData() {
    try {
      await dbStorage.clear();
      this.toast('🗑️ 本地数据已清除', 'success');
    } catch (err) {
      console.error('清除本地数据失败:', err);
      this.toast('清除失败', 'error');
    }
  },
  
  // ---- 成就系统相关方法 ----
  
  // 检查并触发学生成就
  checkAchievements(studentId) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student) return;
    
    // 确保学生有成就记录
    if (!student.achievements) {
      student.achievements = {
        unlocked: [],
        progress: {}
      };
    }
    
    // 检查所有成就
    ACHIEVEMENTS.forEach(achievement => {
      // 跳过已解锁的成就
      if (student.achievements.unlocked.includes(achievement.id)) return;
      
      // 检查成就条件
      if (this.checkAchievementCondition(student, achievement)) {
        this.unlockAchievement(student, achievement);
      } else {
        // 更新成就进度
        this.updateAchievementProgress(student, achievement);
      }
    });
  },
  
  // 检查成就条件
  checkAchievementCondition(student, achievement) {
    const condition = achievement.condition;
    
    switch (condition.type) {
      case 'task_completed':
        // 计算学生完成的任务数
        let completedTasks = 0;
        this.state.tasks.forEach(task => {
          const submission = task.submissions.find(s => s.studentId === student.id);
          if (submission && submission.status === 'completed') {
            completedTasks++;
          }
        });
        return completedTasks >= condition.count;
        
      case 'points_earned':
        return (student.points || 0) >= condition.count;
        
      case 'pet_hatched':
        return student.petType && !student.petDead;
        
      case 'pet_level':
        const levelInfo = getLevelInfo(student.petExp || 0);
        return levelInfo.level >= condition.level;
        
      case 'login_streak':
        // 简化实现，实际应该根据登录记录计算连续天数
        return true; // 暂时返回true，实际需要实现登录记录
        
      case 'task_types':
        // 计算学生完成的任务类型数
        const completedSubjects = new Set();
        this.state.tasks.forEach(task => {
          const submission = task.submissions.find(s => s.studentId === student.id);
          if (submission && submission.status === 'completed') {
            completedSubjects.add(task.subject);
          }
        });
        return completedSubjects.size >= condition.count;
        
      case 'rank_top':
        // 检查学生是否在排行榜第一名
        const sortedStudents = [...this.state.students].sort((a, b) => (b.points || 0) - (a.points || 0));
        return sortedStudents[0] && sortedStudents[0].id === student.id;
        
      default:
        return false;
    }
  },
  
  // 更新成就进度
  updateAchievementProgress(student, achievement) {
    const condition = achievement.condition;
    let progress = 0;
    
    switch (condition.type) {
      case 'task_completed':
        let completedTasks = 0;
        this.state.tasks.forEach(task => {
          const submission = task.submissions.find(s => s.studentId === student.id);
          if (submission && submission.status === 'completed') {
            completedTasks++;
          }
        });
        progress = Math.min(100, Math.round((completedTasks / condition.count) * 100));
        break;
        
      case 'points_earned':
        progress = Math.min(100, Math.round(((student.points || 0) / condition.count) * 100));
        break;
        
      case 'pet_level':
        const levelInfo = getLevelInfo(student.petExp || 0);
        progress = Math.min(100, Math.round((levelInfo.level / condition.level) * 100));
        break;
        
      case 'task_types':
        const completedSubjects = new Set();
        this.state.tasks.forEach(task => {
          const submission = task.submissions.find(s => s.studentId === student.id);
          if (submission && submission.status === 'completed') {
            completedSubjects.add(task.subject);
          }
        });
        progress = Math.min(100, Math.round((completedSubjects.size / condition.count) * 100));
        break;
    }
    
    if (progress > 0) {
      student.achievements.progress[achievement.id] = progress;
    }
  },
  
  // 解锁成就
  unlockAchievement(student, achievement) {
    // 添加到已解锁列表
    student.achievements.unlocked.push(achievement.id);
    // 移除进度记录
    delete student.achievements.progress[achievement.id];
    // 发放成就积分
    if (achievement.points > 0) {
      this.addPoints(student.id, achievement.points, `解锁成就「${achievement.name}」`, achievement.icon);
    }
    // 显示成就解锁通知
    this.toast(`🎉 成就解锁：${achievement.icon} ${achievement.name} - ${achievement.description}`, 'success');
  },
  
  // 获取学生成就列表
  getStudentAchievements(studentId) {
    const student = this.state.students.find(s => s.id === studentId);
    if (!student || !student.achievements) {
      return {
        unlocked: [],
        locked: ACHIEVEMENTS,
        progress: {}
      };
    }
    
    const unlocked = ACHIEVEMENTS.filter(a => student.achievements.unlocked.includes(a.id));
    const locked = ACHIEVEMENTS.filter(a => !student.achievements.unlocked.includes(a.id));
    
    return {
      unlocked,
      locked,
      progress: student.achievements.progress || {}
    };
  },
  
  // 获取成就详情
  getAchievementById(id) {
    return ACHIEVEMENTS.find(a => a.id === id);
  },

  // ---- 宠物状态自然衰减（由前端随机间隔调用，45~90分钟一次）----
  // tick 规则（每次随机）：hungry -2~5/次, happy -1~3/次, clean -1~3/次
  // hungry<30 或 clean<30 时 health -2~4/次（最低1）
  async tickPetStatus(studentId) {
    try {
      const student = this.state.students.find(s => s.id === studentId);
      if (!student || student.petDead) return null;

      const status = student.petStatus || {
        health: 100,
        hungry: 100,
        happy: 100,
        clean: 100
      };

      // 随机衰减值
      const hungryDelta = -Math.floor(Math.random() * 4) - 2; // -2 到 -5
      const happyDelta = -Math.floor(Math.random() * 3) - 1;  // -1 到 -3
      const cleanDelta = -Math.floor(Math.random() * 3) - 1;  // -1 到 -3

      // 应用衰减
      status.hungry = Math.max(0, status.hungry + hungryDelta);
      status.happy = Math.max(0, status.happy + happyDelta);
      status.clean = Math.max(0, status.clean + cleanDelta);

      // 当饱食度或清洁度低于30时，生命值也会下降
      if (status.hungry < 30 || status.clean < 30) {
        const healthDelta = -Math.floor(Math.random() * 3) - 2; // -2 到 -4
        status.health = Math.max(1, status.health + healthDelta);
      }

      student.petStatus = status;

      // 同步到本地存储（DEBUG 模式不保存）
      if (!DEBUG_MODE) {
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();        console.log('宠物状态衰减数据已同步到本地存储');
        // 自动同步到云端
        this._autoSyncToCloud();
      } else {
        console.log('DEBUG 模式：宠物衰减不持久化');
      }

      // 状态较低时返回警告供 UI 展示
      const sick = status.health < 30 || status.hungry < 20 || status.clean < 20;
      return { sick };
    } catch (err) {
      console.warn('宠物状态衰减失败:', err);
      return null;
    }
  },

  // ---- 离线惩罚检测 + 宠物状态时间差同步（登录时触发）----
  // 阶梯积分扣减：24h→-10, 48h→-30, 72h→-60, 96h→-100, 120h→-150, 144h→-200, 336h(14天)→死亡+清零
  // 同时根据时间差自动衰减宠物状态（多端同步用）
  async checkDailyPenalty(studentId) {
    try {
      const student = this.state.students.find(s => s.id === studentId);
      if (!student || student.petDead) return null;

      const now = Date.now();
      // 读取上次登录时间（首次登录设置，之后每次登录更新）
      const lastLoginKey = `lastLogin_${studentId}`;
      const lastLoginStr = localStorage.getItem(lastLoginKey);
      // 记录本次登录时间
      localStorage.setItem(lastLoginKey, String(now));

      if (!lastLoginStr) return null; // 首次登录，不扣分

      const lastLogin = parseInt(lastLoginStr, 10);
      if (isNaN(lastLogin)) return null;

      const hoursMissed = Math.floor((now - lastLogin) / (1000 * 60 * 60));
      
      // ===== 宠物状态时间差衰减（无论是否达到惩罚门槛都执行）=====
      if (hoursMissed > 0) {
        const status = student.petStatus || { health: 100, hungry: 100, happy: 100, clean: 100 };
        // 衰减速率：每小时衰减（模拟自然消耗）
        const decayHungry  = hoursMissed * 1.5;
        const decayHappy   = hoursMissed * 0.8;
        const decayClean   = hoursMissed * 0.8;
        status.hungry = Math.max(0, Math.round((status.hungry || 100) - decayHungry));
        status.happy  = Math.max(0, Math.round((status.happy  || 100) - decayHappy));
        status.clean  = Math.max(0, Math.round((status.clean  || 100) - decayClean));
        // 饥饿或过脏时健康下降
        if ((status.hungry < 30 || status.clean < 30) && hoursMissed > 2) {
          const healthDecay = Math.floor(hoursMissed * 0.5);
          status.health = Math.max(1, Math.round((status.health || 100) - healthDecay));
        }
        student.petStatus = status;
        this._logAudit('宠物状态同步', `「${student.name}」离线 ${hoursMissed}h 后自动同步状态（hungry:${status.hungry}, happy:${status.happy}, clean:${status.clean}, health:${status.health}）`, null);
      }

      if (hoursMissed < 24) {
        // 不足24小时：只更新状态，不扣分，但持久化状态变化
        if (!DEBUG_MODE) {
          await dbStorage.storeStudents(this.state.students);
          this._scheduleCloudPush();
        }
        return { synced: true, hoursMissed, status: student.petStatus };
      }

      const daysMissed = Math.floor(hoursMissed / 24);
      let pointPenalty = 0;

      // 计算惩罚积分
      if (hoursMissed >= 336) {
        // 14天以上，宠物死亡
        student.petDead = true;
        student.petHatchProgress = 0;
        // 记录死亡时间
        student.deathTime = new Date().toISOString();
        const pointLost = student.points || 0;
        student.points = 0;
        
        // 同步到本地存储（DEBUG 模式不保存）
        if (!DEBUG_MODE) {
          await dbStorage.storeStudents(this.state.students);
          this._scheduleCloudPush();          console.log('宠物死亡数据已同步到本地存储');
        } else {
          console.log('DEBUG 模式：宠物死亡不持久化');
        }
        
        return { died: true, hoursMissed, pointLost };
      } else if (hoursMissed >= 144) {
        pointPenalty = 200;
      } else if (hoursMissed >= 120) {
        pointPenalty = 150;
      } else if (hoursMissed >= 96) {
        pointPenalty = 100;
      } else if (hoursMissed >= 72) {
        pointPenalty = 60;
      } else if (hoursMissed >= 48) {
        pointPenalty = 30;
      } else {
        pointPenalty = 10;
      }

      // 扣除积分（不低于0）
      student.points = Math.max(0, (student.points || 0) - pointPenalty);
      const newPoints = student.points;

      // 同步到本地存储（DEBUG 模式不保存）
      if (!DEBUG_MODE) {
        await dbStorage.storeStudents(this.state.students);
        this._scheduleCloudPush();        console.log('离线惩罚数据已同步到本地存储');
      } else {
        console.log('DEBUG 模式：离线惩罚不持久化');
      }

      return {
        died: false,
        hoursMissed,
        daysMissed,
        pointPenalty,
        newPoints
      };
    } catch (err) {
      console.warn('离线惩罚检测失败:', err);
      return null;
    }
  },

  // ---- 喂食（已由 useItem 处理，保留兼容） ----
  async feedPet(studentId) {
    return { ok: true };
  },

  // ---- 验证密码（教师端安全操作）----
  async verifyPassword(password) {
    // 简化实现：固定密码为 '123456'
    // 实际项目中应该调用后端 API 进行验证
    return password === '123456';
  },

  // ---- 清空所有数据（用于初始化测试）----
  async clearAllData() {
    try {
      if (!DEBUG_MODE) {
        await dbStorage.clearAllData();
        this.state.students = [];
        this.state.tasks = [];
        await dbStorage.storeStudents([JSON.parse(JSON.stringify(PLACEHOLDER_STUDENT))]);
        this._scheduleCloudPush();        await dbStorage.storeTasks([]);
        this._scheduleCloudPush();        console.log('所有数据已清空并恢复占位学生');
      } else {
        this.state.students = [];
        this.state.tasks = [];
        console.log('DEBUG 模式：清空数据不持久化');
      }
      this.state.taskRev++;
      this.state.studentRev++;
      return { success: true };
    } catch (err) {
      console.warn('清空数据失败:', err);
      return { success: false, msg: '清空失败' };
    }
  },

  // ---- 管理员登录验证 ----
  async login(username, password) {
    const hash = await this._sha256(password);
    if (username === ADMIN_ACCOUNT.username && hash === ADMIN_ACCOUNT.passwordHash) {
      return { success: true, role: 'admin', user: { ...ADMIN_ACCOUNT } };
    }
    return { success: false, msg: '账号或密码错误' };
  },

  // ---- 更新管理员账号 ----
  async updateAdminAccount(username, password) {
    try {
      ADMIN_ACCOUNT.username = username;
      ADMIN_ACCOUNT.passwordHash = await this._sha256(password);
      console.log('管理员账号已更新');
      this._logAudit('修改管理员账号', `管理员账号用户名已更新为「${username}」`, null);
      return { success: true };
    } catch (err) {
      console.warn('更新管理员账号失败:', err);
      return { success: false, msg: '更新失败' };
    }
  },
  // ---- 云端同步：仅推送头像 ----
  async cloudPushAvatars() {
    const result = await CloudSync.pushAvatarsOnly();
    if (result.success) {
      this.toast('🖼️ ' + result.msg, 'success');
    } else {
      this.toast('🖼️ 上传失败: ' + result.msg, 'error');
    }
    return result;
  },

  // ---- 云端同步：仅恢复头像 ----
  async cloudPullAvatars() {
    const result = await CloudSync.pullAvatarsOnly();
    if (result.success) {
      this.toast('🖼️ ' + result.msg, 'success');
    } else {
      this.toast('🖼️ 恢复失败: ' + result.msg, 'error');
    }
    return result;
  },

  // ---- 云端同步：推送到云端 ----
  async cloudPush() {
    const result = await CloudSync.pushToCloud();
    if (result.success) {
      this.toast('☁️ ' + result.msg, 'success');
    } else {
      this.toast('☁️ 上传失败: ' + result.msg, 'error');
    }
    return result;
  },

  // ---- 云端同步：从云端拉取 ----
  async cloudPull() {
    const result = await CloudSync.pullFromCloud();
    if (result.success) {
      this.toast('☁️ ' + result.msg, 'success');
    } else {
      this.toast('☁️ 拉取失败: ' + result.msg, 'error');
    }
    return result;
  },

  // ---- 云端同步：检测连接 ----
  async cloudPing() {
    return await CloudSync.ping();
  },

  // ---- 云端同步：获取上次同步时间 ----
  async cloudLastSync() {
    return await CloudSync.getLastSyncTime();
  },

  // ---- 云端同步：获取云端统计 ----
  async cloudStats() {
    return await CloudSync.getCloudStats();
  },

  // ---- 版本与更新检测 ----
  async checkForUpdate() {
    try {
      const resp = await fetch('https://gitee.com/am-zzq/classroom-pet-system/raw/master/version.json', {
        cache: 'no-cache',
        signal: (function() {
          try { return AbortSignal.timeout(5000); } catch(e) {
            var c = new AbortController(); setTimeout(function() { c.abort(); }, 5000); return c.signal;
          }
        })()
      });
      if (!resp.ok) return null;
      const remote = await resp.json();
      const local = await this.getLocalVersion();
      if (!local || !remote.version) return null;
      const isNew = this._compareVersions(remote.version, local.version) > 0;
      return { hasUpdate: isNew, local: local.version, remote: remote.version, notes: remote.releaseNotes || '' };
    } catch (e) {
      return null;
    }
  },

  async getLocalVersion() {
    try {
      const resp = await fetch('version.json', { cache: 'no-cache' });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    }
  },

  _compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0, nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  },
};

// ===== 初始化（异步，会被 app.js 中的 mounted 等待） =====
Store.init();
