// ===== 游戏数据配置 =====

// 宠物种类
// stages对应外观阶段：[蛋, 幼宠, 成长, 成熟, 进化, 传说]
// 等级0-2→外观0(蛋), 3-7→外观1(幼宠), 8-11→外观2, 12-15→外观3, 16-18→外观4, 19-20→外观5
// 注：已移除"刚出壳"第2阶段，避免误解
const PET_TYPES = [
  { id: 'dragon', name: '小火龙', emoji: '🐲', stages: ['🦎','🐲','🐉','🔥','⚡'] },
  { id: 'cat',    name: '星星猫', emoji: '🐱', stages: ['🐱','😸','🦁','🌟','✨'] },
  { id: 'bunny',  name: '棉花兔', emoji: '🐰', stages: ['🐰','🐇','🦊','🌸','💫'] },
  { id: 'bird',   name: '彩翼鸟', emoji: '🐦', stages: ['🐦','🦜','🦅','🌈','🪄'] },
  { id: 'dog',    name: '旺财狗', emoji: '🐶', stages: ['🐶','🐕','🦴','🎖️','👑'] },
  { id: 'fairy',  name: '梦精灵', emoji: '🧚', stages: ['🧚','✨','🌟','🎇','🌠'] },
  { id: 'hamster', name: '小仓鼠', emoji: '🐹', stages: ['🐹','🐹','🐹','🐹','🐹'] },
  { id: 'fox',    name: '小狐狸', emoji: '🦊', stages: ['🦊','🦊','🦊','🦊','🦊'] },
  { id: 'deer',   name: '小鹿', emoji: '🦌', stages: ['🦌','🦌','🦌','🦌','🦌'] },
  { id: 'pig',    name: '小猪', emoji: '🐖', stages: ['🐖','🐖','🐖','🐖','🐖'] },
  { id: 'wolf',   name: '小狼', emoji: '🐺', stages: ['🐺','🐺','🐺','🐺','🐺'] },
  { id: 'spider', name: '小蜘蛛', emoji: '🕷️', stages: ['🕷️','🕷️','🕷️','🕷️','🕷️'] },
  { id: 'penguin', name: '小企鹅', emoji: '🐧', stages: ['🐧','🐧','🐧','🐧','🐧'] },
];

// 每日经验上限配置（宠物每天最多获得的经验值）
// 设定为 1000 exp/天
const DAILY_EXP_LIMIT = 1000;

// 宠物成长阶段（共20级，设计为小学6年可持续成长）
// 已移除蛋阶段，level 0 起始即为幼宠
const GROWTH_STAGES = [
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
];

// 宠物状态表情及原因
const PET_MOODS = {
  happy:   { emoji: '😄', label: '开心' },
  normal:  { emoji: '😊', label: '平静' },
  hungry:  { emoji: '😋', label: '饿了' },
  sad:     { emoji: '😢', label: '难过' },
  sick:    { emoji: '🤒', label: '生病' },
  sleepy:  { emoji: '😴', label: '困了' },
  excited: { emoji: '🤩', label: '兴奋' },
  dead:    { emoji: '💀', label: '已死亡' },
};

// 心情原因（用于随机显示）
const MOOD_REASONS = {
  happy: [
    '主人陪我玩得很开心！',
    '吃了美味的食物，心情好好~',
    '今天天气真不错呢！',
    '有主人在身边就开心！',
    '洗完澡真舒服呀~',
    '被主人夸奖了，好开心！',
    '睡了个美美的午觉~',
    '和小伙伴一起玩耍！',
  ],
  normal: [
    '悠闲地晒太阳中...',
    '静静地待着，很舒服~',
    '发呆中...想什么呢？',
    '懒洋洋地躺着~',
    '看着窗外发呆...',
    '一切都很平静呢~',
  ],
  hungry: [
    '肚子咕咕叫了...',
    '好饿呀，想吃东西！',
    '闻到食物的香味了~',
    '主人，我饿了...',
    '想吃好吃的！',
  ],
  sad: [
    '有点想念主人了...',
    '一个人有点孤单...',
    '今天有点不开心...',
    '想出去玩...',
    '主人好久没陪我玩了',
  ],
  sick: [
    '感觉有点不舒服...',
    '头有点晕晕的...',
    '需要好好休息一下',
    '身体不太舒服...',
  ],
  sleepy: [
    '好困呀...想睡觉了',
    '眼皮越来越重了...',
    '打了个大哈欠~',
    '迷迷糊糊的...',
  ],
  excited: [
    '太开心了！转圈圈~',
    '哇！有惊喜！',
    '兴奋得停不下来！',
    '今天超开心的！',
  ],
};

