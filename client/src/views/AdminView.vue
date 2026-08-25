<template>
  <div class="min-h-screen pb-32">
    <header ref="headerEl" class="sticky top-0 z-40 border-b" style="border-bottom-color:rgba(255,255,255,0)">
      <div class="max-w-7xl mx-auto px-5 py-3 text-center">
        <div class="inline-flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/25 grid place-items-center">
            <ShieldCheck class="w-5 h-5 text-emerald-300" />
          </div>
          <h1 class="font-bold text-indigo-50">管理系统</h1>
        </div>
      </div>
    </header>

    <div class="max-w-7xl mx-auto px-5 pt-5 flex gap-2 overflow-x-auto pb-1 justify-center">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="pill !px-4 !py-2 !text-sm cursor-pointer transition-colors shrink-0"
        :class="tab === t.key ? 'bg-emerald-500/25 text-emerald-100 border border-emerald-400/50' : 'bg-white/5 text-indigo-200/70 border border-white/10 hover:bg-white/10'"
        @click="tab = t.key"
      >
        <component :is="t.icon" class="w-4 h-4" /> {{ t.label }}
      </button>
    </div>

    <main class="max-w-7xl mx-auto px-5 pt-5 space-y-5">
      <!-- ============ 概览 ============ -->
      <div v-if="tab === 'overview'" class="grid md:grid-cols-2 gap-5 animate-fadeUp">
        <div class="glass p-5">
          <h3 class="font-bold text-indigo-50 mb-3 flex items-center gap-2"><BarChart3 class="w-5 h-5 text-sky-300" /> 数据概览</h3>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-xl bg-white/5 p-3"><p class="text-2xl font-bold text-indigo-50">{{ stats.cnt ?? '-' }}</p><p class="text-xs text-indigo-200/60">学生</p></div>
            <div class="rounded-xl bg-white/5 p-3"><p class="text-2xl font-bold text-indigo-50">{{ stats.pets ?? '-' }}</p><p class="text-xs text-indigo-200/60">宠物</p></div>
            <div class="rounded-xl bg-white/5 p-3"><p class="text-2xl font-bold text-amber-300">{{ stats.total ?? '-' }}</p><p class="text-xs text-indigo-200/60">总{{ pointsUnit }}</p></div>
            <div class="rounded-xl bg-white/5 p-3"><p class="text-2xl font-bold text-indigo-50">{{ syncStatus.lastSyncAt ? fmtTime(syncStatus.lastSyncAt) : '未同步' }}</p><p class="text-xs text-indigo-200/60">上次同步</p></div>
          </div>
        </div>
        <div class="glass p-5">
          <h3 class="font-bold text-indigo-50 mb-3 flex items-center gap-2"><RefreshCw class="w-5 h-5 text-emerald-300" /> 同步状态</h3>
          <div class="space-y-2 text-sm text-indigo-200/80">
            <p>模式：<span class="pill bg-white/10">{{ syncStatus.mode }}</span></p>
            <button class="btn btn-primary mt-3" :disabled="syncing" @click="runSync">
              <Loader2 v-if="syncing" class="w-4 h-4 animate-spin" /> 立即同步
            </button>
            <p v-if="syncMsg" class="text-xs mt-2" :class="syncMsgType === 'error' ? 'text-rose-300' : 'text-emerald-300'">{{ syncMsg }}</p>
          </div>
        </div>
      </div>

      <!-- ============ 学生管理 ============ -->
      <div v-if="tab === 'students'" class="glass p-5 animate-fadeUp">
        <h3 class="font-bold text-indigo-50 mb-4 flex items-center gap-2"><Users class="w-5 h-5 text-sky-300" /> 学生管理</h3>
        <div class="grid md:grid-cols-2 gap-4 mb-5">
          <div class="rounded-xl bg-white/5 p-4 border border-white/10">
            <p class="font-semibold text-indigo-100 mb-3">新增学生</p>
            <div class="grid grid-cols-2 gap-2">
              <input v-model="stuForm.name" class="input !py-2 text-sm" placeholder="姓名 *" />
              <input v-model.number="stuForm.points" type="number" class="input !py-2 text-sm" placeholder="初始积分" />
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <select v-model="stuForm.petSpeciesId" class="input !py-2 text-sm">
                <option value="">不领养宠物</option>
                <option v-for="sp in species" :key="sp.id" :value="sp.id">{{ sp.emoji }} {{ sp.name }}</option>
              </select>
              <input v-model="stuForm.petName" class="input !py-2 text-sm" placeholder="宠物名" />
            </div>
            <button class="btn btn-primary mt-3" @click="addStudent"><UserPlus class="w-4 h-4" /> 添加</button>
          </div>
          <div class="rounded-xl bg-white/5 p-4 border border-white/10">
            <p class="font-semibold text-indigo-100 mb-3">批量导入</p>
            <textarea v-model="importText" rows="4" class="input text-xs" placeholder="每行格式：姓名,初始积分（示例：张三,0）" />
              <input type="file" class="hidden" accept=".csv,.xlsx,.xls,text/csv" ref="importFileRef" @change="onImportFile" />
              <button class="btn btn-ghost mt-3 !py-2 text-sm" @click="importFileRef?.click()"><FileSpreadsheet class="w-4 h-4" /> 选择 CSV / Excel 导入</button>
              <span v-if="importFileName" class="ml-2 text-xs text-indigo-200/70">{{ importFileName }}</span>
            <button class="btn btn-ghost mt-3" @click="importStudents"><Upload class="w-4 h-4" /> 导入</button>
          </div>
        </div>
        <div class="max-h-[440px] overflow-y-auto">
          <div v-for="s in adminStudents" :key="s.id" class="flex items-center gap-3 rounded-xl bg-white/4 border border-white/8 px-4 py-2.5 mb-2">
            <p class="flex-1 font-medium text-indigo-50 truncate">{{ s.name }}</p>
            <p class="w-16 text-right font-bold text-amber-300">{{ s.points }}</p>
            <button class="btn btn-ghost !py-1 text-xs" @click="editPoints(s)"><PenLine class="w-3.5 h-3.5" /> 改分</button>
          <div class="rounded-xl bg-white/5 p-4 border border-white/10 mt-5">
            <p class="font-semibold text-indigo-100 mb-2 flex items-center gap-2"><ImagePlus class="w-4 h-4" /> 批量上传头像</p>
            <p class="text-xs text-indigo-200/60 mb-2">按学生列表顺序依次选择头像图片，文件数量必须与当前列表学生数一致。</p>
            <input type="file" multiple accept="image/*" class="hidden" ref="avatarFileRef" @change="uploadAvatars" />
            <button class="btn btn-ghost !py-2 text-sm" @click="avatarFileRef?.click()"><Upload class="w-4 h-4" /> 选择头像（多选）</button>
            <span v-if="avatarMsg" class="ml-2 text-xs" :class="avatarMsgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ avatarMsg }}</span>
          </div>
            <button class="btn btn-danger !py-1 text-xs" @click="delStudent(s)"><Trash2 class="w-3.5 h-3.5" /> 删除</button>
          </div>
        </div>
      </div>

      <!-- ============ 快捷理由 ============ -->
      <div v-if="tab === 'presets'" class="glass p-5 animate-fadeUp">
        <h3 class="font-bold text-indigo-50 mb-1 flex items-center gap-2"><Zap class="w-5 h-5 text-yellow-300" /> 快捷理由管理</h3>
        <p class="text-xs text-indigo-200/60 mb-4">快捷理由无数量上限，教师端也可通过「+」直接添加。</p>
        <div class="flex gap-2 mb-4">
          <input v-model="preForm.label" class="input !w-48 !py-2 text-sm" placeholder="名称" />
          <input v-model.number="preForm.delta" type="number" class="input !w-24 !py-2 text-sm" placeholder="分值" />
          <input v-model="preForm.reason" class="input !flex-1 !py-2 text-sm" placeholder="理由内容（默认等于名称）" />
          <button class="btn btn-primary" @click="addPreset"><Plus class="w-4 h-4" /> 添加</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <div v-for="p in presets" :key="p.id" class="pill !px-3 !py-1.5 !text-sm bg-white/5 border border-white/15">
            {{ p.label }} <span :class="p.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'">{{ p.delta > 0 ? '+' : '' }}{{ p.delta }}</span>
            <button class="ml-1 text-white/40 hover:text-rose-300" @click="delPreset(p)"><X class="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      <!-- ============ 宠物种类 ============ -->
      <div v-if="tab === 'species'" class="glass p-5 animate-fadeUp">
        <h3 class="font-bold text-indigo-50 mb-4 flex items-center gap-2"><PawPrint class="w-5 h-5 text-fuchsia-300" /> 宠物种类目录</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div
            v-for="sp in species"
            :key="sp.id"
            class="rounded-xl bg-white/5 border border-white/10 p-3 text-center"
          >
            <div
              class="w-14 h-14 mx-auto rounded-full grid place-items-center text-2xl overflow-hidden"
              :style="{ background: `linear-gradient(135deg, ${sp.color_from}, ${sp.color_to})` }"
            >
              <img v-if="sp.avatar_path" :src="sp.avatar_path" class="w-full h-full object-cover" alt="" />
              <span v-else>{{ sp.emoji }}</span>
            </div>
            <p class="mt-2 text-sm font-semibold text-indigo-50">{{ sp.name }}</p>
            <p class="text-xs text-indigo-200/50">{{ sp.id }}</p>
            <button class="btn btn-danger !py-1 text-xs mt-2" @click="delSpecies(sp)">删除</button>
          </div>
        </div>
        <details class="mt-4 rounded-xl bg-white/5 border border-white/10 p-4">
          <summary class="cursor-pointer text-sm text-indigo-200 font-medium">+ 新增宠物种类</summary>
          <p class="text-xs text-indigo-200/50 mt-2 mb-1">输入框均无预填值；可上传图片作为该种类的默认头像（学生无自定义头像时展示）。</p>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 items-center">
            <input v-model="spForm.id" class="input !py-2 text-sm" placeholder="id（英文，如 cat）" />
            <input v-model="spForm.name" class="input !py-2 text-sm" placeholder="名称" />
            <input v-model="spForm.emoji" class="input !py-2 text-sm" placeholder="表情（可留空）" />
            <label class="btn btn-ghost !py-2 text-sm cursor-pointer justify-center">
              <ImagePlus class="w-4 h-4" /> 上传头像
              <input type="file" accept="image/*" class="hidden" @change="onSpeciesAvatar" />
            </label>
            <div class="flex items-center gap-2">
              <input v-model="spForm.colorFrom" class="input !py-2 text-sm flex-1" placeholder="主色" />
              <input v-model="spForm.colorFrom" type="color" class="w-9 h-9 rounded-lg bg-transparent border border-white/15 cursor-pointer shrink-0" title="主色色盘" />
            </div>
            <div class="flex items-center gap-2">
              <input v-model="spForm.colorTo" class="input !py-2 text-sm flex-1" placeholder="辅色" />
              <input v-model="spForm.colorTo" type="color" class="w-9 h-9 rounded-lg bg-transparent border border-white/15 cursor-pointer shrink-0" title="辅色色盘" />
            </div>
            <div v-if="speciesAvatarPreview" class="md:col-span-2 text-xs text-indigo-200/60 flex items-center gap-2">
              <img :src="speciesAvatarPreview" class="w-9 h-9 rounded-full object-cover" alt="" /> 已选择头像图片，保存后生效
            </div>
          </div>
          <button class="btn btn-primary mt-3" @click="addSpecies">保存新种类</button>
        </details>
      </div>

      <!-- ============ 道具（教师/管理共用） ============ -->
      <div v-if="tab === 'items'"><ItemsManager /></div>

      <!-- ============ 状态规则（教师/管理共用） ============ -->
      <div v-if="tab === 'rules'"><RulesManager /></div>

      <!-- ============ 宠物等级 ============ -->
      <div v-if="tab === 'pets'"><PetsLevelManager /></div>

      <!-- ============ 设置 ============ -->
      <div v-if="tab === 'settings'" class="glass p-5 max-w-2xl animate-fadeUp space-y-5">
        <h3 class="font-bold text-indigo-50 flex items-center gap-2"><Settings2 class="w-5 h-5 text-slate-300" /> 系统设置</h3>
        <div>
          <label class="label">积分单位名称</label>
          <input v-model="setForm.pointsUnit" class="input !w-56" placeholder="如：学分 / 星星 / 积分" />
        </div>
        <div>
          <label class="label">管理员名称</label>
          <input v-model="setForm.adminName" class="input !w-56" />
        </div>
        <div>
          <label class="label">Gitee 更新源（锁定，不可修改）</label>
          <div class="flex gap-2 items-center">
            <input :value="'https://gitee.com/am-zzq/classroom-pet-system'" readonly class="input !flex-1 opacity-70" />
            <span class="pill bg-emerald-500/15 text-emerald-300 shrink-0"><Lock class="w-3 h-3" /> 已锁定</span>
          </div>
        </div>
        <div>
          <label class="label">本地备份存储上限（MB，默认 1024）</label>
          <input v-model.number="setForm.backupMaxMB" type="number" class="input !w-44" min="1" placeholder="1024" />
        </div>

          <div>
            <label class="label">教师口令（管理员可查看/修改）</label>
            <div class="flex gap-2">
              <input v-model="setForm.teacherPassword" class="input !w-44" placeholder="123456" />
              <button class="btn btn-ghost !py-2 text-sm" @click="saveTeacherPassword"><KeyRound class="w-4 h-4" /> 保存教师口令</button>
            </div>
            <p class="text-xs text-indigo-200/50 mt-1">当前教师口令：<code class="px-1.5 py-0.5 rounded bg-white/10 text-amber-300">{{ setForm.teacherPassword || '123456' }}</code></p>
          </div>
          <div>
            <label class="label">当前科目</label>
            <select v-model="setForm.activeSubject" class="input !w-56">
              <option v-for="s in setForm.subjects" :key="s.name" :value="s.name">{{ s.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">科目列表与个性化</label>
            <div v-for="(s, i) in setForm.subjects" :key="i" class="rounded-xl bg-white/5 border border-white/10 p-3 mb-2 text-sm">
              <div class="flex items-center gap-2 mb-1">
                <input v-model="s.name" class="input !py-1 !text-sm !w-32" />
                <label class="flex items-center gap-1 text-xs"><input v-model="s.sync" type="checkbox" class="accent-indigo-400" /> 同步</label>
                <label class="flex items-center gap-1 text-xs"><input v-model="s.enabled.points" type="checkbox" class="accent-indigo-400" /> 积分</label>
                <label class="flex items-center gap-1 text-xs"><input v-model="s.enabled.pets" type="checkbox" class="accent-indigo-400" /> 宠物</label>
                <label class="flex items-center gap-1 text-xs"><input v-model="s.enabled.shop" type="checkbox" class="accent-indigo-400" /> 商店</label>
                <label class="flex items-center gap-1 text-xs"><input v-model="s.enabled.rank" type="checkbox" class="accent-indigo-400" /> 排行</label>
                <label class="flex items-center gap-1 text-xs"><input v-model="s.enabled.avatar" type="checkbox" class="accent-indigo-400" /> 头像</label>
                <button class="ml-auto text-rose-300" @click="removeSubject(i)"><Trash2 class="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <button class="btn btn-ghost !py-2 text-sm" @click="addSubject"><Plus class="w-4 h-4" /> 添加科目</button>
          </div>
          <div>
            <label class="label">云端备份保留份数（默认 10）</label>
            <input v-model.number="setForm.cloudBackupRetention" type="number" class="input !w-44" min="1" max="365" placeholder="10" />
          </div>
          <div class="rounded-xl bg-white/5 border border-white/10 p-3 space-y-3">
            <label class="label !mb-0 flex items-center gap-2"><Palette class="w-4 h-4 text-fuchsia-300" /> 界面文案风格（默认正式）</label>
            <div>
              <span class="text-xs text-indigo-200/60 block mb-1">欢迎 / 准备界面</span>
              <select v-model="setForm.uiStyle.welcome" class="input !w-64">
                <option value="global_formal">全局正式（默认）</option>
                <option value="student_playful">仅学生端俏皮（欢迎/准备保持正式）</option>
                <option value="global_playful">全局俏皮</option>
              </select>
            </div>
            <div>
              <span class="text-xs text-indigo-200/60 block mb-1">学生界面</span>
              <select v-model="setForm.uiStyle.student" class="input !w-64">
                <option value="formal">正式（默认）</option>
                <option value="playful">俏皮（颜文字萌系）</option>
              </select>
            </div>
            <div>
              <span class="text-xs text-indigo-200/60 block mb-1">管理界面</span>
              <select v-model="setForm.uiStyle.admin" class="input !w-64">
                <option value="global_formal">全局正式（默认）</option>
                <option value="student_playful">仅学生端俏皮（管理保持正式）</option>
                <option value="global_playful">全局俏皮</option>
              </select>
            </div>
            <p class="text-xs text-indigo-200/50">俏皮风格会用颜文字萌系口吻，仅影响部分提示文案；切换后点“保存设置”生效。</p>
          </div>
        <button class="btn btn-primary" @click="saveSettings">保存设置</button>

        <hr class="border-white/10" />
        <div>
          <p class="text-xs text-indigo-200/60 mb-2"><ShieldCheck class="w-3.5 h-3.5 inline text-emerald-300" /> 应急口令 <code class="px-1.5 py-0.5 rounded bg-white/10 text-emerald-300 font-mono">114514</code> 可在上方开关；启用时每次使用都会记入审计日志。</p>
          <label class="label">修改管理员密码</label>
          <div class="grid grid-cols-2 gap-2 max-w-md">
            <input v-model="pwForm.old" type="password" class="input" placeholder="旧密码" />
            <input v-model="pwForm.next" type="password" class="input" placeholder="新密码（≥4位）" />
          </div>
          <button class="btn btn-ghost mt-3" @click="changePw">更新密码</button>
        </div>

        <hr class="border-white/10" />
        <div class="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
          <label class="label">数据导出 / 学期归档</label>
          <p class="text-xs text-indigo-200/60">导出全部数据（JSON，可用于学期存档或迁移）；归档会先生成带学期名的快照，再清空学生/宠物/流水开始新学期。</p>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-ghost !py-2 text-sm" @click="exportData"><Download class="w-4 h-4" /> 导出全部数据</button>
            <button class="btn btn-danger !py-2 text-sm" @click="archiveTerm"><Archive class="w-4 h-4" /> 归档并开始新学期</button>
            <button class="btn btn-danger !py-2 text-sm" @click="clearData"><Trash2 class="w-4 h-4" /> 清空业务数据（不留演示）</button>
          </div>
          <p v-if="dataMsg" class="text-xs" :class="dataMsgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ dataMsg }}</p>
        </div>

        <hr class="border-white/10" />
        <div class="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
          <label class="label">审计日志（最近 20 条）</label>
          <div class="max-h-48 overflow-y-auto space-y-1 text-xs">
            <p v-if="auditLogs.length === 0" class="text-indigo-200/50 py-2">暂无记录</p>
            <div v-for="a in auditLogs" :key="a.id" class="flex items-center gap-2 rounded-lg bg-white/4 px-2.5 py-1.5">
              <span class="pill bg-indigo-500/15 text-indigo-200 shrink-0">{{ a.action }}</span>
              <span class="flex-1 text-indigo-200/80 truncate">{{ a.detail }}</span>
              <span class="text-[10px] text-indigo-200/40 shrink-0">{{ fmtTime(a.created_at) }}</span>
            </div>
          </div>
        </div>

          <hr class="border-white/10" />
          <div class="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
            <label class="label">前端错误上报（最近 50 条）</label>
            <div class="max-h-48 overflow-y-auto space-y-1 text-xs">
              <p v-if="errorReports.length === 0" class="text-indigo-200/50 py-2">暂无上报</p>
              <div v-for="e in errorReports" :key="e.id" class="flex items-start gap-2 rounded-lg bg-white/4 px-2.5 py-1.5">
                <span class="pill bg-rose-500/15 text-rose-200 shrink-0">{{ e.level }}</span>
                <span class="flex-1 text-indigo-200/80 truncate" :title="e.stack || e.message">{{ e.message }}</span>
                <span class="text-[10px] text-indigo-200/40 shrink-0">{{ fmtTime(e.created_at) }}</span>
              </div>
            </div>
            <button class="btn btn-ghost !py-1.5 text-xs" @click="loadErrors">刷新</button>
          </div>

        <hr class="border-white/10" />
        <div class="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
          <label class="label">更新检查策略</label>
          <div class="space-y-2 text-sm">
            <label class="flex items-center gap-2 cursor-pointer text-indigo-100">
              <input type="radio" value="none" v-model="updatePolicy.mode" class="accent-indigo-400" /> 正常检查更新
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-indigo-100">
              <input type="radio" value="device" v-model="updatePolicy.mode" class="accent-indigo-400" /> 仅此设备开机时不检查更新
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-indigo-100">
              <input type="radio" value="all" v-model="updatePolicy.mode" class="accent-indigo-400" /> 连接到此数据库的所有设备开机都不检查更新
            </label>
            <button class="btn btn-ghost !py-1.5 text-xs" @click="saveUpdatePolicy">保存策略</button>
            <p v-if="updatePolicyMsg" class="text-xs" :class="updatePolicyMsgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ updatePolicyMsg }}</p>
          </div>
        </div>

        <hr class="border-white/10" />
        <div class="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
          <label class="label">配置导出 / 导入（便携迁移）</label>
          <p class="text-xs text-indigo-200/60">导出包含 Supabase 连接、积分单位、管理员名称、备份上限与等级要求；不含源码与签名密钥，请妥善保管。</p>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-ghost !py-2 text-sm" @click="exportConfig"><Download class="w-4 h-4" /> 导出配置</button>
            <label class="btn btn-ghost !py-2 text-sm cursor-pointer"><Upload class="w-4 h-4" /> 导入配置
              <input type="file" accept=".json,application/json" class="hidden" @change="importConfig" />
            </label>
          </div>
          <p v-if="configMsg" class="text-xs" :class="configMsgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ configMsg }}</p>
        </div>

        <hr class="border-white/10" />
        <div class="rounded-xl bg-rose-500/10 border border-rose-400/25 p-4">
          <label class="label !text-rose-200">重置所有数据</label>
          <p class="text-xs text-indigo-200/60 mb-3">清空全部学生、宠物、积分流水与背包，并恢复演示数据。此操作不可撤销。</p>
          <button class="btn btn-danger" @click="resetAll"><Trash2 class="w-4 h-4" /> 重置所有数据</button>
        </div>
      </div>

      <!-- ============ 同步配置 ============ -->
      <div v-if="tab === 'sync'" class="glass p-5 max-w-2xl animate-fadeUp space-y-4">
        <h3 class="font-bold text-indigo-50 flex items-center gap-2"><Database class="w-5 h-5 text-sky-300" /> Supabase 云端同步</h3>
        <p class="text-xs text-indigo-200/60">多台设备（一体机/教师机）间同步数据。写入需要 Service Role Key（仅保存在本机 config.json）。<strong class="text-indigo-200">留空的字段保持不变</strong>，不会清空已有配置。</p>
        <div>
          <label class="label">Project URL</label>
          <input v-model="syncForm.supabaseUrl" class="input" placeholder="https://xxxx.supabase.co" />
        </div>
        <div>
          <label class="label">Anon Key</label>
          <input v-model="syncForm.supabaseAnonKey" class="input" />
        </div>
        <div>
          <label class="label">Service Role Key</label>
          <input v-model="syncForm.supabaseServiceKey" type="password" class="input" />
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-primary" @click="saveSyncConfig">保存同步配置</button>
          <button class="btn btn-ghost" :disabled="testingSync" @click="testSync">
            <Loader2 v-if="testingSync" class="w-4 h-4 animate-spin" /> 测试连接
          </button>
        </div>
        <p v-if="testMsg" class="text-xs" :class="testMsgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ testMsg }}</p>
        <div class="rounded-xl bg-white/5 p-3 text-xs text-indigo-200/70">
          当前模式：{{ syncStatus.mode }} ｜ 上次同步：{{ syncStatus.lastSyncAt ? fmtTime(syncStatus.lastSyncAt) : '从未' }}
        </div>
      </div>
    </main>

    <!-- 底部操作栏（一体机大按钮） -->
    <div class="bottom-bar">
      <button class="btn btn-danger !text-base" @click="logout">
        <LogOut class="w-5 h-5" /> 退出登录
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ShieldCheck, LogOut, BarChart3, RefreshCw, Users, Zap, PawPrint,
  Store, Smile, Settings2, Database, Plus, X, UserPlus, Upload, PenLine, Trash2, Loader2,
  ImagePlus, Gauge, Lock, Download, Archive, FileSpreadsheet, KeyRound, type LucideIcon,
  Palette,
} from 'lucide-vue-next';
import ItemsManager from '../components/ItemsManager.vue';
import RulesManager from '../components/RulesManager.vue';
import PetsLevelManager from '../components/PetsLevelManager.vue';
import { api, clearAuth, upload } from '../api';
import { toast } from '../composables/toast';
import { useSettings } from '../composables/settings';
import { useFrostHeader } from '../composables/useFrostHeader';

const router = useRouter();
const { pointsUnit } = useSettings();
const { headerEl } = useFrostHeader();
const tab = ref('overview');
const tabs = [
  { key: 'overview', label: '概览', icon: BarChart3 as LucideIcon },
  { key: 'students', label: '学生', icon: Users as LucideIcon },
  { key: 'presets', label: '快捷理由', icon: Zap as LucideIcon },
  { key: 'species', label: '宠物种类', icon: PawPrint as LucideIcon },
  { key: 'items', label: '道具', icon: Store as LucideIcon },
  { key: 'rules', label: '状态规则', icon: Smile as LucideIcon },
  { key: 'pets', label: '宠物等级', icon: Gauge as LucideIcon },
  { key: 'settings', label: '设置', icon: Settings2 as LucideIcon },
  { key: 'sync', label: '同步', icon: Database as LucideIcon },
];

const stats = reactive<Record<string, number>>({});
const syncStatus = reactive<{ mode: string; lastSyncAt: string }>({ mode: 'mock', lastSyncAt: '' });
const syncing = ref(false);
const syncMsg = ref('');
const syncMsgType = ref<'ok' | 'error'>('ok');

const adminStudents = ref<any[]>([]);
const presets = ref<any[]>([]);
const species = ref<any[]>([]);
const items = ref<any[]>([]);
const rules = ref<any[]>([]);

const stuForm = reactive({ name: '', studentNo: '', className: '', points: undefined as number | undefined, petSpeciesId: '', petName: '' });
const importText = ref('');
const importFileRef = ref<HTMLInputElement | null>(null);
const importFileName = ref('');
const avatarFileRef = ref<HTMLInputElement | null>(null);
const avatarMsg = ref('');
const avatarMsgType = ref<'ok' | 'err'>('ok');
const preForm = reactive({ label: '', delta: 5, reason: '' });
const spForm = reactive({ id: '', name: '', emoji: '', colorFrom: '', colorTo: '' });
const speciesAvatarFile = ref<File | null>(null);
const speciesAvatarPreview = ref('');
const itemForm = reactive({ id: '', name: '', type: 'food', cost: 10, effectText: '{}', desc: '' });
const setForm = reactive({ pointsUnit: '积分', adminName: '', giteeRepo: '', giteeEnabled: false, backupMaxMB: 1024, emergencyPwEnabled: true, termName: '默认学期', teacherPassword: '123456', activeSubject: '默认', cloudBackupRetention: 10, subjects: [{ name: '默认', sync: true, enabled: { points: true, pets: true, shop: true, rank: true, avatar: true } }], uiStyle: { welcome: 'global_formal' as string, student: 'formal' as string, admin: 'global_formal' as string } });
const auditLogs = ref<any[]>([]);
const errorReports = ref<any[]>([]);
const dataMsg = ref('');
const dataMsgType = ref<'ok' | 'err'>('ok');
const updatePolicy = reactive({ mode: 'none' });
const updatePolicyMsg = ref('');
const updatePolicyMsgType = ref<'ok' | 'err'>('ok');
const configMsg = ref('');
const configMsgType = ref<'ok' | 'err'>('ok');
const pwForm = reactive({ old: '', next: '' });
const syncForm = reactive({ supabaseUrl: '', supabaseAnonKey: '', supabaseServiceKey: '' });
const testingSync = ref(false);
const testMsg = ref('');
const testMsgType = ref<'ok' | 'err'>('ok');

const fmtTime = (s: string): string => new Date(s).toLocaleString('zh-CN', { hour12: false });

async function loadAll(): Promise<void> {
  const [st, ss, su, pr, sp, it, ru, se] = await Promise.all([
    api<Record<string, number>>('/teacher/stats').catch(() => ({})),
    api<{ mode: string; lastSyncAt: string }>('/sync/status').catch(() => ({ mode: 'mock', lastSyncAt: '' })),
    api<{ students: any[] }>('/admin/students').catch(() => ({ students: [] })),
    api<{ presets: any[] }>('/admin/presets').catch(() => ({ presets: [] })),
    api<{ species: any[] }>('/admin/species').catch(() => ({ species: [] })),
    api<{ items: any[] }>('/admin/items').catch(() => ({ items: [] })),
    api<{ rules: any[] }>('/admin/state-rules').catch(() => ({ rules: [] })),
    api<{ pointsUnit: string; adminName: string; giteeEnabled: boolean; giteeRepo: string; backupMaxMB: number; emergencyPwEnabled: boolean; termName: string; teacherPassword: string; activeSubject: string; cloudBackupRetention: number; subjects: any[] }>('/admin/settings').catch(() => ({ pointsUnit: '积分', adminName: '', giteeEnabled: false, giteeRepo: '', backupMaxMB: 1024, emergencyPwEnabled: true, termName: '默认学期', teacherPassword: '123456', activeSubject: '默认', cloudBackupRetention: 10, subjects: [] })),
  ]);
  Object.assign(stats, st);
  Object.assign(syncStatus, ss);
  adminStudents.value = su.students;
  presets.value = pr.presets;
  species.value = sp.species;
  items.value = it.items;
  rules.value = ru.rules;
  setForm.pointsUnit = se.pointsUnit;
  setForm.adminName = se.adminName;
  setForm.giteeEnabled = se.giteeEnabled;
  setForm.giteeRepo = se.giteeRepo;
  setForm.backupMaxMB = se.backupMaxMB || 1024;
  setForm.emergencyPwEnabled = se.emergencyPwEnabled !== false;
  setForm.termName = se.termName || '默认学期';
  // 界面文案风格（当前生效规则）
  const style = (await api<Partial<Record<'welcome' | 'student' | 'admin', string>>>('/ui/style').catch(() => (undefined))) ?? {};
  if (style.welcome) setForm.uiStyle.welcome = style.welcome;
  if (style.student) setForm.uiStyle.student = style.student;
  if (style.admin) setForm.uiStyle.admin = style.admin;
}

async function addStudent(): Promise<void> {
  if (!stuForm.name.trim()) { toast('姓名必填', 'error'); return; }
  try {
    await api('/admin/students', { method: 'POST', body: JSON.stringify(stuForm) });
    toast('学生已添加', 'success');
    Object.assign(stuForm, { name: '', points: undefined, petSpeciesId: '', petName: '' });
    await loadAll();
  } catch (e) { toast((e as Error).message, 'error'); }
}

async function importStudents(): Promise<void> {
  const rows = importText.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, points] = l.split(/[,，]/).map((x) => x.trim());
    return { name, points: Number(points) || 0 };
  });
  if (rows.length === 0) { toast('请输入要导入的学生', 'error'); return; }
  try {
    const r = await api<{ added: number; errors: string[] }>('/admin/students/import', { method: 'POST', body: JSON.stringify({ students: rows }) });
    toast(`导入成功 ${r.added} 人${r.errors.length ? `，${r.errors.length} 条失败` : ''}`, r.errors.length ? 'error' : 'success');
    importText.value = '';
    await loadAll();
  } catch (e) { toast((e as Error).message, 'error'); }
}
async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importFileName.value = file.name;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const token = localStorage.getItem('pet_token');
    const res = await fetch('/api/admin/students/import-file', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '导入失败');
    toast(`导入成功 ${data.added} 人${data.errors?.length ? `，${data.errors.length} 条失败` : ''}`, data.errors?.length ? 'error' : 'success');
    importFileName.value = '';
    await loadAll();
  } catch (e) {
    toast((e as Error).message, 'error');
  } finally {
    input.value = '';
  }
}
async function uploadAvatars(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length === 0) return;
  if (files.length !== adminStudents.value.length) {
    toast(`头像数量需与学生数量一致（当前列表 ${adminStudents.value.length} 人）`, 'error');
    input.value = '';
    return;
  }
  const studentIds = adminStudents.value.map((s: any) => s.id);
  const fd = new FormData();
  fd.append('studentIds', JSON.stringify(studentIds));
  for (const f of files) fd.append('files', f);
  avatarMsgType.value = 'ok';
  avatarMsg.value = '上传中…';
  try {
    const token = localStorage.getItem('pet_token');
    const res = await fetch('/api/admin/students/avatars', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '上传失败');
    avatarMsg.value = `上传成功 ${data.uploaded} 人`;
    await loadAll();
  } catch (e) {
    avatarMsgType.value = 'err';
    avatarMsg.value = (e as Error).message;
  } finally {
    input.value = '';
  }
}
async function loadErrors(): Promise<void> {
  try {
    const r = await api<{ errors: any[] }>('/admin/errors');
    errorReports.value = r.errors ?? [];
  } catch {
    errorReports.value = [];
  }
}
async function saveTeacherPassword(): Promise<void> {
  try {
    await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ teacherPassword: setForm.teacherPassword }) });
    toast('教师口令已保存', 'success');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}
