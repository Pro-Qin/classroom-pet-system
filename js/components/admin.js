// ===== 管理员端 完整组件 =====

// ---------- 管理员总览 ----------
const AdminDashboard = {
  name: 'AdminDashboard',
  data() {
    return {
      teacherList: [],
      inviteCodeList: [],
    };
  },
  async mounted() {
    this.teacherList     = await Store.getTeachers();
    this.inviteCodeList  = await Store.getInviteCodes();
  },
  computed: {
    stats() {
      const students  = Store.state.students;
      const totalPts  = students.reduce((s, u) => s + (u.points || 0), 0);
      return {
        teacherCount:  this.teacherList.length,
        studentCount:  students.length,
        codeCount:     this.inviteCodeList.length,
        unusedCodes:   this.inviteCodeList.filter(c => !c.used).length,
        totalPoints:   totalPts,
        avgPoints:     students.length ? Math.round(totalPts / students.length) : 0,
      };
    },
    topStudents() {
      return [...Store.state.students]
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .slice(0, 5)
        .map(s => ({ ...s, petEmoji: getStudentPetEmoji(s) }));
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header">
        <div class="teacher-page-title">🛡️ 系统总览</div>
        <div style="font-size:13px;color:var(--text-light);">管理员控制台</div>
      </div>

      <!-- 统计卡片 -->
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-icon-box" style="background:#EDE7F6;">👩‍🏫</div>
          <div>
            <div class="stat-label">教师总数</div>
            <div class="stat-value">{{ stats.teacherCount }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-box" style="background:#FFF0F8;">👨‍🎓</div>
          <div>
            <div class="stat-label">学生总数</div>
            <div class="stat-value">{{ stats.studentCount }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-box" style="background:#F0FFF4;">🔑</div>
          <div>
            <div class="stat-label">邀请码（剩余）</div>
            <div class="stat-value">{{ stats.unusedCodes }}/{{ stats.codeCount }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-box" style="background:#FFFDE7;">⭐</div>
          <div>
            <div class="stat-label">全站积分均值</div>
            <div class="stat-value">{{ stats.avgPoints }}</div>
          </div>
        </div>
      </div>

      <!-- 积分 Top5 -->
      <div class="card" style="padding:20px;margin-top:8px;">
        <div style="font-weight:800;font-size:16px;margin-bottom:14px;">🏆 积分 Top 5</div>
        <div v-if="topStudents.length === 0" style="color:var(--text-light);font-size:14px;text-align:center;padding:20px;">
          暂无学生数据
        </div>
        <div v-for="(s, i) in topStudents" :key="s.id"
             style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;"
               :style="i===0?'background:#FFD700;color:white':i===1?'background:#C0C0C0;color:white':i===2?'background:#CD7F32;color:white':'background:#F5F5F5;color:#888'">
            {{ i < 3 ? ['👑','🥈','🥉'][i] : i+1 }}
          </div>
          <span style="font-size:22px;">{{ s.petEmoji }}</span>
          <div style="flex:1;font-weight:700;">{{ s.name }}</div>
          <div style="font-size:12px;color:var(--text-light);">{{ s.class }}</div>
          <div style="font-weight:800;color:var(--warning);">⭐{{ s.points||0 }}</div>
        </div>
      </div>
    </div>
  `
};

// ---------- 教师管理 ----------
const AdminTeachers = {
  name: 'AdminTeachers',
  data() {
    return {
      _rev: 0,
      searchText: '',
      resetModal: false,
      resetTarget: null,
      currentPassword: '',
      newPassword: '',
      showCurrentPwd: false,
      confirmDeleteId: null,
      showDeleteModal: false,
      allTeachers: [],
    };
  },
  async mounted() {
    this.allTeachers = await Store.getTeachers();
  },
  computed: {
    teachers() {
      void this._rev;
      const q = this.searchText.toLowerCase();
      return this.allTeachers.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q) ||
        (t.class || '').includes(q)
      );
    },
  },
  methods: {
    async openReset(teacher) {
      this.resetTarget = teacher;
      this.newPassword = '';
      this.showCurrentPwd = false;
      // 从 TEACHER_ACCOUNTS 读取当前密码
      const found = TEACHER_ACCOUNTS.find(t => t.id === teacher.id);
      this.currentPassword = found ? found.password : '未知';
      this.resetModal = true;
    },
    async doReset() {
      if (this.newPassword && this.newPassword.length < 6) {
        Store.toast('密码至少6位', 'warning'); return;
      }
      if (this.newPassword) {
        await Store.resetTeacherPassword(this.resetTarget.id, this.newPassword);
        Store.toast(`✅ ${this.resetTarget.name} 密码已更新`, 'success');
      } else {
        Store.toast('未修改密码', 'info');
      }
      this.resetModal = false;
      this._rev++;
    },
    openDelete(id) {
      this.confirmDeleteId = id;
      this.showDeleteModal = true;
    },
    async doDelete() {
      const result = await Store.deleteTeacher(this.confirmDeleteId);
      if (result.success) {
        Store.toast('教师已删除', 'success');
        this.allTeachers = this.allTeachers.filter(t => t.id !== this.confirmDeleteId);
      } else {
        Store.toast(result.msg, 'error');
      }
      this.showDeleteModal = false;
      this._rev++;
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header">
        <div class="teacher-page-title">👩‍🏫 教师管理</div>
      </div>

      <!-- 搜索 -->
      <div style="position:relative;margin-bottom:16px;">
        <input class="input-field" v-model="searchText" placeholder="🔍 搜索教师姓名/账号/班级..." style="padding-left:40px;" />
        <span style="position:absolute;left:14px;top:12px;font-size:16px;">🔍</span>
      </div>

      <!-- 教师卡片列表 -->
      <div v-if="teachers.length === 0" style="text-align:center;color:var(--text-light);padding:40px 20px;">
        暂无教师数据
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div v-for="t in teachers" :key="t.id" class="card" style="padding:14px 16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:36px;flex-shrink:0;">{{ t.avatar || '👩‍🏫' }}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:800;">{{ t.name }}</div>
              <div style="font-size:12px;color:var(--text-light);margin-top:2px;">
                <span class="badge badge-purple" style="font-size:11px;">{{ t.username }}</span>
                <span style="margin-left:8px;">🏫 {{ t.class || '未设置班级' }}</span>
              </div>
              <div style="font-size:11px;color:var(--text-light);margin-top:4px;">加入：{{ t.joinDate || '-' }}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn btn-ghost btn-sm" @click="openReset(t)">🔑 重置</button>
              <button class="btn btn-danger btn-sm" @click="openDelete(t.id)">🗑️</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 重置密码弹窗 -->
      <div v-if="resetModal && resetTarget" class="modal-overlay" @click.self="resetModal=false">
        <div class="modal-box">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:6px;">🔑 教师密码管理</h3>
          <p style="color:var(--text-light);font-size:13px;margin-bottom:14px;">
            教师：<strong>{{ resetTarget.name }}</strong>
          </p>

          <!-- 当前密码 -->
          <div class="input-group">
            <label>当前密码</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <input class="input-field" :type="showCurrentPwd ? 'text' : 'password'"
                     :value="currentPassword" readonly
                     style="background:#F5F5F5;cursor:default;flex:1;" />
              <button class="btn btn-ghost btn-sm" @click="showCurrentPwd=!showCurrentPwd" style="flex-shrink:0;">
                {{ showCurrentPwd ? '🙈' : '👁️' }}
              </button>
            </div>
          </div>

          <!-- 新密码 -->
          <div class="input-group">
            <label>设置新密码</label>
            <input class="input-field" v-model="newPassword" type="password" placeholder="留空则保持当前密码" />
            <div style="font-size:11px;color:var(--text-light);margin-top:2px;">至少6位，留空则不修改</div>
          </div>

          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="resetModal=false">取消</button>
            <button class="btn btn-primary" style="flex:2" @click="doReset">✅ 保存</button>
          </div>
        </div>
      </div>

      <!-- 删除确认 -->
      <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal=false">
        <div class="modal-box" style="text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
          <h3 style="font-size:18px;font-weight:800;margin-bottom:8px;">确认删除教师？</h3>
          <p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">删除后该教师将无法登录，操作不可撤销。</p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showDeleteModal=false">取消</button>
            <button class="btn btn-danger" style="flex:1" @click="doDelete">确认删除</button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 邀请码管理 ----------
const AdminInviteCodes = {
  name: 'AdminInviteCodes',
  data() {
    return {
      _rev: 0,
      newCode: '',
      newNote: '',
      showAddModal: false,
    };
  },
  async mounted() {
    await Store.getInviteCodes();
  },
  computed: {
    codes() {
      void this._rev;
      return Store.state.inviteCodes;
    },
  },
  methods: {
    async doAdd() {
      if (!this.newCode.trim()) {
        Store.toast('邀请码不能为空', 'warning'); return;
      }
      const result = await Store.addInviteCode(this.newCode, this.newNote);
      if (result.success) {
        Store.toast(`✅ 邀请码 ${this.newCode.toUpperCase()} 添加成功`, 'success');
        this.newCode = '';
        this.newNote = '';
        this.showAddModal = false;
        this._rev++;
      } else {
        Store.toast(result.msg, 'error');
      }
    },
    async doRemove(code) {
      await Store.removeInviteCode(code);
      Store.toast(`邀请码 ${code} 已删除`, 'success');
      this._rev++;
    },
    copyCode(code) {
      navigator.clipboard?.writeText(code).then(() => {
        Store.toast(`已复制：${code}`, 'success');
      }).catch(() => {
        Store.toast(`邀请码：${code}`, 'info');
      });
    },
    generateCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      this.newCode = seg() + '-' + seg();
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header">
        <div class="teacher-page-title">🔑 邀请码管理</div>
        <button class="btn btn-primary btn-sm" @click="showAddModal=true">➕ 新增邀请码</button>
      </div>

      <div v-if="codes.length === 0" style="text-align:center;color:var(--text-light);padding:40px 20px;">
        暂无邀请码
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div v-for="c in codes" :key="c.code" class="card" style="padding:14px 16px;">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <!-- 邀请码 -->
            <div style="flex:1;min-width:0;">
              <div style="font-family:monospace;font-size:18px;font-weight:800;letter-spacing:2px;color:#5B30CC;word-break:break-all;">
                {{ c.code }}
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
                <span :class="c.used ? 'badge badge-danger' : 'badge badge-success'" style="font-size:11px;">
                  {{ c.used ? '已使用' : '未使用' }}
                </span>
                <span v-if="c.note" style="font-size:12px;color:var(--text-mid);">{{ c.note }}</span>
                <span style="font-size:11px;color:var(--text-light);">{{ c.createdAt }}</span>
              </div>
            </div>
            <!-- 操作 -->
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn btn-ghost btn-sm" @click="copyCode(c.code)">📋 复制</button>
              <button class="btn btn-danger btn-sm" @click="doRemove(c.code)">🗑️</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 新增弹窗 -->
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal=false">
        <div class="modal-box">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:16px;">➕ 新增邀请码</h3>
          <div class="input-group">
            <label>邀请码（自动转大写）</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input class="input-field" v-model="newCode" placeholder="例如：TEACHER2026B"
                     style="font-family:monospace;letter-spacing:1px;flex:1;" />
              <button class="btn btn-ghost btn-sm" style="flex-shrink:0;white-space:nowrap;border-color:#7C4DFF;color:#7C4DFF;"
                      @click="generateCode" title="随机生成邀请码">
                🎲 随机生成
              </button>
            </div>
          </div>
          <div class="input-group">
            <label>备注（可选）</label>
            <input class="input-field" v-model="newNote" placeholder="例如：三年二班专属" />
          </div>
          <div style="display:flex;gap:10px;margin-top:4px;">
            <button class="btn btn-ghost" style="flex:1" @click="showAddModal=false">取消</button>
            <button class="btn btn-primary" style="flex:2" @click="doAdd">✅ 添加</button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 学生总览（管理员只读视图） ----------
const AdminStudents = {
  name: 'AdminStudents',
  data() {
    return {
      searchText: '',
      resetModal: false,
      resetTarget: null,
      newPassword: '',
    };
  },
  computed: {
    students() {
      const q = this.searchText.toLowerCase();
      return Store.state.students
        .filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q) ||
          (s.class || '').includes(q)
        )
        .map(s => ({ ...s, petEmoji: getStudentPetEmoji(s), levelInfo: getLevelInfo(s.petExp || 0) }));
    },
  },
  methods: {
    openReset(student) {
      this.resetTarget = student;
      this.newPassword = '';
      this.resetModal = true;
    },
    async doReset() {
      if (!this.newPassword || this.newPassword.length < 6) {
        Store.toast('密码至少6位', 'warning'); return;
      }
      await Store.resetStudentPassword(this.resetTarget.id, this.newPassword);
      Store.toast(`✅ 已重置 ${this.resetTarget.name} 的密码`, 'success');
      this.resetModal = false;
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header">
        <div class="teacher-page-title">👨‍🎓 学生总览</div>
        <div style="font-size:13px;color:var(--text-light);">共 {{ students.length }} 名学生</div>
      </div>

      <div style="position:relative;margin-bottom:16px;">
        <input class="input-field" v-model="searchText" placeholder="🔍 搜索学生姓名/账号/班级..." style="padding-left:40px;" />
        <span style="position:absolute;left:14px;top:12px;font-size:16px;">🔍</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div v-for="s in students" :key="s.id" class="card" style="padding:14px 16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:36px;flex-shrink:0;">{{ s.petEmoji }}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:800;">{{ s.name }}</div>
              <div style="font-size:12px;color:var(--text-light);margin-top:2px;">
                <span class="badge badge-purple" style="font-size:11px;">{{ s.username }}</span>
                <span style="margin-left:6px;">{{ s.class }}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">
                <span style="color:var(--warning);font-weight:800;font-size:14px;">⭐{{ s.points||0 }}</span>
                <span v-if="s.petType" class="badge badge-success" style="font-size:11px;">Lv.{{ s.levelInfo.level }} {{ s.levelInfo.name }}</span>
                <span v-else class="badge badge-warning" style="font-size:11px;">未领宠物</span>
                <span style="font-size:12px;color:var(--text-mid);">🐾 {{ s.petName || '未领取' }}</span>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" style="flex-shrink:0;" @click="openReset(s)">🔑 重置</button>
          </div>
        </div>
      </div>

      <!-- 重置密码弹窗 -->
      <div v-if="resetModal && resetTarget" class="modal-overlay" @click.self="resetModal=false">
        <div class="modal-box">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:6px;">🔑 重置学生密码</h3>
          <p style="color:var(--text-light);font-size:13px;margin-bottom:16px;">为 <strong>{{ resetTarget.name }}</strong> 设置新密码</p>
          <div class="input-group">
            <label>新密码（至少6位）</label>
            <input class="input-field" v-model="newPassword" type="password" placeholder="请输入新密码" />
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="resetModal=false">取消</button>
            <button class="btn btn-primary" style="flex:2" @click="doReset">✅ 确认重置</button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 系统设置（管理员） ----------
const AdminSettings = {
  name: 'AdminSettings',
  data() {
    return {
      confirmNuke: false,
      // 修改账号弹窗
      showEditAdmin: false,
      editUsername: '',
      editOldPassword: '',
      editNewPassword: '',
      editConfirmPassword: '',
      showEditPwd: false,
      editError: '',
      // 班级名称
      className: localStorage.getItem('className') || '高一一班',
      // 导入结果
      importResult: null,
    };
  },
  computed: {
    adminUsername() {
      return Store.state.currentUser?.username || 'admin';
    },
  },
  methods: {
    async doNuke() {
      await Store.nukeAll();
      Store.toast('✅ 全部数据已重置为初始状态', 'success');
      this.confirmNuke = false;
    },
    async importPets() {
      if (typeof PetImport === 'undefined') {
        this.importResult = { success: false, message: '❌ PetImport 模块未加载，请刷新页面重试' };
        return;
      }
      try {
        const result = PetImport.run({ overwrite: true, lockPairings: true });
        // PetImport.run() 已经调用了 dbStorage.storeStudents() 持久化
        // 直接更新 Store 的 studentRev 触发 UI 刷新，不要重新 load（会覆盖内存修改）
        Store.state.studentRev++;
        this.importResult = { 
          success: true, 
          message: `✅ 导入完成！共 ${result.total} 人，成功 ${result.imported} 人，跳过 ${result.skipped} 人` 
        };
        Store.toast('✅ 宠物导入完成', 'success');
      } catch (e) {
        this.importResult = { success: false, message: `❌ 导入失败: ${e.message}` };
      }
    },
    previewImport() {
      if (typeof PetImport === 'undefined') {
        this.importResult = { success: false, message: '❌ PetImport 模块未加载' };
        return;
      }
      const stats = PetImport.getStats();
      const list = PetImport.listStudents();
      const msg = `📊 导入预览：
总计 ${stats.total} 人
有图片: ${stats.withImages} 人
通用图: ${stats.genericAssigned} 人
多状态: ${stats.multiState} 人

前5个学生：
${list.slice(0, 5).map(s => `${s.name}: ${s.pet} ${s.hasImage ? '🖼️' : '📝'}`).join('\n')}`;
      this.importResult = { success: true, message: msg };
    },
    openEditAdmin() {
      this.editUsername     = this.adminUsername;
      this.editOldPassword  = '';
      this.editNewPassword  = '';
      this.editConfirmPassword = '';
      this.editError        = '';
      this.showEditPwd      = false;
      this.showEditAdmin    = true;
    },
    async doEditAdmin() {
      this.editError = '';
      if (!this.editUsername.trim()) {
        this.editError = '账号不能为空'; return;
      }
      if (!this.editOldPassword) {
        this.editError = '请输入当前密码验证身份'; return;
      }
      if (this.editNewPassword) {
        if (this.editNewPassword.length < 6) {
          this.editError = '新密码至少6位'; return;
        }
        if (this.editNewPassword !== this.editConfirmPassword) {
          this.editError = '两次新密码不一致'; return;
        }
      }
      // 先用旧密码验证登录
      const verify = await Store.login(this.adminUsername, this.editOldPassword);
      if (!verify.success || verify.role !== 'admin') {
        this.editError = '旧密码不正确'; return;
      }
      const newData = {
        username: this.editUsername.trim(),
        password: this.editNewPassword || this.editOldPassword,
      };
      const res = await Store.updateAdminAccount(newData.username, newData.password);
      if (res.success) {
        // 更新当前用户状态
        if (Store.state.currentUser) Store.state.currentUser.username = newData.username;
        Store.toast('✅ 管理员账号信息已更新', 'success');
        this.showEditAdmin = false;
      } else {
        this.editError = res.msg || '更新失败';
      }
    },
    saveClassName() {
      const name = (this.className || '').trim();
      if (!name) { Store.toast('请输入班级名称', 'warning'); return; }
      localStorage.setItem('className', name);
      Store.toast(`✅ 班级名称已保存为「${name}」`, 'success');
    },
  },
  mounted() {},
  template: `
    <div class="animate-pageIn">
      <div class="teacher-page-title" style="margin-bottom:20px;">⚙️ 系统设置</div>

      <div class="settings-grid">
        <!-- 班级名称设置 -->
        <div class="card" style="padding:20px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">🏫 班级名称</h3>
          <p style="font-size:13px;color:var(--text-light);margin-bottom:14px;">设置班级名称，将显示在学生端各处（如：高一一班）</p>
          <div class="input-group">
            <label>班级名称</label>
            <input class="input-field" v-model="className" placeholder="例如：高一一班" maxlength="20" />
          </div>
          <button class="btn btn-primary" style="margin-top:12px;" @click="saveClassName">💾 保存班级名称</button>
        </div>

        <!-- 账号信息 -->
        <div class="card" style="padding:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <h3 style="font-size:16px;font-weight:800;margin:0;">🛡️ 管理员账号</h3>
            <button class="btn btn-ghost btn-sm" style="color:#7C4DFF;border-color:#7C4DFF;" @click="openEditAdmin">
              ✏️ 修改
            </button>
          </div>
          <div style="font-size:13px;color:var(--text-mid);line-height:2.4;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="color:var(--text-light);width:36px;">账号</span>
              <span style="font-family:monospace;font-weight:800;font-size:14px;color:#5B30CC;">{{ adminUsername }}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="color:var(--text-light);width:36px;">密码</span>
              <span style="font-family:monospace;font-weight:700;letter-spacing:2px;">••••••••</span>
            </div>
            <div style="color:var(--text-light);font-size:12px;margin-top:4px;">⚠️ 请妥善保管，勿对外泄露</div>
          </div>
        </div>

        <!-- 权限说明 -->
        <div class="card" style="padding:20px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">🔐 管理员权限</h3>
          <div style="font-size:13px;color:var(--text-mid);line-height:2;">
            <div>✅ 查看/删除教师账号</div>
            <div>✅ 重置任意账号密码</div>
            <div>✅ 管理教师邀请码</div>
            <div>✅ 查看全站学生数据</div>
            <div>✅ 初始化/清空全部数据</div>
          </div>
        </div>

        <!-- 关于系统 -->
        <div class="card" style="padding:20px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">ℹ️ 关于系统</h3>
          <div style="font-size:13px;color:var(--text-mid);line-height:2;">
            <div>系统名称：课堂电子宠物</div>
            <div>版本：v1.0.0</div>
            <div>适用：中小学课堂游戏化</div>
            <div>存储：IndexedDB + Supabase 云端</div>
          </div>
        </div>

        <!-- 宠物导入 -->
        <div class="card" style="padding:20px;border:2px solid #E8F5E9;background:#FAFAFA;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:8px;color:#2E7D32;">🐾 宠物导入</h3>
          <p style="font-size:13px;color:var(--text-light);margin-bottom:14px;">从 Excel 导入学生宠物数据，包括宠物类型、图片和 emoji。</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" style="background:linear-gradient(135deg,#2E7D32,#4CAF50);" @click="importPets">
              📥 执行导入
            </button>
            <button class="btn btn-ghost" style="color:#2E7D32;border-color:#2E7D32;" @click="previewImport">
              👁️ 预览导入
            </button>
          </div>
          <div v-if="importResult" style="margin-top:12px;padding:10px;border-radius:8px;font-size:13px;"
               :style="importResult.success ? 'background:#E8F5E9;color:#2E7D32;' : 'background:#FFEBEE;color:#C62828;'">
            {{ importResult.message }}
          </div>
        </div>

        <!-- 危险操作 -->
        <div class="card" style="padding:20px;border:2px solid #FFCDD2;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:8px;color:#C62828;">⚠️ 危险操作</h3>
          <p style="font-size:13px;color:var(--text-light);margin-bottom:14px;">清空全部数据，恢复到系统初始状态，包括所有教师、学生、任务和邀请码。</p>
          <button class="btn btn-danger" @click="confirmNuke=true">🔥 清空全部数据</button>
        </div>
      </div>

      <!-- 修改管理员账号弹窗 -->
      <div v-if="showEditAdmin" class="modal-overlay" @click.self="showEditAdmin=false">
        <div class="modal-box" style="max-width:420px;">
          <div style="background:linear-gradient(135deg,#3F1D8A,#7C4DFF);border-radius:16px 16px 0 0;margin:-20px -20px 20px;padding:20px;color:white;">
            <div style="font-size:32px;margin-bottom:4px;">🛡️</div>
            <div style="font-size:18px;font-weight:800;">修改管理员账号</div>
            <div style="font-size:13px;opacity:0.85;margin-top:2px;">需要验证当前密码</div>
          </div>

          <div class="input-group">
            <label>新账号</label>
            <input class="input-field" v-model="editUsername" placeholder="请输入新账号" />
            <span class="input-icon">👤</span>
          </div>
          <div class="input-group">
            <label>当前密码 <span style="color:#F44336;font-size:11px;">* 必填验证</span></label>
            <input class="input-field" v-model="editOldPassword"
                   :type="showEditPwd ? 'text' : 'password'" placeholder="请输入当前密码" />
            <span class="input-icon" style="cursor:pointer;" @click="showEditPwd=!showEditPwd">
              {{ showEditPwd ? '🙈' : '👁️' }}
            </span>
          </div>
          <div style="background:#F8F0FF;border-radius:10px;padding:12px;margin-bottom:14px;">
            <div style="font-size:12px;color:#7C4DFF;font-weight:700;margin-bottom:8px;">🔒 修改密码（不填则保持不变）</div>
            <div class="input-group" style="margin-bottom:10px;">
              <label style="font-size:12px;">新密码（至少6位）</label>
              <input class="input-field" v-model="editNewPassword" type="password" placeholder="留空则不修改密码" />
            </div>
            <div class="input-group" style="margin-bottom:0;">
              <label style="font-size:12px;">确认新密码</label>
              <input class="input-field" v-model="editConfirmPassword" type="password" placeholder="再次输入新密码" />
            </div>
          </div>

          <div v-if="editError" class="login-error" style="margin-bottom:12px;">⚠️ {{ editError }}</div>

          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showEditAdmin=false">取消</button>
            <button class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#5B30CC,#7C4DFF);" @click="doEditAdmin">
              ✅ 保存修改
            </button>
          </div>
        </div>
      </div>

      <!-- 清空确认弹窗 -->
      <div v-if="confirmNuke" class="modal-overlay" @click.self="confirmNuke=false">
        <div class="modal-box" style="text-align:center;">
          <div style="font-size:56px;margin-bottom:12px;">🔥</div>
          <h3 style="font-size:20px;font-weight:800;margin-bottom:8px;color:#C62828;">危险！确认清空全部数据？</h3>
          <p style="color:var(--text-light);font-size:14px;margin-bottom:24px;line-height:1.7;">
            此操作将清除所有教师账号（保留预设）、学生数据、任务记录和邀请码，恢复到系统初始演示状态。<br>
            <strong style="color:#C62828;">操作不可撤销！</strong>
          </p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="confirmNuke=false">取消</button>
            <button class="btn btn-danger" style="flex:2" @click="doNuke">🔥 确认清空</button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- ☁️ 云端同步管理 ----------//

// ---------- 🐛 调试工具 ----------
const AdminDebug = {
  name: 'AdminDebug',
  data() {
    return {
      debugMode: new URLSearchParams(window.location.search).get('debug') === '1',
      storeSnapshot: null,
      dbStatus: null,
      integrityCheck: null,
      checking: false,
      syncTestResult: null,
      syncTesting: false,
      expandedStudent: null,
    };
  },
  computed: {
    students() { void Store.state.studentRev; return Store.state.students; },
    tasks() { void Store.state.taskRev; return Store.state.tasks; },
    quickPoints() { try { return JSON.parse(localStorage.getItem('customQuickPoints') || '[]'); } catch(e) { return []; } },
    sortKey() { return localStorage.getItem('studentSortKey') || 'name_asc'; },
    auditLogCount() { return Store.state.auditLog ? Store.state.auditLog.length : 0; },
  },
  mounted() {
    this.takeSnapshot();
  },
  methods: {
    takeSnapshot() {
      this.storeSnapshot = {
        students: this.students.length,
        tasks: this.tasks.length,
        studentRev: Store.state.studentRev,
        taskRev: Store.state.taskRev,
        currentUser: Store.state.currentUser?.username || '(未登录)',
        auditLog: this.auditLogCount,
      };
    },
    async checkDB() {
      this.checking = true;
      this.dbStatus = null;
      try {
        const dbStudents = await dbStorage.getStudents();
        const dbTasks = await dbStorage.getTasks();
        this.dbStatus = {
          indexedDBStudents: dbStudents.length,
          indexedDBTasks: dbTasks.length,
          memoryStudents: this.students.length,
          memoryTasks: this.tasks.length,
          studentsMatch: dbStudents.length === this.students.length,
          tasksMatch: dbTasks.length === this.tasks.length,
          dbVersion: dbStorage.dbVersion,
        };
      } catch (e) {
        this.dbStatus = { error: e.message || 'IndexedDB 读取失败' };
      }
      this.checking = false;
    },
    async checkIntegrity() {
      this.checking = true;
      this.integrityCheck = null;
      const issues = [];
      // 1. 检查学生数据完整性
      for (const s of this.students) {
        if (!s.id) issues.push(`学生缺少 id: ${s.name || '(无名)'}`);
        if (!s.name) issues.push(`学生 id=${s.id} 缺少姓名`);
        if (s.petExp !== undefined && s.petExp < 0) issues.push(`${s.name}: petExp 为负数 (${s.petExp})`);
        if (s.petStage !== undefined && s.petStage < 0) issues.push(`${s.name}: petStage 为负数 (${s.petStage})`);
        if (s.points !== undefined && s.points < 0) issues.push(`${s.name}: points 为负数 (${s.points})`);
        if (s.petStatus) {
          const st = s.petStatus;
          if (st.health !== undefined && (st.health < 0 || st.health > 100)) issues.push(`${s.name}: health 越界 (${st.health})`);
          if (st.hungry !== undefined && (st.hungry < 0 || st.hungry > 100)) issues.push(`${s.name}: hungry 越界 (${st.hungry})`);
          if (st.happy !== undefined && (st.happy < 0 || st.happy > 100)) issues.push(`${s.name}: happy 越界 (${st.happy})`);
          if (st.clean !== undefined && (st.clean < 0 || st.clean > 100)) issues.push(`${s.name}: clean 越界 (${st.clean})`);
        }
        // 检查等级与经验是否一致
        if (s.petExp !== undefined) {
          const levelInfo = getLevelInfo(s.petExp);
          if ((s.petStage || 0) !== levelInfo.level) {
            issues.push(`${s.name}: petStage(${s.petStage || 0}) 与 petExp(${s.petExp}) 对应等级(${levelInfo.level}) 不一致`);
          }
        }
      }
      // 2. 检查重复 ID
      const ids = this.students.map(s => s.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length) issues.push(`存在重复学生 ID: ${[...new Set(dupes)].join(', ')}`);
      // 3. 检查快捷积分
      const qp = this.quickPoints;
      if (!Array.isArray(qp)) issues.push('快捷积分数据格式错误');
      // 4. 检查排序设置
      const validSorts = ['name_asc','name_desc','points_asc','points_desc','level_asc','level_desc'];
      if (!validSorts.includes(this.sortKey)) issues.push(`无效排序键: ${this.sortKey}`);
      this.integrityCheck = issues.length === 0
        ? { ok: true, msg: '✅ 数据完整性检查通过，未发现问题' }
        : { ok: false, msg: `⚠️ 发现 ${issues.length} 个问题`, issues };
      this.checking = false;
    },
    async testSync() {
      this.syncTesting = true;
      this.syncTestResult = null;
      try {
        const ping = await CloudSync.ping();
        if (!ping.ok) {
          this.syncTestResult = { ok: false, msg: `连接失败: ${ping.msg}` };
          this.syncTesting = false;
          return;
        }
        const stats = await CloudSync.getCloudStats();
        const lastSync = await CloudSync.getLastSyncTime();
        this.syncTestResult = {
          ok: true,
          msg: `✅ 连接正常 | 云端: ${stats?.students || '?'} 学生, ${stats?.tasks || '?'} 任务 | 上次同步: ${lastSync || '无'}`,
        };
      } catch (e) {
        this.syncTestResult = { ok: false, msg: `同步测试失败: ${e.message}` };
      }
      this.syncTesting = false;
    },
    async forceSync() {
      try {
        const result = await CloudSync.pushToCloud();
        Store.toast(result.success ? `✅ ${result.msg}` : `❌ ${result.msg}`, result.success ? 'success' : 'error');
      } catch (e) {
        Store.toast(`❌ 同步失败: ${e.message}`, 'error');
      }
    },
    async forcePull() {
      try {
        const result = await CloudSync.pullFromCloud(true);
        Store.toast(result.success ? `✅ ${result.msg}` : `❌ ${result.msg}`, result.success ? 'success' : 'error');
      } catch (e) {
        Store.toast(`❌ 拉取失败: ${e.message}`, 'error');
      }
    },
    clearLocalCache() {
      const keys = Object.keys(localStorage).filter(k => k !== 'className');
      keys.forEach(k => localStorage.removeItem(k));
      Store.toast(`✅ 已清除 ${keys.length} 项本地缓存`, 'success');
    },
    toggleDebugMode() {
      const url = new URL(window.location.href);
      if (this.debugMode) {
        url.searchParams.set('debug', '1');
      } else {
        url.searchParams.delete('debug');
      }
      window.location.href = url.toString();
    },
    exportStoreJSON() {
      try {
        const data = {
          students: Store.state.students,
          tasks: Store.state.tasks,
          auditLog: Store.state.auditLog,
          exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `debug-store-${Date.now()}.json`;
        a.click();
        Store.toast('✅ Store 数据已导出', 'success');
      } catch (e) {
        Store.toast(`❌ 导出失败: ${e.message}`, 'error');
      }
    },
    toggleStudentDetail(id) {
      this.expandedStudent = this.expandedStudent === id ? null : id;
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-page-title" style="margin-bottom:20px;">🐛 调试工具</div>

      <!-- DEBUG 模式开关 -->
      <div class="card" style="padding:20px;margin-bottom:16px;border:2px solid #FF9800;background:#FFF8E1;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <h3 style="font-size:16px;font-weight:800;margin:0;">🔧 DEBUG 模式</h3>
            <p style="font-size:12px;color:var(--text-light);margin:4px 0 0;">开启后数据操作不持久化（仅内存），用于安全测试</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer;">
              <input type="checkbox" v-model="debugMode" @change="toggleDebugMode" style="opacity:0;width:0;height:0;" />
              <span style="position:absolute;inset:0;background:var(--border);border-radius:26px;transition:0.3s;"
                    :style="debugMode ? 'background:#FF9800;' : ''"></span>
              <span style="position:absolute;left:3px;top:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;"
                    :style="debugMode ? 'transform:translateX(22px);' : ''"></span>
            </label>
            <span style="font-size:13px;font-weight:700;" :style="debugMode ? 'color:#FF9800;' : 'color:var(--text-light);'">
              {{ debugMode ? '已开启' : '已关闭' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Store 状态快照 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="font-size:16px;font-weight:800;margin:0;">📦 Store 状态快照</h3>
          <button class="btn btn-ghost btn-sm" @click="takeSnapshot">🔄 刷新</button>
        </div>
        <div v-if="storeSnapshot" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="padding:10px;background:#F3EEFF;border-radius:8px;">
            <div style="font-size:11px;color:var(--text-light);">学生数</div>
            <div style="font-size:20px;font-weight:800;color:#7C4DFF;">{{ storeSnapshot.students }}</div>
          </div>
          <div style="padding:10px;background:#FFF0F8;border-radius:8px;">
            <div style="font-size:11px;color:var(--text-light);">任务数</div>
            <div style="font-size:20px;font-weight:800;color:#FF6B9D;">{{ storeSnapshot.tasks }}</div>
          </div>
          <div style="padding:10px;background:#E8F5E9;border-radius:8px;">
            <div style="font-size:11px;color:var(--text-light);">studentRev</div>
            <div style="font-size:20px;font-weight:800;color:#4CAF50;">{{ storeSnapshot.studentRev }}</div>
          </div>
          <div style="padding:10px;background:#E3F2FD;border-radius:8px;">
            <div style="font-size:11px;color:var(--text-light);">taskRev</div>
            <div style="font-size:20px;font-weight:800;color:#2196F3;">{{ storeSnapshot.taskRev }}</div>
          </div>
          <div style="padding:10px;background:#FFF3E0;border-radius:8px;grid-column:1/-1;">
            <div style="font-size:11px;color:var(--text-light);">当前用户</div>
            <div style="font-size:14px;font-weight:700;">{{ storeSnapshot.currentUser }}</div>
          </div>
        </div>
      </div>

      <!-- IndexedDB 状态 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="font-size:16px;font-weight:800;margin:0;">🗄️ IndexedDB 状态</h3>
          <button class="btn btn-ghost btn-sm" @click="checkDB" :disabled="checking">{{ checking ? '检查中...' : '🔍 检查' }}</button>
        </div>
        <div v-if="dbStatus">
          <div v-if="dbStatus.error" style="color:#C62828;font-size:13px;">❌ {{ dbStatus.error }}</div>
          <div v-else style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
              <span>DB 版本</span><span style="font-weight:700;">v{{ dbStatus.dbVersion }}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
              <span>IDB 学生数</span>
              <span :style="dbStatus.studentsMatch ? 'color:#4CAF50;font-weight:700;' : 'color:#C62828;font-weight:700;'">
                {{ dbStatus.indexedDBStudents }}
                {{ dbStatus.studentsMatch ? '✅' : '⚠️ 与内存不一致(' + dbStatus.memoryStudents + ')' }}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;">
              <span>IDB 任务数</span>
              <span :style="dbStatus.tasksMatch ? 'color:#4CAF50;font-weight:700;' : 'color:#C62828;font-weight:700;'">
                {{ dbStatus.indexedDBTasks }}
                {{ dbStatus.tasksMatch ? '✅' : '⚠️ 与内存不一致(' + dbStatus.memoryTasks + ')' }}
              </span>
            </div>
          </div>
        </div>
        <div v-else style="font-size:13px;color:var(--text-light);">点击"检查"查看 IndexedDB 状态</div>
      </div>

      <!-- 数据完整性检查 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="font-size:16px;font-weight:800;margin:0;">🩺 数据完整性</h3>
          <button class="btn btn-ghost btn-sm" @click="checkIntegrity" :disabled="checking">{{ checking ? '检查中...' : '🔍 检查' }}</button>
        </div>
        <div v-if="integrityCheck">
          <div :style="integrityCheck.ok ? 'color:#4CAF50;font-size:13px;font-weight:600;' : 'color:#C62828;font-size:13px;font-weight:600;'">
            {{ integrityCheck.msg }}
          </div>
          <div v-if="integrityCheck.issues" style="margin-top:8px;max-height:200px;overflow-y:auto;">
            <div v-for="(issue, i) in integrityCheck.issues" :key="i"
                 style="padding:4px 8px;font-size:12px;color:#C62828;background:#FFEBEE;border-radius:4px;margin-bottom:4px;">
              {{ issue }}
            </div>
          </div>
        </div>
        <div v-else style="font-size:13px;color:var(--text-light);">检查学生数据字段合法性、等级/经验一致性、ID 唯一性等</div>
      </div>

      <!-- 云端同步测试 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="font-size:16px;font-weight:800;margin:0;">☁️ 云端同步</h3>
          <button class="btn btn-ghost btn-sm" @click="testSync" :disabled="syncTesting">{{ syncTesting ? '测试中...' : '🔗 测试连接' }}</button>
        </div>
        <div v-if="syncTestResult" :style="syncTestResult.ok ? 'color:#4CAF50;' : 'color:#C62828;'" style="font-size:13px;font-weight:600;">
          {{ syncTestResult.msg }}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn btn-primary btn-sm" @click="forceSync">📤 强制推送</button>
          <button class="btn btn-ghost btn-sm" @click="forcePull">📥 强制拉取</button>
        </div>
      </div>

      <!-- 学生数据详情 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">👥 学生数据详情</h3>
        <div style="max-height:300px;overflow-y:auto;">
          <div v-for="s in students" :key="s.id" style="border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;cursor:pointer;"
                 @click="toggleStudentDetail(s.id)">
              <div style="font-size:13px;font-weight:700;">{{ s.name }}</div>
              <div style="font-size:12px;color:var(--text-light);">
                ⭐{{ s.points||0 }} · Lv{{ s.petStage||0 }} · Exp{{ s.petExp||0 }}
                <span style="margin-left:4px;">{{ expandedStudent === s.id ? '▾' : '▸' }}</span>
              </div>
            </div>
            <div v-if="expandedStudent === s.id" style="padding:8px;background:#F8F0FF;border-radius:8px;margin-bottom:8px;font-size:12px;font-family:monospace;white-space:pre-wrap;max-height:200px;overflow-y:auto;">
{{ JSON.stringify(s, null, 2) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="card" style="padding:20px;margin-bottom:16px;border:2px solid #FFCDD2;">
        <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;color:#C62828;">⚡ 快捷操作</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" @click="exportStoreJSON">📥 导出 Store JSON</button>
          <button class="btn btn-ghost btn-sm" style="color:#FF9800;border-color:#FF9800;" @click="clearLocalCache">🗑️ 清除本地缓存</button>
        </div>
        <p style="font-size:11px;color:var(--text-light);margin-top:10px;">⚠️ 清除本地缓存会重置排序偏好等，但不删除 IndexedDB 中的学生数据</p>
      </div>
    </div>
  `,
};

const AdminCloud = {
  name: 'AdminCloud',
  data() {
    return {
      connectionStatus: null,   // null=未检测, {ok:true}=正常, {ok:false}=失败
      checking: false,
      pushing: false,
      pulling: false,
      lastSyncTime: null,
      cloudStats: null,
      localStats: { students: 0, tasks: 0 },
      confirmOverwrite: false, // 拉取前确认覆盖
      overwriteLocal: false,   // 是否强制覆盖本地（默认开启时间保护）

      // 智能同步（冲突检测）
      syncChecking: false,       // 正在检测冲突
      showSyncDialog: false,     // 显示冲突对比弹窗
      cloudSyncStats: null,      // 云端统计
      localSyncStats: null,      // 本地统计
      syncDialogResolving: false, // 正在处理用户选择
      autoSyncEnabled: false,
      // 头像专项操作
      avatarPushing: false,
      avatarPulling: false,
      cloudAvatarCount: null,   // 云端头像数量（null=未检测）
      localAvatarCount: 0,      // 本地有头像的学生数
    };
  },
  async mounted() {
    await this.checkConnection();
    await this.refreshStats();
    // 监听数据变化时刷新本地统计
    this._unwatchStudents = this.$watch(() => Store.state.students.length, () => {
      this.localStats.students = Store.state.students.length;
      this.localAvatarCount = Store.state.students.filter(s => s.avatar || s.petImage).length;
    });
    this._unwatchTasks = this.$watch(() => Store.state.tasks.length, () => {
      this.localStats.tasks = Store.state.tasks.length;
    });
    this.localStats.students = Store.state.students.length;
    this.localStats.tasks = Store.state.tasks.length;
    this.localAvatarCount = Store.state.students.filter(s => s.avatar || s.petImage).length;

    // 检查加载时自动检测到的冲突
    if (Store.state._syncConflict) {
      this._showAutoDetectedConflict();
    }
  },
  beforeUnmount() {
    if (this._unwatchStudents) this._unwatchStudents();
    if (this._unwatchTasks) this._unwatchTasks();
  },
  methods: {
    async checkConnection() {
      this.checking = true;
      this.connectionStatus = await Store.cloudPing();
      this.checking = false;
    },

    async refreshStats() {
      this.lastSyncTime = await Store.cloudLastSync();
      this.cloudStats = await Store.cloudStats();
      // 查询云端头像数量
      try {
        const avatarStats = await CloudSync.getAvatarStats();
        this.cloudAvatarCount = avatarStats ? avatarStats.count : 0;
      } catch (e) {
        this.cloudAvatarCount = null;
      }
    },

    async doPushAvatars() {
      this.avatarPushing = true;
      await Store.cloudPushAvatars();
      this.avatarPushing = false;
      await this.refreshStats();
    },

    async doPullAvatars() {
      this.avatarPulling = true;
      const result = await Store.cloudPullAvatars();
      this.avatarPulling = false;
      if (result.success) {
        this.localAvatarCount = Store.state.students.filter(s => s.avatar || s.petImage).length;
      }
    },

    async doPush() {
      this.pushing = true;
      const result = await Store.cloudPush();
      this.pushing = false;
      if (result.success) {
        await this.refreshStats();
      }
    },

    openPullConfirm() {
      // 如果勾选了"时间保护"，且检测到数据已是最新，则无需弹窗
      // 直接展示确认弹窗（强制模式不需要预检）
      this.confirmOverwrite = true;
    },

    async doPull() {
      this.pulling = true;
      this.confirmOverwrite = false;
      // overwriteLocal=true → force（强制覆盖）；false → 时间保护（默认）
      const result = await Store.cloudPull(this.overwriteLocal);
      this.pulling = false;
      this.overwriteLocal = false; // 重置
      if (result.success) {
        if (result.skipped) {
          // 数据已是最新，不需要覆盖，静默提示
          Store.toast('✅ 本地数据已是最新，无需拉取', 'success');
          return;
        }
        await this.refreshStats();
        // 刷新登录状态
        const savedUser = localStorage.getItem('petSystemUser');
        if (savedUser) {
          try {
            const userData = JSON.parse(savedUser);
            if (userData.role === 'student') {
              const user = Store.state.students.find(s => s.id === userData.id);
              if (user) this.$emit('login-success', { ...user, role: 'student' });
            }
          } catch (e) {}
        }
      }
    },

    // ---- 智能同步：检测云端本地时间，一致则静默推送，不一致则弹窗对比 ----
    async checkAndSync() {
      this.syncChecking = true;
      try {
        // 1. 获取云端统计和时间
        const cloudStats = await CloudSync.getCloudStudentStats();
        const cloudTimes = await CloudSync.getCloudLastUpdateTime();

        // 2. 获取本地时间戳
        const localTime = await dbStorage.getMeta('studentsUpdatedAt');

        // 3. 计算本地统计
        const realStudents = Store.state.students.filter(s => !s._isPlaceholder);
        const scores = realStudents.map(s => s.points || 0);
        const localStats = {
          count: realStudents.length,
          scoreAvg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
          scoreMax: scores.length ? Math.max(...scores) : 0,
          lastUpdateTime: localTime,
        };

        // 4. 严格比较时间戳（2秒以内视为一致）
        const cloudTime = cloudTimes ? cloudTimes.students : null;
        let isSame = false;
        if (cloudTime && localTime) {
          isSame = Math.abs(new Date(cloudTime).getTime() - new Date(localTime).getTime()) <= 2000;
        }

        console.log('[Sync] 时间对比', {
          cloud: cloudTime ? cloudTime.toISOString() : '无',
          local: localTime || '无',
          same: isSame
        });

        if (isSame) {
          // 时间一致 → 静默推送
          Store.toast('✅ 数据同步中，云端与本地一致，正在推送...', 'success');
          await this.doPush();
        } else {
          // 时间不一致 → 弹窗对比
          this.cloudSyncStats = cloudStats || {
            count: '?', scoreAvg: '?', scoreMax: '?',
            lastUpdateTime: cloudTime ? cloudTime.toISOString() : null,
          };
          this.cloudSyncStats.lastUpdateTime = cloudTime ? cloudTime.toISOString() : null;
          this.localSyncStats = localStats;
          this.showSyncDialog = true;
        }
      } catch (e) {
        Store.toast('❌ 同步检测失败: ' + (e.message || '未知错误'), 'error');
        console.error('[Sync] 检测失败:', e);
      }
      this.syncChecking = false;
    },

    async resolveConflict(choice) {
      this.syncDialogResolving = true;
      this.showSyncDialog = false;
      try {
        if (choice === 'local') {
          // 保留本地 → 推送到云端
          await this.doPush();
        } else {
          // 使用云端 → 强制拉取
          const result = await Store.cloudPull(true); // force=true
          if (result.success && !result.skipped) {
            await this.refreshStats();
          }
        }
      } catch (e) {
        Store.toast('❌ 操作失败: ' + (e.message || '未知错误'), 'error');
      }
      this.syncDialogResolving = false;
    },

    // ---- 加载时自动检测到冲突，弹出对比窗口 ----
    async _showAutoDetectedConflict() {
      // 清除标志（防止重复弹出）
      Store.state._syncConflict = false;
      
      // 加载云端统计
      const cloudStats = await CloudSync.getCloudStudentStats();
      
      // 计算本地统计
      const realStudents = Store.state.students.filter(s => !s._isPlaceholder);
      const scores = realStudents.map(s => s.points || 0);
      
      this.cloudSyncStats = cloudStats || {
        count: '?', scoreAvg: '?', scoreMax: '?',
        lastUpdateTime: Store.state._syncConflictCloudTime,
      };
      this.cloudSyncStats.lastUpdateTime = Store.state._syncConflictCloudTime;
      
      this.localSyncStats = {
        count: realStudents.length,
        scoreAvg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        scoreMax: scores.length ? Math.max(...scores) : 0,
        lastUpdateTime: Store.state._syncConflictLocalTime,
      };
      
      this.showSyncDialog = true;
    },

    formatTime(isoStr) {
      if (!isoStr) return '从未同步';
      try {
        const d = new Date(isoStr);
        return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (e) {
        return isoStr;
      }
    },

    async copyUrl() {
      const url = window.location.origin + window.location.pathname;
      try {
        await navigator.clipboard.writeText(url);
        Store.toast('访问链接已复制！', 'success');
      } catch (e) {
        Store.toast('访问链接：' + url, 'info');
      }
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header" style="margin-bottom:8px;">
        <div class="teacher-page-title">☁️ 云端同步</div>
        <div style="font-size:13px;color:var(--text-light);">Supabase 多设备数据同步</div>
      </div>

      <!-- 连接状态卡片 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="font-size:15px;font-weight:800;margin:0;">🔗 云端连接状态</h3>
          <button class="btn btn-ghost btn-sm" :disabled="checking" @click="checkConnection">
            {{ checking ? '🔄 检测中...' : '🔄 重新检测' }}
          </button>
        </div>
        <div v-if="connectionStatus === null" style="color:var(--text-light);font-size:14px;">
          点击「重新检测」验证连接
        </div>
        <div v-else-if="connectionStatus.ok" style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:28px;">✅</span>
          <div>
            <div style="font-size:14px;font-weight:700;color:#2E7D32;">{{ connectionStatus.msg }}</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px;">上次同步：{{ formatTime(lastSyncTime) }}</div>
          </div>
        </div>
        <div v-else style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:28px;">❌</span>
          <div>
            <div style="font-size:14px;font-weight:700;color:#C62828;">{{ connectionStatus.msg }}</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px;">请检查 Supabase 项目配置或网络连接</div>
          </div>
        </div>
      </div>

      <!-- 数据对比卡片 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:800;margin:0 0 14px;">📊 数据对比</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div style="background:#F8F0FF;border-radius:12px;padding:14px;text-align:center;">
            <div style="font-size:28px;margin-bottom:4px;">💻</div>
            <div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">本地数据</div>
            <div style="font-size:22px;font-weight:800;color:#7C4DFF;">{{ localStats.students }} <span style="font-size:13px;font-weight:400;color:var(--text-light);">学生</span></div>
            <div style="font-size:14px;color:var(--text-mid);">{{ localStats.tasks }} 任务</div>
          </div>
          <div style="background:#F0FFF4;border-radius:12px;padding:14px;text-align:center;">
            <div style="font-size:28px;margin-bottom:4px;">☁️</div>
            <div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">云端数据</div>
            <div style="font-size:22px;font-weight:800;color:#2E7D32;">{{ cloudStats ? cloudStats.students : '-' }} <span style="font-size:13px;font-weight:400;color:var(--text-light);">学生</span></div>
            <div style="font-size:14px;color:var(--text-mid);">{{ cloudStats ? cloudStats.tasks : '-' }} 任务</div>
          </div>
        </div>
        <div style="margin-top:12px;padding:10px 14px;background:#E8F5E9;border-radius:10px;font-size:12px;color:#2E7D32;line-height:1.6;">
          🛡️ <strong>智能同步</strong>：默认只拉取云端更新的数据，不会覆盖本地的新改动。如需强制同步，下载时请勾选「强制拉取」。
        </div>
      </div>

      <!-- 同步操作 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:800;margin:0 0 14px;">🔄 同步操作</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <!-- 推送到云端 -->
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:700;">📤 推送到云端</div>
              <div style="font-size:12px;color:var(--text-light);margin-top:2px;">将本地数据上传到云端（其他设备可见）</div>
            </div>
            <button class="btn btn-primary" style="min-width:120px;flex-shrink:0;"
                    :disabled="pushing || !connectionStatus?.ok" @click="doPush">
              {{ pushing ? '🔄 上传中...' : '📤 上传' }}
            </button>
          </div>

          <!-- 拉取云端数据 -->
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:700;">🔁 智能同步</div>
              <div style="font-size:12px;color:var(--text-light);margin-top:2px;">自动检测冲突：一致则静默推送，不一致则弹窗对比</div>
            </div>
            <button class="btn btn-primary" style="min-width:130px;flex-shrink:0;"
                    :disabled="syncChecking || !connectionStatus?.ok" @click="checkAndSync">
              {{ syncChecking ? '🔄 检测中...' : '🔁 智能同步' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 🖼️ 头像专项管理（迁移到新环境时使用）-->
      <div class="card" style="padding:20px;margin-bottom:16px;border:2px solid #E8F5E9;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span style="font-size:20px;">🖼️</span>
          <h3 style="font-size:15px;font-weight:800;margin:0;">头像专项管理</h3>
          <span style="font-size:11px;background:#E8F5E9;color:#2E7D32;padding:2px 8px;border-radius:99px;font-weight:600;">迁移/恢复用</span>
        </div>
        <p style="font-size:12px;color:var(--text-mid);margin:0 0 14px;line-height:1.7;">
          头像以 <strong>base64</strong> 格式存于浏览器本地数据库，拷贝代码到新环境后头像会丢失。<br>
          使用下方按钮：在旧环境先<strong>备份头像</strong>，再在新环境<strong>恢复头像</strong>。
        </p>

        <!-- 头像统计 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          <div style="background:#F3E5F5;border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:11px;color:#7B1FA2;margin-bottom:4px;">本地有头像学生</div>
            <div style="font-size:24px;font-weight:800;color:#7C4DFF;">{{ localAvatarCount }}</div>
            <div style="font-size:11px;color:var(--text-light);">/ {{ localStats.students }} 人</div>
          </div>
          <div style="background:#E8F5E9;border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:11px;color:#2E7D32;margin-bottom:4px;">云端已备份头像</div>
            <div style="font-size:24px;font-weight:800;color:#2E7D32;">
              {{ cloudAvatarCount === null ? '—' : cloudAvatarCount }}
            </div>
            <div style="font-size:11px;color:var(--text-light);">个学生</div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <!-- 备份头像 -->
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#F8F4FF;border-radius:10px;">
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:700;">☁️ 备份头像到云端</div>
              <div style="font-size:11px;color:var(--text-light);margin-top:2px;">在<strong>旧/源环境</strong>执行，将本地头像上传到云端</div>
            </div>
            <button class="btn btn-primary" style="min-width:100px;flex-shrink:0;font-size:13px;"
                    :disabled="avatarPushing || localAvatarCount === 0 || !connectionStatus?.ok"
                    @click="doPushAvatars">
              {{ avatarPushing ? '上传中...' : '📤 备份头像' }}
            </button>
          </div>

          <!-- 恢复头像 -->
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#F0FFF4;border-radius:10px;">
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:700;">🔄 从云端恢复头像</div>
              <div style="font-size:11px;color:var(--text-light);margin-top:2px;">在<strong>新/目标环境</strong>执行，将云端头像恢复到本地</div>
            </div>
            <button class="btn" style="min-width:100px;flex-shrink:0;background:#2E7D32;color:white;border:none;font-size:13px;"
                    :disabled="avatarPulling || !connectionStatus?.ok || cloudAvatarCount === 0"
                    @click="doPullAvatars">
              {{ avatarPulling ? '恢复中...' : '📥 恢复头像' }}
            </button>
          </div>
        </div>

        <div v-if="localAvatarCount === 0 && cloudAvatarCount === 0" style="margin-top:12px;padding:10px 14px;background:#FFF9E6;border-radius:10px;font-size:12px;color:#B8860B;">
          ⚠️ 当前本地和云端都没有头像数据。如需找回，请使用 JSON 备份文件恢复（管理员设置 → 数据管理）。
        </div>
      </div>

      <!-- 访问链接分享 -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:800;margin:0 0 10px;">🔗 多设备访问</h3>
        <p style="font-size:13px;color:var(--text-mid);margin:0 0 14px;line-height:1.6;">
          将此链接分享给其他设备，用同一 Supabase 账号登录即可实现数据同步。
        </p>
        <button class="btn btn-ghost" style="border-color:#7C4DFF;color:#7C4DFF;" @click="copyUrl">
          📋 复制访问链接
        </button>
      </div>

      <!-- 数据库配置说明 -->
      <div class="card" style="padding:20px;margin-bottom:16px;background:#F5F5F5;">
        <h3 style="font-size:14px;font-weight:800;margin:0 0 8px;">🗄️ 数据库表结构</h3>
        <div style="font-size:12px;color:var(--text-mid);line-height:2;margin-bottom:12px;">
          请在 Supabase SQL Editor 中执行以下建表语句（仅首次需要）：
        </div>
        <pre style="background:#1E1E1E;color:#A5D6A7;padding:14px;border-radius:10px;font-size:11px;line-height:1.8;overflow:auto;white-space:pre;">-- 学生数据表
CREATE TABLE IF NOT EXISTS students (
  id BIGINT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 任务数据表
CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 同步元数据表
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 开启 RLS（行级安全）
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_meta ENABLE ROW LEVEL SECURITY;

-- 允许所有操作（本地使用）
CREATE POLICY "allow_all_students" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_sync" ON sync_meta FOR ALL USING (true) WITH CHECK (true);</pre>
        <div style="font-size:12px;color:var(--text-light);margin-top:8px;line-height:1.6;">
          ⚠️ 以上为简化配置，实际生产环境建议配置更严格的 RLS 策略。
        </div>
      </div>

      <!-- ⚠️ 智能同步：冲突对比弹窗 -->
      <div v-if="showSyncDialog" class="modal-overlay" @click.self="showSyncDialog=false">
        <div class="modal-box" style="max-width:500px;">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:8px;text-align:center;">⚠️ 数据不一致</h3>
          <p style="font-size:13px;color:var(--text-light);text-align:center;margin-bottom:20px;line-height:1.6;">
            云端与本地数据时间戳不同，可能来自不同设备。<br>请对比后选择保留哪一份数据：
          </p>

          <!-- 对比卡片 -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
            <!-- 本地 -->
            <div style="background:#F0FFF4;border:2px solid #A5D6A7;border-radius:12px;padding:14px;text-align:center;">
              <div style="font-size:13px;font-weight:700;color:#2E7D32;margin-bottom:10px;">💻 本地</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;text-align:center;">
                <div>
                  <div style="font-size:10px;color:var(--text-light);">学生数</div>
                  <div style="font-size:18px;font-weight:800;color:#2E7D32;">{{ localSyncStats.count }}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text-light);">平均分</div>
                  <div style="font-size:18px;font-weight:800;color:#2E7D32;">{{ localSyncStats.scoreAvg }}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text-light);">最高分</div>
                  <div style="font-size:18px;font-weight:800;color:#2E7D32;">{{ localSyncStats.scoreMax }}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text-light);">任务数</div>
                  <div style="font-size:18px;font-weight:800;color:#2E7D32;">{{ localStats.tasks }}</div>
                </div>
              </div>
              <div v-if="localSyncStats.lastUpdateTime" style="font-size:10px;color:var(--text-light);margin-top:10px;border-top:1px solid #A5D6A7;padding-top:8px;line-height:1.4;">
                最后更新<br>{{ formatTime(localSyncStats.lastUpdateTime) }}
              </div>
            </div>

            <!-- 云端 -->
            <div style="background:#FFF3E0;border:2px solid #FFB74D;border-radius:12px;padding:14px;text-align:center;">
              <div style="font-size:13px;font-weight:700;color:#E65100;margin-bottom:10px;">☁️ 云端</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;text-align:center;">
                <div>
                  <div style="font-size:10px;color:var(--text-light);">学生数</div>
                  <div style="font-size:18px;font-weight:800;color:#E65100;">{{ cloudSyncStats.count }}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text-light);">平均分</div>
                  <div style="font-size:18px;font-weight:800;color:#E65100;">{{ cloudSyncStats.scoreAvg }}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text-light);">最高分</div>
                  <div style="font-size:18px;font-weight:800;color:#E65100;">{{ cloudSyncStats.scoreMax }}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--text-light);">任务数</div>
                  <div style="font-size:18px;font-weight:800;color:#E65100;">{{ cloudStats?.tasks || '?' }}</div>
                </div>
              </div>
              <div v-if="cloudSyncStats.lastUpdateTime" style="font-size:10px;color:var(--text-light);margin-top:10px;border-top:1px solid #FFB74D;padding-top:8px;line-height:1.4;">
                最后更新<br>{{ formatTime(cloudSyncStats.lastUpdateTime) }}
              </div>
            </div>
          </div>

          <!-- 选择按钮 -->
          <div style="display:flex;gap:10px;">
            <button class="btn" style="flex:1;background:#2E7D32;color:white;border:none;font-weight:700;"
                    :disabled="syncDialogResolving" @click="resolveConflict('local')">
              {{ syncDialogResolving ? '处理中...' : '📤 保留本地并推送' }}
            </button>
            <button class="btn" style="flex:1;background:#E65100;color:white;border:none;font-weight:700;"
                    :disabled="syncDialogResolving" @click="resolveConflict('cloud')">
              {{ syncDialogResolving ? '处理中...' : '📥 使用云端数据' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 📋 操作记录 ----------
const AdminAuditLog = {
  name: 'AdminAuditLog',
  data() {
    return {
      filterText: '',
      confirmRevertId: null,
      reverting: false,
      actionLegend: [
        { icon: '⭐', label: '发放积分', color: '#2E7D32', canRevert: true },
        { icon: '📉', label: '扣除积分', color: '#E65100', canRevert: true },
        { icon: '🎁', label: '消费积分', color: '#E65100', canRevert: true },
        { icon: '🗑️', label: '删除', color: '#C62828', canRevert: true },
        { icon: '✏️', label: '修改/更新', color: '#6A1B9A', canRevert: true },
        { icon: '↩️', label: '回退', color: '#1565C0', canRevert: false },
      ],
    };
  },
  computed: {
    logs() {
      void Store.state.auditLogRev;
      const q = this.filterText.trim().toLowerCase();
      if (!q) return Store.state.auditLog;
      return Store.state.auditLog.filter(e =>
        e.action.includes(q) || e.detail.includes(q) || e.time.includes(q)
      );
    },
  },
  methods: {
    actionColor(action) {
      if (action.includes('删除')) return '#C62828';
      if (action.includes('扣除')) return '#E65100';
      if (action.includes('发放') || action.includes('添加')) return '#2E7D32';
      if (action.includes('回退')) return '#1565C0';
      if (action.includes('修改') || action.includes('更新')) return '#6A1B9A';
      return '#555';
    },
    actionIcon(action) {
      if (action.includes('删除')) return '🗑️';
      if (action.includes('扣除')) return '📉';
      if (action.includes('发放')) return '⭐';
      if (action.includes('添加')) return '➕';
      if (action.includes('回退')) return '↩️';
      if (action.includes('修改') || action.includes('更新')) return '✏️';
      return '📋';
    },
    openRevert(id) {
      const entry = Store.state.auditLog.find(e => e.id === id);
      if (!entry || !entry.snapshot) {
        Store.toast('该操作不支持回退', 'warning');
        return;
      }
      this.confirmRevertId = id;
    },
    async doRevert() {
      if (!this.confirmRevertId) return;
      this.reverting = true;
      const result = await Store.revertAudit(this.confirmRevertId);
      this.reverting = false;
      this.confirmRevertId = null;
      if (result.success) {
        Store.toast('↩️ ' + result.msg, 'success');
      } else {
        Store.toast('回退失败：' + result.msg, 'error');
      }
    },
    clearAll() {
      if (!confirm('确定要清空所有操作记录吗？此操作不可撤销。')) return;
      Store.clearAuditLog();
      Store.toast('操作记录已清空', 'info');
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header" style="margin-bottom:8px;">
        <div class="teacher-page-title">📋 操作记录</div>
        <div style="font-size:13px;color:var(--text-light);">共 {{ logs.length }} 条记录（最多1000条，自动云端同步）</div>
        <!-- 操作类型图例 -->
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
          <span v-for="item in actionLegend" :key="item.label"
                style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;border-radius:20px;background:white;border:1px solid var(--border);">
            <span>{{ item.icon }}</span>
            <span :style="'color:' + item.color">{{ item.label }}</span>
            <span v-if="item.canRevert" style="color:#1565C0;font-size:10px;">↩可回退</span>
          </span>
        </div>
      </div>

      <!-- 搜索 + 操作栏 -->
      <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;">
        <input class="input-field" v-model="filterText" placeholder="🔍 搜索操作类型或内容..." style="flex:1;padding:8px 14px;font-size:13px;" />
        <button class="btn btn-ghost btn-sm" style="color:#C62828;border-color:#C62828;flex-shrink:0;" @click="clearAll">
          🗑️ 清空
        </button>
      </div>

      <!-- 日志列表 -->
      <div v-if="logs.length === 0" style="text-align:center;padding:40px;color:var(--text-light);font-size:14px;">
        暂无操作记录
      </div>

      <div v-for="entry in logs" :key="entry.id"
           class="card" style="padding:14px 16px;margin-bottom:10px;border-left:4px solid;"
           :style="'border-left-color:' + actionColor(entry.action)">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <!-- 图标 -->
          <div style="font-size:22px;flex-shrink:0;margin-top:1px;">{{ actionIcon(entry.action) }}</div>
          <!-- 内容 -->
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:800;"
                    :style="'color:' + actionColor(entry.action)">{{ entry.action }}</span>
              <span style="font-size:11px;color:var(--text-light);">{{ entry.time }}</span>
            </div>
            <div style="font-size:13px;color:var(--text-mid);line-height:1.6;word-break:break-all;">
              {{ entry.detail }}
            </div>
          </div>
          <!-- 回退按钮 -->
          <button v-if="entry.snapshot && !entry.action.includes('回退')"
                  class="btn btn-ghost btn-sm"
                  style="flex-shrink:0;color:#1565C0;border-color:#1565C0;font-size:12px;"
                  @click="openRevert(entry.id)">
            ↩️ 回退
          </button>
        </div>
      </div>

      <!-- 回退确认弹窗 -->
      <div v-if="confirmRevertId" class="modal-overlay" @click.self="confirmRevertId=null">
        <div class="modal-box" style="text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">↩️</div>
          <h3 style="font-size:18px;font-weight:800;margin-bottom:8px;">确认回退此操作？</h3>
          <p style="color:var(--text-light);font-size:14px;margin-bottom:24px;line-height:1.7;">
            将恢复该操作前的数据状态。<br>
            <strong style="color:#C62828;">注意：此操作本身无法再撤销！</strong>
          </p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="confirmRevertId=null">取消</button>
            <button class="btn" style="flex:1;background:#1565C0;color:white;border:none;" :disabled="reverting" @click="doRevert">
              {{ reverting ? '回退中...' : '↩️ 确认回退' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 管理员总容器 ----------
const AdminApp = {
  name: 'AdminApp',
  props: ['user'],
  emits: ['logout'],
  data() {
    return {
      currentSection: 'dashboard',
      showAvatarMenu: false,
    };
  },
  computed: {
    menuItems() {
      return [
        { key: 'dashboard', icon: '🛡️', label: '总览' },
        { key: 'teachers',  icon: '👩‍🏫', label: '教师管理' },
        { key: 'codes',     icon: '🔑', label: '邀请码' },
        { key: 'students',  icon: '👨‍🎓', label: '学生' },
        { key: 'cloud',     icon: '☁️', label: '云端同步' },
        { key: 'audit',     icon: '📋', label: '操作记录' },
        { key: 'debug',     icon: '🐛', label: '调试' },
        { key: 'settings',  icon: '⚙️', label: '设置' },
      ];
    },
  },
  methods: {
    doLogout() {
      Store.logout();
      this.$emit('logout');
    },
    switchSection(key) {
      this.currentSection = key;
      this.showAvatarMenu = false;
    },
  },
  template: `
    <div style="min-height:100vh;background:#F3EEFF;" @click="showAvatarMenu=false">

      <!-- 顶部导航栏（管理员深紫色主题） -->
      <div class="topbar admin-topbar">
        <div class="topbar-logo">
          <span class="logo-icon">🛡️</span>
          <span>管理控制台</span>
        </div>
        <div class="topbar-right">
          <!-- 身份标签 -->
          <div class="topbar-points" style="background:rgba(255,255,255,0.15);">
            <span>🛡️</span>
            <span>{{ user && user.name ? user.name : '系统管理员' }}</span>
          </div>
          <!-- 头像 + 下拉菜单 -->
          <div style="position:relative;" @click.stop="showAvatarMenu=false">
            <div class="topbar-avatar" @click.stop="showAvatarMenu=true"
                 :style="showAvatarMenu ? 'box-shadow:0 0 0 3px rgba(255,255,255,0.6);' : ''">
              🛡️
            </div>
            <transition name="fade">
              <div v-if="showAvatarMenu" class="avatar-dropdown">
                <div class="avatar-menu-header">
                  <div style="font-size:28px;color:#7C4DFF;">🛡️</div>
                  <div>
                    <div style="font-size:14px;font-weight:800;color:var(--text-dark);">{{ user && user.name ? user.name : '系统管理员' }}</div>
                    <div style="font-size:12px;color:var(--text-light);">管理员</div>
                  </div>
                </div>
                <div class="avatar-menu-item avatar-menu-logout" @click="doLogout">
                  <span>🚪</span>
                  <span>退出登录</span>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="main-content">
        <admin-dashboard    v-if="currentSection==='dashboard'"></admin-dashboard>
        <admin-teachers     v-if="currentSection==='teachers'"></admin-teachers>
        <admin-invite-codes v-if="currentSection==='codes'"></admin-invite-codes>
        <admin-students     v-if="currentSection==='students'"></admin-students>
        <admin-cloud        v-if="currentSection==='cloud'"></admin-cloud>
        <admin-audit-log    v-if="currentSection==='audit'"></admin-audit-log>
        <admin-debug        v-if="currentSection==='debug'"></admin-debug>
        <admin-settings     v-if="currentSection==='settings'"></admin-settings>
      </div>

      <!-- 底部导航栏 -->
      <div class="bottom-nav">
        <div v-for="item in menuItems" :key="item.key" class="nav-item"
             :class="{active: currentSection===item.key}"
             @click="switchSection(item.key)">
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </div>
      </div>

      <!-- 版权信息 -->
      <div style="text-align:center;padding:10px;font-size:11px;color:rgba(124,77,255,0.5);background:#F3EEFF;">
        Made by Qin_zzq · Copyright © 2026
      </div>

    </div>
  `,
  components: {
    AdminDashboard,
    AdminTeachers,
    AdminInviteCodes,
    AdminStudents,
    AdminCloud,
    AdminAuditLog,
    AdminDebug,
    AdminSettings,
    'admin-dashboard':    AdminDashboard,
    'admin-teachers':     AdminTeachers,
    'admin-invite-codes': AdminInviteCodes,
    'admin-students':     AdminStudents,
    'admin-cloud':        AdminCloud,
    'admin-audit-log':    AdminAuditLog,
    'admin-debug':        AdminDebug,
    'admin-settings':     AdminSettings,
  },
};