// 获取随机心情原因
function getMoodReason(moodKey) {
  const reasons = MOOD_REASONS[moodKey] || MOOD_REASONS.normal;
  return reasons[Math.floor(Math.random() * reasons.length)];
}

// 背包道具（金币购买）
const ITEMS = [
  { id: 'apple',     name: '苹果',     emoji: '🍎', type: 'food',   effect: { hungry: 20, happy: 5,  exp: 10 }, cost: 5,  desc: '补充饱食度+20，经验+10' },
  { id: 'cake',      name: '蛋糕',     emoji: '🎂', type: 'food',   effect: { hungry: 50, happy: 15, exp: 30 }, cost: 15, desc: '美味蛋糕，大幅补充饱食度，经验+30' },
  { id: 'milk',      name: '牛奶',     emoji: '🥛', type: 'food',   effect: { hungry: 30, health: 10, exp: 15 }, cost: 8,  desc: '增强体质+10，经验+15' },
  { id: 'fish',      name: '小鱼',     emoji: '🐟', type: 'food',   effect: { hungry: 40, happy: 20, exp: 25 }, cost: 12, desc: '宠物最爱的食物！经验+25' },
  { id: 'soap',      name: '沐浴露',   emoji: '🧴', type: 'clean',  effect: { clean: 30, exp: 10 },             cost: 5,  desc: '清洁度+30，经验+10' },
  { id: 'shampoo',   name: '香波',     emoji: '🫧', type: 'clean',  effect: { clean: 50, happy: 10, exp: 20 }, cost: 10, desc: '让宠物香喷喷的！经验+20' },
  { id: 'ball',      name: '皮球',     emoji: '⚽', type: 'toy',    effect: { happy: 25, exp: 15 },             cost: 8,  desc: '趣味玩耍，心情+25，经验+15' },
  { id: 'yarn',      name: '毛线团',   emoji: '🧶', type: 'toy',    effect: { happy: 35, hungry: -5, exp: 20 }, cost: 10, desc: '超级好玩的玩具！经验+20' },
  { id: 'medicine',  name: '急救药',   emoji: '💊', type: 'heal',   effect: { health: 30, exp: 5 },            cost: 10, desc: '恢复健康度+30，经验+5' },
  { id: 'potion',    name: '魔法药水', emoji: '🧪', type: 'heal',   effect: { health: 60, happy: 10, exp: 40 }, cost: 25, desc: '快速恢复所有状态，经验+40' },
];

// 任务模板
const TASK_TEMPLATES = [
  { title: '完成数学作业', desc: '完成今日数学练习题并提交', points: 50, icon: '📐', subject: '数学' },
  { title: '朗读英语课文', desc: '朗读并录音上传课文第5章', points: 40, icon: '📚', subject: '英语' },
  { title: '语文背诵', desc: '背诵古诗《静夜思》', points: 35, icon: '📝', subject: '语文' },
  { title: '科学实验报告', desc: '完成本周科学实验观察记录', points: 60, icon: '🔬', subject: '科学' },
  { title: '课堂积极回答', desc: '在课堂上积极举手回答3个问题', points: 20, icon: '🙋', subject: '综合' },
  { title: '艺术创作', desc: '完成一幅关于春天的绘画作品', points: 45, icon: '🎨', subject: '美术' },
  { title: '体育达标', desc: '完成体能测试并达到合格标准', points: 30, icon: '🏃', subject: '体育' },
  { title: '阅读打卡', desc: '阅读课外书籍30分钟并做笔记', points: 25, icon: '📖', subject: '语文' },
];