function addSubject(): void {
  setForm.subjects.push({ name: '新科目', sync: true, enabled: { points: true, pets: true, shop: true, rank: true, avatar: true } });
}
function removeSubject(i: number): void {
  setForm.subjects.splice(i, 1);
  if (!setForm.subjects.some((s: any) => s.name === setForm.activeSubject)) setForm.activeSubject = setForm.subjects[0]?.name || '默认';
}

async function editPoints(s: any): Promise<void> {
  const v = window.prompt(`修改 ${s.name} 的积分`, String(s.points));
  if (v === null) return;
  const n = Number(v);
  if (!Number.isFinite(n)) { toast('请输入数字', 'error'); return; }
  try {
    await api(`/admin/students/${s.id}`, { method: 'PUT', body: JSON.stringify({ points: n }) });
    toast('积分已更新', 'success');
    await loadAll();
  } catch (e) { toast((e as Error).message, 'error'); }
}

async function delStudent(s: any): Promise<void> {
  if (!confirm(`确定删除学生 ${s.name}？`)) return;
  try {
    await api(`/admin/students/${s.id}`, { method: 'DELETE' });
    toast('已删除', 'success');
    await loadAll();
  } catch (e) { toast((e as Error).message, 'error'); }
}

async function addPreset(): Promise<void> {
  if (!preForm.label.trim()) { toast('名称必填', 'error'); return; }
  try {
    await api('/admin/presets', { method: 'POST', body: JSON.stringify({ ...preForm, reason: preForm.reason || preForm.label }) });
    toast('已添加', 'success');
    Object.assign(preForm, { label: '', delta: 5, reason: '' });
    await loadAll();
  } catch (e) { toast((e as Error).message, 'error'); }
}
async function delPreset(p: any): Promise<void> {
  await api(`/admin/presets/${p.id}`, { method: 'DELETE' });
  await loadAll();
}

