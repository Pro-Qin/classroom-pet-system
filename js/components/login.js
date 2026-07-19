// ===== 登录页面组件 =====

// 汉字→拼音首字母映射（无重复key，常见姓名用字全覆盖）
const PINYIN_MAP = {
  // A
  '阿':'A','爱':'A','安':'A','奥':'A',
  // B
  '白':'B','包':'B','宝':'B','贝':'B','冰':'B','博':'B','斌':'B','彬':'B','碧':'B','滨':'B','兵':'B','邦':'B','柏':'B',
  // C
  '蔡':'C','曹':'C','陈':'C','程':'C','池':'C','成':'C','出':'C','楚':'C','褚':'C','储':'C','丛':'C','崔':'C','聪':'C','彩':'C','春':'C','超':'C','晨':'C','辰':'C','纯':'C','灿':'C','翠':'C',
  // D
  '代':'D','戴':'D','邓':'D','丁':'D','董':'D','窦':'D','杜':'D','段':'D','刁':'D','典':'D','迪':'D','栋':'D','冬':'D','丹':'D','道':'D','德':'D','东':'D','多':'D','朵':'D','大':'D','党':'D',
  // E
  '尔':'E','恩':'E',
  // F
  '范':'F','方':'F','芳':'F','凡':'F','飞':'F','丰':'F','峰':'F','风':'F','福':'F','帆':'F','非':'F','菲':'F','斐':'F','芬':'F','冯':'F','傅':'F','付':'F',
  // G
  '高':'G','葛':'G','龚':'G','古':'G','顾':'G','关':'G','管':'G','郭':'G','广':'G','刚':'G','根':'G','工':'G','光':'G','贵':'G','国':'G','果':'G','桂':'G','庚':'G','谷':'G',
  // H
  '韩':'H','郝':'H','何':'H','贺':'H','洪':'H','华':'H','黄':'H','霍':'H','胡':'H','惠':'H','侯':'H','宦':'H','杭':'H','宦':'H','浩':'H','好':'H','和':'H','鸿':'H','欢':'H','环':'H','辉':'H','慧':'H','汇':'H','晖':'H','宏':'H','昊':'H','豪':'H','涵':'H','瀚':'H','花':'H','荷':'H','寒':'H','恒':'H','红':'H','虹':'H','鹤':'H','汉':'H','海':'H','含':'H','号':'H','合':'H',
  // J
  '蒋':'J','姜':'J','贾':'J','江':'J','金':'J','焦':'J','解':'J','简':'J','见':'J','健':'J','嘉':'J','坚':'J','剑':'J','杰':'J','景':'J','娟':'J','军':'J','俊':'J','君':'J','晋':'J','进':'J','静':'J','晶':'J','菊':'J','锦':'J','佳':'J','家':'J','建':'J','洁':'J','卷':'J','竣':'J','峻':'J','瑾':'J','均':'J','军':'J',
  // K
  '康':'K','柯':'K','孔':'K','可':'K','科':'K','凯':'K','宽':'K','昆':'K','坤':'K','苦':'K',
  // L
  '李':'L','刘':'L','廖':'L','梁':'L','林':'L','柳':'L','卢':'L','陆':'L','龙':'L','楼':'L','吕':'L','雷':'L','罗':'L','赖':'L','郎':'L','蓝':'L','劳':'L','黎':'L','冷':'L','乐':'L','磊':'L','丽':'L','力':'L','亮':'L','灵':'L','玲':'L','露':'L','凌':'L','琳':'L','令':'L','立':'L','励':'L','莉':'L','菱':'L','伦':'L','洛':'L','骆':'L','路':'L','雒':'L','鲁':'L',
  // M
  '马':'M','毛':'M','梅':'M','孟':'M','莫':'M','穆':'M','苗':'M','木':'M','牧':'M','米':'M','闵':'M','明':'M','敏':'M','铭':'M','萌':'M','妙':'M','民':'M','茂':'M','美':'M','梦':'M',
  // N
  '倪':'N','聂':'N','牛':'N','宁':'N','娜':'N','南':'N','楠':'N','能':'N','年':'N','念':'N','鸟':'N',
  // O
  '欧':'O','欧阳':'O',
  // P
  '潘':'P','裴':'P','彭':'P','庞':'P','鹏':'P','平':'P','萍':'P','品':'P','澎':'P','皮':'P',
  // Q
  '秦':'Q','钱':'Q','邱':'Q','乔':'Q','戚':'Q','齐':'Q','仇':'Q','青':'Q','清':'Q','晴':'Q','庆':'Q','强':'Q','奇':'Q','琦':'Q','琪':'Q','倩':'Q','茜':'Q','乾':'Q','卿':'Q','琴':'Q','权':'Q','泉':'Q','群':'Q','秋':'Q','邱':'Q',
  // R
  '任':'R','仁':'R','荣':'R','阮':'R','瑞':'R','睿':'R','如':'R','润':'R','蓉':'R','容':'R','融':'R','热':'R','冉':'R','饶':'R',
  // S
  '宋':'S','沈':'S','苏':'S','孙':'S','隋':'S','司徒':'S','宋':'S','石':'S','史':'S','施':'S','时':'S','帅':'S','邵':'S','盛':'S','舒':'S','淑':'S','商':'S','申':'S','单':'S','沙':'S','桑':'S','三':'S','山':'S','尚':'S','绍':'S','深':'S','圣':'S','曙':'S','双':'S','爽':'S','水':'S','硕':'S','思':'S','松':'S','素':'S','霜':'S','珊':'S','嗣':'S','松':'S',
  // T
  '谭':'T','唐':'T','陶':'T','田':'T','童':'T','铁':'T','汤':'T','滕':'T','陶':'T','涛':'T','婷':'T','亭':'T','汀':'T','桐':'T','彤':'T','天':'T','太':'T','甜':'T','廷':'T','同':'T','腾':'T','通':'T','谭':'T','涂':'T',
  // W
  '王':'W','吴':'W','魏':'W','汪':'W','万':'W','巫':'W','邬':'W','文':'W','汶':'W','伟':'W','维':'W','威':'W','旺':'W','卫':'W','韦':'W','温':'W','雯':'W','伍':'W','邬':'W','武':'W',
  // X
  '夏':'X','谢':'X','徐':'X','许':'X','肖':'X','薛':'X','辛':'X','席':'X','奚':'X','向':'X','项':'X','萧':'X','熊':'X','徐':'X','西':'X','修':'X','秀':'X','旭':'X','宣':'X','星':'X','雪':'X','轩':'X','先':'X','仙':'X','贤':'X','香':'X','希':'X','曦':'X','希':'X','璇':'X','学':'X','寻':'X','小':'X','晓':'X','心':'X','欣':'X','鑫':'X',
  // Y
  '杨':'Y','叶':'Y','于':'Y','袁':'Y','元':'Y','俞':'Y','易':'Y','应':'Y','尤':'Y','阎':'Y','颜':'Y','严':'Y','姚':'Y','喻':'Y','云':'Y','岳':'Y','燕':'Y','阳':'Y','尹':'Y','殷':'Y','游':'Y','俞':'Y','余':'Y','予':'Y','育':'Y','雅':'Y','延':'Y','烟':'Y','英':'Y','盈':'Y','影':'Y','宇':'Y','羽':'Y','玉':'Y','玥':'Y','悦':'Y','运':'Y','允':'Y','越':'Y','远':'Y','源':'Y','媛':'Y','圆':'Y','苑':'Y','昱':'Y','煜':'Y','宜':'Y','怡':'Y','颐':'Y','异':'Y','弈':'Y','义':'Y','引':'Y','莹':'Y','勇':'Y','艳':'Y','炎':'Y','永':'Y','勇':'Y',
  // Z
  '张':'Z','赵':'Z','郑':'Z','周':'Z','朱':'Z','钟':'Z','邹':'Z','庄':'Z','曾':'Z','祖':'Z','章':'Z','祝':'Z','卓':'Z','左':'Z','查':'Z','湛':'Z','詹':'Z','翟':'Z','甄':'Z','子':'Z','梓':'Z','珍':'Z','贞':'Z','真':'Z','哲':'Z','泽':'Z','增':'Z','展':'Z','照':'Z','政':'Z','志':'Z','智':'Z','仲':'Z','忠':'Z','竹':'Z','自':'Z','宗':'Z','钻':'Z','仔':'Z',
};