// 占位学生：首次启动时写入，用户创建真实学生后自动替换
const PLACEHOLDER_STUDENT = {
  id: 999999999,
  name: '测试学生',
  username: 'test',
  password: '123456',
  role: 'student',
  class: '高一一班',
  points: 100,
  money: 100,
  petType: 'cat',
  petName: '测试喵',
  petExp: 100,
  petStage: 1,
  petStatus: { health: 100, hungry: 100, happy: 100, clean: 100 },
  backpack: { apple: 3, soap: 2 },
  joinDate: '2026-01-01',
  _isPlaceholder: true, // 特殊标记，创建真实学生时会被删除
};

// 演示学生数据（仅在 DEBUG_MODE 下可见，不持久化）
const INITIAL_STUDENTS = [
  { id: 1, name: '小明', username: 'xiaoming', password: '123456', role: 'student', class: '高一一班', points: 100, money: 100, petType: 'dragon', petName: '小火龙', petExp: 220, petStage: 2, petStatus: { health: 75, hungry: 60, happy: 80, clean: 70 }, backpack: { apple:3, cake:1, soap:2, ball:1, medicine:1 }, joinDate: '2026-02-01' },
  { id: 2, name: '小红', username: 'xiaohong', password: '123456', role: 'student', class: '高一一班', points: 100, money: 100, petType: 'cat',    petName: '星星猫', petExp: 530, petStage: 3, petStatus: { health: 90, hungry: 70, happy: 95, clean: 85 }, backpack: { apple:5, cake:2, soap:3, ball:2, medicine:0 }, joinDate: '2026-02-01' },
  { id: 3, name: '小刚', username: 'xiaogang', password: '123456', role: 'student', class: '高一一班', points: 100, money: 100, petType: 'bunny',  petName: '棉花兔', petExp: 150, petStage: 1, petStatus: { health: 55, hungry: 30, happy: 40, clean: 50 }, backpack: { apple:1, soap:1, medicine:2 }, joinDate: '2026-02-01' },
  { id: 4, name: '小美', username: 'xiaomei', password: '123456', role: 'student', class: '高一一班', points: 100, money: 100, petType: 'fairy',  petName: '梦精灵', petExp: 420, petStage: 2, petStatus: { health: 85, hungry: 65, happy: 88, clean: 92 }, backpack: { apple:4, cake:1, soap:2, yarn:2 }, joinDate: '2026-02-01' },
  { id: 5, name: '小强', username: 'xiaoqiang', password: '123456', role: 'student', class: '高一一班', points: 100, money: 100, petType: 'bird',   petName: '彩翼鸟', petExp: 250, petStage: 2, petStatus: { health: 70, hungry: 55, happy: 65, clean: 75 }, backpack: { apple:2, soap:1, ball:3, medicine:1 }, joinDate: '2026-02-01' },
  { id: 6, name: '小丽', username: 'xiaoli', password: '123456', role: 'student', class: '高一一班', points: 100, money: 100, petType: 'dog',    petName: '旺财狗', petExp: 100, petStage: 1, petStatus: { health: 60, hungry: 40, happy: 55, clean: 45 }, backpack: { apple:2, medicine:1 }, joinDate: '2026-02-01' },
];

// 管理员账号（硬编码，最高权限）
// 密码使用 SHA-256 存储，明文不可见
const ADMIN_ACCOUNT = {
  id: 0,
  name: '系统管理员',
  username: 'admin',
  // SHA-256('Lq090825')
  passwordHash: '4ad5f311a71d4ca6ef96bf506d86b3c6fce9a9adb3987b2ea66f90ebf18a6440',
  role: 'admin',
  avatar: '🛡️',
};