function onSpeciesAvatar(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  speciesAvatarFile.value = file;
  speciesAvatarPreview.value = URL.createObjectURL(file);
}

async function addSpecies(): Promise<void> {
  if (!spForm.id.trim() || !spForm.name.trim()) { toast('id 与名称必填', 'error'); return; }
  try {
    await api('/admin/species', { method: 'POST', body: JSON.stringify(spForm) });
    if (speciesAvatarFile.value) {
      try {
        await upload('/admin/species/' + spForm.id + '/avatar', speciesAvatarFile.value);
      } catch (ue) {
        toast('种类已创建，但头像上传失败：' + (ue as Error).message, 'error');
      }
    }
    toast('已添加', 'success');
    Object.assign(spForm, { id: '', name: '', emoji: '', colorFrom: '', colorTo: '' });
    speciesAvatarFile.value = null;
    speciesAvatarPreview.value = '';
    await loadAll();
  } catch (e) { toast((e as Error).message, 'error'); }
}
async function delSpecies(sp: any): Promise<void> {
  await api(`/admin/species/${sp.id}`, { method: 'DELETE' });
  await loadAll();
}

async function addItem(): Promise<void> {
  if (!itemForm.id.trim() || !itemForm.name.trim()) { toast('id 与名称必填', 'error'); return; }
  let effect: Record<string, number> = {};
  try {
    effect = JSON.parse(itemForm.effectText || '{}');
  } catch {
    toast('效果 JSON 格式错误', 'error');
    return;
  }
  try {
    await api('/admin/items', { method: 'POST', body: JSON.stringify({ ...itemForm, effect }) });
    toast('已添加', 'success');
    Object.assign(itemForm, { id: '', name: '', type: 'food', cost: 10, effectText: '{}', desc: '' });
    await loadAll();
  } catch (e) { toast((e as Error).message, 'error'); }
}
async function delItem(it: any): Promise<void> {
  await api(`/admin/items/${it.id}`, { method: 'DELETE' });
  await loadAll();
}