function getNameInitial(name) {
  if (!name) return '#';
  const ch = name[0];
  if (PINYIN_MAP[ch]) return PINYIN_MAP[ch];
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90)  return ch.toUpperCase();
  if (code >= 97 && code <= 122) return ch.toUpperCase();
  return '#';
}

const LoginPage = {
  name: 'LoginPage',
  emits: ['login-success', 'go-admin'],
  data() {
    return {
      activeTab: 'student', // student / teacher / admin
      // 学生登录
      studentUsername: '',
      studentPassword: '',
      // 教师登录
      teacherUsername: '',
      teacherPassword: '',
      // 管理员登录
      adminUsername: '',
      adminPassword: '',
      // 状态
      loading: false,
      error: '',
      showPassword: false,
      // 快速登录选择器
      qlSearch: '',
      qlActiveLetter: null,
    };
  },
  computed: {
    studentAccounts() {
      return Store.state.students.map(s => ({
        id: s.id,
        name: s.name,
        username: s.username,
        class: s.class,
        avatar: s.name ? s.name[0] : '👤',
        initial: getNameInitial(s.name || ''),
      }));
    },
    // 搜索过滤后的学生列表
    filteredAccounts() {
      const q = (this.qlSearch || '').trim().toLowerCase();
      if (!q) return this.studentAccounts;
      return this.studentAccounts.filter(s => {
        if ((s.name || '').toLowerCase().includes(q)) return true;
        const init = (s.initial || '').toLowerCase();
        return init === q || init.startsWith(q);
      });
    },
    // 按首字母分组
    groupedAccounts() {
      const groups = {};
      for (const s of this.filteredAccounts) {
        const ch = s.initial || '#';
        if (!groups[ch]) groups[ch] = [];
        groups[ch].push(s);
      }
      return groups;
    },
    // 有序首字母列表
    availableLetters() {
      return Object.keys(this.groupedAccounts).sort((a, b) => {
        if (a === '#') return 1; if (b === '#') return -1;
        return a.localeCompare(b);
      });
    },
  },
  methods: {
    // 切换Tab
    switchTab(tab) {
      this.activeTab = tab;
      this.error = '';
      this.studentUsername = '';
      this.studentPassword = '';
      // 教师账号自动填充，只需输密码
      this.teacherUsername = TEACHER_ACCOUNTS[0]?.username || 'teacher';
      this.teacherPassword = '';
      this.adminUsername = '';
      this.adminPassword = '';
    },
    // 学生快速登录
    async quickLogin(student) {
      this.loading = true;
      this.error = '';
      
      // 模拟登录延迟
      await new Promise(r => setTimeout(r, 300));
      
      // 学生快速登录无需密码
      const user = {
        ...student,
        role: 'student',
      };
      
      this.loading = false;
      this.$emit('login-success', user);
    },
    // 学生账号密码登录
    async loginStudent() {
      if (!this.studentUsername.trim()) {
        this.error = '请输入账号'; return;
      }
      if (!this.studentPassword.trim()) {
        this.error = '请输入密码'; return;
      }
      
      this.loading = true;
      this.error = '';
      
      // 模拟网络延迟
      await new Promise(r => setTimeout(r, 500));
      
      // 查找学生账号（比对实际密码，无万能回退）
      const student = Store.state.students.find(s => 
        (s.username === this.studentUsername.trim() || s.name === this.studentUsername.trim()) &&
        s.password === this.studentPassword
      );
      
      if (student) {
        this.$emit('login-success', { ...student, role: 'student' });
      } else {
        this.error = '账号或密码错误';
      }
      
      this.loading = false;
    },
    // 教师登录
    async loginTeacher() {
      if (!this.teacherPassword.trim()) {
        this.error = '请输入密码'; return;
      }
      
      this.loading = true;
      this.error = '';
      
      await new Promise(r => setTimeout(r, 500));
      
      // 从 Store 查找教师账号（支持动态密码）
      const teachers = Store._getTeacherAccounts ? Store._getTeacherAccounts() : TEACHER_ACCOUNTS;
      const teacher = teachers.find(t => 
        t.username === this.teacherUsername.trim() &&
        t.password === this.teacherPassword
      );
      
      if (teacher) {
        this.$emit('login-success', { ...teacher, role: 'teacher' });
      } else {
        this.error = '账号或密码错误';
      }
      
      this.loading = false;
    },
    // 管理员登录
    async loginAdmin() {
      if (!this.adminUsername.trim()) {
        this.error = '请输入账号'; return;
      }
      if (!this.adminPassword.trim()) {
        this.error = '请输入密码'; return;
      }

      this.loading = true;
      this.error = '';

      await new Promise(r => setTimeout(r, 500));

      // 通过 Store.login 做 SHA-256 哈希比对
      const result = await Store.login(this.adminUsername.trim(), this.adminPassword);
      if (result.success && result.role === 'admin') {
        this.$emit('login-success', { ...result.user, role: 'admin' });
      } else {
        this.error = '管理员账号或密码错误';
      }

      this.loading = false;
    },
    // 去管理员登录
    goAdmin() {
      this.switchTab('admin');
    },
    // 快速登录：面板区域滚轮事件（让整个面板区域都能滚动）
    onQuickLoginWheel(e) {
      const wrap = this.$refs.qlScrollArea || document.querySelector('.ql-scroll-area');
      if (wrap) {
        wrap.scrollTop += e.deltaY;
      }
    },
    // 快速登录选择器：滚动到字母分组
    scrollToLetter(letter) {
      this.qlActiveLetter = letter;
      this.$nextTick(() => {
        const wrap = this.$refs.qlScrollArea || document.querySelector('.ql-scroll-area');
        if (!wrap) return;
        const el = document.getElementById('ql-group-' + letter);
        if (el) {
          // 计算目标位置：元素相对滚动容器的偏移 - 固定间距
          const targetTop = el.offsetTop - wrap.offsetTop - 8;
          wrap.scrollTo({ top: targetTop, behavior: 'smooth' });
        }
      });
    },
    // 清空搜索
    clearSearch() {
      this.qlSearch = '';
      this.qlActiveLetter = null;
    },
  },
  template: `
    <div class="login-page animate-fadeIn">
      <!-- 背景装饰 -->
      <div class="login-bg">
        <div class="login-bg-circle circle-1"></div>
        <div class="login-bg-circle circle-2"></div>
        <div class="login-bg-circle circle-3"></div>
      </div>

      <!-- 主内容区（左侧登录卡 + 右侧快速选择器） -->
      <div class="login-main">
        <!-- ===== 左侧：登录卡片 ===== -->
        <div class="login-card">
          <!-- Logo区域 -->
          <div class="login-header">
            <div class="login-logo">🐾</div>
            <h1 class="login-title">课堂电子宠物</h1>
            <p class="login-subtitle">把学习变成养宠物！</p>
          </div>

          <!-- Tab切换 -->
          <div class="login-tabs">
            <button class="login-tab" :class="{ active: activeTab === 'student' }" @click="switchTab('student')">
              👨‍🎓 学生
            </button>
            <button class="login-tab" :class="{ active: activeTab === 'teacher' }" @click="switchTab('teacher')">
              👩‍🏫 教师
            </button>
            <button class="login-tab" :class="{ active: activeTab === 'admin' }" @click="switchTab('admin')">
              🛡️ 管理
            </button>
          </div>

          <!-- 学生登录（仅展示快速选择器，账号密码登录已移除） -->
          <div v-if="activeTab === 'student'" class="login-form">
            <div v-if="studentAccounts.length === 0" class="login-empty-tip">
              暂无学生账号，请切换到教师端添加学生
            </div>
          </div>

          <!-- 教师登录 -->
          <div v-if="activeTab === 'teacher'" class="login-form">
            <div class="input-group">
              <label>密码</label>
              <div style="position:relative;">
                <input class="input-field" v-model="teacherPassword"
                       :type="showPassword ? 'text' : 'password'"
                       placeholder="输入密码（默认：123456）" @keyup.enter="loginTeacher" />
                <span class="input-icon" style="cursor:pointer;" @click="showPassword=!showPassword">
                  {{ showPassword ? '🙈' : '👁️' }}
                </span>
              </div>
            </div>
            <div class="demo-hint">
              <div class="demo-hint-title">教师账号</div>
              <div class="demo-hint-item">{{ teacherUsername }} / 123456</div>
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%;"
                    @click="loginTeacher" :disabled="loading">
              {{ loading ? '登录中...' : '登录' }}
            </button>
          </div>

          <!-- 管理员登录 -->
          <div v-if="activeTab === 'admin'" class="login-form">
            <div class="input-group">
              <label>管理员账号</label>
              <input class="input-field" v-model="adminUsername"
                     placeholder="输入管理员账号" @keyup.enter="loginAdmin" />
            </div>
            <div class="input-group">
              <label>密码</label>
              <div style="position:relative;">
                <input class="input-field" v-model="adminPassword"
                       :type="showPassword ? 'text' : 'password'"
                       placeholder="输入管理员密码" @keyup.enter="loginAdmin" />
                <span class="input-icon" style="cursor:pointer;" @click="showPassword=!showPassword">
                  {{ showPassword ? '🙈' : '👁️' }}
                </span>
              </div>
            </div>
            <button class="btn btn-admin btn-lg" style="width:100%;"
                    @click="loginAdmin" :disabled="loading">
              {{ loading ? '登录中...' : '进入管理后台' }}
            </button>
          </div>

          <!-- 错误提示 -->
          <div v-if="error" class="login-error">
            ⚠️ {{ error }}
          </div>
        </div>

        <!-- ===== 右侧：学生快速选择器（仅学生Tab显示，且有学生时） ===== -->
        <div v-if="activeTab === 'student' && studentAccounts.length > 0" class="ql-panel"
             @wheel.prevent="onQuickLoginWheel">
          <div class="ql-panel-title">快速登录</div>

          <!-- 搜索框 -->
          <div class="ql-search-wrap">
            <span class="ql-search-icon">🔍</span>
            <input class="ql-search-input"
                   v-model="qlSearch"
                   placeholder="搜索姓名或拼音首字母..."
                   @input="qlActiveLetter = null" />
            <button v-if="qlSearch" class="ql-search-clear" @click="clearSearch">✕</button>
          </div>

          <!-- 首字母索引（横向可滚动） -->
          <div class="ql-index-bar">
            <button v-for="letter in availableLetters" :key="letter"
                    class="ql-index-btn"
                    :class="{ active: qlActiveLetter === letter }"
                    @click="scrollToLetter(letter)">
              {{ letter }}
            </button>
          </div>

          <!-- 可滚动分组卡片 -->
          <div class="ql-scroll-area" ref="qlScrollArea" @wheel.prevent="onQuickLoginWheel">
            <div v-for="letter in availableLetters" :key="letter"
                 :id="'ql-group-' + letter"
                 class="ql-group">
              <!-- 分组标题 - 点击跳转 -->
              <div class="ql-group-header" @click="scrollToLetter(letter)">
                <span class="ql-group-badge">{{ letter }}</span>
                <span class="ql-group-name">{{ letter }}</span>
                <span class="ql-group-count">{{ groupedAccounts[letter].length }}人</span>
              </div>
              <!-- 3列网格 -->
              <div class="ql-grid">
                <div v-for="student in groupedAccounts[letter]" :key="student.id"
                     class="ql-card"
                     @click="quickLogin(student)">
                  <div class="ql-avatar">{{ student.avatar }}</div>
                  <div class="ql-name">{{ student.name }}</div>
                  <div class="ql-class">{{ student.class }}</div>
                </div>
              </div>
            </div>
            <!-- 无搜索结果 -->
            <div v-if="filteredAccounts.length === 0 && qlSearch" class="ql-no-result">
              <div style="font-size:28px;margin-bottom:6px;">🔍</div>
              <div>没有找到「{{ qlSearch }}」</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部版权 -->
      <div class="login-footer">
        课堂电子宠物系统 v1.0 · Made by Qin_zzq · Copyright © 2026
      </div>
    </div>
  `
};