// 教师账号
const TEACHER_ACCOUNTS = [
  { id: 100, name: '王老师', username: 'teacher', password: 'teacher123', role: 'teacher', class: '高一一班', avatar: '👩‍🏫' },
  { id: 101, name: '李老师', username: 'teacher2', password: 'teacher123', role: 'teacher', class: '三年二班', avatar: '👨‍🏫' },
];

// 初始邀请码池（管理员可增删）
const INITIAL_INVITE_CODES = [
  { code: 'TEACHER2026', note: '默认通用邀请码', used: false, createdAt: '2026-01-01' },
  { code: 'CLASS2026A',  note: '高一一班专属',  used: false, createdAt: '2026-01-01' },
];

// 初始任务数据
const INITIAL_TASKS = [
  { id: 1, title: '完成数学作业', desc: '完成今日数学练习题（P45-P47）并提交照片', points: 50, icon: '📐', subject: '数学', deadline: '2026-03-14 18:00', status: 'active', createdBy: 100, submissions: [
    { studentId: 1, status: 'completed', submittedAt: '2026-03-14 15:30', content: '已完成所有题目' },
    { studentId: 2, status: 'completed', submittedAt: '2026-03-14 14:20', content: '完成并检查了两遍' },
    { studentId: 3, status: 'pending', submittedAt: null, content: null },
  ]},
  { id: 2, title: '背诵古诗《静夜思》', desc: '背诵全文，明日课堂当场检查', points: 35, icon: '📝', subject: '语文', deadline: '2026-03-15 08:00', status: 'active', createdBy: 100, submissions: [
    { studentId: 2, status: 'completed', submittedAt: '2026-03-14 16:00', content: '已背熟' },
    { studentId: 4, status: 'submitted', submittedAt: '2026-03-14 17:00', content: '背了好多遍了' },
  ]},
  { id: 3, title: '课堂积极回答问题', desc: '在今日课堂上积极举手回答3个问题', points: 20, icon: '🙋', subject: '综合', deadline: '2026-03-14 16:00', status: 'active', createdBy: 100, submissions: [
    { studentId: 1, status: 'completed', submittedAt: '2026-03-14 14:00', content: '回答了5个问题！' },
    { studentId: 4, status: 'completed', submittedAt: '2026-03-14 15:00', content: '认真参与了' },
    { studentId: 5, status: 'completed', submittedAt: '2026-03-14 15:30', content: '举手3次' },
  ]},
  { id: 4, title: '阅读打卡', desc: '阅读课外书籍30分钟并做简单笔记上传', points: 25, icon: '📖', subject: '语文', deadline: '2026-03-16 20:00', status: 'active', createdBy: 100, submissions: [] },
];