async function saveRule(r: any): Promise<void> {
  await api(`/admin/state-rules/${r.id}`, { method: 'PUT', body: JSON.stringify({ label: r.label }) });
  toast('已保存', 'success');
}

async function saveSettings(): Promise<void> {
  // 保存界面文案风格（独立接口）
  try {
    await api('/ui/style', { method: 'POST', body: JSON.stringify(setForm.uiStyle) });
  } catch {
    /* 风格保存失败不阻塞其它设置 */
  }
  await api('/admin/settings', { method: 'PUT', body: JSON.stringify(setForm) });
  toast('设置已保存', 'success');
  await loadAll();
}

async function loadUpdatePolicy(): Promise<void> {
  try {
    const p = await api<{ deviceDisabled: boolean; dbDisabled: boolean }>('/updates/policy');
    updatePolicy.mode = p.dbDisabled ? 'all' : p.deviceDisabled ? 'device' : 'none';
  } catch {
    updatePolicy.mode = 'none';
  }
}

async function saveUpdatePolicy(): Promise<void> {
  try {
    await api('/updates/policy', {
      method: 'POST',
      body: JSON.stringify({
        deviceDisabled: updatePolicy.mode === 'device' || updatePolicy.mode === 'all',
        dbDisabled: updatePolicy.mode === 'all',
      }),
    });
    updatePolicyMsg.value = '更新检查策略已保存';
    updatePolicyMsgType.value = 'ok';
  } catch (e) {
    updatePolicyMsg.value = (e as Error).message;
    updatePolicyMsgType.value = 'err';
  }
}

