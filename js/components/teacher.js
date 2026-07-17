// ===== 教师端 完整组件 =====

// ---------- 教师主页（概览） ----------
const TeacherDashboard = {
  name: 'TeacherDashboard',
  props: ['teacher'],
  data() {
    return {
      pointsStudent: null, // 当前查看积分记录的学生
    };
  },
  computed: {
    students() { void Store.state.studentRev; return Store.state.students; },
    totalStudents() { return this.students.length; },
    topStudent() {
      return [...this.students].sort((a,b) => (b.points||0) - (a.points||0))[0] || null;
    },
    classStats() {
      const total = this.students.length;
      const withPet = this.students.filter(s => s.petType).length;
      const avgPoints = total > 0
        ? Math.round(this.students.reduce((sum, s) => sum + (s.points||0), 0) / total)
        : 0;
      return { total, withPet, avgPoints };
    },
    pointsHistory() {
      if (!this.pointsStudent) return [];
      const s = Store.state.students.find(st => st.id === this.pointsStudent.id);
      if (!s) return [];
      if (s.pointsLog && s.pointsLog.length) return [...s.pointsLog].reverse();
      return [];
    },
  },
  methods: {
    getStudentPetEmoji,
    // 获取学生头像（优先自定义头像/宠物图片，兜底 emoji）
    getStudentAvatar(student) {
      if (student.avatar && student.avatar.startsWith('data:')) {
        return { type: 'image', value: student.avatar };
      }
      if (student.petImage) {
        return { type: 'image', value: student.petImage };
      }
      return { type: 'emoji', value: getStudentPetEmoji(student) };
    },
    openPointsDetail(student) {
      this.pointsStudent = student;
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header">
        <div class="teacher-page-title">📊 班级总览</div>
        <div style="font-size:13px;color:var(--text-light);">{{ teacher.name }}</div>
      </div>

      <!-- 统计卡片 -->
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-icon-box" style="background:#FFF0F8;">👨‍🎓</div>
          <div>
            <div class="stat-label">学生总数</div>
            <div class="stat-value">{{ totalStudents }}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon-box" style="background:#EDE7F6;">⭐</div>
          <div>
            <div class="stat-label">平均积分</div>
            <div class="stat-value">{{ classStats.avgPoints }}</div>
          </div>
        </div>
      </div>

      <div class="dashboard-panels">
        <!-- 积分排行（主面板） -->
        <div class="card" style="padding:20px;">
          <div style="font-weight:800;font-size:16px;margin-bottom:14px;">🏆 积分排行
            <span style="font-size:12px;color:var(--text-light);font-weight:400;margin-left:6px;">点击查看积分记录</span>
          </div>
          <div style="overflow-y:auto;max-height:300px;scrollbar-width:thin;scrollbar-color:var(--primary) #F0E8FF;">
            <div v-for="(s, i) in [...students].sort((a,b)=>(b.points||0)-(a.points||0))" :key="s.id"
                 @click="openPointsDetail(s)"
                 style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;border-radius:8px;transition:background 0.15s;"
                 onmouseover="this.style.background='#F8F0FF'" onmouseout="this.style.background='transparent'">
              <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0;"
                   :style="i===0?'background:#FFD700;color:white':i===1?'background:#C0C0C0;color:white':i===2?'background:#CD7F32;color:white':'background:#F5F5F5;color:#888'">
                {{ i+1 }}
              </div>
              <div style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#F8F0FF;display:flex;align-items:center;justify-content:center;">
                <img v-if="getStudentAvatar(s).type==='image'" :src="getStudentAvatar(s).value" style="width:100%;height:100%;object-fit:cover;" />
                <span v-else style="font-size:22px;">{{ getStudentAvatar(s).value }}</span>
              </div>
              <div style="flex:1;font-weight:700;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ s.name }}</div>
              <div style="font-weight:800;color:var(--warning);flex-shrink:0;">⭐{{ s.points||0 }}</div>
              <span style="font-size:12px;color:var(--primary);opacity:0.6;flex-shrink:0;">›</span>
            </div>
          </div>
        </div>

        <!-- 班级宠物概览 -->
        <div class="card" style="padding:20px;">
          <div style="font-weight:800;font-size:16px;margin-bottom:14px;">🐾 宠物概览</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#FFF0F8;border-radius:10px;">
              <span style="font-size:13px;color:var(--text-mid);">已领养宠物</span>
              <span style="font-size:18px;font-weight:800;color:#FF6B9D;">{{ classStats.withPet }} / {{ classStats.total }}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#EDE7F6;border-radius:10px;">
              <span style="font-size:13px;color:var(--text-mid);">平均积分</span>
              <span style="font-size:18px;font-weight:800;color:#7C4DFF;">{{ classStats.avgPoints }}</span>
            </div>
            <div v-if="topStudent" style="display:flex;align-items:center;gap:10px;padding:10px;background:linear-gradient(135deg,#FFF8E1,#FFF3CD);border-radius:10px;">
              <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#FFF8E1;display:flex;align-items:center;justify-content:center;">
                <img v-if="getStudentAvatar(topStudent).type==='image'" :src="getStudentAvatar(topStudent).value" style="width:100%;height:100%;object-fit:cover;" />
                <span v-else style="font-size:28px;">{{ getStudentAvatar(topStudent).value }}</span>
              </div>
              <div>
                <div style="font-size:12px;color:var(--text-light);">🏆 积分冠军</div>
                <div style="font-size:14px;font-weight:800;color:#E65100;">{{ topStudent.name }} · ⭐{{ topStudent.points }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 积分记录弹窗 -->
      <div v-if="pointsStudent" class="modal-overlay" @click.self="pointsStudent=null">
        <div class="modal-box" style="max-width:420px;max-height:80vh;display:flex;flex-direction:column;">
          <!-- 头部 -->
          <div style="background:linear-gradient(135deg,#FF9800,#FFB74D);border-radius:16px 16px 0 0;margin:-20px -20px 0;padding:20px;color:white;flex-shrink:0;">
            <div style="width:60px;height:60px;border-radius:50%;overflow:hidden;margin:0 auto 8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;border:3px solid rgba(255,255,255,0.5);">
              <img v-if="getStudentAvatar(pointsStudent).type==='image'" :src="getStudentAvatar(pointsStudent).value" style="width:100%;height:100%;object-fit:cover;" />
              <span v-else style="font-size:36px;">{{ getStudentAvatar(pointsStudent).value }}</span>
            </div>
            <div style="font-size:18px;font-weight:800;">{{ pointsStudent.name }} 的积分记录</div>
            <div style="font-size:13px;opacity:0.9;margin-top:4px;">当前积分：⭐ {{ pointsStudent.points || 0 }}</div>
          </div>

          <!-- 记录列表 -->
          <div style="overflow-y:auto;flex:1;padding-top:16px;margin-top:4px;">
            <div v-if="pointsHistory.length===0"
                 style="text-align:center;color:var(--text-light);font-size:14px;padding:30px 0;">
              暂无积分记录
            </div>
            <div v-for="(log, idx) in pointsHistory" :key="idx"
                 style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F5F0FF;">
              <div style="width:36px;height:36px;border-radius:50%;background:#F8F0FF;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
                {{ log.icon }}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ log.label }}</div>
                <div style="font-size:11px;color:var(--text-light);">{{ log.time }}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:15px;font-weight:800;" :style="{color: log.delta>0 ? '#4CAF50' : '#F44336'}">
                  {{ log.delta > 0 ? '+' : '' }}{{ log.delta }}
                </div>
                <div v-if="log.total !== '-'" style="font-size:11px;color:var(--text-light);">共{{ log.total }}分</div>
              </div>
            </div>
          </div>

          <!-- 底部关闭 -->
          <div style="padding-top:14px;flex-shrink:0;">
            <button class="btn btn-ghost" style="width:100%;" @click="pointsStudent=null">关闭</button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 学生管理 ----------
const TeacherStudents = {
  name: 'TeacherStudents',
  emits: ['toast'],
  data() {
    return {
      _rev: 0,                  // 版本计数器，增删改后强制 computed 重算
      searchText: '',
      showAddModal: false,
      showGrantModal: false,
      showDeductModal: false,   // 扣分弹窗
      grantStudent: null,
      grantPoints: 20,
      grantReason: '',
      deductStudent: null,      // 扣分对象
      deductPoints: 10,         // 默认扣10分
      deductReason: '',
      newStudent: { name:'', username:'', class:'' },
      showConfirmDelete: false,
      deleteStudentId: null,
      // 点击学生确认框
      openStudentConfirm: null, // 正在确认的学生对象
      // 自定义快捷积分
      customQuickPoints: [],    // 自定义加分数组
      showAddQuickModal: false, // 添加快捷积分弹窗
      newQuickPoint: '',        // 新快捷积分输入值
      // 自定义快捷扣分
      customQuickDeducts: [],
      showAddQuickDeductModal: false,
      newQuickDeduct: '',
      // 排序方式
      sortKey: localStorage.getItem('studentSortKey') || 'name_asc',
    };
  },
  computed: {
    sortOptions() {
      return [
        { key: 'name_asc',   label: '姓名 A→Z',  icon: '🔤' },
        { key: 'name_desc',  label: '姓名 Z→A',  icon: '🔠' },
        { key: 'points_asc', label: '积分 低→高', icon: '📈' },
        { key: 'points_desc',label: '积分 高→低', icon: '🏆' },
        { key: 'level_asc',  label: '等级 低→高', icon: '🐣' },
        { key: 'level_desc', label: '等级 高→低', icon: '🐉' },
      ];
    },
    students() {
      void this._rev;  // 依赖追踪，_rev 变化时强制重算
      const q = this.searchText.toLowerCase();
      const filtered = Store.state.students.filter(s =>
        s.name.includes(q) || s.username.toLowerCase().includes(q)
      );
      const key = this.sortKey;
      const sorted = [...filtered].sort((a, b) => {
        switch (key) {
          case 'name_asc':  return a.name.localeCompare(b.name, 'zh-Hans-CN');
          case 'name_desc': return b.name.localeCompare(a.name, 'zh-Hans-CN');
          case 'points_asc':  return (a.points||0) - (b.points||0);
          case 'points_desc': return (b.points||0) - (a.points||0);
          case 'level_asc':  return (a.petStage||0) - (b.petStage||0);
          case 'level_desc': return (b.petStage||0) - (a.petStage||0);
          default: return a.name.localeCompare(b.name, 'zh-Hans-CN');
        }
      });
      return sorted.map(s => ({
        ...s,
        petEmoji: getStudentPetEmoji(s),
        studentAvatar: s.avatar || null,
        petImage: s.petImage || null,
        levelInfo: getLevelInfo(s.petExp||0),
      }));
    },
  },
  async mounted() {
    // 加载自定义快捷积分
    this.customQuickPoints = await Store.getQuickPoints();
    // 自定义扣分存本地
    try {
      const d = localStorage.getItem('customQuickDeducts');
      if (d) this.customQuickDeducts = JSON.parse(d);
    } catch (e) {}
  },
  methods: {
    async addStudent() {
      const { name, username, class: cls } = this.newStudent;
      if (!name || !username) {
        this.$emit('toast', '请填写姓名和账号', 'warning'); return;
      }
      const result = await Store.addStudent({ name, username, class: cls });
      if (result.success) {
        this.$emit('toast', `✅ 学生 ${name} 添加成功`, 'success');
        this.showAddModal = false;
        this.newStudent = { name:'', username:'', class:'高一一班' };
        this._rev++;
      } else {
        this.$emit('toast', result.msg, 'error');
      }
    },
    openGrant(student) {
      this.grantStudent = student;
      this.grantPoints = 20;
      this.grantReason = '';
      this.showGrantModal = true;
    },
    // ---- 快捷加分管理 ----
    async addQuickPoint() {
      const val = parseInt(this.newQuickPoint);
      if (!val || val <= 0 || val > 9999) {
        this.$emit('toast', '请输入 1-9999 之间的正整数', 'warning'); return;
      }
      if (this.customQuickPoints.includes(val)) {
        this.$emit('toast', '该数值已存在', 'warning'); return;
      }
      this.customQuickPoints = [...this.customQuickPoints, val].sort((a, b) => a - b);
      this.newQuickPoint = '';
      this.showAddQuickModal = false;
      await Store.saveQuickPoints(this.customQuickPoints);
      this.$emit('toast', `✅ 已添加快捷加分 +${val}`, 'success');
    },
    async removeQuickPoint(val) {
      this.customQuickPoints = this.customQuickPoints.filter(v => v !== val);
      await Store.saveQuickPoints(this.customQuickPoints);
    },
    // ---- 快捷扣分管理 ----
    changeSort(key) {
      this.sortKey = key;
      localStorage.setItem('studentSortKey', key);
    },
    addQuickDeduct() {
      const val = parseInt(this.newQuickDeduct);
      if (!val || val <= 0 || val > 9999) {
        this.$emit('toast', '请输入 1-9999 之间的正整数', 'warning'); return;
      }
      if (this.customQuickDeducts.includes(val)) {
        this.$emit('toast', '该数值已存在', 'warning'); return;
      }
      this.customQuickDeducts = [...this.customQuickDeducts, val].sort((a, b) => a - b);
      this.newQuickDeduct = '';
      this.showAddQuickDeductModal = false;
      localStorage.setItem('customQuickDeducts', JSON.stringify(this.customQuickDeducts));
      this.$emit('toast', `✅ 已添加快捷扣分 -${val}`, 'success');
    },
    removeQuickDeduct(val) {
      this.customQuickDeducts = this.customQuickDeducts.filter(v => v !== val);
      localStorage.setItem('customQuickDeducts', JSON.stringify(this.customQuickDeducts));
    },
    async doGrant() {
      if (!this.grantPoints || this.grantPoints <= 0) {
        this.$emit('toast', '请输入有效积分数', 'warning'); return;
      }
      const result = await Store.grantPoints(this.grantStudent.id, Number(this.grantPoints), this.grantReason || `老师奖励了 ${this.grantPoints} 积分`);
      if (result.success) {
        this.$emit('toast', `✅ 已给 ${this.grantStudent.name} 发放 ${this.grantPoints} 积分`, 'success');
        this.showGrantModal = false;
        this._rev++;
      } else {
        this.$emit('toast', result.msg || '发放积分失败', 'error');
      }
    },
    openDeduct(student) {
      this.deductStudent = student;
      this.deductPoints = 10;
      this.deductReason = '';
      this.showDeductModal = true;
    },
    async doDeduct() {
      if (!this.deductPoints || this.deductPoints <= 0) {
        this.$emit('toast', '请输入有效扣分数', 'warning'); return;
      }
      const result = await Store.deductPoints(
        this.deductStudent.id,
        Number(this.deductPoints),
        this.deductReason || `课堂违规扣除 ${this.deductPoints} 积分`
      );
      if (result.success) {
        this.$emit('toast', `⚠️ 已扣除 ${this.deductStudent.name} ${result.deducted} 积分`, 'warning');
        this.showDeductModal = false;
        this._rev++;
      } else {
        this.$emit('toast', result.msg, 'error');
      }
    },
    confirmDelete(id) {
      this.deleteStudentId = id;
      this.showConfirmDelete = true;
    },
    // 点击学生卡片 → 显示确认框
    clickStudentCard(student) {
      if (this.openStudentConfirm && this.openStudentConfirm.id === student.id) {
        this.openStudentConfirm = null; // 再次点击同一学生关闭
      } else {
        this.openStudentConfirm = student;
      }
    },
    // 以该学生身份打开学生系统（本页切换，不新开标签页）
    openStudentSystem(student) {
      this.openStudentConfirm = null;
      this.$emit('view-as-student', student);
    },
    async doDelete() {
      const result = await Store.deleteStudent(this.deleteStudentId);
      if (result.success) {
        this.$emit('toast', '已删除该学生', 'success');
      } else {
        this.$emit('toast', '删除失败', 'error');
      }
      this.showConfirmDelete = false;
      this._rev++;
    },
    exportCSV() {
      const headers = ['姓名','账号','班级','积分','宠物','等级','加入日期'];
      const rows = Store.state.students.map(s => [
        s.name, s.username, '', s.points||0,
        s.petName||'-', getLevelInfo(s.petExp||0).name, s.joinDate||'-'
      ]);
      const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
      const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '班级学生名单.csv';
      a.click();
      this.$emit('toast', '📥 导出成功！', 'success');
    },
    triggerFileInput() {
      this.$refs.fileInput.click();
    },
    async handleFileImport(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target.result;
        const names = content.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);

        if (names.length === 0) {
          this.$emit('toast', '文件内容为空', 'warning');
          return;
        }

        try {
          for (const name of names) {
            // 自动生成账号（使用姓名的拼音或首字母）
            const username = name.toLowerCase().replace(/\s+/g, '');
            // 生成随机ID
            const id = Date.now() + Math.floor(Math.random() * 1000);
            // 自动为每个学生创建默认宠物"小火龙"
            const petName = `${name}的宠物`;
            
            // 添加学生
            const result = await Store.addStudent({
              name,
              username,
              class: '高一一班'
            });

            // 为学生创建默认宠物
            if (result.success && result.student) {
              await Store.adoptPet(result.student.id, 'dragon', petName);
            }
          }
          this.$emit('toast', `✅ 成功导入 ${names.length} 名学生`, 'success');
          this._rev++;
        } catch (error) {
          this.$emit('toast', '导入失败：' + error.message, 'error');
        }
      };
      reader.onerror = () => {
        this.$emit('toast', '文件读取失败', 'error');
      };
      reader.readAsText(file, 'utf-8');
      // 重置文件输入，以便可以重复选择同一个文件
      event.target.value = '';
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header">
        <div class="teacher-page-title">👨‍🎓 学生管理</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" @click="exportCSV">📥 导出</button>
          <button class="btn btn-ghost btn-sm" @click="triggerFileInput">📤 批量导入</button>
          <input type="file" ref="fileInput" style="display:none" accept=".txt" @change="handleFileImport" />
          <button class="btn btn-primary btn-sm" @click="showAddModal=true">➕ 添加</button>
        </div>
      </div>

      <!-- 搜索 -->
      <div style="position:relative;margin-bottom:12px;">
        <input class="input-field" v-model="searchText" placeholder="🔍 搜索姓名/账号..." style="padding-left:40px;" />
        <span style="position:absolute;left:14px;top:12px;font-size:16px;">🔍</span>
      </div>

      <!-- 排序选择器 -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
        <button v-for="opt in sortOptions" :key="opt.key" class="btn btn-sm"
                :class="sortKey===opt.key?'btn-primary':'btn-ghost'"
                @click="changeSort(opt.key)" style="font-size:12px;padding:4px 10px;">
          {{ opt.icon }} {{ opt.label }}
        </button>
      </div>

      <!-- 学生卡片列表（响应式多栏网格） -->
      <div class="teacher-student-grid">
        <div v-for="s in students" :key="s.id" class="card" style="padding:14px 16px;position:relative;">
          <!-- 头像+姓名+积分（点击区域） -->
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;cursor:pointer;"
               @click.stop="clickStudentCard(s)">
            <!-- 圆形头像，优先显示自定义头像/宠物图片，兜底显示 emoji -->
            <div style="width:50px;height:50px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#F8F0FF;display:flex;align-items:center;justify-content:center;">
              <img v-if="s.studentAvatar && s.studentAvatar.startsWith('data:')" :src="s.studentAvatar" style="width:100%;height:100%;object-fit:cover;" />
              <img v-else-if="s.petImage" :src="s.petImage" style="width:100%;height:100%;object-fit:cover;" />
              <span v-else style="font-size:36px;">{{ s.petEmoji }}</span>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:15px;font-weight:800;">{{ s.name }}</div>
              <div style="font-size:12px;color:var(--text-light);">{{ s.username }}</div>
              <div style="font-size:11px;color:var(--text-light);">加入 {{ s.joinDate }}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="color:var(--warning);font-weight:800;font-size:16px;">⭐{{ s.points||0 }}</div>
              <span v-if="s.petType" class="badge badge-success" style="font-size:11px;">Lv.{{ s.levelInfo.level }} {{ s.levelInfo.name }}</span>
              <span v-else class="badge badge-warning" style="font-size:11px;">未领宠物</span>
            </div>
          </div>

          <!-- 内联确认框（同级、不置顶、不模糊背景） -->
          <div v-if="openStudentConfirm && openStudentConfirm.id === s.id"
               style="background:#F8F0FF;border:1.5px solid var(--primary);border-radius:10px;padding:10px 14px;margin-bottom:10px;
                      display:flex;align-items:center;justify-content:space-between;gap:10px;animation:fadeIn 0.15s ease;">
            <div style="font-size:13px;color:var(--text-dark);font-weight:600;">
              打开 <span style="color:var(--primary);">{{ s.name }}</span> 的学生系统？
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:12px;" @click.stop="openStudentConfirm=null">否</button>
              <button class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:12px;" @click.stop="openStudentSystem(s)">是</button>
            </div>
          </div>

          <!-- 宠物名 + 操作按钮 -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div style="font-size:12px;color:var(--text-mid);">🐾 {{ s.petName || '未领取宠物' }}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              <button class="btn btn-warning btn-sm" @click.stop="openGrant(s)">⭐</button>
              <button class="btn btn-sm" style="background:#FF9800;color:white;border:none;" @click.stop="openDeduct(s)">⬇️</button>
              <button class="btn btn-danger btn-sm" @click.stop="confirmDelete(s.id)">🗑️</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 添加学生弹窗 -->
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal=false">
        <div class="modal-box">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:16px;">➕ 添加学生</h3>
          <div class="input-group">
            <label>姓名</label>
            <input class="input-field" v-model="newStudent.name" placeholder="学生真实姓名" />
          </div>
          <div class="input-group">
            <label>账号</label>
            <input class="input-field" v-model="newStudent.username" placeholder="登录账号" />
          </div>
          <div class="input-group">
            <label>班级</label>
            <input class="input-field" v-model="newStudent.class" placeholder="选填" style="display:none;" />
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showAddModal=false">取消</button>
            <button class="btn btn-primary" style="flex:2" @click="addStudent">✅ 添加</button>
          </div>
        </div>
      </div>

      <!-- 发分弹窗 -->
      <div v-if="showGrantModal && grantStudent" class="modal-overlay" @click.self="showGrantModal=false">
        <!-- 背景滚动大字 -->
        <div class="marquee-bg" :style="{'--marquee-duration': Math.max(6, 12 - grantStudent.name.length) + 's'}">
          <div class="marquee-track">
            <span class="marquee-text" v-for="i in 5" :key="'a'+i">{{ grantStudent.name }}</span>
            <span class="marquee-text" v-for="i in 5" :key="'b'+i">{{ grantStudent.name }}</span>
          </div>
        </div>
        <div class="modal-box" style="position:relative;z-index:2;">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:6px;">⭐ 发放积分</h3>
          <p style="color:var(--text-light);font-size:13px;margin-bottom:16px;">给 {{ grantStudent.name }} 发放积分奖励</p>
          <div class="input-group">
            <label>积分数量</label>
            <input class="input-field" type="number" v-model="grantPoints" min="1" max="500" />
          </div>
          <div class="input-group">
            <label>发放理由（可选）</label>
            <input class="input-field" v-model="grantReason" placeholder="例如：课堂表现优秀" />
          </div>
          <!-- 快捷积分（默认 + 自定义） -->
          <div style="margin-bottom:12px;">
            <div style="font-size:12px;color:var(--text-light);margin-bottom:6px;">快捷加分</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <button v-for="pts in [10,20,30,50,100]" :key="'d'+pts" class="btn btn-ghost btn-sm" @click="grantPoints=pts">+{{ pts }}</button>
              <button v-for="pts in customQuickPoints" :key="'c'+pts" class="btn btn-sm"
                      style="background:#EDE7F6;color:#7C4DFF;border:1px solid #7C4DFF;position:relative;padding-right:22px;"
                      @click="grantPoints=pts">
                +{{ pts }}
                <span style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;color:#aaa;cursor:pointer;"
                      @click.stop="removeQuickPoint(pts)" title="删除">✕</span>
              </button>
              <button class="btn btn-ghost btn-sm" style="color:#7C4DFF;border-color:#7C4DFF;font-weight:700;"
                      @click="showAddQuickModal=true" title="添加常用加分数目">＋添加</button>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showGrantModal=false">取消</button>
            <button class="btn btn-success" style="flex:2" @click="doGrant">✅ 发放 {{ grantPoints }} 积分</button>
          </div>
        </div>
      </div>

      <!-- 扣分弹窗 -->
      <div v-if="showDeductModal && deductStudent" class="modal-overlay" @click.self="showDeductModal=false">
        <!-- 背景滚动大字 -->
        <div class="marquee-bg" :style="{'--marquee-duration': Math.max(6, 12 - deductStudent.name.length) + 's'}">
          <div class="marquee-track">
            <span class="marquee-text" v-for="i in 5" :key="'a'+i">{{ deductStudent.name }}</span>
            <span class="marquee-text" v-for="i in 5" :key="'b'+i">{{ deductStudent.name }}</span>
          </div>
        </div>
        <div class="modal-box" style="position:relative;z-index:2;">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:6px;color:#FF9800;">⬇️ 扣除积分</h3>
          <p style="color:var(--text-light);font-size:13px;margin-bottom:16px;">
            对 <strong>{{ deductStudent.name }}</strong> 扣除积分（当前：⭐{{ deductStudent.points||0 }}）
          </p>
          <div class="input-group">
            <label>扣除数量</label>
            <input class="input-field" type="number" v-model="deductPoints" min="1" :max="deductStudent.points||0" />
          </div>
          <div class="input-group">
            <label>扣分原因（将通知学生）</label>
            <input class="input-field" v-model="deductReason" placeholder="例如：课堂违纪、作业未完成" />
          </div>
          <!-- 快捷扣分（默认 + 自定义） -->
          <div style="margin-bottom:16px;">
            <div style="font-size:12px;color:var(--text-light);margin-bottom:6px;">快捷扣分</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <button v-for="pts in [5,10,20,30,50]" :key="'d'+pts" class="btn btn-ghost btn-sm"
                      style="color:#FF9800;border-color:#FF9800;" @click="deductPoints=pts">-{{ pts }}</button>
              <button v-for="pts in customQuickDeducts" :key="'c'+pts" class="btn btn-sm"
                      style="background:#FFF3E0;color:#FF9800;border:1px solid #FF9800;position:relative;padding-right:22px;"
                      @click="deductPoints=pts">
                -{{ pts }}
                <span style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;color:#aaa;cursor:pointer;"
                      @click.stop="removeQuickDeduct(pts)" title="删除">✕</span>
              </button>
              <button class="btn btn-ghost btn-sm" style="color:#FF9800;border-color:#FF9800;font-weight:700;"
                      @click="showAddQuickDeductModal=true" title="添加常用扣分数目">＋添加</button>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showDeductModal=false">取消</button>
            <button class="btn btn-danger" style="flex:2;background:#FF9800;border-color:#FF9800;" @click="doDeduct">
              ⬇️ 确认扣除 {{ deductPoints }} 积分
            </button>
          </div>
        </div>
      </div>

      <!-- 删除确认 -->
      <div v-if="showConfirmDelete" class="modal-overlay" @click.self="showConfirmDelete=false">
        <div class="modal-box" style="text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
          <h3 style="font-size:18px;font-weight:800;margin-bottom:8px;">确认删除？</h3>
          <p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">删除后无法恢复，该学生的所有数据将被清除。</p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showConfirmDelete=false">取消</button>
            <button class="btn btn-danger" style="flex:1" @click="doDelete">确认删除</button>
          </div>
        </div>
      </div>

      <!-- 添加快捷加分弹窗 -->
      <div v-if="showAddQuickModal" class="modal-overlay" @click.self="showAddQuickModal=false">
        <div class="modal-box" style="max-width:320px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">⭐ 添加常用加分数目</h3>
          <div class="input-group">
            <label>加分数值（1-9999）</label>
            <input class="input-field" type="number" v-model="newQuickPoint" min="1" max="9999"
                   placeholder="例如：15" @keyup.enter="addQuickPoint" autofocus />
          </div>
          <div style="display:flex;gap:8px;margin-top:4px;">
            <button class="btn btn-ghost" style="flex:1" @click="showAddQuickModal=false;newQuickPoint=''">取消</button>
            <button class="btn btn-primary" style="flex:2" @click="addQuickPoint">✅ 添加</button>
          </div>
        </div>
      </div>

      <!-- 添加快捷扣分弹窗 -->
      <div v-if="showAddQuickDeductModal" class="modal-overlay" @click.self="showAddQuickDeductModal=false">
        <div class="modal-box" style="max-width:320px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;color:#FF9800;">⬇️ 添加常用扣分数目</h3>
          <div class="input-group">
            <label>扣分数值（1-9999）</label>
            <input class="input-field" type="number" v-model="newQuickDeduct" min="1" max="9999"
                   placeholder="例如：15" @keyup.enter="addQuickDeduct" autofocus />
          </div>
          <div style="display:flex;gap:8px;margin-top:4px;">
            <button class="btn btn-ghost" style="flex:1" @click="showAddQuickDeductModal=false;newQuickDeduct=''">取消</button>
            <button class="btn btn-danger" style="flex:2;background:#FF9800;border-color:#FF9800;" @click="addQuickDeduct">✅ 添加</button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 排行榜（教师视角） ----------
const TeacherRank = {
  name: 'TeacherRank',
  computed: {
    rankList() {
      return [...Store.state.students]
        .sort((a, b) => (b.points||0) - (a.points||0))
        .map((s, i) => ({
          ...s,
          rank: i + 1,
          petEmoji: getStudentPetEmoji(s),
          studentAvatar: s.avatar || null,  // 自定义头像
          petImage: s.petImage || null,     // 宠物图片
          levelInfo: getLevelInfo(s.petExp||0),
          mood: getStudentMood(s.petStatus),
        }));
    }
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-page-title" style="margin-bottom:20px;">🏆 班级排行榜</div>
      <div class="teacher-rank-grid">
        <div v-for="s in rankList" :key="s.id" class="card" style="padding:14px 16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <!-- 排名徽章 -->
            <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;"
                 :style="s.rank===1?'background:#FFD700;color:white':s.rank===2?'background:#C0C0C0;color:white':s.rank===3?'background:#CD7F32;color:white':'background:#F5F5F5;color:#666'">
              {{ s.rank <= 3 ? ['👑','🥈','🥉'][s.rank-1] : s.rank }}
            </div>
            <!-- 宠物头像（圆形） -->
            <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#F8F0FF;display:flex;align-items:center;justify-content:center;">
              <img v-if="s.studentAvatar && s.studentAvatar.startsWith('data:')" :src="s.studentAvatar" style="width:100%;height:100%;object-fit:cover;" />
              <img v-else-if="s.petImage" :src="s.petImage" style="width:100%;height:100%;object-fit:cover;" />
              <span v-else style="font-size:30px;">{{ s.petEmoji }}</span>
            </div>
            <!-- 信息区 -->
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:15px;font-weight:800;">{{ s.name }}</span>
                <span style="font-size:12px;color:var(--text-light);"></span>
                <span class="badge badge-success" style="font-size:11px;">Lv.{{ s.levelInfo.level }} {{ s.levelInfo.name }}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;margin-top:4px;flex-wrap:wrap;">
                <span style="font-size:12px;" :style="{color: s.petStatus?.health>=70?'#4CAF50':s.petStatus?.health>=40?'#FF9800':'#F44336'}">❤️ {{ s.petStatus?.health||0 }}</span>
                <span style="font-size:12px;color:#FF9800;">🍗 {{ s.petStatus?.hungry||0 }}</span>
                <span style="font-size:12px;">{{ s.mood.emoji }}</span>
                <span style="font-size:11px;color:var(--text-light);">{{ s.petExp||0 }} exp</span>
              </div>
            </div>
            <!-- 积分 -->
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:18px;font-weight:800;color:var(--warning);">⭐{{ s.points||0 }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 数据分析模块 ----------
const TeacherAnalytics = {
  name: 'TeacherAnalytics',
  emits: ['toast'],
  data() {
    return {
      activeTab: 'overview', // overview / students / subjects
      selectedStudent: null,
      dateRange: 'week', // week / month / semester
      showExportModal: false,
      exportFormat: 'csv', // csv / excel
      charts: {},
    };
  },
  mounted() {
    this.$nextTick(() => {
      this.initCharts();
    });
  },
  watch: {
    activeTab() {
      this.$nextTick(() => {
        this.initCharts();
      });
    },
  },
  methods: {
    initCharts() {
      this.destroyCharts();
      if (this.activeTab === 'overview') {
        this.initOverviewCharts();
      } else if (this.activeTab === 'students') {
        this.initStudentCharts();
      } else if (this.activeTab === 'subjects') {
        this.initSubjectCharts();
      }
    },
    destroyCharts() {
      Object.values(this.charts).forEach(chart => {
        if (chart) chart.destroy();
      });
      this.charts = {};
    },
    initOverviewCharts() {
      // 积分分布图表
      const pointsCtx = document.getElementById('pointsChart');
      if (pointsCtx) {
        const topStudents = this.studentPerformanceData.slice(0, 5);
        this.charts.points = new Chart(pointsCtx, {
          type: 'bar',
          data: {
            labels: topStudents.map(s => s.name),
            datasets: [{
              label: '积分',
              data: topStudents.map(s => s.points),
              backgroundColor: '#F59E0B',
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }
    },
    initStudentCharts() {
      const studentCtx = document.getElementById('studentPerformanceChart');
      if (studentCtx) {
        const topStudents = this.studentPerformanceData.slice(0, 5);
        this.charts.studentPerformance = new Chart(studentCtx, {
          type: 'radar',
          data: {
            labels: topStudents.map(s => s.name),
            datasets: [{
              label: '积分',
              data: topStudents.map(s => s.points),
              backgroundColor: 'rgba(124, 58, 237, 0.2)',
              borderColor: '#7C3AED',
              pointBackgroundColor: '#7C3AED'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        });
      }
    },
    initSubjectCharts() {
      const subjectCtx = document.getElementById('subjectDistributionChart');
      if (subjectCtx) {
        this.charts.subjectDistribution = new Chart(subjectCtx, {
          type: 'pie',
          data: {
            labels: this.subjectDistributionData.map(s => s.subject),
            datasets: [{
              data: this.subjectDistributionData.map(s => s.count),
              backgroundColor: [
                '#7C3AED', '#F59E0B', '#10B981', '#3B82F6',
                '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'
              ],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom'
              }
            }
          }
        });
      }
    },
    exportData() {
      if (this.exportFormat === 'csv') {
        this.exportCSV();
      } else {
        this.exportExcel();
      }
      this.showExportModal = false;
      this.$emit('toast', '📥 数据导出成功！', 'success');
    },
    exportCSV() {
      // 导出CSV格式数据
      const headers = ['姓名', '班级', '积分', '宠物等级'];
      const rows = this.studentPerformanceData.map(student => [
        student.name,
        student.class,
        student.points,
        student.petLevel,
      ]);
      
      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '学生学习数据.csv';
      a.click();
    },
    exportExcel() {
      // 简化实现，实际项目中可以使用更专业的库
      this.exportCSV();
    },
    viewStudentDetail(student) {
      this.selectedStudent = student;
    },
    getLevelInfo,
  },
  computed: {
    students() {
      return Store.state.students;
    },
    tasks() {
      return Store.state.tasks;
    },
    // 概览数据
    overviewData() {
      const totalStudents = this.students.length;
      const totalPoints = this.students.reduce((sum, student) => sum + (student.points || 0), 0);
      const avgPoints = totalStudents > 0 ? Math.round(totalPoints / totalStudents) : 0;
      
      return {
        totalStudents,
        totalPoints,
        avgPoints,
      };
    },
    // 学生表现数据
    studentPerformanceData() {
      return this.students.map(student => {
        const levelInfo = getLevelInfo(student.petExp || 0);
        return {
          id: student.id,
          name: student.name,
          class: student.class,
          points: student.points || 0,
          petLevel: levelInfo.level,
        };
      }).sort((a, b) => b.points - a.points);
    },
    // 学科分布数据
    subjectDistributionData() {
      const subjectStats = {};
      
      this.tasks.forEach(task => {
        if (!subjectStats[task.subject]) {
          subjectStats[task.subject] = {
            count: 0,
            totalPoints: 0,
            completedSubmissions: 0,
            totalSubmissions: 0,
          };
        }
        
        subjectStats[task.subject].count++;
        subjectStats[task.subject].totalPoints += task.points;
        
        task.submissions.forEach(sub => {
          subjectStats[task.subject].totalSubmissions++;
          if (sub.status === 'completed') {
            subjectStats[task.subject].completedSubmissions++;
          }
        });
      });
      
      return Object.entries(subjectStats).map(([subject, stats]) => ({
        subject,
        ...stats,
        completionRate: stats.totalSubmissions > 0 ? Math.round((stats.completedSubmissions / stats.totalSubmissions) * 100) : 0,
      }));
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header">
        <div class="teacher-page-title">📈 学生学习数据分析</div>
        <button class="btn btn-primary btn-sm" @click="showExportModal=true">📥 导出数据</button>
      </div>

      <!-- 标签页 -->
      <div style="display:flex;gap:8px;margin-bottom:20px;">
        <button class="btn btn-sm" :class="activeTab==='overview'?'btn-primary':'btn-ghost'" @click="activeTab='overview'">📊 概览</button>
        <button class="btn btn-sm" :class="activeTab==='students'?'btn-primary':'btn-ghost'" @click="activeTab='students'">👨‍🎓 学生表现</button>
        <button class="btn btn-sm" :class="activeTab==='subjects'?'btn-primary':'btn-ghost'" @click="activeTab='subjects'">📚 学科分布</button>
      </div>

      <!-- 概览页面 -->
      <div v-if="activeTab === 'overview'">
        <!-- 统计卡片 -->
        <div class="stat-cards">
          <div class="stat-card">
            <div class="stat-icon-box" style="background:#FFF0F8;">👨‍🎓</div>
            <div>
              <div class="stat-label">学生总数</div>
              <div class="stat-value">{{ overviewData.totalStudents }}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-box" style="background:#EDE7F6;">⭐</div>
            <div>
              <div class="stat-label">平均积分</div>
              <div class="stat-value">{{ overviewData.avgPoints }}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-box" style="background:#FFFDE7;">💰</div>
            <div>
              <div class="stat-label">班级总积分</div>
              <div class="stat-value">{{ overviewData.totalPoints }}</div>
            </div>
          </div>
        </div>

        <!-- 图表区域 -->
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <!-- 积分分布图表 -->
          <div class="card" style="padding:20px;flex:1;min-width:300px;">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:16px;">💰 积分分布</h3>
            <div style="height:250px;">
              <canvas id="pointsChart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- 学生表现页面 -->
      <div v-if="activeTab === 'students'">
        <div class="card" style="padding:20px;margin-bottom:20px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:16px;">👨‍🎓 学生学习表现</h3>
          <div style="height:300px;">
            <canvas id="studentPerformanceChart"></canvas>
          </div>
        </div>
        <div class="card" style="padding:20px;">
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:2px solid var(--border);">
                  <th style="padding:12px;text-align:left;">学生</th>
                  <th style="padding:12px;text-align:center;">班级</th>
                  <th style="padding:12px;text-align:center;">积分</th>
                  <th style="padding:12px;text-align:center;">宠物等级</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="student in studentPerformanceData" :key="student.id" style="border-bottom:1px solid var(--border);cursor:pointer;" @click="viewStudentDetail(student)">
                  <td style="padding:12px;">{{ student.name }}</td>
                  <td style="padding:12px;text-align:center;">{{ student.class }}</td>
                  <td style="padding:12px;text-align:center;">{{ student.points }}</td>
                  <td style="padding:12px;text-align:center;">Lv.{{ student.petLevel }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 学科分布页面 -->
      <div v-if="activeTab === 'subjects'">
        <div class="card" style="padding:20px;margin-bottom:20px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:16px;">📚 学科任务分布</h3>
          <div style="height:300px;">
            <canvas id="subjectDistributionChart"></canvas>
          </div>
        </div>
        <div class="card" style="padding:20px;">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div v-for="item in subjectDistributionData" :key="item.subject" style="display:flex;align-items:center;gap:16px;">
              <div style="width:100px;font-weight:700;">{{ item.subject }}</div>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-bottom:4px;">
                  <span>任务数: {{ item.count }}</span>
                  <span>总积分: {{ item.totalPoints }}</span>
                </div>
                <div class="progress-bar" style="height:12px;">
                  <div class="progress-fill" style="background:var(--primary);" :style="{width: item.completionRate + '%'}"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-top:4px;">
                  <span>完成: {{ item.completedSubmissions }}/{{ item.totalSubmissions }}</span>
                  <span>完成率: {{ item.completionRate }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 导出数据弹窗 -->
      <div v-if="showExportModal" class="modal-overlay" @click.self="showExportModal=false">
        <div class="modal-box">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:16px;">📥 导出数据</h3>
          <div class="input-group">
            <label>导出格式</label>
            <select class="input-field" v-model="exportFormat">
              <option value="csv">CSV格式</option>
              <option value="excel">Excel格式</option>
            </select>
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button class="btn btn-ghost" style="flex:1" @click="showExportModal=false">取消</button>
            <button class="btn btn-primary" style="flex:2" @click="exportData">确认导出</button>
          </div>
        </div>
      </div>

      <!-- 学生详情弹窗 -->
      <div v-if="selectedStudent" class="modal-overlay" @click.self="selectedStudent=null">
        <div class="modal-box" style="max-width:400px;">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:16px;">{{ selectedStudent.name }} 的详细数据</h3>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-light);">积分:</span>
              <span style="font-weight:700;color:var(--warning);">⭐{{ selectedStudent.points || 0 }}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-light);">宠物等级:</span>
              <span>{{ getLevelInfo(selectedStudent.petExp || 0).level }}级</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-light);">宠物状态:</span>
              <span>{{ selectedStudent.petDead ? '已死亡' : '正常' }}</span>
            </div>
          </div>
          <button class="btn btn-ghost" style="width:100%;margin-top:20px;" @click="selectedStudent=null">关闭</button>
        </div>
      </div>
    </div>
  `,
};

// ---------- 系统设置 ----------
const TeacherSettings = {
  name: 'TeacherSettings',
  props: ['user'],
  emits: ['toast'],
  data() {
    return {
      confirmReset: false,
      confirmImport: false,
      activeTab: 'rules', // rules / class / growth / about
      // 班级名称
      className: '',
      // 积分规则配置
      pointRules: {
        homework: 45,      // 完成作业
        classAnswer: 20,   // 课堂回答
        reading: 30,       // 阅读打卡
        creative: 50,      // 创意作品
        attendance: 10,    // 考勤
        behavior: 15,      // 行为表现
      },
      // 宠物成长规则配置
      growthRules: {
        expMultiplier: 0.5, // 积分转经验倍率
        dailyExpLimit: 50,  // 每日经验上限
        growthStages: [
          { level:  0, name: '小幼宠',  minExp: 0,     maxExp: 100   },
          { level:  1, name: '幼宠',    minExp: 100,   maxExp: 300   },
          { level:  2, name: '活泼期',  minExp: 300,   maxExp: 600   },
          { level:  3, name: '成长期',  minExp: 600,   maxExp: 1000  },
          { level:  4, name: '少年宠',  minExp: 1000,  maxExp: 1500  },
          { level:  5, name: '青春期',  minExp: 1500,  maxExp: 2200  },
          { level:  6, name: '亚成体',  minExp: 2200,  maxExp: 3100  },
          { level:  7, name: '成长宠',  minExp: 3100,  maxExp: 4200  },
          { level:  8, name: '壮年宠',  minExp: 4200,  maxExp: 5600  },
          { level:  9, name: '熟练宠',  minExp: 5600,  maxExp: 7200  },
          { level: 10, name: '精英宠',  minExp: 7200,  maxExp: 9000  },
          { level: 11, name: '强化宠',  minExp: 9000,  maxExp: 11200 },
          { level: 12, name: '进化宠',  minExp: 11200, maxExp: 13700 },
          { level: 13, name: '超进化',  minExp: 13700, maxExp: 16500 },
          { level: 14, name: '稀有宠',  minExp: 16500, maxExp: 20000 },
          { level: 15, name: '史诗宠',  minExp: 20000, maxExp: 24000 },
          { level: 16, name: '传奇宠',  minExp: 24000, maxExp: 28500 },
          { level: 17, name: '神话宠',  minExp: 28500, maxExp: 33500 },
          { level: 18, name: '✨传说✨', minExp: 33500, maxExp: 39000 },
          { level: 19, name: '巅峰宠',  minExp: 39000, maxExp: 99999 },
        ],
      },
      showSaveConfirm: false,
      // 宠物经验控制面板
      petExpControl: {
        baseExp: 50,          // 基础经验值
        topMultiplier: 2.0,   // 第1名加成倍率
        bottomMultiplier: 0.5, // 末名加成倍率
        moodLink: true,       // 心情联动开关
      },
      expPreview: [],         // 预览结果
      showExpPreview: false,  // 是否显示预览
      granting: false,        // 发放中
    };
  },
  created() {
      // 从 localStorage 读取已保存的班级名
    this.className = '未分班';
  },
  methods: {
    saveClassName() {
      const name = (this.className || '').trim();
      if (!name) {
        this.$emit('toast', '请输入班级名称', 'warning');
        return;
      }
      localStorage.setItem('className', name);
      // 同步更新当前 user 对象（影响顶部导航显示）
      if (this.user) this.user.class = name;
      this.$emit('toast', `✅ 班级名称已保存为「${name}」`, 'success');
    },
    resetDemo() {
      Store.resetDemo();
      this.$emit('toast', '✅ 演示数据已重置！', 'success');
      this.confirmReset = false;
    },
    saveRules() {
      // 这里可以实现保存规则到后端或localStorage
      this.showSaveConfirm = false;
      this.$emit('toast', '✅ 规则保存成功！', 'success');
    },
    validateRules() {
      // 简单的规则验证
      for (const key in this.pointRules) {
        if (this.pointRules[key] < 0) {
          this.$emit('toast', '积分规则不能为负数', 'error');
          return false;
        }
      }
      if (this.growthRules.expMultiplier < 0) {
        this.$emit('toast', '经验倍率不能为负数', 'error');
        return false;
      }
      if (this.growthRules.dailyExpLimit < 0) {
        this.$emit('toast', '每日经验上限不能为负数', 'error');
        return false;
      }
      return true;
    },
    confirmSave() {
      if (this.validateRules()) {
        this.showSaveConfirm = true;
      }
    },
    // ---- 宠物经验控制面板 ----
    previewExpGrant() {
      const students = (Store.state.students || []).filter(s => !s.petDead);
      if (students.length === 0) {
        this.$emit('toast', '没有可发放经验的学生', 'warning');
        return;
      }
      const { baseExp, topMultiplier, bottomMultiplier } = this.petExpControl;
      const ranked = [...students].sort((a, b) => (b.points || 0) - (a.points || 0));
      const total = ranked.length;
      this.expPreview = ranked.map((s, i) => {
        const ratio = total === 1 ? topMultiplier :
          bottomMultiplier + (topMultiplier - bottomMultiplier) * ((total - 1 - i) / (total - 1));
        const exp = Math.round(baseExp * ratio);
        return {
          id: s.id,
          name: s.name,
          points: s.points || 0,
          rank: i + 1,
          ratio: ratio.toFixed(2),
          exp,
          currentExp: s.petExp || 0,
        };
      });
      this.showExpPreview = true;
    },
    async doGrantExp() {
      if (this.granting) return;
      this.granting = true;
      const result = await Store.batchGrantPetExp(this.petExpControl);
      this.granting = false;
      if (result.success) {
        this.$emit('toast', `✅ 已为 ${result.total} 名学生发放宠物经验`, 'success');
        this.showExpPreview = false;
        this.expPreview = [];
      } else {
        this.$emit('toast', result.msg || '发放失败', 'error');
      }
    },
    doExportJSON() {
      Store.exportJSON();
    },
    async doImportJSON(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      e.target.value = '';
      if (!confirm('⚠️ 导入将覆盖当前所有数据，是否继续？')) return;
      const ok = await Store.importJSON(file);
      if (ok) this.$emit('toast', '✅ 数据导入成功，已恢复！', 'success');
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="teacher-header">
        <div class="teacher-page-title">⚙️ 系统设置</div>
        <button v-if="activeTab !== 'about'" class="btn btn-primary btn-sm" @click="confirmSave">💾 保存设置</button>
      </div>

        <!-- 标签页 -->
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
        <button class="btn btn-sm" :class="activeTab==='rules'?'btn-primary':'btn-ghost'" @click="activeTab='rules'">⭐ 积分规则</button>
        <button class="btn btn-sm" :class="activeTab==='growth'?'btn-primary':'btn-ghost'" @click="activeTab='growth'">🐾 成长规则</button>
        <button class="btn btn-sm" :class="activeTab==='about'?'btn-primary':'btn-ghost'" @click="activeTab='about'">ℹ️ 关于系统</button>
      </div>

      <!-- 积分规则配置 -->
      <div v-if="activeTab === 'rules'" class="settings-content">
        <div class="card" style="padding:20px;margin-bottom:20px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:16px;">⭐ 积分规则配置</h3>
          <p style="font-size:13px;color:var(--text-light);margin-bottom:20px;">设置不同行为对应的积分值，鼓励学生积极参与课堂活动</p>
          
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div class="input-group">
              <label>📐 完成作业</label>
              <input class="input-field" type="number" v-model.number="pointRules.homework" min="0" max="100" />
              <span style="font-size:12px;color:var(--text-light);">积分</span>
            </div>
            
            <div class="input-group">
              <label>🙋 课堂回答</label>
              <input class="input-field" type="number" v-model.number="pointRules.classAnswer" min="0" max="50" />
              <span style="font-size:12px;color:var(--text-light);">积分</span>
            </div>
            
            <div class="input-group">
              <label>📖 阅读打卡</label>
              <input class="input-field" type="number" v-model.number="pointRules.reading" min="0" max="60" />
              <span style="font-size:12px;color:var(--text-light);">积分</span>
            </div>
            
            <div class="input-group">
              <label>🎨 创意作品</label>
              <input class="input-field" type="number" v-model.number="pointRules.creative" min="0" max="80" />
              <span style="font-size:12px;color:var(--text-light);">积分</span>
            </div>
            
            <div class="input-group">
              <label>📋 考勤</label>
              <input class="input-field" type="number" v-model.number="pointRules.attendance" min="0" max="30" />
              <span style="font-size:12px;color:var(--text-light);">积分</span>
            </div>
            
            <div class="input-group">
              <label>✨ 行为表现</label>
              <input class="input-field" type="number" v-model.number="pointRules.behavior" min="0" max="40" />
              <span style="font-size:12px;color:var(--text-light);">积分</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 宠物成长规则配置 -->
      <div v-if="activeTab === 'growth'" class="settings-content">
        <div class="card" style="padding:20px;margin-bottom:20px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:16px;">🐾 宠物成长规则配置</h3>
          <p style="font-size:13px;color:var(--text-light);margin-bottom:20px;">调整宠物成长速度、等级提升条件等参数</p>

          <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:24px;">
            <div class="input-group">
              <label>💫 积分转经验倍率</label>
              <input class="input-field" type="number" v-model.number="growthRules.expMultiplier" min="0" max="2" step="0.1" />
              <span style="font-size:12px;color:var(--text-light);">倍</span>
            </div>

            <div class="input-group">
              <label>📈 每日经验上限</label>
              <input class="input-field" type="number" v-model.number="growthRules.dailyExpLimit" min="0" max="200" />
              <span style="font-size:12px;color:var(--text-light);">点</span>
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <h4 style="font-size:14px;font-weight:800;margin-bottom:12px;">成长阶段设置</h4>
            <p style="font-size:12px;color:var(--text-light);margin-bottom:12px;">调整各等级所需经验值（注：高级别经验值必须大于低级别）</p>

            <div style="max-height:300px;overflow-y:auto;">
              <div v-for="(stage, index) in growthRules.growthStages" :key="stage.level" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
                <div style="width:70px;font-size:13px;font-weight:700;flex-shrink:0;">{{ stage.name }}</div>
                <div style="width:90px;flex-shrink:0;">
                  <input type="number" v-model.number="stage.minExp" min="0" style="width:100%;padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;outline:none;background:#FAFAFA;" />
                </div>
                <div style="width:16px;text-align:center;flex-shrink:0;">~</div>
                <div style="width:90px;flex-shrink:0;">
                  <input type="number" v-model.number="stage.maxExp" min="0" style="width:100%;padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;outline:none;background:#FAFAFA;" />
                </div>
                <div style="font-size:12px;color:var(--text-light);">经验</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 宠物经验批量发放控制面板 -->
        <div class="card" style="padding:20px;margin-bottom:20px;">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:16px;">🎯 宠物经验批量发放</h3>
          <p style="font-size:13px;color:var(--text-light);margin-bottom:20px;">基于积分排名为学生宠物发放经验，积分排名越高获得经验越多，宠物心情也会相应变化</p>

          <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px;">
            <div class="input-group">
              <label>⭐ 基础经验值</label>
              <input class="input-field" type="number" v-model.number="petExpControl.baseExp" min="1" max="500" />
              <span style="font-size:12px;color:var(--text-light);">点</span>
            </div>

            <div class="input-group">
              <label>🥇 第1名加成倍率</label>
              <input class="input-field" type="number" v-model.number="petExpControl.topMultiplier" min="0.5" max="5" step="0.1" />
              <span style="font-size:12px;color:var(--text-light);">倍</span>
            </div>

            <div class="input-group">
              <label>🥉 末名加成倍率</label>
              <input class="input-field" type="number" v-model.number="petExpControl.bottomMultiplier" min="0.1" max="3" step="0.1" />
              <span style="font-size:12px;color:var(--text-light);">倍</span>
            </div>

            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;">
              <label style="font-size:14px;font-weight:600;">🎭 心情联动</label>
              <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
                <input type="checkbox" v-model="petExpControl.moodLink" style="opacity:0;width:0;height:0;" />
                <span style="position:absolute;inset:0;background:var(--border);border-radius:24px;transition:0.3s;" :style="petExpControl.moodLink ? 'background:var(--primary)' : ''"></span>
                <span style="position:absolute;left:3px;top:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:0.3s;" :style="petExpControl.moodLink ? 'transform:translateX(20px)' : ''"></span>
              </label>
              <span style="font-size:12px;color:var(--text-light);">积分排名影响宠物心情值（前30%↑ / 后30%↓）</span>
            </div>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-ghost" @click="previewExpGrant">👁️ 预览分配</button>
            <button class="btn btn-primary" @click="doGrantExp" :disabled="granting">{{ granting ? '发放中...' : '🚀 一键发放' }}</button>
          </div>

          <!-- 经验分配预览 -->
          <div v-if="showExpPreview && expPreview.length" style="margin-top:20px;">
            <h4 style="font-size:14px;font-weight:800;margin-bottom:10px;">📊 经验分配预览</h4>
            <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="background:var(--bg);position:sticky;top:0;">
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">排名</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">姓名</th>
                    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);">积分</th>
                    <th style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--border);">倍率</th>
                    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);">获得经验</th>
                    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border);">当前经验</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in expPreview" :key="item.id" style="border-bottom:1px solid var(--border);">
                    <td style="padding:6px 10px;">{{ item.rank <= 3 ? ['🥇','🥈','🥉'][item.rank-1] : item.rank }}</td>
                    <td style="padding:6px 10px;font-weight:600;">{{ item.name }}</td>
                    <td style="padding:6px 10px;text-align:right;">{{ item.points }}</td>
                    <td style="padding:6px 10px;text-align:center;">×{{ item.ratio }}</td>
                    <td style="padding:6px 10px;text-align:right;color:var(--success);font-weight:700;">+{{ item.exp }}</td>
                    <td style="padding:6px 10px;text-align:right;color:var(--text-light);">{{ item.currentExp }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- 关于系统 -->
      <div v-if="activeTab === 'about'" class="settings-content">
        <div class="settings-grid">
          <!-- 关于系统 -->
          <div class="card" style="padding:20px;">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">ℹ️ 关于系统</h3>
            <div style="font-size:13px;color:var(--text-mid);line-height:2;">
              <div>系统名称：课堂电子宠物</div>
              <div>版本：v1.0.0</div>
              <div>适用：高中课堂游戏化</div>
              <div>支持：PC + 手机 + 教室投影</div>
            </div>
          </div>

          <!-- 数据备份与恢复 -->
          <div class="card" style="padding:20px;">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">📦 数据备份 / 恢复</h3>
            <p style="font-size:13px;color:var(--text-light);margin-bottom:14px;">导出完整数据（含学生+任务）为 JSON 文件，可在其他设备或浏览器导入恢复。</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" @click="doExportJSON">📤 导出备份</button>
              <button class="btn btn-ghost btn-sm" @click="$refs.importJsonInput.click()">📥 导入恢复</button>
            </div>
            <input type="file" ref="importJsonInput" accept=".json" style="display:none" @change="doImportJSON" />
            <p style="font-size:12px;color:var(--warning);margin-top:10px;">⚠️ 导入会覆盖当前所有数据，请谨慎操作。</p>
          </div>

          <!-- 演示数据重置 -->
          <div class="card" style="padding:20px;">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">🔄 演示管理</h3>
            <p style="font-size:13px;color:var(--text-light);margin-bottom:14px;">重置所有学生数据到初始演示状态</p>
            <button class="btn btn-danger" @click="confirmReset=true">🔄 重置演示数据</button>
          </div>
        </div>
      </div>

      <!-- 确认重置 -->
      <div v-if="confirmReset" class="modal-overlay" @click.self="confirmReset=false">
        <div class="modal-box" style="text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
          <h3 style="font-size:18px;font-weight:800;margin-bottom:8px;">确认重置？</h3>
          <p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">这将把所有学生数据恢复到演示初始状态。</p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="confirmReset=false">取消</button>
            <button class="btn btn-danger" style="flex:1" @click="resetDemo">确认重置</button>
          </div>
        </div>
      </div>

      <!-- 确认保存 -->
      <div v-if="showSaveConfirm" class="modal-overlay" @click.self="showSaveConfirm=false">
        <div class="modal-box" style="text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">💾</div>
          <h3 style="font-size:18px;font-weight:800;margin-bottom:8px;">确认保存规则？</h3>
          <p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">保存后新规则将立即生效。</p>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showSaveConfirm=false">取消</button>
            <button class="btn btn-success" style="flex:1" @click="saveRules">确认保存</button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 教师总容器 ----------
const TeacherApp = {
  name: 'TeacherApp',
  props: ['user'],
  emits: ['logout', 'view-as-student'],
  data() {
    return {
      currentSection: 'dashboard',
      showAvatarMenu: false,
      // 注意：_pollTimer 和 _pendingCount 不放 data()，直接挂实例，避免 Vue Proxy 包裹导致 clearInterval 失效
    };
  },
  computed: {
    navItems() {
      return [
        { key: 'dashboard', icon: '📊', label: '总览'   },
        { key: 'students',  icon: '👨‍🎓', label: '学生管理' },
        { key: 'analytics', icon: '📈', label: '数据分析' },
        { key: 'rank',      icon: '🏆', label: '排行榜' },
        { key: 'settings',  icon: '⚙️', label: '系统设置' },
      ];
    },
    teacherAvatar() {
      return (this.user && this.user.name && this.user.name[0]) || '👩‍🏫';
    },
  },
  mounted() {
    // 直接挂在实例上（不走 Vue 响应式），避免 Proxy 包裹导致 clearInterval 失效
    this.$_pollTimer = setInterval(async () => {
      await Store.refreshStudents();
    }, 10000);

    // 每日自动发放宠物经验（基于积分排名，每天一次）
    this._autoDailyExpGrant();
  },
  beforeUnmount() {
    if (this.$_pollTimer) clearInterval(this.$_pollTimer);
  },
  methods: {
    onToast(msg, type) { Store.toast(msg, type); },
    doLogout() {
      if (this.$_pollTimer) clearInterval(this.$_pollTimer);
      Store.logout();
      this.$emit('logout');
    },
    navTo(key) { this.currentSection = key; this.showAvatarMenu = false; },

    // 每日自动发放宠物经验（基于积分排名，一天一次，日期存云端）
    async _autoDailyExpGrant() {
      try {
        const today = new Date().toLocaleDateString('zh-CN');
        const lastDate = await Store.getDailyGrantDate();
        if (lastDate === today) return; // 今天已发放过

        // 确保学生数据已初始化
        if (Store.state.students.length === 0) return;

        const result = await Store.batchGrantPetExp({
          baseExp: 50,
          topMultiplier: 2.0,
          bottomMultiplier: 0.5,
          moodLink: true,
        });

        if (result.success && result.results) {
          await Store.setDailyGrantDate(today);
          const levelUps = result.results.filter(r => r.levelUp).length;
          let msg = `🐾 每日经验已自动发放！${result.results.length} 位学生`;
          if (levelUps > 0) msg += `，${levelUps} 只宠物升级了 🎉`;
          Store.toast(msg, 'success');
          console.log('[TeacherApp] 每日自动经验发放完成，升级数:', levelUps);
        }
      } catch (e) {
        console.warn('[TeacherApp] 每日自动经验发放失败:', e.message);
      }
    },
  },
  template: `
    <div style="min-height:100vh;background:#F8F0FF;" @click="showAvatarMenu=false">

      <!-- 顶部导航栏（与学生端同款） -->
      <div class="topbar">
        <div class="topbar-logo">
          <span class="logo-icon">🐾</span>
          <span>课堂宠物</span>
        </div>
        <div class="topbar-right">
          <!-- 头像 + 下拉菜单 -->
          <div style="position:relative;" @click.stop="showAvatarMenu=false">
            <div class="topbar-avatar" @click.stop="showAvatarMenu=true"
                 :style="showAvatarMenu ? 'box-shadow:0 0 0 3px var(--primary);' : ''">
              {{ teacherAvatar }}
            </div>
            <transition name="fade">
              <div v-if="showAvatarMenu" class="avatar-dropdown">
                <div class="avatar-menu-header">
                  <div style="font-size:28px;font-weight:900;color:var(--secondary);">
                    {{ teacherAvatar }}
                  </div>
                  <div>
                    <div style="font-size:14px;font-weight:800;color:var(--text-dark);">{{ user && user.name }}</div>
                    <div style="font-size:12px;color:var(--text-light);">{{ user && user.class }} · 教师</div>
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

      <!-- 主内容 -->
      <div class="main-content">
        <teacher-dashboard v-if="currentSection==='dashboard'" :teacher="user" @toast="onToast"></teacher-dashboard>
        <teacher-students  v-if="currentSection==='students'"  @toast="onToast" @view-as-student="s => $emit('view-as-student', s)"></teacher-students>
        <teacher-analytics v-if="currentSection==='analytics'" @toast="onToast"></teacher-analytics>
        <teacher-rank      v-if="currentSection==='rank'"></teacher-rank>
        <teacher-settings  v-if="currentSection==='settings'"  :user="user" @toast="onToast"></teacher-settings>
      </div>

      <!-- 底部导航栏（与学生端同款） -->
      <div class="bottom-nav">
        <div v-for="item in navItems" :key="item.key" class="nav-item"
             :class="{active: currentSection===item.key}"
             @click="navTo(item.key)">
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </div>
      </div>

    </div>
  `,
  components: {
    TeacherDashboard, TeacherStudents, TeacherAnalytics, TeacherRank, TeacherSettings,
    'teacher-dashboard': TeacherDashboard,
    'teacher-students':  TeacherStudents,
    'teacher-analytics': TeacherAnalytics,
    'teacher-rank':      TeacherRank,
    'teacher-settings':  TeacherSettings,
  }
};