// 成就系统数据
const ACHIEVEMENTS = [
  // 任务相关成就
  {
    id: 'first_task',
    name: '初出茅庐',
    icon: '🌟',
    description: '完成第一个任务',
    category: 'task',
    condition: { type: 'task_completed', count: 1 },
    rarity: 'common',
    points: 10
  },
  {
    id: 'task_master',
    name: '任务大师',
    icon: '🏆',
    description: '完成10个任务',
    category: 'task',
    condition: { type: 'task_completed', count: 10 },
    rarity: 'uncommon',
    points: 30
  },
  {
    id: 'task_king',
    name: '任务之王',
    icon: '👑',
    description: '完成50个任务',
    category: 'task',
    condition: { type: 'task_completed', count: 50 },
    rarity: 'rare',
    points: 100
  },
  
  // 积分相关成就
  {
    id: 'first_point',
    name: '第一桶金',
    icon: '💰',
    description: '获得第一个积分',
    category: 'points',
    condition: { type: 'points_earned', count: 1 },
    rarity: 'common',
    points: 5
  },
  {
    id: 'point_hunter',
    name: '积分猎手',
    icon: '🎯',
    description: '累计获得500积分',
    category: 'points',
    condition: { type: 'points_earned', count: 500 },
    rarity: 'uncommon',
    points: 25
  },
  {
    id: 'point_master',
    name: '积分大师',
    icon: '💎',
    description: '累计获得2000积分',
    category: 'points',
    condition: { type: 'points_earned', count: 2000 },
    rarity: 'rare',
    points: 80
  },
  
  // 宠物相关成就
  {
    id: 'pet_parent',
    name: '宠物家长',
    icon: '🐾',
    description: '成功孵化宠物',
    category: 'pet',
    condition: { type: 'pet_hatched' },
    rarity: 'common',
    points: 15
  },
  {
    id: 'pet_trainer',
    name: '宠物训练师',
    icon: '🎖️',
    description: '宠物达到10级',
    category: 'pet',
    condition: { type: 'pet_level', level: 10 },
    rarity: 'uncommon',
    points: 40
  },
  {
    id: 'pet_master',
    name: '宠物大师',
    icon: '🌟',
    description: '宠物达到20级',
    category: 'pet',
    condition: { type: 'pet_level', level: 20 },
    rarity: 'epic',
    points: 150
  },
  
  // 连续登录成就
  {
    id: 'streak_3',
    name: '坚持3天',
    icon: '🔥',
    description: '连续登录3天',
    category: 'streak',
    condition: { type: 'login_streak', days: 3 },
    rarity: 'common',
    points: 10
  },
  {
    id: 'streak_7',
    name: '一周达人',
    icon: '⚡',
    description: '连续登录7天',
    category: 'streak',
    condition: { type: 'login_streak', days: 7 },
    rarity: 'uncommon',
    points: 25
  },
  {
    id: 'streak_30',
    name: '月度冠军',
    icon: '🏆',
    description: '连续登录30天',
    category: 'streak',
    condition: { type: 'login_streak', days: 30 },
    rarity: 'rare',
    points: 100
  },
  
  // 特殊成就
  {
    id: 'all_rounder',
    name: '全能选手',
    icon: '🌟',
    description: '完成所有类型的任务',
    category: 'special',
    condition: { type: 'task_types', count: 5 },
    rarity: 'epic',
    points: 120
  },
  {
    id: 'top_rank',
    name: '班级之星',
    icon: '👑',
    description: '登上班级排行榜第一名',
    category: 'special',
    condition: { type: 'rank_top', position: 1 },
    rarity: 'legendary',
    points: 200
  }
];

// 成就分类
const ACHIEVEMENT_CATEGORIES = {
  task: { name: '任务', icon: '📋' },
  points: { name: '积分', icon: '⭐' },
  pet: { name: '宠物', icon: '🐾' },
  streak: { name: '连续', icon: '🔥' },
  special: { name: '特殊', icon: '🌟' }
};

// 成就稀有度
const ACHIEVEMENT_RARITIES = {
  common: { name: '普通', color: '#4CAF50' },
  uncommon: { name: '优秀', color: '#2196F3' },
  rare: { name: '稀有', color: '#9C27B0' },
  epic: { name: '史诗', color: '#FF9800' },
  legendary: { name: '传说', color: '#FF5722' }
};

// 积分兑换商店
const SHOP_ITEMS = ITEMS.map(item => ({ ...item }));



// 工具函数
// 工具函数：判断是否是有效的 emoji 字符（简单判断）
function isValidEmoji(str) {
  if (!str || typeof str !== 'string') return false;
  // 排除纯英文/数字字符串（如 'xuehu', 'jinli'）
  if (/^[a-zA-Z0-9]+$/.test(str)) return false;
  // 排除纯中文字符串
  if (/^[\u4e00-\u9fa5]+$/.test(str)) return false;
  // emoji 字符一般在1-4个代码点
  if (str.length > 4) return false;
  // emoji 包含特殊 Unicode 字符或表情符号
  // 检查是否包含非 ASCII、非中文、非字母数字的字符
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 127 && !((code >= 0x4e00 && code <= 0x9fa5))) {
      return true; // 包含特殊字符，很可能是 emoji
    }
  }
  return false;
}