async function exportConfig(): Promise<void> {
  try {
    const cfg = await api<Record<string, unknown>>('/admin/config/export');
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classroom-pet-config-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    configMsg.value = '配置已导出，请妥善保管（含云端密钥）';
    configMsgType.value = 'ok';
  } catch (e) {
    configMsg.value = (e as Error).message;
    configMsgType.value = 'err';
  }
}

async function importConfig(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text) as Record<string, unknown>;
    await api('/admin/config/import', { method: 'POST', body: JSON.stringify(data) });
    configMsg.value = '配置已导入，云端配置已更新';
    configMsgType.value = 'ok';
    await loadAll();
    await loadUpdatePolicy();
  } catch (err) {
    configMsg.value = '导入失败：' + (err as Error).message;
    configMsgType.value = 'err';
  }
}

async function changePw(): Promise<void> {
  if (!pwForm.old || !pwForm.next) { toast('请填写新旧密码', 'error'); return; }
  try {
    await api('/admin/password', { method: 'POST', body: JSON.stringify({ oldPassword: pwForm.old, newPassword: pwForm.next }) });
    toast('密码已更新', 'success');
    Object.assign(pwForm, { old: '', next: '' });
  } catch (e) { toast((e as Error).message, 'error'); }
}

async function testSync(): Promise<void> {
  testingSync.value = true;
  testMsg.value = '';
  try {
    const r = await api<{ ok: boolean; readOk: boolean; writeKeyPresent: boolean; note?: string; error?: string }>('/sync/test', { method: 'POST' });
    testMsg.value = r.note ?? (r.ok ? '连接成功' : '连接失败');
    testMsgType.value = r.ok ? 'ok' : 'err';
  } catch (e) {
    testMsg.value = (e as Error).message;
    testMsgType.value = 'err';
  } finally {
    testingSync.value = false;
  }
}

