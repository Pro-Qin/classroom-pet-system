// ===== 学生端 完整组件 =====

// ---------- 宠物页面 ----------
const PetPage = {
  name: 'PetPage',
  props: ['student'],
  emits: ['update', 'toast', 'level-up', 'purchase-start', 'purchase-end'],
  data() {
    return {
      petAction: 'idle',    // idle / eating / bathing / playing / healing
      showItemModal: false,
      currentActionType: null,
      showBubble: false,
      bubbleText: '',
      bubbleTimer: null,
      showShopModal: false,
      actionLoading: false,
      showPointsDetail: false,  // 积分明细弹窗
      showCreatePetModal: false, // 宠物创建弹窗
      createPetStep: 1,          // 1:选宠物 2:命名 3:孵化动画 4:完成
      selectedPetType: null,
      petName: '',
      hatching: false,
      showEditPetModal: false,  // 宠物信息编辑弹窗
      editPetName: '',
      editPetType: null,
      // 头像上传相关
      showAvatarUpload: false,  // 显示头像上传弹窗
      avatarPreview: null,       // 头像预览 URL
      avatarCanvas: null,        // Canvas 裁剪后的 base64
      avatarLoading: false,      // 上传中
    };
  },
  computed: {
    petType() {
      return PET_TYPES.find(p => p.id === this.student.petType) || null;
    },
    petEmoji() {
      if (!this.petType) return '🐱';
      if (this.student.petDead) return this.petType.emoji;
      return getStudentPetEmoji(this.student);
    },
    petTypes() {
      return PET_TYPES;
    },
    mood() {
      // 计算排名百分比（用于心情调节）
      const students = [...Store.state.students].filter(s => !s._isPlaceholder).sort((a, b) => (b.points||0) - (a.points||0));
      const idx = students.findIndex(s => s.id === this.student.id);
      if (idx >= 0 && students.length > 0) {
        this.student._rankPercent = 1 - (idx / students.length);
      } else {
        this.student._rankPercent = 0.5;
      }
      return getStudentMood(this.student.petStatus, this.student);
    },
    // 心情原因
    moodReason() {
      if (this.student.petDead) return '需要复活才能恢复活力...';
      const moodKey = this.mood ? Object.keys(PET_MOODS).find(k => PET_MOODS[k] === this.mood) : 'normal';
      return getMoodReason(moodKey);
    },
    levelInfo() {
      return getLevelInfo(this.student.petExp || 0);
    },
    expPercent() {
      return getExpPercent(this.student.petExp || 0);
    },
    dailyExpLimit() {
      return typeof DAILY_EXP_LIMIT !== 'undefined' ? DAILY_EXP_LIMIT : 50;
    },
    // 升级信息
    nextLevelInfo() {
      const exp = this.student.petExp || 0;
      const current = getLevelInfo(exp);
      const nextLevelNum = current.level + 1;
      const next = GROWTH_STAGES.find(s => s.level === nextLevelNum);
      if (!next) return null;
      const expNeeded = next.minExp;
      const remaining = expNeeded - exp;
      return {
        nextLevel: nextLevelNum,
        nextName: next.name,
        expNeeded,
        remaining,
        totalNeeded: next.maxExp - current.minExp,
      };
    },
    statusBars() {
      const s = this.student.petStatus || {};
      return [
        { key: 'health', icon: '❤️',  label: '生命', value: s.health || 0, cls: 'progress-health' },
        { key: 'hungry', icon: '🍗',  label: '饱食', value: s.hungry || 0, cls: 'progress-hungry' },
        { key: 'happy',  icon: '😊',  label: '心情', value: s.happy  || 0, cls: 'progress-happy'  },
        { key: 'clean',  icon: '🛁',  label: '清洁', value: s.clean  || 0, cls: 'progress-clean'  },
      ];
    },
    // 状态警告（低于阈值时显示提示）
    statusWarnings() {
      const s = this.student.petStatus || {};
      const warnings = [];
      const hungry = s.hungry || 0;
      const clean  = s.clean  || 0;
      const happy  = s.happy  || 0;
      const health = s.health || 0;
      if (health <= 30)  warnings.push({ key: 'health', icon: '🚨', msg: `生命值只剩 ${health}！快用急救药治疗宠物！`, urgent: true });
      if (hungry <= 20)  warnings.push({ key: 'hungry', icon: '😭', msg: `宠物快饿坏了！饱食度只剩 ${hungry}，健康正在下降！`, urgent: true });
      else if (hungry <= 40) warnings.push({ key: 'hungry', icon: '😟', msg: `宠物有点饿了（饱食度 ${hungry}），记得喂食哦~`, urgent: false });
      if (clean <= 20)   warnings.push({ key: 'clean',  icon: '🧹', msg: `宠物太脏了！清洁度只剩 ${clean}，健康正在下降！`, urgent: true });
      else if (clean <= 40)  warnings.push({ key: 'clean',  icon: '🛁', msg: `宠物有点脏了（清洁度 ${clean}），记得洗澡哦~`, urgent: false });
      if (happy <= 20)   warnings.push({ key: 'happy',  icon: '😢', msg: `宠物心情很差（${happy}），陪它玩一玩吧！`, urgent: false });
      return warnings;
    },
    backpackItems() {
      const bp = this.student.backpack || {};
      return ITEMS.filter(item => bp[item.id] > 0).map(item => ({
        ...item,
        count: bp[item.id]
      }));
    },
    feedItems()  { return this.backpackItems.filter(i => i.type === 'food'); },
    cleanItems() { return this.backpackItems.filter(i => i.type === 'clean'); },
    toyItems()   { return this.backpackItems.filter(i => i.type === 'toy'); },
    healItems()  { return this.backpackItems.filter(i => i.type === 'heal'); },
    shopItems()  { return ITEMS.filter(i => i.type !== 'special'); },  // 商店不再出售经验类特殊道具
    // 积分明细：优先读 pointsLog，兜底从任务记录构建
    pointsHistory() {
      const student = Store.state.students.find(s => s.id === this.student.id);
      if (student && student.pointsLog && student.pointsLog.length > 0) {
        // 倒序，最新在前
        return [...student.pointsLog].reverse();
      }
      // 兜底：从任务提交记录中汇总（旧数据兼容）
      const list = [];
      Store.state.tasks.forEach(task => {
        const sub = task.submissions.find(s => s.studentId === this.student.id);
        if (sub && sub.status === 'completed') {
          list.push({
            icon: task.icon,
            label: `完成任务「${task.title}」`,
            delta: task.points,
            time: sub.reviewedAt || sub.submittedAt || '',
          });
        }
      });
      return list.reverse();
    },
  },
  methods: {
    // ========== 头像上传 ==========
    openAvatarUpload() {
      this.showAvatarUpload = true;
      this.avatarPreview = null;
      this.avatarCanvas = null;
    },
    closeAvatarUpload() {
      this.showAvatarUpload = false;
      this.avatarPreview = null;
      this.avatarCanvas = null;
    },
    onAvatarFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        this.$emit('toast', '请选择图片文件', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        this.$emit('toast', '图片大小不能超过 5MB', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.avatarPreview = e.target.result;
        this.$nextTick(() => this.cropAvatar());
      };
      reader.readAsDataURL(file);
    },
    cropAvatar() {
      // 圆形裁剪头像
      const img = this.$refs.avatarImg;
      if (!img) return;
      const size = 200; // 输出尺寸
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // 创建圆形裁剪路径
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // 计算缩放以填满圆形
      const srcSize = Math.min(img.naturalWidth, img.naturalHeight);
      const dx = (img.naturalWidth - srcSize) / 2;
      const dy = (img.naturalHeight - srcSize) / 2;
      ctx.drawImage(img, dx, dy, srcSize, srcSize, 0, 0, size, size);

      this.avatarCanvas = canvas.toDataURL('image/png', 0.9);
    },
    async saveAvatar() {
      if (!this.avatarCanvas) {
        this.$emit('toast', '请先选择图片', 'warning');
        return;
      }
      // 确保有有效的学生ID
      const sid = this.student && (this.student.id || this.student._id);
      if (!sid) {
        console.error('[saveAvatar] 学生ID无效:', this.student);
        this.$emit('toast', '无法保存：学生信息缺失', 'error');
        return;
      }
      this.avatarLoading = true;
      try {
        const ok = await Store.updateAvatar(sid, this.avatarCanvas);
        if (ok) {
          this.$emit('toast', '头像已更新！', 'success');
          this.$emit('update');  // 通知父组件刷新数据
          this.closeAvatarUpload();
        } else {
          this.$emit('toast', '保存失败：未找到学生', 'error');
        }
      } catch (e) {
        console.error('[saveAvatar] 保存失败:', e);
        this.$emit('toast', '保存失败', 'error');
      }
      this.avatarLoading = false;
    },
    async removeAvatar() {
      if (!this.student || !this.student.avatar) return;
      const sid = this.student.id || this.student._id;
      if (!sid) {
        this.$emit('toast', '无法移除：学生信息缺失', 'error');
        return;
      }
      this.avatarLoading = true;
      try {
        await Store.updateAvatar(sid, null);
        this.$emit('toast', '头像已移除', 'success');
        this.$emit('update');
        this.closeAvatarUpload();
      } catch (e) {
        this.$emit('toast', '移除失败', 'error');
      }
      this.avatarLoading = false;
    },

    triggerAction(actionType) {
      if (this.actionLoading) return;
      this.currentActionType = actionType;
      const items = {
        feed: this.feedItems,
        bath: this.cleanItems,
        play: this.toyItems,
        heal: this.healItems,
      }[actionType];
      if (!items || items.length === 0) {
        this.$emit('toast', `背包中没有${this.actionLabel(actionType)}道具！去商店购买吧 🛒`, 'warning');
        return;
      }
      this.showItemModal = true;
    },
    actionLabel(type) {
      return { feed: '食物', bath: '清洁', play: '玩具', heal: '医疗' }[type] || '';
    },
    actionEmoji(type) {
      return { feed: '🍎', bath: '🛁', play: '⚽', heal: '💊' }[type] || '✨';
    },
    currentItems() {
      return {
        feed: this.feedItems,
        bath: this.cleanItems,
        play: this.toyItems,
        heal: this.healItems,
      }[this.currentActionType] || [];
    },
    async useItem(item) {
      this.showItemModal = false;
      this.actionLoading = true;
      const animMap = { food: 'eating', clean: 'bathing', toy: 'playing', heal: 'healing', special: 'healing' };
      this.petAction = animMap[item.type] || 'eating';

      const result = await Store.useItem(this.student.id, item.id);
      await new Promise(r => setTimeout(r, 500));
      this.petAction = 'idle';
      this.actionLoading = false;

      if (result.success) {
        // 宠物复活（从死亡状态）
        if (result.recovered) {
          this.refreshStudent(result.student);
          this.$emit('toast', `🎉 ${result.student?.petName || this.student.petName} 复活啦！经验已重置，重新开始成长吧~`, 'success');
          return;
        }
        const effectTexts = [];
        if (item.effect.hungry)  effectTexts.push(`饱食+${item.effect.hungry}`);
        if (item.effect.health)  effectTexts.push(`生命+${item.effect.health}`);
        if (item.effect.happy)   effectTexts.push(`心情+${item.effect.happy}`);
        if (item.effect.clean)   effectTexts.push(`清洁+${item.effect.clean}`);
        this.showBubbleMsg(`${item.emoji} ${effectTexts.join(' ')} ！`);
        this.refreshStudent(result.student);
        if (result.levelUp) {
          this.$emit('level-up', result.newStage);
        } else {
          let toastMsg = `使用了 ${item.emoji}${item.name}，${effectTexts.join(' ')}！`;
          if (result.expMsg) toastMsg += ' ' + result.expMsg;
          this.$emit('toast', toastMsg, 'success');
        }
      } else {
        this.$emit('toast', result.msg, 'error');
      }
    },
    async buyItem(item) {
      const result = await Store.buyItem(this.student.id, item.id);
      if (result.success) {
        this.$emit('toast', `${item.emoji} ${item.name} 已加入背包  -${item.cost} 金币`, 'success');
        this.$emit('update');
      } else {
        this.$emit('toast', result.msg, 'error');
      }
    },
    showBubbleMsg(text) {
      if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
      this.bubbleText = text;
      this.showBubble = true;
      this.bubbleTimer = setTimeout(() => { this.showBubble = false; }, 2500);
    },
    clickPet() {
      const msgs = ['汪汪！玩我嘛~', '我要吃东西！', '今天学了什么呀？', '你是最棒的主人！', '陪我玩！', '喜欢你哟 ❤️'];
      this.showBubbleMsg(msgs[Math.floor(Math.random() * msgs.length)]);
    },
    getStatusColor(value) {
      if (value >= 70) return '#4CAF50';
      if (value >= 40) return '#FF9800';
      return '#F44336';
    },
    openCreatePetModal() {
      this.showCreatePetModal = true;
      this.createPetStep = 1;
      this.selectedPetType = null;
      this.petName = '';
      this.hatching = false;
    },
    selectPet(typeId) {
      this.selectedPetType = typeId;
    },
    async startHatch() {
      if (!this.selectedPetType) {
        this.$emit('toast', '请先选择一个宠物！', 'warning');
        return;
      }
      const name = this.petName.trim() || this.petTypes.find(p => p.id === this.selectedPetType).name;
      this.createPetStep = 3;
      this.hatching = true;
      await new Promise(r => setTimeout(r, 2500));
      const result = await Store.adoptPet(this.student.id, this.selectedPetType, name);
      if (!result.success) {
        this.$emit('toast', result.msg || '领养失败', 'error');
        this.createPetStep = 1;
        this.hatching = false;
        return;
      }
      this.hatching = false;
      this.createPetStep = 4;
    },
    async     finishHatch() {
      this.showCreatePetModal = false;
      this.$emit('update');
      this.$emit('hatch-done');
      this.$emit('toast', '🎉 宠物创建成功！', 'success');
    },
    openEditPetModal() {
      this.editPetName = this.student.petName || '';
      this.editPetType = this.student.petType || null;
      this.showEditPetModal = true;
    },
    selectEditPetType(typeId) {
      this.editPetType = typeId;
    },
    async saveEditPet() {
      const name = this.editPetName.trim();
      if (!name) {
        this.$emit('toast', '宠物名字不能为空', 'warning');
        return;
      }
      const result = await Store.updatePet(this.student.id, {
        petName: name,
        petType: this.editPetType,
      });
      if (result.success) {
        this.showEditPetModal = false;
        this.$emit('toast', '宠物信息已更新！', 'success');
        this.$emit('update');
      } else {
        this.$emit('toast', result.msg || '更新失败', 'error');
      }
    },
  },
  template: `
    <div class="pet-page animate-pageIn">
      <!-- 宠物展示区 -->
      <div class="pet-container">
        <!-- 左侧：宠物主展示（横屏时独立成栏） -->
        <div class="pet-left">
          <div class="pet-scene" @click="clickPet">
            <div class="pet-bg"></div>
            <!-- 气泡 -->
            <div v-if="showBubble" class="pet-status-bubble" style="max-width:180px;font-size:11px;">{{ bubbleText }}</div>
            <!-- 宠物：优先显示自定义头像 > 宠物图片 > emoji -->
            <div class="pet-emoji" :class="petAction" :style="{fontSize: '90px'}">
              <img v-if="student.avatar && student.avatar.startsWith('data:')"
                   :src="student.avatar"
                   style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.2);cursor:pointer;"
                   @click.stop="showAvatarUpload=true"
                   title="点击更换头像" />
              <img v-else-if="student.petImage"
                   :src="student.petImage"
                   style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.2);cursor:pointer;"
                   @click.stop="showAvatarUpload=true"
                   title="点击更换头像" />
              <span v-else @click.stop="showAvatarUpload=true" title="点击上传头像">{{ petEmoji }}</span>
            </div>
            <!-- 等级徽章 -->
            <div class="pet-level-badge">Lv.{{ levelInfo.level }} {{ levelInfo.name }}</div>
            <!-- 头像上传按钮 -->
            <button class="avatar-upload-btn" @click.stop="showAvatarUpload=true" title="上传自定义头像">
              📷
            </button>
          </div>

          <div class="pet-name">{{ student.petName || '我的宠物' }} {{ student.petDead ? '😴' : mood.emoji }}</div>
          <!-- 宠物归属 -->
          <div style="color:var(--text-light);font-size:12px;margin-bottom:4px;">
            🏠 属于 {{ student.name }}
          </div>
          <div style="color:var(--text-light);font-size:13px;margin-bottom:8px;">
            <template v-if="student.petDead">
              <span style="color:#FF9800;">宠物需要休息 😴</span><br>
              <span>喂食可以唤醒宠物（经验将清零）</span>
            </template>
            <template v-else>{{ mood.label }} - {{ moodReason }}</template>
          </div>

          <!-- 积分 + 金币入口（并排显示） -->
          <div style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <!-- 积分入口（可点击查明细） -->
            <div @click="showPointsDetail=true"
                 style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#FFF8E1,#FFF3CD);
                        border:1.5px solid #FFD54F;border-radius:50px;padding:6px 14px;cursor:pointer;
                        transition:all 0.2s;" title="点击查看积分明细">
              <span style="font-size:18px;">⭐</span>
              <span style="font-size:16px;font-weight:900;color:#E65100;">{{ student.points || 0 }}</span>
              <span style="font-size:11px;color:#FF9800;font-weight:600;">积分</span>
              <span style="font-size:11px;color:#FFB300;">明细 ›</span>
            </div>
            <!-- 金币入口（醒目金黄色） -->
            <div style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#FFF9C4,#FFE082);
                        border:1.5px solid #FFD700;border-radius:50px;padding:6px 14px;
                        box-shadow:0 2px 8px rgba(255,193,7,0.3);">
              <span style="font-size:18px;">💵</span>
              <span style="font-size:16px;font-weight:900;color:#B8860B;">{{ student.money || 0 }}</span>
              <span style="font-size:11px;color:#FFA000;font-weight:600;">金币</span>
            </div>
          </div>

          <!-- 去商店（竖屏时在底部，横屏时在左侧底部） -->
          <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;justify-content:center;">
            <button class="btn btn-ghost btn-sm" @click="showShopModal=true">
              🛒 去商店购买道具
            </button>
            <button v-if="!petType" class="btn btn-primary btn-sm" @click="openCreatePetModal">
              🐣 创建宠物
            </button>
            <button v-if="petType && !student.petDead" class="btn btn-ghost btn-sm" @click="openEditPetModal">
              ✏️ 宠物设置
            </button>
          </div>
        </div>

        <!-- 右侧：状态 + 操作（横屏时独立成栏） -->
        <div class="pet-right">
          <!-- 经验条（活着时显示） -->
          <div v-if="!student.petDead" style="width:100%;max-width:280px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-bottom:4px;">
              <span>✨ 经验值</span>
              <span>{{ student.petExp || 0 }} / {{ levelInfo.maxExp }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill progress-exp" :style="{width: expPercent + '%'}"></div>
            </div>
            <!-- 升级进度详情 -->
            <div v-if="nextLevelInfo" style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding:8px 12px;background:#F8F0FF;border-radius:10px;">
              <div style="text-align:center;">
                <div style="font-size:11px;color:var(--text-light);">当前经验</div>
                <div style="font-size:14px;font-weight:800;color:var(--primary);">{{ student.petExp || 0 }}</div>
              </div>
              <div style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-light);">
                <span>距 Lv.{{ nextLevelInfo.nextLevel }}</span>
                <span style="color:#FF9800;font-weight:700;">{{ nextLevelInfo.remaining }}</span>
                <span>点</span>
              </div>
              <div style="text-align:center;">
                <div style="font-size:11px;color:var(--text-light);">升级所需</div>
                <div style="font-size:14px;font-weight:800;color:#E65100;">{{ nextLevelInfo.expNeeded }}</div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--text-light);text-align:center;margin-top:4px;">
              💡 每天喂食/洗澡/玩耍可获得经验，每日上限 {{ dailyExpLimit }} 点
            </div>
          </div>

          <!-- 宠物状态警告横幅（活着时，有指标过低则显示） -->
          <div v-if="!student.petDead && statusWarnings.length > 0"
               style="width:100%;max-width:280px;margin-bottom:10px;">
            <div v-for="w in statusWarnings" :key="w.key"
                 :style="{
                   background: w.urgent ? '#FFF3E0' : '#FFFDE7',
                   border: '1.5px solid ' + (w.urgent ? '#FF9800' : '#FFD54F'),
                   borderRadius: '10px',
                   padding: '7px 12px',
                   fontSize: '12px',
                   color: w.urgent ? '#E65100' : '#F57C00',
                   marginBottom: '5px',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '6px'
                 }">
              <span>{{ w.icon }}</span>
              <span>{{ w.msg }}</span>
            </div>
          </div>

          <!-- 状态条（活着时显示） -->
          <div v-if="!student.petDead" class="status-bars">
            <div v-for="bar in statusBars" :key="bar.key" class="status-bar-item">
              <span class="icon">{{ bar.icon }}</span>
              <span class="label">{{ bar.label }}</span>
              <div class="progress-bar" style="flex:1">
                <div class="progress-fill" :class="bar.cls" :style="{width: bar.value + '%'}"></div>
              </div>
              <span class="value" :style="{color: getStatusColor(bar.value)}">{{ bar.value }}</span>
            </div>
          </div>

          <!-- 操作按钮（死亡时只显示喂食） -->
          <div class="action-buttons">
            <button class="action-btn action-feed" @click="triggerAction('feed')" :disabled="actionLoading">
              <span class="action-icon">🍎</span>
              <span>喂食</span>
              <span class="action-cost">道具</span>
            </button>
            <template v-if="!student.petDead">
            <button class="action-btn action-bath" @click="triggerAction('bath')" :disabled="actionLoading">
              <span class="action-icon">🛁</span>
              <span>洗澡</span>
              <span class="action-cost">道具</span>
            </button>
            <button class="action-btn action-play" @click="triggerAction('play')" :disabled="actionLoading">
              <span class="action-icon">⚽</span>
              <span>玩耍</span>
              <span class="action-cost">道具</span>
            </button>
            <button class="action-btn action-heal" @click="triggerAction('heal')" :disabled="actionLoading">
              <span class="action-icon">💊</span>
              <span>治疗</span>
              <span class="action-cost">道具</span>
            </button>
            </template>
          </div>
        </div>
      </div>

      <!-- 道具选择弹窗 -->
      <div v-if="showItemModal" class="modal-overlay" @click.self="showItemModal=false">
        <div class="modal-box" style="max-width:400px;">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:16px;color:var(--text-dark);">
            {{ actionEmoji(currentActionType) }} 选择道具
          </h3>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div v-for="item in currentItems()" :key="item.id"
                 @click="useItem(item)"
                 style="display:flex;align-items:center;gap:14px;padding:14px 16px;
                        background:linear-gradient(135deg,#FFF8FF,#F8F0FF);
                        border:2px solid var(--border);border-radius:16px;cursor:pointer;
                        transition:all 0.2s;"
                 @mouseenter="e => { e.currentTarget.style.borderColor='var(--primary)'; e.currentTarget.style.transform='translateX(4px)'; }"
                 @mouseleave="e => { e.currentTarget.style.borderColor='var(--border)';   e.currentTarget.style.transform='translateX(0)';  }">
              <span style="font-size:36px;flex-shrink:0;">{{ item.emoji }}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:15px;font-weight:800;color:var(--text-dark);">{{ item.name }}</div>
                <div style="font-size:12px;color:var(--text-light);margin-top:2px;">{{ item.desc }}</div>
              </div>
              <div style="background:var(--primary);color:white;border-radius:50px;padding:4px 10px;
                          font-size:13px;font-weight:800;flex-shrink:0;">×{{ item.count }}</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:14px;" @click="showItemModal=false">取消</button>
        </div>
      </div>

      <!-- 商店弹窗 -->
      <div v-if="showShopModal" class="modal-overlay" @click.self="showShopModal=false">
        <div class="modal-box" style="width:100%;max-width:600px;max-height:88vh;overflow-y:auto;padding:0;border-radius:24px;">
          <!-- 商店顶部 Header -->
          <div style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#FF6B9D,#7C4DFF);
                      padding:16px 20px;border-radius:24px 24px 0 0;display:flex;align-items:center;justify-content:space-between;">
            <h3 style="font-size:18px;font-weight:900;color:white;display:flex;align-items:center;gap:8px;">
              🛒 道具商店
            </h3>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,0.2);
                          border-radius:50px;padding:5px 14px;">
                <span style="font-size:16px;">💵</span>
                <span style="font-size:18px;font-weight:900;color:white;line-height:1;">{{ student.money || 0 }}</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.85);font-weight:600;">金币</span>
              </div>
              <div @click="showShopModal=false"
                   style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.25);
                          display:flex;align-items:center;justify-content:center;cursor:pointer;
                          font-size:15px;font-weight:700;color:white;flex-shrink:0;">✕</div>
            </div>
          </div>
          <!-- 商品列表 -->
          <div class="shop-grid" style="padding:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
            <div v-for="item in shopItems" :key="item.id"
                 style="background:white;border:2px solid var(--border);border-radius:16px;
                        padding:14px;display:flex;flex-direction:row;align-items:center;gap:12px;
                        transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.05);"
                 :style="(student.money||0) < item.cost ? 'opacity:0.6;' : 'cursor:pointer;'"
                 @mouseenter="e => e.currentTarget.style.boxShadow='0 4px 16px rgba(255,107,157,0.2)'"
                 @mouseleave="e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
              <!-- 图标 -->
              <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#FFF0F8,#F8F0FF);
                          display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0;">
                {{ item.emoji }}
              </div>
              <!-- 信息 -->
              <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:14px;color:var(--text-dark);margin-bottom:2px;
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ item.name }}</div>
                <div style="font-size:11px;color:var(--text-light);margin-bottom:8px;line-height:1.4;
                            display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">{{ item.desc }}</div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                  <span style="font-size:13px;color:var(--warning);font-weight:800;white-space:nowrap;">💵 {{ item.cost }}</span>
                  <button class="btn btn-primary btn-sm" @click="buyItem(item)"
                          :disabled="(student.money||0) < item.cost"
                          style="font-size:12px;padding:5px 12px;flex-shrink:0;">购买</button>
                </div>
              </div>
            </div>
          </div>
          <div style="padding:0 16px 16px;">
            <button class="btn btn-ghost btn-sm" style="width:100%;" @click="showShopModal=false">关闭商店</button>
          </div>
        </div>
      </div>

      <!-- 积分明细弹窗 -->
      <div v-if="showPointsDetail" class="modal-overlay" @click.self="showPointsDetail=false">
        <div class="modal-box" style="max-height:80vh;overflow-y:auto;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <h3 style="font-size:18px;font-weight:800;color:var(--text-dark);">⭐ 积分明细</h3>
            <div style="font-size:22px;font-weight:900;color:#E65100;">{{ student.points || 0 }} 分</div>
          </div>

          <!-- 无记录 -->
          <div v-if="pointsHistory.length === 0" style="text-align:center;padding:30px 0;color:var(--text-light);">
            <div style="font-size:40px;margin-bottom:8px;">📋</div>
            <div style="font-size:14px;">暂无积分记录，完成任务可获得积分哦！</div>
          </div>

          <!-- 记录列表 -->
          <div v-for="(record, idx) in pointsHistory" :key="idx"
               style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="width:36px;height:36px;border-radius:50%;background:#FFF8E1;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
              {{ record.icon }}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:700;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                {{ record.label }}
              </div>
              <div style="font-size:11px;color:var(--text-light);margin-top:2px;">
                {{ record.time }}
                <span v-if="record.total !== undefined" style="margin-left:6px;color:var(--text-light);">总计: {{ record.total }}</span>
              </div>
            </div>
            <div style="font-size:16px;font-weight:900;flex-shrink:0;"
                 :style="{color: record.delta > 0 ? '#4CAF50' : '#F44336'}">
              {{ record.delta > 0 ? '+' : '' }}{{ record.delta }}
            </div>
          </div>

          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:14px;" @click="showPointsDetail=false">关闭</button>
        </div>
      </div>

      <!-- 宠物创建弹窗 -->
      <div v-if="showCreatePetModal" class="modal-overlay" @click.self="showCreatePetModal=false">
        <div class="modal-box" style="max-width:400px;">
          <!-- 步骤1：选宠物 -->
          <div v-if="createPetStep===1">
            <div style="font-size:56px;margin-bottom:12px;">🐾</div>
            <h2 style="font-size:22px;font-weight:900;color:var(--text-dark);margin-bottom:6px;">领取你的宠物</h2>
            <p style="color:var(--text-light);font-size:14px;margin-bottom:24px;">选择你最喜欢的宠物吧！完成学习任务帮助它成长～</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
              <div v-for="pet in petTypes" :key="pet.id"
                   class="card" style="padding:16px;cursor:pointer;transition:all 0.3s;"
                   :style="selectedPetType===pet.id ? 'border-color:var(--primary);background:#FFF0F8;transform:scale(1.05)' : ''"
                   @click="selectPet(pet.id)">
                <div style="font-size:40px;margin-bottom:6px;">{{ pet.stages[1] }}</div>
                <div style="font-size:13px;font-weight:700;color:var(--text-dark);">{{ pet.name }}</div>
                <div v-if="selectedPetType===pet.id" style="color:var(--primary);font-size:16px;margin-top:4px;">✓</div>
              </div>
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%;max-width:300px;margin:0 auto;display:block;" @click="createPetStep=2" :disabled="!selectedPetType">
              下一步：给宠物起名 →
            </button>
          </div>

          <!-- 步骤2：命名 -->
          <div v-if="createPetStep===2">
            <div style="font-size:72px;margin-bottom:12px;animation:petFloat 3s ease-in-out infinite;">
              {{ petTypes.find(p => p.id === selectedPetType) && petTypes.find(p => p.id === selectedPetType).stages[1] }}
            </div>
            <h2 style="font-size:22px;font-weight:900;color:var(--text-dark);margin-bottom:6px;">给你的宠物起个名字</h2>
            <p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">一个好名字会让它更有活力！</p>
            <div class="input-group" style="max-width:300px;margin:0 auto 20px;">
              <input class="input-field" v-model="petName" :placeholder="petTypes.find(p => p.id === selectedPetType) && petTypes.find(p => p.id === selectedPetType).name"
                     maxlength="10" style="text-align:center;font-size:18px;font-weight:700;" />
            </div>
            <div style="display:flex;gap:10px;justify-content:center;">
              <button class="btn btn-ghost" @click="createPetStep=1">← 重新选择</button>
              <button class="btn btn-primary btn-lg" @click="startHatch">🌟 开始冒险！</button>
            </div>
          </div>

          <!-- 步骤3：领取动画 -->
          <div v-if="createPetStep===3">
            <div style="padding:40px 0">
              <div style="font-size:100px;animation:petFloat 2s ease-in-out infinite;display:block;margin:0 auto;">
                {{ petTypes.find(p => p.id === selectedPetType) && petTypes.find(p => p.id === selectedPetType).stages[0] }}
              </div>
              <div style="font-size:18px;font-weight:700;color:var(--primary);margin-top:20px;" class="animate-blink">✨ 正在加入中... ✨</div>
              <p style="color:var(--text-light);font-size:14px;margin-top:8px;">你的新伙伴即将到来！</p>
            </div>
          </div>

          <!-- 步骤4：领取完成 -->
          <div v-if="createPetStep===4">
            <div style="font-size:100px;margin-bottom:12px;animation:levelUp 1s ease;">
              {{ petTypes.find(p => p.id === selectedPetType) && petTypes.find(p => p.id === selectedPetType).stages[0] }}
            </div>
            <div style="background:linear-gradient(135deg,#FF6B9D,#7C4DFF);color:white;border-radius:20px;padding:20px;margin-bottom:20px;">
              <div style="font-size:24px;font-weight:900;margin-bottom:6px;">🎉 领取成功！</div>
              <div style="font-size:16px;opacity:0.9;">「{{ petName || (petTypes.find(p => p.id === selectedPetType) && petTypes.find(p => p.id === selectedPetType).name) }}」正式加入</div>
              <div style="font-size:13px;opacity:0.75;margin-top:6px;">完成学习任务，帮助它快速成长吧！</div>
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%;max-width:300px;margin:0 auto;display:block;" @click="finishHatch">
              🌟 开始冒险！→
            </button>
          </div>
        </div>
      </div>

      <!-- 宠物信息编辑弹窗 -->
      <div v-if="showEditPetModal" class="modal-overlay" @click.self="showEditPetModal=false">
        <div class="modal-box" style="max-width:400px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h3 style="font-size:18px;font-weight:900;color:var(--text-dark);">✏️ 宠物设置</h3>
            <div @click="showEditPetModal=false" style="cursor:pointer;font-size:18px;color:var(--text-light);">✕</div>
          </div>

          <!-- 改名 -->
          <div class="input-group">
            <label style="font-size:13px;font-weight:700;color:var(--text-dark);margin-bottom:6px;display:block;">宠物名字</label>
            <input class="input-field" v-model="editPetName" placeholder="给宠物起个新名字" maxlength="10" />
          </div>

          <!-- 改类型 -->
          <div style="margin-top:16px;">
            <div style="font-size:13px;font-weight:700;color:var(--text-dark);margin-bottom:8px;display:block;">更换宠物类型</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
              <div v-for="pet in petTypes" :key="pet.id"
                   style="border:2px solid var(--border);border-radius:12px;padding:10px;cursor:pointer;text-align:center;transition:all 0.2s;"
                   :style="editPetType===pet.id ? 'border-color:var(--primary);background:#FFF0F8;' : ''"
                   @click="selectEditPetType(pet.id)">
                <div style="font-size:32px;margin-bottom:4px;">{{ pet.stages[1] }}</div>
                <div style="font-size:11px;font-weight:700;color:var(--text-dark);">{{ pet.name }}</div>
                <div v-if="editPetType===pet.id" style="color:var(--primary);font-size:12px;font-weight:700;margin-top:2px;">✓ 已选</div>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:20px;">
            <button class="btn btn-ghost" style="flex:1;" @click="showEditPetModal=false">取消</button>
            <button class="btn btn-primary" style="flex:2;" @click="saveEditPet">💾 保存设置</button>
          </div>
        </div>
      </div>

      <!-- 头像上传弹窗 -->
      <div v-if="showAvatarUpload" class="modal-overlay" @click.self="closeAvatarUpload">
        <div class="modal-box" style="max-width:360px;text-align:center;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h3 style="font-size:18px;font-weight:900;color:var(--text-dark);">📷 自定义头像</h3>
            <div @click="closeAvatarUpload" style="cursor:pointer;font-size:18px;color:var(--text-light);">✕</div>
          </div>

          <!-- 预览区域 -->
          <div style="width:120px;height:120px;border-radius:50%;margin:0 auto 20px;overflow:hidden;border:3px solid var(--primary);background:#f0f0f0;display:flex;align-items:center;justify-content:center;">
            <img v-if="avatarCanvas" :src="avatarCanvas" style="width:100%;height:100%;object-fit:cover;" />
            <img v-else-if="student.avatar && student.avatar.startsWith('data:')" :src="student.avatar" style="width:100%;height:100%;object-fit:cover;" />
            <img v-else-if="student.petImage" :src="student.petImage" style="width:100%;height:100%;object-fit:cover;" />
            <span v-else style="font-size:48px;">{{ petEmoji }}</span>
          </div>

          <!-- 选择图片 -->
          <div style="margin-bottom:16px;">
            <label class="btn btn-primary" style="cursor:pointer;display:inline-block;padding:10px 24px;">
              📁 选择图片
              <input type="file" accept="image/*" @change="onAvatarFileSelect" style="display:none;" />
            </label>
          </div>

          <!-- 隐藏的图片用于裁剪 -->
          <img v-if="avatarPreview" ref="avatarImg" :src="avatarPreview" @load="cropAvatar" style="display:none;max-width:300px;max-height:300px;" />

          <!-- 裁剪预览 -->
          <div v-if="avatarCanvas" style="margin:16px 0;font-size:13px;color:var(--text-light);">
            ✓ 头像已裁剪为圆形
          </div>

          <!-- 操作按钮 -->
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button v-if="student.avatar" class="btn btn-ghost" style="flex:1;" @click="removeAvatar" :disabled="avatarLoading">
              🗑️ 移除
            </button>
            <button class="btn btn-primary" style="flex:2;" @click="saveAvatar" :disabled="!avatarCanvas || avatarLoading">
              {{ avatarLoading ? '保存中...' : '💾 保存头像' }}
            </button>
          </div>

          <div style="margin-top:12px;font-size:12px;color:var(--text-light);">
            支持 JPG、PNG、WebP，最大 5MB<br/>
            图片会自动裁剪为圆形
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 排行榜页面 ----------
const RankPage = {
  name: 'RankPage',
  props: ['student'],
  computed: {
    rankList() {
      return [...Store.state.students]
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .map((s, i) => ({
          ...s,
          rank: i + 1,
          petEmoji: getStudentPetEmoji(s),
          petImage: s.petImage || null,
          studentAvatar: s.avatar || null,  // 保留原头像
          levelInfo: getLevelInfo(s.petExp || 0),
        }));
    },
    myRank() {
      return this.rankList.findIndex(s => s.id === this.student.id) + 1;
    }
  },
  methods: {
    getStudentPetEmoji
  },
  template: `
    <div class="animate-pageIn">
      <div class="page-title">🏆 班级排行榜</div>

      <!-- 我的排名 -->
      <div class="card" style="padding:16px;margin-bottom:20px;background:linear-gradient(135deg,#FF6B9D,#7C4DFF);color:white;border:none;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid white;">
            <img v-if="student.avatar && student.avatar.startsWith('data:')" :src="student.avatar" style="width:100%;height:100%;object-fit:cover;" />
            <img v-else-if="student.petImage" :src="student.petImage" style="width:100%;height:100%;object-fit:cover;" />
            <div v-else style="font-size:32px;text-align:center;line-height:46px;">{{ getStudentPetEmoji(student) }}</div>
          </div>
          <div style="flex:1">
            <div style="font-size:18px;font-weight:800;">{{ student.name }} 的排名</div>
            <div style="font-size:14px;opacity:0.85;">⭐ {{ student.points }} 积分</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:40px;font-weight:900;line-height:1;">#{{ myRank }}</div>
            <div style="font-size:12px;opacity:0.8;">当前排名</div>
          </div>
        </div>
      </div>

      <!-- 前三名特殊展示 -->
      <div style="display:flex;gap:10px;margin-bottom:20px;align-items:flex-end;">
        <div v-if="rankList[1]" class="rank-podium rank-2nd" style="flex:1;order:1">
          <div style="width:60px;height:60px;border-radius:50%;overflow:hidden;margin:0 auto;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
            <img v-if="rankList[1].studentAvatar && rankList[1].studentAvatar.startsWith('data:')" :src="rankList[1].studentAvatar" style="width:100%;height:100%;object-fit:cover;" />
            <img v-else-if="rankList[1].petImage" :src="rankList[1].petImage" style="width:100%;height:100%;object-fit:cover;" />
            <div v-else style="font-size:36px;text-align:center;line-height:54px;">{{ rankList[1].petEmoji }}</div>
          </div>
          <div style="text-align:center;font-weight:800;font-size:13px;">{{ rankList[1].name }}</div>
          <div style="background:linear-gradient(135deg,#B0BEC5,#78909C);color:white;padding:10px;border-radius:10px 10px 0 0;text-align:center;">
            <div style="font-size:20px;font-weight:900;">🥈 #2</div>
            <div style="font-size:12px;">{{ rankList[1].points }}分</div>
          </div>
        </div>
        <div v-if="rankList[0]" class="rank-podium rank-1st" style="flex:1;order:2">
          <div style="width:80px;height:80px;border-radius:50%;overflow:hidden;margin:0 auto;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.2);">
            <img v-if="rankList[0].studentAvatar && rankList[0].studentAvatar.startsWith('data:')" :src="rankList[0].studentAvatar" style="width:100%;height:100%;object-fit:cover;" />
            <img v-else-if="rankList[0].petImage" :src="rankList[0].petImage" style="width:100%;height:100%;object-fit:cover;" />
            <div v-else style="font-size:48px;text-align:center;line-height:74px;">{{ rankList[0].petEmoji }}</div>
          </div>
          <div style="text-align:center;font-weight:800;font-size:14px;">{{ rankList[0].name }}</div>
          <div style="background:linear-gradient(135deg,#FFD700,#FFA000);color:white;padding:14px;border-radius:10px 10px 0 0;text-align:center;">
            <div style="font-size:24px;font-weight:900;">👑 #1</div>
            <div style="font-size:13px;">{{ rankList[0].points }}分</div>
          </div>
        </div>
        <div v-if="rankList[2]" class="rank-podium rank-3rd" style="flex:1;order:3">
          <div style="width:50px;height:50px;border-radius:50%;overflow:hidden;margin:0 auto;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
            <img v-if="rankList[2].studentAvatar && rankList[2].studentAvatar.startsWith('data:')" :src="rankList[2].studentAvatar" style="width:100%;height:100%;object-fit:cover;" />
            <img v-else-if="rankList[2].petImage" :src="rankList[2].petImage" style="width:100%;height:100%;object-fit:cover;" />
            <div v-else style="font-size:28px;text-align:center;line-height:44px;">{{ rankList[2].petEmoji }}</div>
          </div>
          <div style="text-align:center;font-weight:800;font-size:12px;">{{ rankList[2].name }}</div>
          <div style="background:linear-gradient(135deg,#FFAB76,#E64A19);color:white;padding:8px;border-radius:10px 10px 0 0;text-align:center;">
            <div style="font-size:18px;font-weight:900;">🥉 #3</div>
            <div style="font-size:12px;">{{ rankList[2].points }}分</div>
          </div>
        </div>
      </div>

      <!-- 完整排名 -->
      <div v-for="s in rankList" :key="s.id" class="rank-item"
           :style="s.id === student.id ? 'border-color:var(--primary);background:#FFF0F8;' : ''">
        <div class="rank-num" :class="s.rank<=3 ? 'rank-'+s.rank : 'rank-other'">
          {{ s.rank <= 3 ? ['👑','🥈','🥉'][s.rank-1] : s.rank }}
        </div>
        <div class="rank-pet">
          <div v-if="s.studentAvatar && s.studentAvatar.startsWith('data:')" style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.15);">
            <img :src="s.studentAvatar" style="width:100%;height:100%;object-fit:cover;" />
          </div>
          <div v-else-if="s.petImage" style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.15);">
            <img :src="s.petImage" style="width:100%;height:100%;object-fit:cover;" />
          </div>
          <span v-else>{{ s.petEmoji }}</span>
        </div>
        <div class="rank-info">
          <div class="rank-name">
            {{ s.name }}
            <span v-if="s.id === student.id" style="font-size:11px;color:var(--primary);"> (我)</span>
          </div>
          <div class="rank-detail">Lv.{{ s.levelInfo.level }} {{ s.levelInfo.name }} · {{ s.petExp||0 }} exp</div>
        </div>
        <div class="rank-points">⭐{{ s.points }}</div>
      </div>
    </div>
  `,
  methods: { getStudentPetEmoji }
};

// ---------- 背包页面 ----------
const BackpackPage = {
  name: 'BackpackPage',
  props: ['student'],
  emits: ['update', 'toast'],
  data() {
    return {
      filterType: 'all',
      showItemInfo: null,
    };
  },
  computed: {
    allItems() {
      const bp = this.student.backpack || {};
      return ITEMS
        .filter(item => item.type !== 'special')   // 过滤掉已废弃的经验类特殊道具
        .map(item => ({
          ...item,
          count: bp[item.id] || 0,
          owned: (bp[item.id] || 0) > 0,
        }));
    },
    filteredItems() {
      if (this.filterType === 'all') return this.allItems;
      return this.allItems.filter(i => i.type === this.filterType);
    },
    tabs() {
      return [
        { k: 'all',   l: '全部', icon: '🎒' },
        { k: 'food',  l: '食物', icon: '🍎' },
        { k: 'clean', l: '清洁', icon: '🛁' },
        { k: 'toy',   l: '玩具', icon: '⚽' },
        { k: 'heal',  l: '医疗', icon: '💊' },
      ];
    },
  },
  methods: {
    async useItemDirect(item) {
      if (!item.owned) return;
      const result = await Store.useItem(this.student.id, item.id);
      if (result.success) {
        let msg = `使用了 ${item.emoji}${item.name}！`;
        if (result.expMsg) msg += ' ' + result.expMsg;
        this.$emit('toast', msg, 'success');
        this.$emit('update');
        if (result.levelUp) {
          this.$emit('toast', `🎉 宠物升级了！Lv.${result.newStage}`, 'success');
        }
      } else {
        this.$emit('toast', result.msg, 'error');
      }
      this.showItemInfo = null;
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="page-title">🎒 我的背包</div>

      <!-- 道具类型筛选 -->
      <div style="display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px;">
        <button v-for="tab in tabs" :key="tab.k" class="btn btn-sm"
                :class="filterType===tab.k ? 'btn-primary' : 'btn-ghost'"
                @click="filterType=tab.k" style="white-space:nowrap;">
          {{ tab.icon }} {{ tab.l }}
        </button>
      </div>

      <!-- 背包格子 -->
      <div class="backpack-grid">
        <div v-for="item in filteredItems" :key="item.id"
             class="backpack-item" :class="{empty: !item.owned}"
             @click="item.owned && (showItemInfo = item)">
          <span class="item-icon">{{ item.emoji }}</span>
          <span class="item-name">{{ item.name }}</span>
          <span v-if="item.owned" class="item-count">{{ item.count }}</span>
          <div v-if="!item.owned" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(240,230,255,0.6);border-radius:12px;">
            <span style="font-size:20px;opacity:0.4;">🔒</span>
          </div>
        </div>
      </div>

      <!-- 道具详情弹窗 -->
      <div v-if="showItemInfo" class="modal-overlay" @click.self="showItemInfo=null">
        <div class="modal-box" style="text-align:center;">
          <div style="font-size:72px;margin-bottom:8px;">{{ showItemInfo.emoji }}</div>
          <h3 style="font-size:22px;font-weight:800;color:var(--text-dark);margin-bottom:6px;">{{ showItemInfo.name }}</h3>
          <p style="font-size:14px;color:var(--text-mid);margin-bottom:16px;">{{ showItemInfo.desc }}</p>
          <div style="background:#F8F0FF;border-radius:14px;padding:14px;margin-bottom:16px;text-align:left;">
            <div style="font-size:13px;font-weight:700;color:var(--text-mid);margin-bottom:8px;">📊 使用效果</div>
            <div v-for="(v, k) in showItemInfo.effect" :key="k" style="font-size:13px;color:var(--text-dark);margin-bottom:4px;">
              {{ {hungry:'🍗 饱食度',health:'❤️ 生命值',happy:'😊 心情值',clean:'🛁 清洁度',exp:'✨ 经验值'}[k] || k }}
              <span :style="{color: v>0 ? '#4CAF50' : '#F44336'}">{{ v > 0 ? '+' : '' }}{{ v }}</span>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showItemInfo=null">关闭</button>
            <button class="btn btn-primary" style="flex:2" @click="useItemDirect(showItemInfo)">
              🎯 使用 (剩余×{{ showItemInfo.count }})
            </button>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 成就页面 ----------
const AchievementPage = {
  name: 'AchievementPage',
  props: ['student'],
  data() {
    return {
      activeTab: 'all', // all / unlocked / locked
      filterCategory: 'all',
    };
  },
  computed: {
    achievements() {
      return Store.getStudentAchievements(this.student.id);
    },
    filteredAchievements() {
      let achievements = [];
      
      if (this.activeTab === 'all') {
        achievements = [...this.achievements.unlocked, ...this.achievements.locked];
      } else if (this.activeTab === 'unlocked') {
        achievements = this.achievements.unlocked;
      } else {
        achievements = this.achievements.locked;
      }
      
      if (this.filterCategory !== 'all') {
        achievements = achievements.filter(a => a.category === this.filterCategory);
      }
      
      return achievements;
    },
    categories() {
      return [
        { k: 'all', name: '全部', icon: '🌟' },
        ...Object.entries(ACHIEVEMENT_CATEGORIES).map(([key, value]) => ({
          k: key,
          name: value.name,
          icon: value.icon
        }))
      ];
    },
    unlockedCount() {
      return this.achievements.unlocked.length;
    },
    totalCount() {
      return ACHIEVEMENTS.length;
    },
    progressPercent() {
      return Math.round((this.unlockedCount / this.totalCount) * 100);
    },
  },
  methods: {
    getRarityColor(rarity) {
      return ACHIEVEMENT_RARITIES[rarity]?.color || '#999';
    },
    getRarityName(rarity) {
      return ACHIEVEMENT_RARITIES[rarity]?.name || '普通';
    },
    getCategoryName(category) {
      return ACHIEVEMENT_CATEGORIES[category]?.name || '其他';
    },
    getCategoryIcon(category) {
      return ACHIEVEMENT_CATEGORIES[category]?.icon || '📋';
    },
  },
  template: `
    <div class="animate-pageIn">
      <div class="page-title">🏆 我的成就</div>

      <!-- 成就进度 -->
      <div class="card" style="padding:20px;margin-bottom:20px;background:linear-gradient(135deg,#FF6B9D,#7C4DFF);color:white;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div>
            <div style="font-size:18px;font-weight:800;">成就完成度</div>
            <div style="font-size:13px;opacity:0.85;">{{ unlockedCount }} / {{ totalCount }} 个成就</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:32px;font-weight:900;">{{ progressPercent }}%</div>
            <div style="font-size:12px;opacity:0.85;">完成</div>
          </div>
        </div>
        <div class="progress-bar" style="background:rgba(255,255,255,0.2);">
          <div class="progress-fill" style="background:white;" :style="{width: progressPercent + '%'}"></div>
        </div>
      </div>

      <!-- 标签筛选 -->
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn btn-sm" :class="activeTab==='all'?'btn-primary':'btn-ghost'" @click="activeTab='all'">全部</button>
        <button class="btn btn-sm" :class="activeTab==='unlocked'?'btn-primary':'btn-ghost'" @click="activeTab='unlocked'">已解锁</button>
        <button class="btn btn-sm" :class="activeTab==='locked'?'btn-primary':'btn-ghost'" @click="activeTab='locked'">未解锁</button>
      </div>

      <!-- 分类筛选 -->
      <div style="display:flex;gap:6px;margin-bottom:20px;overflow-x:auto;padding-bottom:4px;">
        <button v-for="cat in categories" :key="cat.k" class="btn btn-sm"
                :class="filterCategory===cat.k ? 'btn-primary' : 'btn-ghost'"
                @click="filterCategory=cat.k" style="white-space:nowrap;">
          {{ cat.icon }} {{ cat.name }}
        </button>
      </div>

      <!-- 成就列表 -->
      <div v-if="filteredAchievements.length === 0" class="empty-state">
        <div class="empty-icon">🏆</div>
        <p>暂无成就</p>
      </div>

      <div v-for="achievement in filteredAchievements" :key="achievement.id" 
           class="card" style="padding:16px;margin-bottom:12px;transition:all 0.3s;"
           :class="{ 'achievement-unlocked': achievements.unlocked.includes(achievement.id), 'achievement-locked': !achievements.unlocked.includes(achievement.id) }">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <!-- 成就图标 -->
          <div style="width:56px;height:56px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0;"
               :style="{
                 background: achievements.unlocked.includes(achievement.id) ? '#F8F0FF' : '#F0F0F0',
                 opacity: achievements.unlocked.includes(achievement.id) ? 1 : 0.6
               }">
            {{ achievement.icon }}
          </div>
          
          <!-- 成就信息 -->
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <h4 style="font-size:16px;font-weight:800;margin:0;">{{ achievement.name }}</h4>
              <span class="badge" :style="{background: getRarityColor(achievement.rarity), color: 'white'}">{{ getRarityName(achievement.rarity) }}</span>
            </div>
            <p style="font-size:13px;color:var(--text-mid);margin:0 0 8px 0;">{{ achievement.description }}</p>
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:12px;color:var(--text-light);display:flex;align-items:center;gap:4px;">
                {{ getCategoryIcon(achievement.category) }} {{ getCategoryName(achievement.category) }}
              </span>
              <span v-if="achievement.points > 0" style="font-size:12px;color:var(--warning);font-weight:700;display:flex;align-items:center;gap:4px;">
                ⭐ +{{ achievement.points }} 积分
              </span>
            </div>
            
            <!-- 进度条（未解锁的成就） -->
            <div v-if="!achievements.unlocked.includes(achievement.id) && achievements.progress[achievement.id]"
                 style="margin-top:8px;">
              <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-light);margin-bottom:4px;">
                <span>进度</span>
                <span>{{ achievements.progress[achievement.id] }}%</span>
              </div>
              <div class="progress-bar" style="height:6px;">
                <div class="progress-fill" style="background:var(--primary);" :style="{width: achievements.progress[achievement.id] + '%'}"></div>
              </div>
            </div>
          </div>
          
          <!-- 解锁状态 -->
          <div style="flex-shrink:0;">
            <span v-if="achievements.unlocked.includes(achievement.id)" class="badge badge-success" style="font-size:12px;">✅ 已解锁</span>
            <span v-else class="badge badge-warning" style="font-size:12px;">🔒 未解锁</span>
          </div>
        </div>
      </div>
    </div>
  `
};

// ---------- 领取页面（新用户） ----------
const HatchPage = {
  name: 'HatchPage',
  props: ['student'],
  emits: ['update', 'toast', 'hatch-done'],
  data() {
    return {
      step: 1,          // 1:选宠物 2:命名 3:领取动画 4:完成
      selectedType: null,
      petName: '',
      loading: false,
    };
  },
  computed: {
    petTypes() { return PET_TYPES; },
    selectedPetType() {
      return PET_TYPES.find(p => p.id === this.selectedType);
    }
  },
  methods: {
    selectPet(typeId) {
      this.selectedType = typeId;
    },
    async startHatch() {
      if (!this.selectedType) { this.$emit('toast','请先选择一个宠物！','warning'); return; }
      const name = this.petName.trim() || this.selectedPetType.name;
      this.step = 3;
      this.loading = true;
      await new Promise(r => setTimeout(r, 2500));
      const result = await Store.adoptPet(this.student.id, this.selectedType, name);
      this.loading = false;
      if (!result.success) {
        this.$emit('toast', result.msg || '领养失败，请重试', 'error');
        this.step = 1;
        return;
      }
      this.step = 4;
    },
    finish() {
      this.$emit('update');
      this.$emit('hatch-done');
    }
  },
  template: `
    <div class="animate-pageIn" style="padding:20px;text-align:center;">
      <!-- 步骤1：选宠物 -->
      <div v-if="step===1">
        <div style="font-size:56px;margin-bottom:12px;">🐾</div>
        <h2 style="font-size:22px;font-weight:900;color:var(--text-dark);margin-bottom:6px;">领取你的宠物</h2>
        <p style="color:var(--text-light);font-size:14px;margin-bottom:24px;">选择你最喜欢的宠物吧！完成学习任务帮助它成长～</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
          <div v-for="pet in petTypes" :key="pet.id"
               class="card" style="padding:16px;cursor:pointer;transition:all 0.3s;"
               :style="selectedType===pet.id ? 'border-color:var(--primary);background:#FFF0F8;transform:scale(1.05)' : ''"
               @click="selectPet(pet.id)">
            <div style="font-size:40px;margin-bottom:6px;">{{ pet.stages[1] }}</div>
            <div style="font-size:13px;font-weight:700;color:var(--text-dark);">{{ pet.name }}</div>
            <div v-if="selectedType===pet.id" style="color:var(--primary);font-size:16px;margin-top:4px;">✓</div>
          </div>
        </div>
        <button class="btn btn-primary btn-lg" style="width:100%;max-width:300px" @click="step=2" :disabled="!selectedType">
          下一步：给宠物起名 →
        </button>
      </div>

      <!-- 步骤2：命名 -->
      <div v-if="step===2">
        <div style="font-size:72px;margin-bottom:12px;animation:petFloat 3s ease-in-out infinite;">
          {{ selectedPetType && selectedPetType.stages[1] }}
        </div>
        <h2 style="font-size:22px;font-weight:900;color:var(--text-dark);margin-bottom:6px;">给你的宠物起个名字</h2>
        <p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">一个好名字会让它更有活力！</p>
        <div class="input-group" style="max-width:300px;margin:0 auto 20px;">
          <input class="input-field" v-model="petName" :placeholder="selectedPetType && selectedPetType.name"
                 maxlength="10" style="text-align:center;font-size:18px;font-weight:700;" />
        </div>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="btn btn-ghost" @click="step=1">← 重新选择</button>
          <button class="btn btn-primary btn-lg" @click="startHatch">🌟 开始冒险！</button>
        </div>
      </div>

      <!-- 步骤3：领取动画 -->
      <div v-if="step===3">
        <div style="padding:40px 0">
          <div style="font-size:100px;animation:petFloat 2s ease-in-out infinite;display:block;margin:0 auto;">
            {{ selectedPetType && selectedPetType.stages[0] }}
          </div>
          <div style="font-size:18px;font-weight:700;color:var(--primary);margin-top:20px;" class="animate-blink">✨ 正在加入中... ✨</div>
          <p style="color:var(--text-light);font-size:14px;margin-top:8px;">你的新伙伴即将到来！</p>
        </div>
      </div>

      <!-- 步骤4：领取完成 -->
      <div v-if="step===4">
        <div style="font-size:100px;margin-bottom:12px;animation:levelUp 1s ease;">
          {{ selectedPetType && selectedPetType.stages[0] }}
        </div>
        <div style="background:linear-gradient(135deg,#FF6B9D,#7C4DFF);color:white;border-radius:20px;padding:20px;margin-bottom:20px;">
          <div style="font-size:24px;font-weight:900;margin-bottom:6px;">🎉 领取成功！</div>
          <div style="font-size:16px;opacity:0.9;">「{{ petName || selectedPetType.name }}」正式加入</div>
          <div style="font-size:13px;opacity:0.75;margin-top:6px;">完成学习任务，帮助它快速成长吧！</div>
        </div>
        <button class="btn btn-primary btn-lg" style="width:100%;max-width:300px" @click="finish">
          🌟 开始冒险！→
        </button>
      </div>
    </div>
  `
};

// ---------- 学生主页 ----------
const StudentHomePage = {
  name: 'StudentHomePage',
  props: ['student'],
  computed: {
    todayTasks() {
      return Store.state.tasks
        .filter(t => t.status === 'active')
        .map(task => ({
          ...task,
          myStatus: (task.submissions.find(s => s.studentId === this.student.id) || {}).status || 'pending',
        }))
        .slice(0, 3);
    },
    completedCount() {
      return this.todayTasks.filter(t => t.myStatus === 'completed').length;
    },
    petEmoji() { return getStudentPetEmoji(this.student); },
    levelInfo() { return getLevelInfo(this.student.petExp || 0); },
    expPercent() { return getExpPercent(this.student.petExp || 0); },
    homeNextLevel() {
      const exp = this.student.petExp || 0;
      const current = getLevelInfo(exp);
      const next = GROWTH_STAGES.find(s => s.level === current.level + 1);
      if (!next) return null;
      return { nextLevel: current.level + 1, remaining: next.minExp - exp, expNeeded: next.minExp };
    },
    rankIndex() {
      const sorted = [...Store.state.students].sort((a,b) => (b.points||0) - (a.points||0));
      return sorted.findIndex(s => s.id === this.student.id) + 1;
    },
    greeting() {
      const h = new Date().getHours();
      if (h < 6)  return '夜猫子！';
      if (h < 12) return '早上好！';
      if (h < 14) return '中午好！';
      if (h < 18) return '下午好！';
      return '晚上好！';
    },
    currentStudent() { return this.student; },
    statusBars() {
      const s = this.student.petStatus || {};
      return [
        { key: 'health', icon: '❤️',  label: '生命', value: s.health || 0, cls: 'progress-health' },
        { key: 'hungry', icon: '🍗',  label: '饱食', value: s.hungry || 0, cls: 'progress-hungry' },
        { key: 'happy',  icon: '😊',  label: '心情', value: s.happy  || 0, cls: 'progress-happy'  },
        { key: 'clean',  icon: '🛁',  label: '清洁', value: s.clean  || 0, cls: 'progress-clean'  },
      ];
    },
    // 首页只展示最严重的一条状态警告
    homeStatusWarning() {
      const s = this.student.petStatus || {};
      const hungry = s.hungry || 0;
      const clean  = s.clean  || 0;
      const health = s.health || 0;
      if (health <= 30)  return { icon: '🚨', msg: `生命值只剩 ${health}！快去照顾宠物！`, urgent: true };
      if (hungry <= 20)  return { icon: '😭', msg: `宠物快饿坏了（饱食度 ${hungry}），健康正在下降！`, urgent: true };
      if (clean  <= 20)  return { icon: '🧹', msg: `宠物太脏了（清洁度 ${clean}），健康正在下降！`, urgent: true };
      if (hungry <= 40)  return { icon: '😟', msg: `宠物有点饿了（饱食度 ${hungry}），去喂食吧！`, urgent: false };
      if (clean  <= 40)  return { icon: '🛁', msg: `宠物有点脏了（清洁度 ${clean}），记得洗澡哦！`, urgent: false };
      return null;
    },
  },
  methods: {
    getStatusColor(value) {
      if (value >= 70) return '#4CAF50';
      if (value >= 40) return '#FF9800';
      return '#F44336';
    },
  },
  template: `
    <div class="animate-pageIn">
      <!-- 欢迎横幅 -->
      <div class="card" style="padding:20px;margin-bottom:16px;background:linear-gradient(135deg,#FF6B9D,#7C4DFF);color:white;border:none;">
        <div style="display:flex;align-items:center;gap:16px;">
          <!-- 宠物：优先显示自定义头像 > 宠物图片 > emoji -->
          <div v-if="student.avatar && student.avatar.startsWith('data:')" style="width:80px;height:80px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.5);box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:petFloat 3s ease-in-out infinite;">
            <img :src="student.avatar" style="width:100%;height:100%;object-fit:cover;" />
          </div>
          <div v-else-if="student.petImage" style="width:80px;height:80px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.5);box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:petFloat 3s ease-in-out infinite;">
            <img :src="student.petImage" style="width:100%;height:100%;object-fit:cover;" />
          </div>
          <div v-else style="font-size:56px;animation:petFloat 3s ease-in-out infinite;">{{ petEmoji }}</div>
          <div style="flex:1">
            <div style="font-size:20px;font-weight:900;">{{ greeting }} {{ student.name }}！</div>
            <div style="font-size:13px;opacity:0.85;margin-top:3px;">{{ student.petName }} 在等你回来玩～</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
              <div style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:50px;font-size:13px;font-weight:700;">
                ⭐ {{ student.points }} 积分
              </div>
              <div style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:50px;font-size:13px;font-weight:700;">
                🏆 第 {{ rankIndex }} 名
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 宠物状态快览 -->
      <div class="card" style="padding:16px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-weight:800;font-size:16px;">🐾 宠物状态</div>
          <span class="badge badge-primary">Lv.{{ levelInfo.level }} {{ levelInfo.name }}</span>
        </div>
        <!-- 经验条 + 升级信息 -->
        <div class="progress-bar" style="margin-bottom:8px;">
          <div class="progress-fill progress-exp" :style="{width:expPercent+'%'}"></div>
        </div>
        <div v-if="homeNextLevel" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-light);margin-bottom:12px;">
          <span>✨ {{ student.petExp || 0 }} 经验</span>
          <span v-if="homeNextLevel" style="color:#FF9800;font-weight:700;">
            距 Lv.{{ homeNextLevel.nextLevel }} 还差 {{ homeNextLevel.remaining }} 点
          </span>
          <span>所需 {{ homeNextLevel.expNeeded }}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
          <div v-for="bar in statusBars" :key="bar.key" style="text-align:center;">
            <div style="font-size:18px;">{{ bar.icon }}</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px;" :style="{color:getStatusColor(bar.value)}">{{ bar.value }}</div>
            <div style="font-size:10px;color:var(--text-light)">{{ bar.label }}</div>
          </div>
        </div>
        <!-- 首页状态警告（有低指标时显示） -->
        <div v-if="!student.petDead && homeStatusWarning"
             :style="{
               marginTop:'10px',
               background: homeStatusWarning.urgent ? '#FFF3E0' : '#FFFDE7',
               border: '1.5px solid ' + (homeStatusWarning.urgent ? '#FF9800' : '#FFD54F'),
               borderRadius:'8px', padding:'7px 12px',
               fontSize:'12px',
               color: homeStatusWarning.urgent ? '#E65100' : '#F57C00',
               display:'flex', alignItems:'center', gap:'6px'
             }">
          <span>{{ homeStatusWarning.icon }}</span>
          <span>{{ homeStatusWarning.msg }}</span>
        </div>
      </div>



      <!-- 快捷操作 -->
      <div style="font-weight:800;font-size:16px;margin-bottom:10px;">⚡ 快捷功能</div>
      <div class="grid-2" style="gap:10px;">
        <div class="card" style="padding:16px;cursor:pointer;text-align:center;" @click="$emit('nav','rank')">
          <div style="font-size:36px;">🏆</div>
          <div style="font-weight:700;margin-top:6px;">查看排行</div>
          <div style="font-size:12px;color:var(--text-light)">看看你在第几名</div>
        </div>
        <div class="card" style="padding:16px;cursor:pointer;text-align:center;grid-column:span 2;"
             @click="$emit('nav','pet'); $emit('open-points-detail')">
          <div style="font-size:36px;">⭐</div>
          <div style="font-weight:700;margin-top:6px;">积分明细</div>
          <div style="font-size:12px;color:var(--text-light)">查看积分获取/扣分记录</div>
        </div>
      </div>
    </div>
  `,
  emits: ['nav', 'open-points-detail'],
};

// ---------- 学生端总容器 ----------
const StudentApp = {
  name: 'StudentApp',
  props: ['user'],
  emits: ['logout'],
  data() {
    return {
      currentTab: 'home',
      showLevelUp: false,
      levelUpStage: 0,
      studentData: null,   // 本地副本，驱动响应式
      tickInterval: null,
      showAvatarMenu: false,      // 头像弹出菜单
      showAvatarUpload: false,    // 上传头像弹窗
      showPointsNotify: false,    // 积分到账弹窗
      pointsNotifyData: null,     // { delta, reason, total }
      _isPurchasing: false,      // 购物中标志，通知弹窗在此期间静默消费积分变化
      _lastBuyPoints: null,       // 购买前快照积分，用于精确识别购买行为（绕过DB持久化时序问题）
      _lastBuyCost: 0,             // 本次购买消耗的积分
      showGlobalPointsDetail: false,  // 全局积分明细弹窗（从主页快捷入口打开）
      showPetDeadNotify: false,       // 宠物死亡通知弹窗
      petDeadInfo: null,              // { hoursMissed, pointLost }
      showPenaltyNotify: false,       // 离线惩罚通知弹窗
      penaltyInfo: null,              // { daysMissed, pointPenalty, newPoints }
      pointsWatchTimer: null,         // 积分监听定时器
      showStudentSelect: false,       // 登录时已选过，无需再选
      selectedStudentId: null,        // 选中的学生ID
      selectedStudent: null,          // 选中的学生对象
    };
  },
  computed: {
    // 优先用本地副本（响应式），兜底 Store（按 selectedStudentId）
    student() {
      const sid = this.selectedStudentId || this.user.id;
      return this.studentData || Store.state.students.find(s => s.id === sid);
    },
    hasPet() {
      // 用 studentData 驱动，确保 adoptPet 后立即响应
      return !!(this.studentData && this.studentData.petType);
    },
    navItems() {
      return [
        { key: 'home',    icon: '🏠', label: '主页'  },
        { key: 'pet',     icon: '🐾', label: '宠物'  },
        { key: 'rank',    icon: '🏆', label: '排行'  },
        { key: 'backpack',icon: '🎒', label: '背包'  },
        { key: 'achievement', icon: '🏆', label: '成就' },
      ];
    },
    // 仅显示真实学生，排除占位学生（占位学生仅在 DEBUG 模式可见）
    students() {
      const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1';
      return Store.state.students.filter(s => DEBUG_MODE || !s._isPlaceholder);
    },
    globalPointsHistory() {
      const s = this.student;
      if (!s) return [];
      const raw = Store.state.students.find(st => st.id === s.id);
      if (raw && raw.pointsLog && raw.pointsLog.length > 0) {
        return [...raw.pointsLog].reverse();
      }
      // 兜底
      const list = [];
      Store.state.tasks.forEach(task => {
        const sub = task.submissions.find(su => su.studentId === s.id);
        if (sub && sub.status === 'completed') {
          list.push({
            icon: task.icon,
            label: `完成任务「${task.title}」`,
            delta: task.points,
            time: sub.reviewedAt || sub.submittedAt || '',
          });
        }
      });
      return list.reverse();
    },
    // ---- 学生选择器相关计算属性 ----
    pickerStudents() {
      void Store.state.studentRev;
      return Store.state.students;
    },
    filteredPickerStudents() {
      const q = (this.pickerSearch || '').trim().toLowerCase();
      if (!q) return this.pickerStudents;
      return this.pickerStudents.filter(s => {
        const name = (s.name || '').toLowerCase();
        if (name.includes(q)) return true;
        const initials = this._getNameInitials(s.name || '');
        return initials.toLowerCase().startsWith(q) || initials.toLowerCase().includes(q);
      });
    },
    groupedPickerStudents() {
      const groups = {};
      for (const s of this.filteredPickerStudents) {
        const initials = this._getNameInitials(s.name || '');
        const ch = initials[0] || '#';
        if (!groups[ch]) groups[ch] = [];
        groups[ch].push(s);
      }
      return groups;
    },
    availableLetters() {
      const keys = Object.keys(this.groupedPickerStudents);
      return keys.sort((a, b) => {
        if (a === '#') return 1; if (b === '#') return -1;
        return a.localeCompare(b);
      });
    },
    rankByPoints() {
      return [...this.pickerStudents].sort((a, b) => (b.points||0) - (a.points||0)).slice(0, 5);
    },
    rankByPetExp() {
      return [...this.pickerStudents].filter(s => s.petType).sort((a, b) => (b.petExp||0) - (a.petExp||0)).slice(0, 5);
    },
  },
  data() {
    return {
      currentTab: 'home',
      selectedStudentId: null,
      studentData: null,
      showStudentSelect: true,
      showAvatarMenu: false,
      showAvatarUpload: false,
      showLevelUp: false,
      levelUpStage: 1,
      showPointsNotify: false,
      pointsNotifyData: null,
      showPetDeadNotify: false,
      petDeadInfo: null,
      showPenaltyNotify: false,
      penaltyInfo: null,
      tickInterval: null,
      pointsWatchTimer: null,
      showGlobalPointsDetail: false,
      _lastPoints: null,
      _lastBuyPoints: null,
      _lastBuyCost: null,
      _isPurchasing: false,
      // 学生选择器相关
      pickerSearch: '',
      pickerLandscape: window.innerWidth >= 768,
      pickerActiveLetter: null,
    };
  },
  mounted() {
    // 如果有 user prop（从登录页传入），自动选择该学生并跳过选择界面
    if (this.user && this.user.id) {
      this.selectedStudentId = this.user.id;
      this.showStudentSelect = false;
      this.refreshStudent();
      this.startPointsWatch();
      setTimeout(() => this.runDailyPenaltyCheck(), 500);
    }
    this.startTick();
    // 监听窗口大小变化，更新横竖屏状态
    this._resizeHandler = () => { this.pickerLandscape = window.innerWidth >= 768; };
    window.addEventListener('resize', this._resizeHandler);
  },
  beforeUnmount() {
    if (this.tickInterval) clearTimeout(this.tickInterval);   // tick 用 setTimeout，用 clearTimeout 清除
    if (this.pointsWatchTimer) clearInterval(this.pointsWatchTimer);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
  },
  template: `
    <div style="min-height:100vh;background:var(--bg-main);" @click="showAvatarMenu=false">
      <!-- 学生选择界面（横屏双栏 / 竖屏单栏） -->
      <div v-if="showStudentSelect" class="picker-page">

        <!-- 标题区 -->
        <div class="picker-header">
          <div class="picker-logo">🐾</div>
          <h1 class="picker-title">课堂宠物</h1>
          <p class="picker-subtitle">请选择你的名字</p>
        </div>

        <!-- 无学生时显示引导页 -->
        <div v-if="pickerStudents.length === 0" class="picker-empty">
          <div class="picker-empty-card">
            <div class="picker-empty-icon">👨‍🏫</div>
            <h2 class="picker-empty-title">暂无学生账号</h2>
            <p class="picker-empty-desc">
              请先由教师在「系统设置」中添加学生账号，或切换到教师端初始化演示数据。
            </p>
            <div class="picker-empty-actions">
              <button class="btn btn-primary" style="width:100%;" @click="$parent.switchMode && $parent.switchMode('teacher')">
                👨‍🏫 进入教师端
              </button>
              <button class="btn btn-ghost" style="width:100%;" @click="$parent.toggleDebugMode && $parent.toggleDebugMode()">
                🐛 加载演示数据
              </button>
            </div>
          </div>
        </div>

        <!-- 有学生时的主体布局 -->
        <template v-if="pickerStudents.length > 0">
          <!-- 搜索框：固定在顶部，不随页面滚动 -->
          <div class="picker-search-wrap">
            <div class="picker-search-icon">🔍</div>
            <input class="picker-search-input"
                   v-model="pickerSearch"
                   placeholder="搜索姓名或拼音首字母..."
                   @input="onPickerSearch" />
            <button v-if="pickerSearch" class="picker-search-clear" @click="pickerSearch='';onPickerSearch()">✕</button>
          </div>

          <!-- 主体区域：flex 布局 -->
          <div class="picker-body">

            <!-- ===== 左侧/主区：首字母索引 + 学生卡片 ===== -->
            <div class="picker-main" ref="pickerScrollArea">

              <!-- 首字母索引栏 -->
              <div class="picker-index-bar" :class="{ 'picker-index-vertical': pickerLandscape }">
                <button v-for="letter in availableLetters" :key="letter"
                        class="picker-index-btn"
                        :class="{ 'active': pickerActiveLetter === letter }"
                        @click="scrollToLetter(letter)">
                  {{ letter }}
                </button>
              </div>

              <!-- 按首字母分组的学生卡片列表 -->
              <div class="picker-groups">
                <div v-for="letter in availableLetters" :key="letter" :id="'picker-group-' + letter" class="picker-group">
                  <!-- 分组标题 -->
                  <div class="picker-group-header">
                    <span class="picker-group-badge">{{ letter }}</span>
                    <span class="picker-group-name">{{ letter }}</span>
                    <span class="picker-group-count">{{ groupedPickerStudents[letter].length }}人</span>
                  </div>
                  <!-- 3列网格卡片 -->
                  <div class="picker-grid">
                    <div v-for="s in groupedPickerStudents[letter]" :key="s.id"
                         class="picker-card"
                         @click="selectStudent(s)">
                      <!-- 头像 -->
                      <div class="picker-card-avatar">
                        <img v-if="s.avatar" :src="s.avatar" />
                        <span v-else class="picker-card-initial">{{ s.name && s.name[0] }}</span>
                      </div>
                      <!-- 名字 -->
                      <div class="picker-card-name">{{ s.name }}</div>
                      <div class="picker-card-class"></div>
                    </div>
                  </div>
                </div>

                <!-- 搜索无结果提示 -->
                <div v-if="filteredPickerStudents.length === 0 && pickerSearch" class="picker-no-result">
                  <div class="picker-no-result-icon">🔍</div>
                  <div>没有找到包含「{{ pickerSearch }}」的学生</div>
                </div>
              </div>
            </div>

            <!-- ===== 右侧：排行榜（仅横屏） ===== -->
            <div v-if="pickerLandscape" class="picker-sidebar">
              <!-- 积分榜 -->
              <div class="picker-rank-section">
                <div class="picker-rank-title picker-rank-title--points">⭐ 积分排行</div>
                <div v-for="(s, i) in rankByPoints" :key="'p'+s.id" class="picker-rank-item">
                  <span class="picker-rank-num" :class="{'rank-top': i<3}">{{ i+1 }}</span>
                  <div class="picker-rank-avatar">
                    <img v-if="s.avatar" :src="s.avatar" />
                    <span v-else>{{ (s.name||'')[0] }}</span>
                  </div>
                  <div class="picker-rank-info">
                    <div class="picker-rank-name">{{ s.name }}</div>
                    <div class="picker-rank-score">{{ s.points||0 }} 分</div>
                  </div>
                </div>
              </div>
              <!-- 宠物经验榜 -->
              <div v-if="rankByPetExp.length > 0" class="picker-rank-section">
                <div class="picker-rank-title picker-rank-title--pet">🐾 宠物经验</div>
                <div v-for="(s, i) in rankByPetExp" :key="'e'+s.id" class="picker-rank-item">
                  <span class="picker-rank-num" :class="{'rank-top': i<3}">{{ i+1 }}</span>
                  <div class="picker-rank-emoji">{{ getStudentPetEmoji(s) }}</div>
                  <div class="picker-rank-info">
                    <div class="picker-rank-name">{{ s.name }}</div>
                    <div class="picker-rank-score">{{ s.petExp||0 }} exp</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 竖屏排行榜（放在底部） -->
          <div v-if="!pickerLandscape" class="picker-mobile-ranks">
            <div class="picker-mrank-row">
              <div class="picker-mrank-block">
                <div class="picker-rank-title picker-rank-title--points">⭐ 积分 TOP5</div>
                <div v-for="(s, i) in rankByPoints" :key="'mp'+s.id" class="picker-mrank-item">
                  <span class="picker-mrank-num">{{ i+1 }}</span>
                  <span class="picker-mrank-name">{{ s.name }}</span>
                  <span class="picker-mrank-score">{{ s.points||0 }}分</span>
                </div>
              </div>
              <div v-if="rankByPetExp.length > 0" class="picker-mrank-block">
                <div class="picker-rank-title picker-rank-title--pet">🐾 经验 TOP5</div>
                <div v-for="(s, i) in rankByPetExp" :key="'me'+s.id" class="picker-mrank-item">
                  <span class="picker-mrank-num">{{ i+1 }}</span>
                  <span class="picker-mrank-emoji">{{ getStudentPetEmoji(s) }}</span>
                  <span class="picker-mrank-name">{{ s.name }}</span>
                  <span class="picker-mrank-score">{{ s.petExp||0}}</span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 版权信息 -->
        <div class="picker-footer">
          Made by Qin_zzq · Copyright © 2026
        </div>
      </div>

      <!-- 顶部导航 -->
      <div v-if="!showStudentSelect" class="topbar">
        <div class="topbar-logo">
          <span class="logo-icon">🐾</span>
          <span>课堂宠物</span>
        </div>
        <div class="topbar-right">
          <!-- 头像 + 下拉菜单 -->
          <div style="position:relative;" @click.stop>
            <div class="topbar-avatar" @click="showAvatarMenu=!showAvatarMenu" title="账户菜单"
                 :style="showAvatarMenu ? 'box-shadow:0 0 0 3px var(--primary);' : ''">
              <img v-if="student && student.avatar" :src="student.avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
              <span v-else>{{ (student && student.name && student.name[0]) || '👤' }}</span>
            </div>
            <!-- 下拉菜单 -->
            <transition name="fade">
              <div v-if="showAvatarMenu" class="avatar-dropdown">
                <div class="avatar-menu-header">
                  <div style="font-size:28px;font-weight:900;color:var(--primary);width:48px;height:48px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--bg-card);">
                    <img v-if="student && student.avatar" :src="student.avatar" style="width:100%;height:100%;object-fit:cover;" />
                    <span v-else>{{ (student && student.name && student.name[0]) || '👤' }}</span>
                  </div>
                  <div>
                    <div style="font-size:14px;font-weight:800;color:var(--text-dark);">{{ student && student.name }}</div>
                    <div style="font-size:12px;color:var(--text-light);"></div>
                  </div>
                </div>
                <div class="avatar-menu-item" @click="showAvatarUpload=true;showAvatarMenu=false">
                  <span>🖼️</span>
                  <span>更换头像</span>
                </div>
                <div class="avatar-menu-item avatar-menu-logout" @click="doLogout">
                  <span>🚪</span>
                  <span>退出登录</span>
                </div>
                <div class="avatar-menu-item" @click="showStudentSelect=true">
                  <span>👤</span>
                  <span>切换学生</span>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- 更换头像弹窗 -->
      <div v-if="showAvatarUpload" class="modal-overlay" @click.self="showAvatarUpload=false">
        <div class="modal-box" style="max-width:340px;text-align:center;">
          <h3 style="font-size:17px;font-weight:800;margin-bottom:16px;">🖼️ 更换头像</h3>
          <div style="margin:0 auto 16px;width:80px;height:80px;border-radius:50%;overflow:hidden;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;color:var(--primary);border:2px solid var(--border);">
            <img v-if="student && student.avatar" :src="student.avatar" style="width:100%;height:100%;object-fit:cover;" />
            <span v-else>{{ (student && student.name && student.name[0]) || '👤' }}</span>
          </div>
          <p style="font-size:13px;color:var(--text-light);margin-bottom:14px;">选择一张图片作为头像（支持 JPG/PNG/GIF，建议正方形）</p>
          <input type="file" accept="image/*" ref="avatarFileInput" style="display:none" @change="onAvatarFileChange" />
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" style="flex:1" @click="showAvatarUpload=false">取消</button>
            <button class="btn btn-primary" style="flex:2" @click="$refs.avatarFileInput.click()">📁 选择图片</button>
            <button v-if="student && student.avatar" class="btn btn-danger btn-sm" style="flex:1" @click="removeAvatar">删除</button>
          </div>
        </div>
      </div>

      <!-- 主内容 -->
      <div v-if="!showStudentSelect" class="main-content">
        <!-- 未领宠物时 -->
        <template v-if="!hasPet">
          <hatch-page :student="student" @update="onUpdate" @toast="onToast" @hatch-done="onHatchDone"></hatch-page>
        </template>
        <!-- 已领宠物 -->
        <template v-else>
          <student-home-page v-if="currentTab==='home'" :student="student" @nav="navTo" @open-points-detail="showGlobalPointsDetail=true"></student-home-page>
          <pet-page         v-if="currentTab==='pet'"     :student="student" @update="onUpdate" @toast="onToast" @level-up="onLevelUp" @purchase-start="onPurchaseStart" @purchase-end="onPurchaseEnd"></pet-page>
          <rank-page        v-if="currentTab==='rank'"    :student="student"></rank-page>
          <backpack-page    v-if="currentTab==='backpack'" :student="student" @update="onUpdate" @toast="onToast"></backpack-page>
          <achievement-page v-if="currentTab==='achievement'" :student="student"></achievement-page>
        </template>

        <!-- 底部导航 -->
        <div v-show="hasPet" class="bottom-nav">
          <div v-for="item in navItems" :key="item.key" class="nav-item"
               :class="{active: currentTab===item.key}" @click="navTo(item.key)">
            <span class="nav-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </div>
        </div>

        <!-- 版权信息 -->
        <div style="text-align:center;padding:10px;font-size:11px;color:var(--text-light);border-top:1px solid var(--border);">
          Made by Qin_zzq · Copyright © 2026
        </div>
      </div>

      <!-- 等级提升横幅 -->
      <div v-if="showLevelUp" class="level-up-banner">
        <div class="level-up-title">🎉 宠物升级！</div>
        <div class="level-up-sub">{{ student && student.petName }} 已成长到 Lv.{{ levelUpStage }}！</div>
        <div style="font-size:60px;margin-top:10px;">{{ student && getStudentPetEmoji(student) }}</div>
      </div>

      <!-- 💤 宠物休息弹窗（已禁用死亡，此弹窗不再显示） -->
      <!-- showPetDeadNotify 保留变量以避免代码报错，但永远不触发 -->

      <!-- ⚠️ 离线惩罚通知（已禁用，不再显示） -->

      <!-- 积分到账/扣除弹窗 -->
      <transition name="slide-up">
        <div v-if="showPointsNotify && pointsNotifyData" class="points-notify-popup"
             @click="showPointsNotify=false">
          <div class="points-notify-inner">
            <div style="font-size:36px;margin-bottom:4px;">
              {{ pointsNotifyData.delta > 0 ? '🎉' : '😢' }}
            </div>
            <div style="font-size:18px;font-weight:900;color:var(--text-dark);margin-bottom:4px;">
              {{ pointsNotifyData.delta > 0 ? '积分到账！' : '积分被扣除！' }}
            </div>
            <div style="font-size:28px;font-weight:900;"
                 :style="{color: pointsNotifyData.delta > 0 ? '#FF9800' : '#F44336'}">
              {{ pointsNotifyData.delta > 0 ? '+' : '' }}{{ pointsNotifyData.delta }} 积分
            </div>
            <div style="font-size:13px;color:var(--text-mid);margin-top:6px;">
              {{ pointsNotifyData.delta < 0
                ? (pointsNotifyData.reason || ('老师扣除了 ' + Math.abs(pointsNotifyData.delta) + ' 积分'))
                : pointsNotifyData.reason }}
            </div>
            <div style="font-size:12px;color:var(--text-light);margin-top:4px;">
              当前总积分：⭐ {{ pointsNotifyData.total }}
            </div>
            <div style="font-size:11px;color:var(--text-light);margin-top:8px;">点击关闭</div>
          </div>
        </div>
      </transition>

      <!-- 全局积分明细弹窗（从主页快捷功能入口打开） -->
      <div v-if="showGlobalPointsDetail" class="modal-overlay" @click.self="showGlobalPointsDetail=false"
           style="z-index:3000;">
        <div class="modal-box" style="max-height:80vh;overflow-y:auto;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <h3 style="font-size:18px;font-weight:800;color:var(--text-dark);">⭐ 积分明细</h3>
            <div style="font-size:22px;font-weight:900;color:#E65100;">{{ student && (student.points || 0) }} 分</div>
          </div>

          <div v-if="!globalPointsHistory || globalPointsHistory.length === 0"
               style="text-align:center;padding:30px 0;color:var(--text-light);">
            <div style="font-size:40px;margin-bottom:8px;">📋</div>
            <div style="font-size:14px;">暂无积分记录，完成任务可获得积分哦！</div>
          </div>

          <div v-for="(record, idx) in globalPointsHistory" :key="idx"
               style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="width:36px;height:36px;border-radius:50%;background:#FFF8E1;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
              {{ record.icon }}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:700;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                {{ record.label }}
              </div>
              <div style="font-size:11px;color:var(--text-light);margin-top:2px;">
                {{ record.time }}
                <span v-if="record.total !== undefined" style="margin-left:6px;">总计: {{ record.total }}</span>
              </div>
            </div>
            <div style="font-size:16px;font-weight:900;flex-shrink:0;"
                 :style="{color: record.delta > 0 ? '#4CAF50' : '#F44336'}">
              {{ record.delta > 0 ? '+' : '' }}{{ record.delta }}
            </div>
          </div>

          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:14px;" @click="showGlobalPointsDetail=false">关闭</button>
        </div>
      </div>

    </div>
  `,
  components: {
    HatchPage, PetPage, RankPage, BackpackPage, StudentHomePage, AchievementPage,
    'hatch-page': HatchPage,
    'pet-page': PetPage,
    'rank-page': RankPage,
    'backpack-page': BackpackPage,
    'student-home-page': StudentHomePage,
    'achievement-page': AchievementPage,
  },
  methods: {
    getStudentPetEmoji,
    async refreshStudent(freshData) {
      // 使用当前选中的学生ID（优先）或 props 里的 user.id
      const sid = this.selectedStudentId || this.user.id;
      // 如果有已知的最新数据（如 useItem 返回），直接用它，跳过 IndexedDB 重读的时序问题
      if (freshData) {
        Object.assign(Store.state.students.find(s => s.id === sid) || {}, freshData);
        this.studentData = { ...freshData };
        return;
      }
      // 先同步本地 state（adoptPet/grantPoints 等已更新的数据）
      const localRaw = Store.state.students.find(s => s.id === sid);
      if (localRaw) this.studentData = { ...localRaw };
      // 再异步刷新（从 IndexedDB 读取最新持久化数据）
      await Store.refreshStudent(sid);
      const raw = Store.state.students.find(s => s.id === sid);
      this.studentData = raw ? { ...raw } : null;
    },
    async onHatchDone() {
      await this.refreshStudent();
      this.$nextTick(() => {
        if (this.hasPet) {
          this.currentTab = 'home';
        }
      });
    },
    onPurchaseStart(snapshot) {
      // 快照购买前的积分，用于精确识别购买行为
      this._lastBuyPoints = snapshot.points;
      this._lastBuyCost = snapshot.cost;
      this._isPurchasing = true;
    },
    onPurchaseEnd() {
      this._isPurchasing = false;
    },
    // ---- 汉字转拼音首字母（粗略实现，基于 Unicode 码段映射）----
    _getNameInitials(name) {
      if (!name) return '';
      const PINYIN_MAP = {
        '阿':'A','啊':'A','埃':'AI','挨':'AI','哎':'AI','唉':'AI','哀':'AI','爱':'AI','矮':'AI','碍':'AI',
        '安':'AN','暗':'AN','岸':'AN','按':'AN','案':'AN','昂':'ANG','凹':'AO',
        '八':'B','巴':'B','伯':'B','白':'B','百':'B','班':'BAN','半':'BAN','办':'BAN','棒':'BANG','帮':'BANG','保':'BAO','报':'BAO','北':'BEI','背':'BEI','贝':'BEI','被':'BEI','本':'BEN','比':'BI','笔':'BI','必':'BI','毕':'BI','闭':'BI','碧':'BI','边':'BIAN','变':'BIAN','便':'BIAN','标':'BIAO','表':'BIAO','别':'BIE','宾':'BIN','冰':'BING','兵':'BING','饼':'BING','丙':'BING','并':'BING','病':'BING','拨':'BO','波':'BO','博':'BO','伯':'BO','搏':'BO','薄':'BO','补':'BU','不':'BU','布':'BU','步':'BU','部':'BU',
        '擦':'CA','猜':'CAI','才':'CAI','材':'CAI','财':'CAI','彩':'CAI','菜':'CAI','蔡':'CAI','参':'CAN','残':'CAN','蚕':'CAN','惨':'CAN','灿':'CAN','仓':'CANG','藏':'CANG','操':'CAO','草':'CAO','册':'CE','测':'CE','侧':'CE','厕':'CE','策':'CE','层':'CENG','曾':'CENG','查':'CHA','茶':'CHA','察':'CHA','差':'CHA','拆':'CHAI','柴':'CHAI','产':'CHAN','常':'CHANG','长':'CHANG','场':'CHANG','唱':'CHANG','超':'CHAO','朝':'CHAO','车':'CHE','彻':'CHE','陈':'CHEN','称':'CHEN','城':'CHENG','成':'CHENG','呈':'CHENG','承':'CHENG','程':'CHENG','吃':'CHI','持':'CHI','池':'CHI','迟':'CHI','赤':'CHI','冲':'CHONG','充':'CHONG','虫':'CHONG','抽':'CHOU','仇':'CHOU','丑':'CHOU','臭':'CHOU','出':'CHU','初':'CHU','除':'CHU','处':'CHU','楚':'CHU','触':'CHU','传':'CHUAN','船':'CHUAN','串':'CHUAN','创':'CHUANG','吹':'CHUI','春':'CHUN','纯':'CHUN','唇':'CHUN','戳':'CHUO','词':'CI','此':'CI','次':'CI','刺':'CI','从':'CONG','丛':'CONG','凑':'COU','粗':'CU','促':'CU','簇':'CU','窜':'CUAN','催':'CUI','脆':'CUI','翠':'CUI','村':'CUN','存':'CUN','寸':'CUN','错':'CUO',
        '搭':'DA','答':'DA','达':'DA','打':'DA','大':'DA','呆':'DAI','带':'DAI','代':'DAI','待':'DAI','袋':'DAI','大':'DA','大':'DA','丹':'DAN','单':'DAN','耽':'DAN','担':'DAN','胆':'DAN','旦':'DAN','蛋':'DAN','但':'DAN','诞':'DAN','淡':'DAN','弹':'DAN','档':'DANG','当':'DANG','刀':'DAO','导':'DAO','倒':'DAO','岛':'DAO','到':'DAO','盗':'DAO','道':'DAO','得':'DE','的':'DE','德':'DE','灯':'DENG','等':'DENG','邓':'DENG','低':'DI','底':'DI','滴':'DI','迪':'DI','敌':'DI','笛':'DI','底':'DI','地':'DI','弟':'DI','帝':'DI','第':'DI','递':'DI','典':'DIAN','点':'DIAN','电':'DIAN','店':'DIAN','垫':'DIAN','淀':'DIAN','雕':'DIAO','吊':'DIAO','掉':'DIAO','钓':'DIAO','调':'DIAO','跌':'DIE','爹':'DIE','碟':'DIE','叠':'DIE','丁':'DING','叮':'DING','盯':'DING','钉':'DING','顶':'DING','定':'DING','订':'DING','丢':'DIU','东':'DONG','冬':'DONG','懂':'DONG','动':'DONG','冻':'DONG','洞':'DONG','斗':'DOU','豆':'DOU','都':'DU','督':'DU','读':'DU','毒':'DU','独':'DU','读':'DU','堵':'DU','赌':'DU','杜':'DU','度':'DU','渡':'DU','端':'DUAN','短':'DUAN','段':'DUAN','断':'DUAN','锻':'DUAN','堆':'DUI','队':'DUI','对':'DUI','吨':'DUN','蹲':'DUN','顿':'DUN','多':'DUO','夺':'DUO','朵':'DUO','躲':'DUO',
        '额':'E','俄':'E','恶':'E','饿':'E','恩':'EN','儿':'ER','而':'ER','尔':'ER','耳':'ER','二':'ER',
        '发':'FA','法':'FA','翻':'FAN','凡':'FAN','反':'FAN','返':'FAN','范':'FAN','犯':'FAN','饭':'FAN','方':'FANG','防':'FANG','坊':'FANG','房':'FANG','芳':'FANG','非':'FEI','飞':'FEI','肥':'FEI','费':'FEI','分':'FEN','纷':'FEN','粉':'FEN','份':'FEN','奋':'FEN','粪':'FEN','风':'FENG','封':'FENG','峰':'FENG','锋':'FENG','蜂':'FENG','冯':'FENG','奉':'FENG','否':'FOU','佛':'FO',
        '夫':'FU','服':'FU','弗':'FU','福':'FU','伏':'FU','扶':'FU','幅':'FU','浮':'FU','符':'FU','辐':'FU','幅':'FU','福':'FU','甫':'FU','俯':'FU','釜':'FU','辅':'FU','腐':'FU','父':'FU','付':'FU','负':'FU','附':'FU','复':'FU','傅':'FU','富':'FU','腹':'FU','覆':'FU',
        '噶':'GA','嘎':'GA','该':'GAI','改':'GAI','概':'GAI','钙':'GAI','盖':'GAI','干':'GAN','杆':'GAN','赶':'GAN','感':'GAN','敢':'GAN','刚':'GANG','纲':'GANG','港':'GANG','高':'GAO','糕':'GAO','告':'GAO','哥':'GE','歌':'GE','格':'GE','阁':'GE','革':'GE','隔':'GE','个':'GE','给':'GEI','根':'GEN','跟':'GEN','更':'GENG','工':'GONG','公':'GONG','功':'GONG','攻':'GONG','供':'GONG','宫':'GONG','恭':'GONG','拱':'GONG','共':'GONG','贡':'GONG','沟':'GOU','狗':'GOU','构':'GOU','购':'GOU','够':'GOU','估':'GU','姑':'GU','孤':'GU','古':'GU','谷':'GU','股':'GU','骨':'GU','鼓':'GU','固':'GU','故':'GU','顾':'GU','瓜':'GUA','挂':'GUA','怪':'GUAI','关':'GUAN','观':'GUAN','官':'GUAN','冠':'GUAN','馆':'GUAN','管':'GUAN','惯':'GUAN','广':'GUANG','光':'GUANG','广':'GUANG','逛':'GUANG','归':'GUI','贵':'GUI','桂':'GUI','柜':'GUI','鬼':'GUI','轨':'GUI','国':'GUO','果':'GUO','过':'GUO',
        '哈':'HA','还':'HAI','孩':'HAI','海':'HAI','害':'HAI','汉':'HAN','号':'HAO','好':'HAO','浩':'HAO','喝':'HE','合':'HE','何':'HE','和':'HE','河':'HE','核':'HE','荷':'HE','盒':'HE','黑':'HEI','黑':'HEI','很':'HEN','恨':'HEN','哼':'HENG','横':'HENG','衡':'HENG','红':'HONG','洪':'HONG','宏':'HONG','虹':'HONG','鸿':'HONG','侯':'HOU','后':'HOU','厚':'HOU','候':'HOU','呼':'HU','乎':'HU','忽':'HU','胡':'HU','湖':'HU','虎':'HU','护':'HU','互':'HU','户':'HU','花':'HUA','华':'HUA','划':'HUA','化':'HUA','话':'HUA','画':'HUA','划':'HUA','怀':'HUAI','坏':'HUAI','欢':'HUAN','还':'HUAN','环':'HUAN','缓':'HUAN','换':'HUAN','唤':'HUAN','患':'HUAN','黄':'HUANG','慌':'HUANG','晃':'HUANG','灰':'HUI','挥':'HUI','辉':'HUI','徽':'HUI','回':'HUI','毁':'HUI','悔':'HUI','汇':'HUI','会':'HUI','绘':'HUI','惠':'HUI','慧':'HUI','昏':'HUN','婚':'HUN','浑':'HUN','混':'HUN','活':'HUO','火':'HUO','或':'HUO','货':'HUO','获':'HUO','祸':'HUO',
        '几':'JI','击':'JI','机':'JI','肌':'JI','鸡':'JI','迹':'JI','积':'JI','基':'JI','激':'JI','及':'JI','吉':'JI','级':'JI','极':'JI','即':'JI','急':'JI','疾':'JI','集':'JI','及':'JI','己':'JI','挤':'JI','技':'JI','季':'JI','继':'JI','纪':'JI','济':'JI','寂':'JI','寄':'JI','计':'JI','记':'JI','忌':'JI','纪':'JI','际':'JI','继':'JI','祭':'JI','剂':'JI','季':'JI','既':'JI','jia':'JIA','加':'JIA','夹':'JIA','佳':'JIA','家':'JIA','嘉':'JIA','英':'JIA','贾':'JIA','甲':'JIA','假':'JIA','嫁':'JIA','价':'JIA','架':'JIA','驾':'JIA','坚':'JIAN','尖':'JIAN','间':'JIAN','肩':'JIAN','艰':'JIAN','兼':'JIAN','监':'JIAN','减':'JIAN','检':'JIAN','剪':'JIAN','简':'JIAN','见':'JIAN','件':'JIAN','建':'JIAN','剑':'JIAN','键':'JIAN','健':'JIAN','舰':'JIAN','渐':'JIAN','践':'JIAN','鉴':'JIAN','江':'JIANG','姜':'JIANG','将':'JIANG','浆':'JIANG','僵':'JIANG','疆':'JIANG','讲':'JIANG','奖':'JIANG','桨':'JIANG','蒋':'JIANG','匠':'JIANG','降':'JIANG','郊':'JIAO','浇':'JIAO','骄':'JIAO','娇':'JIAO','胶':'JIAO','焦':'JIAO','角':'JIAO','脚':'JIAO','搅':'JIAO','叫':'JIAO','觉':'JIAO','教':'JIAO','阶':'JIE','街':'JIE','节':'JIE','劫':'JIE','杰':'JIE','洁':'JIE','结':'JIE','捷':'JIE','截':'JIE','解':'JIE','姐':'JIE','界':'JIE','借':'JIE','介':'JIE','戒':'JIE','津':'JIN','今':'JIN','金':'JIN','仅':'JIN','紧':'JIN','锦':'JIN','进':'JIN','近':'JIN','劲':'JIN','晋':'JIN','禁':'JIN','尽':'JIN','烬':'JIN','京':'JING','经':'JING','惊':'JING','精':'JING','井':'JING','警':'JING','景':'JING','颈':'JING','静':'JING','境':'JING','镜':'JING','竞':'JING','竟':'JING','敬':'JING','久':'JIU','九':'JIU','酒':'JIU','旧':'JIU','救':'JIU','就':'JIU','舅':'JIU','举':'JU','巨':'JU','具':'JU','剧':'JU','据':'JU','距':'JU','惧':'JU','句':'JU','聚':'JU','拒':'JU','柜':'JU','居':'JU','菊':'JU','局':'JU','橘':'JU','矩':'JU','举':'JU','据':'JU','聚':'JU','巨':'JU','俱':'JU','剧':'JU','卷':'JUAN','倦':'JUAN','决':'JUE','绝':'JUE','觉':'JUE','均':'JUN','军':'JUN','君':'JUN','俊':'JUN','菌':'JUN','骏':'JUN',
        '卡':'KA','开':'KAI','揩':'KAI','凯':'KAI','刊':'KAN','看':'KAN','砍':'KAN','康':'KANG','抗':'KANG','考':'KAO','烤':'KAO','靠':'KAO','科':'KE','颗':'KE','壳':'KE','咳':'KE','可':'KE','克':'KE','刻':'KE','客':'KE','课':'KE','课':'KE','肯':'KEN','恳':'KEN','坑':'KENG','空':'KONG','孔':'KONG','恐':'KONG','控':'KONG','口':'KOU','扣':'KOU','哭':'KU','苦':'KU','库':'KU','裤':'KU','酷':'KU','夸':'KUA','垮':'KUA','跨':'KUA','挎':'KUA','块':'KUAI','快':'KUAI','宽':'KUAN','款':'KUAN','矿':'KUANG','眶':'KUANG','亏':'KUI','葵':'KUI','愧':'KUI','溃':'KUI','坤':'KUN','昆':'KUN','困':'KUN','扩':'KUO','阔':'KUO',
        '拉':'LA','啦':'LA','腊':'LA','蜡':'LA','来':'LAI','赖':'LAI','蓝':'LAN','兰':'LAN','拦':'LAN','栏':'LAN','懒':'LAN','烂':'LAN','滥':'LAN','郎':'LANG','浪':'LANG','捞':'LAO','劳':'LAO','老':'LAO','乐':'LE','勒':'LEI','雷':'LEI','累':'LEI','泪':'LEI','类':'LEI','擂':'LEI','冷':'LENG','离':'LI','厘':'LI','梨':'LI','黎':'LI','礼':'LI','里':'LI','理':'LI','李':'LI','力':'LI','历':'LI','厉':'LI','立':'LI','丽':'LI','利':'LI','励':'LI','连':'LIAN','帘':'LIAN','廉':'LIAN','联':'LIAN','莲':'LIAN','连':'LIAN','脸':'LIAN','练':'LIAN','恋':'LIAN','炼':'LIAN','凉':'LIANG','梁':'LIANG','良':'LIANG','两':'LIANG','量':'LIANG','粮':'LIANG','梁':'LIANG','亮':'LIANG','谅':'LIANG','辽':'LIAO','疗':'LIAO','聊':'LIAO','了':'LIAO','料':'LIAO','列':'LIE','烈':'LIE','猎':'LIE','裂':'LIE','林':'LIN','临':'LIN','邻':'LIN','琳':'LIN','淋':'LIN','凛':'LIN','吝':'LIN','拎':'LIN','伶':'LING','灵':'LING','铃':'LING','零':'LING','龄':'LING','领':'LING','令':'LING','另':'LING','刘':'LIU','留':'LIU','流':'LIU','柳':'LIU','六':'LIU','龙':'LONG','隆':'LONG','笼':'LONG','拢':'LONG','楼':'LOU','搂':'LOU','漏':'LOU','露':'LOU','卢':'LU','芦':'LU','炉':'LU','陆':'LU','录':'LU','鹿':'LU','鲁':'LU','路':'LU','露':'LU','林':'LU','吕':'LU','旅':'LU','屡':'LU','律':'LU','虑':'LU','率':'LU','氯':'LU','滤':'LU','卵':'LUAN','乱':'LUAN','掠':'LUE','略':'LUE','轮':'LUN','伦':'LUN','论':'LUN','沦':'LUN','罗':'LUO','洛':'LUO','逻':'LUO','络':'LUO','骆':'LUO',
        '妈':'MA','麻':'MA','马':'MA','码':'MA','吗':'MA','骂':'MA','麻':'MA','吗':'MA','嘛':'MA','埋':'MAI','买':'MAI','麦':'MAI','卖':'MAI','迈':'MAI','满':'MAN','慢':'MAN','瞒':'MAN','曼':'MAN','漫':'MAN','芒':'MANG','忙':'MANG','盲':'MANG','茫':'MANG','猫':'MAO','毛':'MAO','矛':'MAO','冒':'MAO','贸':'MAO','帽':'MAO','貌':'MAO','么':'ME','没':'MEI','枚':'MEI','梅':'MEI','媒':'MEI','煤':'MEI','每':'MEI','美':'MEI','妹':'MEI','门':'MEN','闷':'MEN','们':'MEN','萌':'MENG','蒙':'MENG','盟':'MENG','猛':'MENG','梦':'MENG','孟':'MENG','米':'MI','迷':'MI','谜':'MI','密':'MI','蜜':'MI','眠':'MIAN','面':'MIAN','苗':'MIAO','描':'MIAO','秒':'MIAO','妙':'MIAO','庙':'MIAO','灭':'MIE','民':'MIN','敏':'MIN','闽':'MIN','明':'MING','名':'MING','鸣':'MING','命':'MING','摸':'MO','模':'MO','膜':'MO','摩':'MO','磨':'MO','魔':'MO','抹':'MO','末':'MO','莫':'MO','墨':'MO','默':'MO','没':'MOU','某':'MOU','牟':'MOU','模':'MOU','木':'MU','母':'MU','目':'MU','墓':'MU','幕':'MU','慕':'MU','穆':'MU',
        '拿':'NA','那':'NA','娜':'NA','纳':'NA','钠':'NA','娜':'NA','呢':'NE','内':'NEI','嫩':'NEN','能':'NENG','你':'NI','妮':'NI','尼':'NI','泥':'NI','拟':'NI','你':'NI','匿':'NI','逆':'NI','腻':'NI','年':'NIAN','念':'NIAN','粘':'NIAN','捻':'NIAN','娘':'NIANG','酿':'NIANG','鸟':'NIAO','尿':'NIAO','捏':'NIE','您':'NIN','宁':'NING','凝':'NING','牛':'NIU','扭':'NIU','纽':'NIU','农':'NONG','浓':'NONG','弄':'NONG','奴':'NU','努':'NU','怒':'NU','女':'NV','暖':'NUAN','虐':'NUE','疟':'NUE','挪':'NUO','懦':'NUO','诺':'NUO','糯':'NUO',
        '欧':'OU','偶':'OU','呕':'OU',
        '趴':'PA','怕':'PA','拍':'PAI','排':'PAI','牌':'PAI','派':'PAI','潘':'PAN','盘':'PAN','判':'PAN','叛':'PAN','盼':'PAN','庞':'PANG','旁':'PANG','胖':'PANG','跑':'PAO','炮':'PAO','泡':'PAO','胚':'PEI','陪':'PEI','配':'PEI','佩':'PEI','喷':'PEN','盆':'PEN','朋':'PENG','彭':'PENG','棚':'PENG','蓬':'PENG','碰':'PENG','批':'PI','披':'PI','皮':'PI','疲':'PI','脾':'PI','匹':'PI','屁':'PI','僻':'PI','片':'PIAN','偏':'PIAN','骗':'PIAN','飘':'PIAO','票':'PIAO','拼':'PIN','贫':'PIN','频':'PIN','品':'PIN','聘':'PIN','平':'PING','评':'PING','凭':'PING','瓶':'PING','苹':'PING','坡':'PO','泼':'PO','颇':'PO','破':'PO','迫':'PO','扑':'PU','铺':'PU','葡':'PU','蒲':'PU','朴':'PU','谱':'PU','普':'PU','曝':'PU','瀑':'PU',
        '七':'QI','期':'QI','其':'QI','奇':'QI','歧':'QI','骑':'QI','棋':'QI','旗':'QI','企':'QI','岂':'QI','启':'QI','起':'QI','气':'QI','器':'QI','弃':'QI','汽':'QI','契':'QI','砌':'QI','器':'QI','恰':'QIA','洽':'QIA','恰':'QIA','千':'QIAN','迁':'QIAN','牵':'QIAN','谦':'QIAN','签':'QIAN','前':'QIAN','钱':'QIAN','潜':'QIAN','浅':'QIAN','遣':'QIAN','欠':'QIAN','歉':'QIAN','强':'QIANG','墙':'QIANG','抢':'QIANG','强':'QIANG','悄':'QIAO','敲':'QIAO','桥':'QIAO','瞧':'QIAO','巧':'QIAO','俏':'QIAO','峭':'QIAO','翘':'QIAO','切':'QIE','且':'QIE','窃':'QIE','侵':'QIN','亲':'QIN','秦':'QIN','琴':'QIN','勤':'QIN','青':'QING','轻':'QING','氢':'QING','倾':'QING','清':'QING','情':'QING','晴':'QING','请':'QING','庆':'QING','穷':'QIONG','秋':'QIU','求':'QIU','球':'QIU','区':'QU','曲':'QU','驱':'QU','屈':'QU','躯':'QU','趋':'QU','渠':'QU','取':'QU','去':'QU','趣':'QUAN','全':'QUAN','权':'QUAN','泉':'QUAN','拳':'QUAN','犬':'QUAN','劝':'QUAN','缺':'QUE','却':'QUE','雀':'QUE','确':'QUE','群':'QUN','裙':'QUN',
        '然':'RAN','燃':'RAN','染':'RAN','嚷':'RANG','让':'RANG','饶':'RAO','绕':'RAO','热':'RE','人':'REN','仁':'REN','忍':'REN','认':'REN','任':'REN','扔':'RENG','仍':'RENG','日':'RI','绒':'RONG','容':'RONG','熔':'RONG','荣':'RONG','融':'RONG','绒':'RONG','如':'RU','儒':'RU','蠕':'RU','如':'RU','乳':'RU','入':'RU','软':'RUAN','锐':'RUI','瑞':'RUI','润':'RUN','若':'RUO',
        '撒':'SA','洒':'SA','萨':'SA','塞':'SAI','三':'SAN','散':'SAN','桑':'SANG','嗓':'SANG','扫':'SAO','色':'SE','森':'SEN','僧':'SENG','沙':'SHA','杀':'SHA','啥':'SHA','沙':'SHA','纱':'SHA','傻':'SHA','帅':'SHUAI','率':'SHUAI','摔':'SHUAI','甩':'SHUAI','衰':'SHUAI','双':'SHUANG','霜':'SHUANG','爽':'SHUANG','谁':'SHUI','水':'SHUI','税':'SHUI','睡':'SHUI','顺':'SHUN','说':'SHUO','硕':'SHUO','朔':'SHUO','斯':'SI','私':'SI','思':'SI','司':'SI','丝':'SI','死':'SI','四':'SI','寺':'SI','似':'SI','伺':'SI','松':'SONG','耸':'SONG','送':'SONG','宋':'SONG','颂':'SONG','搜':'SOU','艘':'SOU','苏':'SU','俗':'SU','诉':'SU','素':'SU','速':'SU','塑':'SU','肃':'SU','酸':'SUAN','算':'SUAN','虽':'SUI','随':'SUI','岁':'SUI','碎':'SUI','遂':'SUI','隧':'SUI','孙':'SUN','损':'SUN','笋':'SUN','缩':'SUO','所':'SUO','索':'SUO','琐':'SUO','锁':'SUO',
        '他':'TA','她':'TA','它':'TA','塔':'TA','踏':'TA','胎':'TAI','台':'TAI','太':'TAI','态':'TAI','抬':'TAI','泰':'TAI','坍':'TAN','摊':'TAN','贪':'TAN','滩':'TAN','谈':'TAN','痰':'TAN','坦':'TAN','叹':'TAN','炭':'TAN','探':'TAN','汤':'TANG','唐':'TANG','堂':'TANG','塘':'TANG','糖':'TANG','躺':'TANG','烫':'TANG','掏':'TAO','逃':'TAO','桃':'TAO','淘':'TAO','陶':'TAO','讨':'TAO','套':'TAO','特':'TE','疼':'TENG','腾':'TENG','藤':'TENG','梯':'TI','踢':'TI','提':'TI','题':'TI','体':'TI','替':'TI','天':'TIAN','添':'TIAN','田':'TIAN','甜':'TIAN','填':'TIAN','挑':'TIAO','跳':'TIAO','贴':'TIE','铁':'TIE','帖':'TIE','厅':'TING','听':'TING','停':'TING','庭':'TING','挺':'TING','通':'TONG','同':'TONG','铜':'TONG','童':'TONG','统':'TONG','痛':'TONG','偷':'TOU','投':'TOU','头':'TOU','透':'TOU','突':'TU','图':'TU','徒':'TU','途':'TU','涂':'TU','土':'TU','吐':'TU','兔':'TU','团':'TUAN','推':'TUI','腿':'TUI','退':'TUI','吞':'TUN','屯':'TUN','托':'TUO','拖':'TUO','脱':'TUO','驼':'TUO','妥':'TUO','拓':'TUO',
        '挖':'WA','瓦':'WA','袜':'WA','歪':'WAI','外':'WAI','弯':'WAN','湾':'WAN','玩':'WAN','完':'WAN','顽':'WAN','丸':'WAN','晚':'WAN','碗':'WAN','万':'WAN','汪':'WANG','王':'WANG','往':'WANG','网':'WANG','望':'WANG','忘':'WANG','危':'WEI','威':'WEI','微':'WEI','为':'WEI','韦':'WEI','围':'WEI','违':'WEI','唯':'WEI','维':'WEI','伪':'WEI','位':'WEI','胃':'WEI','卫':'WEI','未':'WEI','温':'WEN','文':'WEN','纹':'WEN','闻':'WEN','蚊':'WEN','问':'WEN','翁':'WENG','我':'WO','沃':'WO','卧':'WO','握':'WO','屋':'WU','无':'WU','吴':'WU','五':'WU','午':'WU','舞':'WU','武':'WU','物':'WU','务':'WU','误':'WU','悟':'WU',
        '西':'XI','吸':'XI','希':'XI','昔':'XI','析':'XI','息':'XI','悉':'XI','惜':'XI','稀':'XI','锡':'XI','溪':'XI','熙':'XI','晰':'XI','嘻':'XI','吸':'XI','习':'XI','席':'XI','袭':'XI','洗':'XI','喜':'XI','系':'XI','细':'XI','戏':'XI','系':'XI','隙':'XI','虾':'XIA','瞎':'XIA','峡':'XIA','侠':'XIA','狭':'XIA','下':'XIA','夏':'XIA','吓':'XIA','掀':'XIAN','先':'XIAN','仙':'XIAN','鲜':'XIAN','闲':'XIAN','弦':'XIAN','嫌':'XIAN','显':'XIAN','险':'XIAN','现':'XIAN','线':'XIAN','限':'XIAN','宪':'XIAN','县':'XIAN','献':'XIAN','腺':'XIAN','相':'XIANG','香':'XIANG','乡':'XIANG','湘':'XIANG','箱':'XIANG','详':'XIANG','想':'XIANG','响':'XIANG','享':'XIANG','项':'XIANG','象':'XIANG','像':'XIANG','橡':'XIANG','向':'XIANG','萧':'XIAO','硝':'XIAO','削':'XIAO','消':'XIAO','宵':'XIAO','小':'XIAO','晓':'XIAO','孝':'XIAO','校':'XIAO','肖':'XIAO','效':'XIAO','笑':'XIAO','些':'XIE','写':'XIE','协':'XIE','斜':'XIE','协':'XIE','胁':'XIE','谐':'XIE','鞋':'XIE','携':'XIE','写':'XIE','谢':'XIE','泄':'XIE','屑':'XIE','薪':'XIN','心':'XIN','辛':'XIN','新':'XIN','信':'XIN','星':'XING','腥':'XING','猩':'XING','兴':'XING','刑':'XING','行':'XING','形':'XING','型':'XING','醒':'XING','姓':'XING','性':'XING','凶':'XIONG','兄':'XIONG','胸':'XIONG','熊':'XIONG','休':'XIU','修':'XIU','羞':'XIU','朽':'XIU','秀':'XIU','绣':'XIU','臭':'XIU','需':'XU','虚':'XU','须':'XU','徐':'XU','许':'XU','续':'XU','蓄':'XU','轩':'XUAN','宣':'XUAN','旋':'XUAN','悬':'XUAN','选':'XUAN','癣':'XUAN','旋':'XUAN','穴':'XUE','学':'XUE','雪':'XUE','血':'XUE','循':'XUN','巡':'XUN','寻':'XUN','驯':'XUN','训':'XUN','讯':'XUN','迅':'XUN',
        '压':'YA','呀':'YA','鸭':'YA','牙':'YA','芽':'YA','呀':'YA','哑':'YA','亚':'YA','呀':'YA','呀':'YA','雅':'YA','咽':'YAN','烟':'YAN','淹':'YAN','延':'YAN','严':'YAN','研':'YAN','盐':'YAN','岩':'YAN','炎':'YAN','沿':'YAN','言':'YAN','颜':'YAN','阎':'YAN','阎':'YAN','掩':'YAN','眼':'YAN','演':'YAN','厌':'YAN','雁':'YAN','燕':'YAN','艳':'YAN','验':'YAN','央':'YANG','扬':'YANG','羊':'YANG','阳':'YANG','杨':'YANG','洋':'YANG','仰':'YANG','养':'YANG','氧':'YANG','痒':'YANG','样':'YANG','邀':'YAO','腰':'YAO','妖':'YAO','摇':'YAO','窑':'YAO','遥':'YAO','咬':'YAO','药':'YAO','要':'YAO','耀':'YAO','爷':'YE','也':'YE','治':'YE','野':'YE','叶':'YE','业':'YE','夜':'YE','液':'YE','一':'YI','伊':'YI','衣':'YI','医':'YI','依':'YI','仪':'YI','宜':'YI','姨':'YI','移':'YI','遗':'YI','疑':'YI','已':'YI','乙':'YI','以':'YI','艺':'YI','易':'YI','异':'YI','抑':'YI','译':'YI','衣':'YI','医':'YI','亿':'YI','忆':'YI','义':'YI','艺':'YI','议':'YI','译':'YI','议':'YI','异':'YI','屹':'YI','役':'YI','疫':'YI','意':'YI','溢':'YI','毅':'YI','翼':'YI','因':'YIN','阴':'YIN','音':'YIN','吟':'YIN','银':'YIN','引':'YIN','饮':'YIN','隐':'YIN','印':'YIN','英':'YING','樱':'YING','鹰':'YING','应':'YING','迎':'YING','盈':'YING','赢':'YING','影':'YING','映':'YING','硬':'YING','哟':'YO','用':'YONG','佣':'YONG','永':'YONG','泳':'YONG','勇':'YONG','涌':'YONG','蛹':'YONG','踊':'YONG','涌':'YONG','永':'YONG','用':'YONG','优':'YOU','忧':'YOU','尤':'YOU','由':'YOU','油':'YOU','邮':'YOU','犹':'YOU','游':'YOU','友':'YOU','有':'YOU','酉':'YOU','又':'YOU','幼':'YOU','右':'YOU','佑':'YOU','余':'YU','鱼':'YU','俞':'YU','娱':'YU','渔':'YU','愉':'YU','与':'YU','予':'YU','宇':'YU','羽':'YU','雨':'YU','语':'YU','玉':'YU','育':'YU','域':'YU','郁':'YU','狱':'YU','浴':'YU','预':'YU','欲':'YU','御':'YU','裕':'YU','遇':'YU','寓':'YU','愈':'YU','誉':'YU','豫':'YU','元':'YUAN','员':'YUAN','园':'YUAN','圆':'YUAN','原':'YUAN','袁':'YUAN','援':'YUAN','缘':'YUAN','源':'YUAN','远':'YUAN','怨':'YUAN','院':'YUAN','愿':'YUAN','约':'YUE','月':'YUE','岳':'YUE','钥':'YUE','悦':'YUE','阅':'YUE','跃':'YUE','越':'YUE','匀':'YUN','云':'YUN','允':'YUN','孕':'YUN','运':'YUN','晕':'YUN','韵':'YUN','蕴':'YUN','杂':'ZA','咱':'ZAN','暂':'ZAN','赞':'ZAN','赃':'ZANG','脏':'ZANG','遭':'ZAO','糟':'ZAO','早':'ZAO','枣':'ZAO','蚤':'ZAO','澡':'ZAO','皂':'ZAO','灶':'ZAO','造':'ZAO','燥':'ZAO','躁':'ZAO','则':'ZE','责':'ZE','择':'ZE','泽':'ZE','怎':'ZEN','增':'ZENG','曾':'ZENG','赠':'ZENG','扎':'ZHA','闸':'ZHA','炸':'ZHA','宅':'ZHAI','窄':'ZHAI','债':'ZHAI','寨':'ZHAI','沾':'ZHAN','粘':'ZHAN','斩':'ZHAN','展':'ZHAN','盏':'ZHAN','崭':'ZHAN','站':'ZHAN','占':'ZHAN','战':'ZHAN','栈':'ZHAN','张':'ZHANG','章':'ZHANG','掌':'ZHANG','涨':'ZHANG','长':'ZHANG','帐':'ZHANG','账':'ZHANG','杖':'ZHANG','丈':'ZHANG','仗':'ZHANG','招':'ZHAO','昭':'ZHAO','找':'ZHAO','赵':'ZHAO','照':'ZHAO','罩':'ZHAO','兆':'ZHAO','召':'ZHAO','者':'ZHE','浙':'ZHE','着':'ZHEO','遮':'ZHE','折':'ZHE','哲':'ZHE','辙':'ZHE','者':'ZHE','这':'ZHE','真':'ZHEN','针':'ZHEN','侦':'ZHEN','诊':'ZHEN','振':'ZHEN','震':'ZHEN','镇':'ZHEN','阵':'ZHEN','争':'ZHENG','征':'ZHENG','挣':'ZHENG','睁':'ZHENG','蒸':'ZHENG','整':'ZHENG','正':'ZHENG','证':'ZHENG','郑':'ZHENG','政':'ZHENG','帧':'ZHENG','之':'ZHI','支':'ZHI','只':'ZHI','汁':'ZHI','织':'ZHI','知':'ZHI','肢':'ZHI','脂':'ZHI','之':'ZHI','执':'ZHI','直':'ZHI','值':'ZHI','职':'ZHI','植':'ZHI','殖':'ZHI','止':'ZHI','只':'ZHI','旨':'ZHI','指':'ZHI','至':'ZHI','志':'ZHI','制':'ZHI','治':'ZHI','质':'ZHI','致':'ZHI','智':'ZHI','置':'ZHI','稚':'ZHI','中':'ZHONG','忠':'ZHONG','终':'ZHONG','钟':'ZHONG','肿':'ZHONG','种':'ZHONG','重':'ZHONG','众':'ZHONG','洲':'ZHOU','周':'ZHOU','州':'ZHOU','粥':'ZHOU','轴':'ZHOU','肘':'ZHOU','帚':'ZHOU','咒':'ZHOU','昼':'ZHOU','皱':'ZHOU','骤':'ZHOU','猪':'ZHU','珠':'ZHU','株':'ZHU','蛛':'ZHU','诸':'ZHU','猪':'ZHU','逐':'ZHU','竹':'ZHU','烛':'ZHU','主':'ZHU','著':'ZHU','柱':'ZHU','助':'ZHU','住':'ZHU','注':'ZHU','祝':'ZHU','驻':'ZHU','柱':'ZHU','抓':'ZHUAI','拽':'ZHUAI','专':'ZHUAN','砖':'ZHUAN','转':'ZHUAN','赚':'ZHUAN','撰':'ZHUAN','庄':'ZHUANG','装':'ZHUANG','妆':'ZHUANG','撞':'ZHUANG','壮':'ZHUANG','状':'ZHUANG','椎':'ZHUI','锥':'ZHUI','坠':'ZHUI','缀':'ZHUI','准':'ZHUN','捉':'ZHUO','桌':'ZHUO','卓':'ZHUO','琢':'ZHUO','灼':'ZHUO','浊':'ZHUO','着':'ZI','咨':'ZI','资':'ZI','姿':'ZI','滋':'ZI','紫':'ZI','子':'ZI','仔':'ZI','自':'ZI','字':'ZI','宗':'ZONG','综':'ZONG','棕':'ZONG','总':'ZONG','纵':'ZONG','走':'ZOU','奏':'ZOU','揍':'ZOU','足':'ZU','租':'ZU','组':'ZU','祖':'ZU','阻':'ZU','组':'ZU','钻':'ZUAN','嘴':'ZUI','最':'ZUI','罪':'ZUI','醉':'ZUI','尊':'ZUN','遵':'ZUN','昨':'ZUO','左':'ZUO','佐':'ZUO','坐':'ZUO','座':'ZUO','做':'ZUO','作':'ZUO','作':'ZUO',
      };
      let result = '';
      for (const ch of name) {
        if (/[a-zA-Z]/.test(ch)) { result += ch.toUpperCase(); continue; }
        if (/[0-9]/.test(ch)) { continue; }
        const mapped = PINYIN_MAP[ch];
        if (mapped) { result += mapped[0]; }
      }
      return result;
    },
    // 滚动到指定首字母分组
    scrollToLetter(letter) {
      this.pickerActiveLetter = letter;
      const el = document.getElementById('picker-group-' + letter);
      if (el) {
        const scrollArea = this.$refs.pickerScrollArea;
        if (scrollArea) {
          const offsetTop = el.offsetTop - scrollArea.offsetTop;
          scrollArea.scrollTo({ top: offsetTop - 8, behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    // 搜索输入时清除高亮
    onPickerSearch() {
      this.pickerActiveLetter = null;
    },
    async onAvatarFileChange(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      // 限制 2MB
      if (file.size > 2 * 1024 * 1024) {
        Store.toast('图片不能超过 2MB', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result;
        // 优先使用 selectedStudentId，如果没有则使用 user.id
        const sid = this.selectedStudentId || (this.user && this.user.id);
        if (!sid) {
          console.error('[onAvatarFileChange] 无法获取学生ID:', { selectedStudentId: this.selectedStudentId, userId: this.user?.id });
          Store.toast('无法上传：学生信息缺失', 'error');
          return;
        }
        const ok = await Store.updateAvatar(sid, base64);
        if (ok) {
          await this.refreshStudent();
          this.showAvatarUpload = false;
          Store.toast('✅ 头像已更新', 'success');
        } else {
          Store.toast('上传失败：未找到学生', 'error');
        }
      };
      reader.readAsDataURL(file);
      // 清空 input 以便下次选同一文件也能触发
      e.target.value = '';
    },
    async removeAvatar() {
      const sid = this.selectedStudentId || (this.student && this.student.id);
      if (!sid) return;
      await Store.updateAvatar(sid, null);
      await this.refreshStudent();
      Store.toast('头像已移除', 'success');
    },
    onLevelUp(newStage) {
      this.levelUpStage = newStage;
      this.showLevelUp = true;
      setTimeout(() => { this.showLevelUp = false; }, 3000);
      this.refreshStudent();
    },
    onUpdate() { this.refreshStudent(); },
    onToast(msg, type) { Store.toast(msg, type); },
    navTo(tab) { this.currentTab = tab; },
    doLogout() {
      this.showAvatarMenu = false;
      Store.logout();
      this.$emit('logout');
    },
    startTick() {
      // 用递归 setTimeout + 随机间隔替代 setInterval，让宠物状态变化时间不可预测
      // 间隔范围：45 ~ 90 分钟随机（平均约 67 分钟）
      const scheduleNextTick = () => {
        const minMs = 45 * 60 * 1000;   // 45 分钟
        const maxMs = 90 * 60 * 1000;   // 90 分钟
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        this.tickInterval = setTimeout(async () => {
          if (this.student && this.student.petType && !this.student.petDead) {
            try {
              const result = await Store.tickPetStatus(this.student.id);
              await this.refreshStudent();
              if (result && result.sick) {
                Store.toast('🤒 宠物状态不好，记得照顾它！', 'warning');
              }
            } catch(e) {
              console.warn('[tick] 请求失败:', e);
            }
          }
          scheduleNextTick();  // 无论成功与否，继续安排下一次
        }, delay);
      };
      scheduleNextTick();
    },
    // 每次登录检测离线惩罚（积分扣减阶梯制）
    async runDailyPenaltyCheck() {
      if (!this.student || !this.student.petType) return;

      // ---- 每日成长：按日期差给宠物经验 ----
      const now = Date.now();
      const growthKey = `lastGrowth_${this.student.id}`;
      const lastGrowthStr = localStorage.getItem(growthKey);
      if (lastGrowthStr) {
        const lastGrowth = parseInt(lastGrowthStr, 10);
        if (!isNaN(lastGrowth)) {
          const daysSinceGrowth = Math.floor((now - lastGrowth) / (1000 * 60 * 60 * 24));
          if (daysSinceGrowth >= 1) {
            // 每日成长：固定给 50 宠物经验
            const growthAmount = 50;
            const student = Store.state.students.find(s => s.id === this.student.id);
            if (student) {
              const oldExp = student.petExp || 0;
              const oldLevel = getLevelInfo(oldExp).level;
              student.petExp = (student.petExp || 0) + growthAmount;
              const newLevel = getLevelInfo(student.petExp).level;
              // 同步到 IndexedDB
              await dbStorage.storeStudents(Store.state.students);
              await this.refreshStudent();
              if (newLevel > oldLevel) {
                student.petStage = newLevel;
                await dbStorage.storeStudents(Store.state.students);
                Store.toast(`🌱 每日成长 +${growthAmount} 经验！宠物升级了（Lv.${newLevel}）！`, 'success');
              } else {
                Store.toast(`🌱 每日成长 +${growthAmount} 经验！好好照顾宠物吧～`, 'success');
              }
            }
          }
        }
      }
      // 记录本次成长时间戳（每日只奖励一次）
      localStorage.setItem(growthKey, String(now));

      // ---- 日收入：金币每日自动发放 ----
      // 公式：base 10 + points*5%，最低1金币
      const incomeKey = `lastIncome_${this.student.id}`;
      const lastIncomeStr = localStorage.getItem(incomeKey);
      const today = new Date().toDateString();
      if (!lastIncomeStr || lastIncomeStr !== today) {
        const income = await Store.grantDailyIncome(this.student.id);
        if (income) {
          Store.toast(`💵 日收入 +${income} 金币（积分为 ${this.student.points || 0} 时）`, 'success');
        }
        await this.refreshStudent();
        localStorage.setItem(incomeKey, today);
      }

      // ---- 离线惩罚检测 ----
      const result = await Store.checkDailyPenalty(this.student.id);
      await this.refreshStudent();
      if (!result) return;
      if (result.died) {
        this.petDeadInfo = {
          hoursMissed: result.hoursMissed,
          pointLost:   result.pointLost || 0,
        };
        this.showPetDeadNotify = true;
      } else if (result.hoursMissed >= 24) {
        this.penaltyInfo = {
          daysMissed:   result.daysMissed,
          pointPenalty: result.pointPenalty,
          newPoints:    result.newPoints,
        };
        this.showPenaltyNotify = true;
        setTimeout(() => { this.showPenaltyNotify = false; }, 8000);
      }
    },
    // 监听积分变化：每3秒从服务器拉一次最新学生数据，检测变化
    startPointsWatch() {
      // 确保 _lastPoints 与当前学生积分同步，避免首次加载触发错误的弹窗
      this._lastPoints = this.studentData ? (this.studentData.points || 0) : 0;
      this._lastTaskCount = Store.state.tasks.length;
      this.pointsWatchTimer = setInterval(async () => {
        const sid = this.selectedStudentId || this.user.id;
        // 同时刷新任务和学生数据
        await Promise.all([
          Store.refreshTasks(),
          Store.refreshStudent(sid),
        ]);
        const raw = Store.state.students.find(s => s.id === sid);
        if (!raw) return;
        const newPts = raw.points || 0;
        const delta  = newPts - this._lastPoints;

        // 检测是否有新任务
        const newTaskCount = Store.state.tasks.length;
        if (newTaskCount > this._lastTaskCount) {
          this._lastTaskCount = newTaskCount;
          // 更新本地视图
          const localRaw = Store.state.students.find(s => s.id === sid);
          if (localRaw) this.studentData = { ...localRaw };
        }

        if (delta !== 0) {
          const buyDeduct = raw._buyDeduct || 0;
          // 购买道具产生的精确扣分，跳过弹窗
          // 策略：用购买前快照积分对比（_lastBuyPoints/_lastBuyCost），绕过 IndexedDB 异步时序问题
          const isBuyDeduct = (this._lastBuyPoints !== null && this._lastBuyCost > 0 && delta === -this._lastBuyCost);
          if (isBuyDeduct) {
            // 购买道具扣分：静默更新，清除快照
            this._lastBuyPoints = null;
            this._lastBuyCost = 0;
            raw._buyDeduct = 0;
            this._lastPoints = newPts;
            const localRaw2 = Store.state.students.find(s => s.id === sid);
            if (localRaw2) this.studentData = { ...localRaw2 };
          } else {
            // 老师奖励积分 / 老师扣除积分 / 离线惩罚扣分 → 都要弹窗通知
            let reason;
            if (delta > 0) {
              reason = raw._lastGrantReason || '老师给你发放了积分奖励！';
            } else {
              reason = raw._lastGrantReason || '⚠️ 老师扣除了你的积分';
            }
            this.pointsNotifyData = { delta, reason, total: newPts };
            this.showPointsNotify = true;
            this._lastPoints = newPts;
            // 清零标记，防止残留影响下一次判断
            raw._lastGrantReason = '';
            raw._buyDeduct = 0;
            const localRaw3 = Store.state.students.find(s => s.id === sid);
            if (localRaw3) this.studentData = { ...localRaw3 };
            setTimeout(() => { this.showPointsNotify = false; }, 5000);
          }
        }
      }, 3000);
    },
    async selectStudent(student) {
      // 更新内部状态，不直接修改 props
      this.selectedStudentId = student.id;
      this.showStudentSelect = false;
      // 先用本地已有 state 立即更新（避免异步竞态）
      const raw = Store.state.students.find(s => s.id === student.id);
      this.studentData = raw ? { ...raw } : null;
      // 重置标签页到主页
      this.currentTab = 'home';
      // 再异步刷新最新数据
      await Store.refreshStudent(student.id);
      const latest = Store.state.students.find(s => s.id === student.id);
      if (latest) this.studentData = { ...latest };
      // 如果该学生没有宠物，自动跳转到孵化页
      if (!latest || !latest.petType) {
        this.$nextTick(() => { this.currentTab = 'pet'; });
      }
    },
  },
};