function getStudentPetEmoji(student) {
  // 优先显示自定义 emoji（从 Excel 导入），但必须是有效的 emoji 字符
  if (student.petEmoji && isValidEmoji(student.petEmoji)) {
    return student.petEmoji;
  }
  // 有自定义图片时，不显示 emoji（图片逻辑在 PetPage 组件中处理）
  // 注意：petImage 优先级高于 emoji，已在 PetPage 中处理
  const petType = PET_TYPES.find(p => p.id === student.petType);
  if (!petType) return '🐱';
  // 死亡状态显示伤心的宠物
  if (student.petDead) return petType.emoji;
  const level = getLevelInfo(student.petExp || 0).level;
  // 19级 → 5个外观阶段（已移除蛋阶段）
  // level 0-1 → stages[0], 2-7 → stages[1], 8-12 → stages[2], 13-16 → stages[3], 17-19 → stages[4]
  let stageIdx;
  if (level <= 1)       stageIdx = 0;  // 幼宠
  else if (level <= 7)  stageIdx = 1;  // 成长期
  else if (level <= 12) stageIdx = 2;  // 成熟
  else if (level <= 16) stageIdx = 3;  // 进化
  else                  stageIdx = 4;  // 传说
  return petType.stages[Math.min(stageIdx, petType.stages.length - 1)];
}

// 统一的宠物显示（用于主页等位置）
function getStudentPetDisplay(student) {
  // 有自定义图片时返回图片URL（统一格式）
  if (student.petImage) {
    return { type: 'image', value: student.petImage };
  }
  // 否则返回 emoji
  return { type: 'emoji', value: getStudentPetEmoji(student) };
}

function getStudentMood(status, student) {
  // 死亡状态直接返回死亡心情
  if (student && student.petDead) return PET_MOODS.dead;
  if (!status) return PET_MOODS.normal;
  const { health, hungry, happy, clean } = status;
  
  // 优先级：先检查负面状态
  if (health < 30) return PET_MOODS.sick;
  if (hungry < 20) return PET_MOODS.hungry;
  if (clean < 20) return PET_MOODS.sad;
  if (happy < 40) return PET_MOODS.sad;
  
  // 排名调节：计算排名得分（0~1）
  let rankBonus = 0;
  if (student && student._rankPercent !== undefined) {
    rankBonus = (student._rankPercent - 0.5) * 20; // 排名前50%加成，后50%减成
  }
  const adjustedHappy = happy + rankBonus;
  const adjustedHealth = health + (rankBonus > 0 ? rankBonus * 0.5 : 0);
  
  // 所有状态都好时，才显示正面心情
  if (adjustedHealth >= 70 && hungry >= 60 && adjustedHappy >= 70 && clean >= 60) {
    if (adjustedHappy > 85) return PET_MOODS.excited;
    if (adjustedHappy > 70) return PET_MOODS.happy;
  }
  
  // 状态一般时
  if (adjustedHappy < 60) return PET_MOODS.normal;
  
  return PET_MOODS.normal;
}

function getLevelInfo(exp) {
  for (let i = GROWTH_STAGES.length - 1; i >= 0; i--) {
    if (exp >= GROWTH_STAGES[i].minExp) {
      return GROWTH_STAGES[i];
    }
  }
  return GROWTH_STAGES[0];
}

function getExpPercent(exp) {
  const stage = getLevelInfo(exp);
  const range = stage.maxExp - stage.minExp;
  const current = exp - stage.minExp;
  return Math.min(100, Math.round((current / range) * 100));
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