async function saveSyncConfig(): Promise<void> {
  // 只提交非空字段，避免误清已有云端配置
  const payload: Record<string, string> = {};
  if (syncForm.supabaseUrl.trim()) payload.supabaseUrl = syncForm.supabaseUrl.trim();
  if (syncForm.supabaseAnonKey.trim()) payload.supabaseAnonKey = syncForm.supabaseAnonKey.trim();
  if (syncForm.supabaseServiceKey.trim()) payload.supabaseServiceKey = syncForm.supabaseServiceKey.trim();
  try {
    await api('/sync/config', { method: 'POST', body: JSON.stringify(payload) });
    toast('同步配置已保存', 'success');
    await loadAll();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function runSync(): Promise<void> {
  syncing.value = true;
  syncMsg.value = '';
  try {
    const r = await api<{ conflicts: unknown[]; pulled: number; pushed: number; completed: boolean }>('/sync/run', { method: 'POST' });
    if (r.conflicts.length > 0) {
      syncMsg.value = `存在 ${r.conflicts.length} 处冲突，请在准备界面处理`;
      syncMsgType.value = 'error';
    } else {
      syncMsg.value = `同步完成：拉取 ${r.pulled}，推送 ${r.pushed}`;
      syncMsgType.value = 'ok';
    }
    await loadAll();
  } catch (e) {
    syncMsg.value = (e as Error).message;
    syncMsgType.value = 'error';
  } finally {
    syncing.value = false;
  }
}

async function resetAll(): Promise<void> {
  if (!confirm('确定要清空所有学生/宠物/流水/背包数据吗？此操作不可恢复！')) return;
  if (!confirm('再次确认：将删除全部业务数据并恢复演示数据。确定继续？')) return;
  try {
    const r = await api<{ message: string }>('/admin/reset', { method: 'POST' });
    toast(r.message || '已重置', 'success');
    await loadAll();
  } catch (e) { toast((e as Error).message, 'error'); }
}

async function exportData(): Promise<void> {
  try {
    const data = await api<Record<string, unknown>>('/admin/data/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classroom-pet-data-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    dataMsg.value = '数据已导出（JSON）';
    dataMsgType.value = 'ok';
  } catch (e) {
    dataMsg.value = (e as Error).message;
    dataMsgType.value = 'err';
  }
}

async function archiveTerm(): Promise<void> {
  const label = setForm.termName.trim() || '默认学期';
  if (!confirm('将生成「' + label + '」的学期快照，然后清空学生/宠物/流水开始新学期。确定继续？')) return;
  if (!confirm('再次确认：归档后业务数据将被清空（快照文件可恢复）。继续？')) return;
  try {
    const r = await api<{ message: string; backupFile: string }>('/admin/archive', {
      method: 'POST',
      body: JSON.stringify({ termName: label }),
    });
    dataMsg.value = r.message + '（快照：' + r.backupFile + '）';
    dataMsgType.value = 'ok';
    await loadAll();
    await loadAudit();
  } catch (e) {
    dataMsg.value = (e as Error).message;
    dataMsgType.value = 'err';
  }
}

async function loadAudit(): Promise<void> {
  try {
    const r = await api<{ logs: any[] }>('/admin/audit');
    auditLogs.value = r.logs.slice(0, 20);
  } catch {
    auditLogs.value = [];
  }
}

async function clearData(): Promise<void> {
  if (!confirm('将清空全部学生/宠物/流水/背包（保留宠物种类、道具、规则与系统设置），且不恢复演示数据。确定继续？')) return;
  if (!confirm('再次确认：清空后请立即在「同步」页执行同步，把清空结果推送到云端。继续？')) return;
  try {
    const r = await api<{ message: string }>('/admin/clear-data', { method: 'POST' });
    dataMsg.value = r.message || '已清空';
    dataMsgType.value = 'ok';
    await loadAll();
    await loadAudit();
  } catch (e) {
    dataMsg.value = (e as Error).message;
    dataMsgType.value = 'err';
  }
}

function logout(): void {
  clearAuth();
  router.push('/login');
}

onMounted(() => {
  loadAll();
  loadUpdatePolicy();
  loadAudit();
});
</script>
