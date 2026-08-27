<template>
  <div class="min-h-screen pb-32">
    <header ref="headerEl" class="sticky top-0 z-40 border-b" style="border-bottom-color:rgba(255,255,255,0)">
      <div class="max-w-7xl mx-auto px-5 py-3 text-center">
        <div class="inline-flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/25 grid place-items-center">
            <GraduationCap class="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h1 class="font-bold text-indigo-50 leading-tight">教师系统</h1>
            <p class="text-xs text-indigo-200/60">加减分 · 排行榜 · 宠物成长</p>
          </div>
        </div>
      </div>
    </header>

    <!-- 数据概览 -->
    <div class="max-w-7xl mx-auto px-5 pt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="glass p-4 flex items-center gap-3 animate-fadeUp">
        <Users class="w-6 h-6 text-sky-300" />
        <div>
          <p class="text-2xl font-bold text-indigo-50">{{ stats.cnt ?? '-' }}</p>
          <p class="text-xs text-indigo-200/60">学生总数</p>
        </div>
      </div>
      <div class="glass p-4 flex items-center gap-3 animate-fadeUp">
        <Coins class="w-6 h-6 text-amber-300" />
        <div>
          <p class="text-2xl font-bold text-indigo-50">{{ stats.total ?? '-' }}</p>
          <p class="text-xs text-indigo-200/60">总{{ pointsUnit }}</p>
        </div>
      </div>
      <div class="glass p-4 flex items-center gap-3 animate-fadeUp">
        <TrendingUp class="w-6 h-6 text-emerald-300" />
        <div>
          <p class="text-2xl font-bold text-indigo-50">{{ stats.avg ?? '-' }}</p>
          <p class="text-xs text-indigo-200/60">平均{{ pointsUnit }}</p>
        </div>
      </div>
      <div class="glass p-4 flex items-center gap-3 animate-fadeUp">
        <PawPrint class="w-6 h-6 text-fuchsia-300" />
        <div>
          <p class="text-2xl font-bold text-indigo-50">{{ stats.pets ?? '-' }}</p>
          <p class="text-xs text-indigo-200/60">宠物总数</p>
        </div>
      </div>
    </div>

    <!-- 标签页 -->
    <div class="max-w-7xl mx-auto px-5 mt-6 flex gap-2 overflow-x-auto pb-1 justify-center">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="pill !px-4 !py-2 !text-sm cursor-pointer transition-colors shrink-0"
        :class="tab === t.key ? 'bg-indigo-500/30 text-indigo-100 border border-indigo-400/50' : 'bg-white/5 text-indigo-200/70 border border-white/10 hover:bg-white/10'"
        @click="switchTab(t.key)"
      >
        <component :is="t.icon" class="w-4 h-4" /> {{ t.label }}
      </button>
    </div>

    <main class="max-w-7xl mx-auto px-5 pt-5">
        <!-- ===== 仪表盘 ===== -->
        <div v-if="tab === 'dash'" class="space-y-5 animate-fadeUp">
          <div class="glass p-5">
            <h3 class="font-bold text-indigo-50 mb-4 flex items-center gap-2"><TrendingUp class="w-5 h-5 text-emerald-300" /> 积分趋势（近 30 天）</h3>
            <div class="w-full h-48 flex items-end gap-[2px] overflow-x-auto">
              <div
                v-for="p in trendData"
                :key="p.day"
                class="flex-1 min-w-[6px] rounded-t bg-gradient-to-t from-indigo-500/60 to-fuchsia-400/80 hover:bg-fuchsia-300"
                :style="{ height: Math.max(4, (Math.abs(p.delta) / maxTrend) * 100) + '%' }"
                :title="p.day + ' ' + p.delta"
              />
            </div>
            <p class="text-xs text-indigo-200/50 mt-2">柱高表示当天增减分绝对值；悬停查看具体日期。</p>
          </div>
          <div class="glass p-5">
            <h3 class="font-bold text-indigo-50 mb-4 flex items-center gap-2"><Settings2 class="w-5 h-5 text-slate-300" /> 当前科目</h3>
            <div class="flex flex-wrap gap-2 items-center">
              <select v-model="activeSubject" class="input !w-48 !py-2 text-sm" @change="changeSubject">
                <option v-for="s in subjects" :key="s.name" :value="s.name">{{ s.name }}</option>
              </select>
              <span class="text-xs text-indigo-200/60">切换后教师端只显示该科目学生</span>
            </div>
          </div>
        </div>

        <!-- ===== 设置 ===== -->
        <div v-if="tab === 'settings'" class="glass p-5 max-w-2xl animate-fadeUp space-y-5">
          <h3 class="font-bold text-indigo-50 flex items-center gap-2"><Settings2 class="w-5 h-5 text-slate-300" /> 教师设置</h3>
          <div>
            <label class="label">修改教师口令</label>
            <div class="grid grid-cols-2 gap-2 max-w-md">
              <input v-model="pwForm.old" type="password" class="input" placeholder="当前口令" />
              <input v-model="pwForm.next" type="password" class="input" placeholder="新口令（≥4位）" />
            </div>
            <button class="btn btn-ghost mt-3 !py-2 text-sm" @click="changeTeacherPassword"><KeyRound class="w-4 h-4" /> 修改口令</button>
          </div>
          <div>
            <label class="label">科目与个性化</label>
            <div v-for="(s, i) in subjects" :key="i" class="rounded-xl bg-white/5 border border-white/10 p-3 mb-2">
              <div class="flex gap-2 items-center text-sm">
                <span class="font-semibold text-indigo-100">{{ s.name }}</span>
                <label class="ml-auto flex items-center gap-1 text-xs text-indigo-200/70">
                  <input v-model="s.sync" type="checkbox" class="accent-indigo-400" /> 同步
                </label>
                <label class="flex items-center gap-1 text-xs text-indigo-200/70">
                  <input v-model="s.enabled.points" type="checkbox" class="accent-indigo-400" /> 积分
                </label>
                <label class="flex items-center gap-1 text-xs text-indigo-200/70">
                  <input v-model="s.enabled.pets" type="checkbox" class="accent-indigo-400" /> 宠物
                </label>
                <label class="flex items-center gap-1 text-xs text-indigo-200/70">
                  <input v-model="s.enabled.shop" type="checkbox" class="accent-indigo-400" /> 商店
                </label>
                <label class="flex items-center gap-1 text-xs text-indigo-200/70">
                  <input v-model="s.enabled.rank" type="checkbox" class="accent-indigo-400" /> 排行
                </label>
                <label class="flex items-center gap-1 text-xs text-indigo-200/70">
                  <input v-model="s.enabled.avatar" type="checkbox" class="accent-indigo-400" /> 头像
                </label>
              </div>
            </div>
            <button class="btn btn-ghost !py-2 text-sm" @click="saveSubjects"><Save class="w-4 h-4" /> 保存科目设置</button>
            <span v-if="subjectMsg" class="text-xs ml-2" :class="subjectMsgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ subjectMsg }}</span>
          </div>
          <div>
            <label class="label">版本更新</label>
            <p v-if="updateInfo" class="text-sm text-indigo-200/80">{{ updateInfo }}</p>
            <button class="btn btn-ghost !py-2 text-sm" @click="checkUpdate"><RefreshCw class="w-4 h-4" /> 检查更新</button>
          </div>
        </div>
      <!-- ===== 加减分 ===== -->
      <div v-if="tab === 'points'" class="grid lg:grid-cols-3 gap-6 animate-fadeUp">
        <!-- 学生选择 -->
        <div class="glass p-5 lg:col-span-2">
          <div class="flex items-center justify-between mb-3 gap-2">
            <h3 class="font-bold text-indigo-50 flex items-center gap-2">
              <Users class="w-5 h-5 text-sky-300" /> 选择学生
              <span class="pill bg-indigo-500/25 text-indigo-200">{{ selected.size }} 人</span>
            </h3>
            <label class="flex items-center gap-1.5 text-xs text-indigo-200/80 cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                class="accent-indigo-400 w-4 h-4"
                :checked="allFilteredSelected"
                @change="toggleSelectAll"
              />
              全选{{ searchKey ? '（当前筛选）' : '' }}
            </label>
            <input v-model="searchKey" class="input !w-40 !py-2 text-sm" placeholder="搜索姓名…" />
            <select v-model="sortMode" class="input !w-36 !py-2 text-sm">
              <option value="default">默认排序</option>
              <option value="points">按积分降序</option>
              <option value="name">按姓名</option>
              <option value="class">按班级</option>
            </select>
          </div>
          <p class="text-xs text-indigo-200/50 mb-2">点击学生卡片即可选中 / 取消选中（可多选）</p>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[400px] overflow-y-auto pr-1">
            <div
              v-for="s in filteredStudents"
              :key="s.id"
              role="checkbox"
              :aria-checked="selected.has(s.id)"
              class="rounded-xl border p-3 flex items-center gap-2.5 cursor-pointer transition-colors select-none"
              :class="selected.has(s.id) ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'"
              @click="onCardClick(s, $event)"
            >
              <span
                class="w-6 h-6 rounded-md grid place-items-center border shrink-0 transition-colors"
                :class="selected.has(s.id) ? 'bg-indigo-500 border-indigo-300 text-white' : 'border-white/25 text-transparent'"
              >
                <Check class="w-4 h-4" />
              </span>
              <span
                class="w-9 h-9 rounded-full grid place-items-center text-base shrink-0 overflow-hidden"
                :style="{ background: `linear-gradient(135deg, ${s.speciesColorFrom}, ${s.speciesColorTo})` }"
              >
                <template v-if="s.petAvatar && !avatarFailed.has(s.id)"><img :src="s.petAvatar" class="w-full h-full object-cover" alt="" @error="avatarFailed.add(s.id)" /></template>
                <template v-else>{{ s.petEmoji || s.name.slice(0, 1) }}</template>
              </span>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-indigo-50 truncate">{{ s.name }}</p>
                <p class="text-xs text-indigo-200/60">{{ s.points }} {{ pointsUnit }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作面板 -->
        <div class="space-y-4">
          <!-- 加减分 -->
          <div class="glass p-5">
            <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-1">
              <Plus class="w-5 h-5 text-amber-300" /> 加减分
            </h3>
            <p class="text-xs text-indigo-200/60 mb-3 leading-relaxed">
              ① 点选左侧学生 → ② 用 <b class="text-emerald-300">+5</b> / <b class="text-rose-300">−5</b> 调整分值 →
              ③ 填理由 → ④ 确认
            </p>
            <div class="flex items-stretch gap-2">
              <button
                class="btn btn-danger !px-4 !text-2xl font-black shrink-0"
                title="点击一次，分值减 5"
                @click="adjustDelta(-5)"
              >
                −5
              </button>
              <input v-model.number="delta" type="number" class="input flex-1 text-center !text-2xl font-black !py-2" />
              <button
                class="btn btn-primary !px-4 !text-2xl font-black shrink-0"
                title="点击一次，分值加 5"
                @click="adjustDelta(5)"
              >
                +5
              </button>
            </div>
            <div class="mt-1.5 flex items-center justify-between text-xs text-indigo-200/50">
              <span>扣分方向</span>
              <span>加分方向</span>
            </div>
            <div class="mt-2 flex items-center justify-between text-xs">
              <span class="text-indigo-200/60">当前分值：<b class="text-lg" :class="delta >= 0 ? 'text-emerald-300' : 'text-rose-300'">{{ delta > 0 ? '+' : '' }}{{ delta }}</b></span>
              <button class="btn btn-ghost !py-1 !px-2 text-xs" @click="delta = 5">恢复默认 5</button>
            </div>
            <input v-model="reason" class="input !py-1.5 !text-sm mt-3" placeholder="加减分理由（必填）" @keyup.enter="applyPoints" />
            <p class="mt-1 text-xs text-indigo-200/50">
              想把当前分值+理由存下来复用？
              <button class="underline text-fuchsia-300 hover:text-fuchsia-200" @click="quickSavePreset">一键存为快捷理由！</button>
            </p>
            <p v-if="pointsValidation" class="mt-1 text-xs text-amber-300">{{ pointsValidation }}</p>
            <div class="flex gap-2 mt-3">
              <button class="btn btn-gold flex-1" @click="applyPoints">
                <Send class="w-4 h-4" /> 确认{{ delta > 0 ? '加分' : delta < 0 ? '扣分' : '' }}（{{ selected.size }} 人）
              </button>
              <button v-if="!pointsValidation" class="btn btn-ghost shrink-0" title="把当前分值与理由存为快捷选项" @click="quickSavePreset">
                <Plus class="w-4 h-4" /> 存为快捷理由
              </button>
            </div>
          </div>

          <!-- 快捷加减分 -->
          <div class="glass p-5">
            <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-1">
              <Zap class="w-5 h-5 text-yellow-300" /> 快捷加减分
            </h3>
            <p class="text-xs text-indigo-200/60 mb-2">点击预设直接填入分值与理由，也可点「+」添加</p>
            <div class="flex flex-wrap gap-2 items-center">
              <button
                v-for="p in presets"
                :key="p.id"
                class="pill !px-3 !py-1.5 cursor-pointer transition-colors group"
                :class="[
                  p.delta >= 0 ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/25' : 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25',
                  p.id === presetHighlightId ? 'preset-pop ring-2 ring-amber-300' : '',
                ]"
                @click="usePreset(p)"
              >
                {{ p.label }} {{ p.delta > 0 ? '+' : '' }}{{ p.delta }}
                <X class="w-3 h-3 opacity-40 group-hover:opacity-100 hover:text-rose-200" @click.stop="removePreset(p)" />
              </button>
              <button
                class="pill !px-3 !py-1.5 cursor-pointer border border-dashed border-white/25 text-indigo-200/70 hover:bg-white/10 hover:text-indigo-100 transition-colors"
                @click="presetAddOpen = !presetAddOpen"
              >
                <Plus class="w-3.5 h-3.5" /> 添加
              </button>
            </div>
            <div v-if="presetAddOpen" ref="presetBox" class="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 animate-fadeUp">
              <p class="text-xs text-indigo-200/70 mb-2">新增快捷预设（无数量上限）</p>
              <div class="flex gap-2">
                <input v-model="newPreset.label" class="input !py-1.5 !text-sm flex-1" placeholder="名称，如：黑板报加分" @keyup.enter="addPreset" />
                <button
                  class="btn !py-1.5 !px-3 text-xs shrink-0"
                  :class="newPreset.sign === '+' ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30' : 'bg-rose-500/15 text-rose-200 border border-rose-400/30'"
                  type="button"
                  title="点击切换 加分 / 扣分"
                  @click="togglePresetSign"
                >
                  {{ newPreset.sign }}
                </button>
                <input v-model.number="newPreset.delta" type="number" class="input !py-1.5 !text-sm !w-20 text-center" placeholder="分" />
                <button class="btn btn-primary !py-1.5 !px-3 text-xs" @click="addPreset">
                  <Plus class="w-3.5 h-3.5" /> 添加
                </button>
              </div>
              <p class="text-xs text-indigo-200/50 mt-1">点 ± 在加分/扣分之间切换；输入框只填正数即可。</p>
              <p v-if="presetError" class="text-xs text-rose-300 mt-1.5">{{ presetError }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 三连击：进入学生宠物系统小弹窗（无背景遮罩，点击别处关闭） -->
      <Transition name="pop">
        <div
          v-if="gotoPop"
          class="fixed z-[70] glass p-4 rounded-2xl w-72"
          :style="{ left: gotoPop.x + 'px', top: gotoPop.y + 'px' }"
          @click.stop
        >
          <p class="text-sm font-semibold text-indigo-50 mb-3">是否进入「{{ gotoPop.student.name }}」的宠物系统？</p>
          <div class="flex gap-2">
            <button class="btn btn-gold !py-2 flex-1" @click="enterStudentSystem"><Check class="w-4 h-4" /> 进入</button>
            <button class="btn btn-ghost !py-2" @click="closeGotoPop"><X class="w-4 h-4" /> 取消</button>
          </div>
        </div>
      </Transition>

      <!-- ===== 排行榜 ===== -->
      <div v-if="tab === 'rank'" class="space-y-6 animate-fadeUp">
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost !py-1.5 text-xs" @click="exportRankCsv"><Download class="w-3.5 h-3.5" /> 导出榜单 CSV</button>
          <button class="btn btn-ghost !py-1.5 text-xs" @click="exportPointsXlsx"><FileSpreadsheet class="w-3.5 h-3.5" /> 导出积分流水 Excel</button>
        </div>
        <!-- 领奖台：第2名左、第1名中、第3名右 -->
        <div class="grid grid-cols-3 gap-4 items-end max-w-3xl mx-auto">
          <div v-for="p in podiumOrdered" :key="p.rank" class="text-center">
            <div
              class="mx-auto rounded-t-2xl grid place-items-center relative"
              :style="{
                height: p.rank === 1 ? '9rem' : p.rank === 2 ? '7rem' : '5rem',
                background: `linear-gradient(180deg, ${podiumColor(p.rank)}, #1b2447)`,
              }"
            >
              <span class="text-4xl absolute -top-8" :class="p.rank === 1 ? 'animate-bounce-soft' : ''">
                <template v-if="p.petAvatar && !avatarFailed.has(p.id)"><img :src="p.petAvatar" class="w-14 h-14 rounded-full object-cover ring-4" :class="p.rank === 1 ? 'ring-amber-400' : p.rank === 2 ? 'ring-slate-300' : 'ring-orange-400'" alt="" @error="avatarFailed.add(p.id)" /></template>
                <template v-else>{{ p.petEmoji }}</template>
              </span>
            </div>
            <p class="mt-2 font-bold text-indigo-50">{{ p.name }}</p>
            <p class="text-sm text-amber-300 font-semibold">{{ p.points }} {{ pointsUnit }}</p>
          </div>
        </div>

        <!-- 第 4-5 名左侧漂浮 / 第 6-7 名右侧漂浮 -->
        <div class="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div class="glass p-4">
            <p class="text-xs text-indigo-200/60 mb-2 flex items-center gap-1.5"><TrendingUp class="w-3.5 h-3.5" /> 第 4 - 5 名</p>
            <div v-for="p in floatingLeft" :key="p.id" class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              <span class="w-7 h-7 rounded-lg bg-white/8 grid place-items-center text-xs font-bold text-indigo-200/70">{{ p.rank }}</span>
              <template v-if="p.petAvatar && !avatarFailed.has(p.id)"><img :src="p.petAvatar" class="w-7 h-7 rounded-full object-cover" alt="" @error="avatarFailed.add(p.id)" /></template>
              <span v-else class="text-xl">{{ p.petEmoji }}</span>
              <span class="font-medium text-indigo-50 truncate">{{ p.name }}</span>
              <span class="ml-auto font-bold text-amber-300">{{ p.points }}</span>
            </div>
          </div>
          <div class="glass p-4">
            <p class="text-xs text-indigo-200/60 mb-2 flex items-center gap-1.5"><TrendingUp class="w-3.5 h-3.5" /> 第 6 - 7 名</p>
            <div v-for="p in floatingRight" :key="p.id" class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              <span class="w-7 h-7 rounded-lg bg-white/8 grid place-items-center text-xs font-bold text-indigo-200/70">{{ p.rank }}</span>
              <template v-if="p.petAvatar && !avatarFailed.has(p.id)"><img :src="p.petAvatar" class="w-7 h-7 rounded-full object-cover" alt="" @error="avatarFailed.add(p.id)" /></template>
              <span v-else class="text-xl">{{ p.petEmoji }}</span>
              <span class="font-medium text-indigo-50 truncate">{{ p.name }}<span v-if="p.petStageLabel" class="ml-1 text-fuchsia-300/70 text-[10px]">Lv.{{ (p.petStage ?? 0) + 1 }}</span></span>
              <span class="ml-auto font-bold text-amber-300">{{ p.points }}</span>
            </div>
          </div>
        </div>

        <!-- 第 8 名起正常列表 -->
        <div v-if="tableRows.length" class="glass overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-indigo-200/70 border-b border-white/10">
                <th class="px-5 py-3 w-16">名次</th>
                <th class="px-5 py-3">学生</th>
                <th class="px-5 py-3">宠物</th>
                <th class="px-5 py-3 text-right">积分</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in tableRows" :key="r.id" class="border-b border-white/5 last:border-0 hover:bg-white/4">
                <td class="px-5 py-3">
                  <span class="w-7 h-7 inline-grid place-items-center rounded-lg text-xs font-bold bg-white/8 text-indigo-200/70">{{ r.rank }}</span>
                </td>
                <td class="px-5 py-3 font-medium text-indigo-50">{{ r.name }}</td>
                <td class="px-5 py-3 text-indigo-200/70 flex items-center gap-2">
                <template v-if="r.petName">
                  <template v-if="r.petAvatar && !avatarFailed.has(r.id)"><img :src="r.petAvatar" class="w-7 h-7 rounded-full object-cover shrink-0" alt="" @error="avatarFailed.add(r.id)" /></template>
                  <span v-else>{{ r.petEmoji }}</span>
                  <span>{{ r.petName }}</span><span v-if="r.petStageLabel" class="ml-1 text-fuchsia-300/80 text-xs">Lv.{{ (r.petStage ?? 0) + 1 }} {{ r.petStageLabel }}</span>
                </template>
                <span v-else>—</span>
              </td>
                <td class="px-5 py-3 text-right font-bold text-amber-300">{{ r.points }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-center text-indigo-200/50 py-6">暂无更多排名</p>
      </div>

      <!-- ===== 宠物经验 ===== -->
      <div v-if="tab === 'exp'" class="glass p-5 animate-fadeUp">
        <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-4">
          <PawPrint class="w-5 h-5 text-fuchsia-300" /> 宠物经验管理
        </h3>
        <div class="flex flex-wrap gap-3 mb-4">
          <input v-model="expAmount" type="number" class="input !w-32" placeholder="经验值" />
          <input v-model="expReason" class="input !w-64" placeholder="加经验理由（可选）" />
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[480px] overflow-y-auto pr-1">
          <div
            v-for="s in students"
            :key="s.id"
            class="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3"
            :class="expFlashId === s.id ? '!border-fuchsia-400/60 exp-flash' : ''"
          >
            <span
              class="w-10 h-10 rounded-full grid place-items-center text-lg shrink-0 overflow-hidden"
              :style="{ background: `linear-gradient(135deg, ${s.speciesColorFrom}, ${s.speciesColorTo})` }"
            ><template v-if="s.petAvatar && !avatarFailed.has(s.id)"><img :src="s.petAvatar" class="w-full h-full object-cover" alt="" @error="avatarFailed.add(s.id)" /></template><template v-else>{{ s.petEmoji || s.name.slice(0, 1) }}</template></span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-indigo-50 truncate">{{ s.name }}</p>
              <p class="text-xs text-indigo-200/60">
                <template v-if="s.petId">
                  宠物 {{ s.petName }} · <b class="text-fuchsia-300">Lv.{{ (s.petStage ?? 0) + 1 }} {{ s.petStageLabel }}</b> · 经验 {{ fmtExp(s.petExp) }} / {{ s.petNextExp != null ? fmtExp(s.petNextExp) : '—' }}
                </template>
                <template v-else>未领养宠物</template>
              </p>
            </div>
            <button
              class="btn btn-primary !py-1.5 text-xs"
              :disabled="!s.petId || !expAmount"
              @click="giveExp(s)"
            >
              加经验
            </button>
          </div>
        </div>
      </div>

      <!-- ===== 道具管理（下放给教师） ===== -->
      <div v-if="tab === 'items'"><ItemsManager /></div>

      <!-- ===== 状态规则（下放给教师） ===== -->
      <div v-if="tab === 'rules'"><RulesManager /></div>

      <!-- ===== 宠物等级 ===== -->
      <div v-if="tab === 'levels'"><PetsLevelManager /></div>

      <!-- ===== 积分流水 ===== -->
      <div v-if="tab === 'history'" class="glass p-5 animate-fadeUp">
        <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-4">
          <History class="w-5 h-5 text-sky-300" /> 积分流水查询
        </h3>
        <select v-model="historyStudent" class="input !w-72 mb-4" @change="loadHistory">
          <option value="">选择学生…</option>
          <option v-for="s in students" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <div v-if="historyList.length === 0" class="py-8 text-center text-indigo-200/50">暂无记录</div>
        <ul v-else class="space-y-2 max-h-[460px] overflow-y-auto pr-1">
          <li v-for="h in historyList" :key="h.id" class="flex items-center gap-3 rounded-lg bg-white/4 px-4 py-2.5">
            <span class="w-10 text-center font-bold" :class="h.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'">
              {{ h.delta >= 0 ? '+' : '' }}{{ h.delta }}
            </span>
            <span class="flex-1 text-sm text-indigo-100">{{ h.reason || '（无备注）' }}</span>
            <span class="text-xs text-indigo-200/50">{{ fmtTime(h.created_at) }}</span>
          </li>
        </ul>
      </div>
    </main>

    <!-- 底部操作栏（一体机大按钮） -->
    <div class="bottom-bar !justify-end">
      <!-- 撤回：固定在底部栏正中 -->
      <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <UndoButton @reverted="onReverted" />
      </div>
      <button class="btn btn-ghost !text-base" @click="goScreen">
        <MonitorPlay class="w-5 h-5" /> 大屏
      </button>
      <button class="btn btn-danger !text-base" @click="logout">
        <LogOut class="w-5 h-5" /> 退出登录
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  GraduationCap, MonitorPlay, LogOut, Users, Coins, TrendingUp, PawPrint,
  Plus, Zap, Send, History, Check, X, Store, Smile, Gauge, Download, Settings2, KeyRound, Save, RefreshCw, Gift, FileSpreadsheet, type LucideIcon,
} from 'lucide-vue-next';
import ItemsManager from '../components/ItemsManager.vue';
import RulesManager from '../components/RulesManager.vue';
import PetsLevelManager from '../components/PetsLevelManager.vue';
import { api, clearAuth } from '../api';
import { toast } from '../composables/toast';
import { pushUndoable } from '../composables/undo';
import { fmtExp } from '../utils/format';
import UndoButton from '../components/UndoButton.vue';
import { useSettings } from '../composables/settings';
import { useFrostHeader } from '../composables/useFrostHeader';

interface Student {
  id: string; name: string; class_name: string; points: number;
  petId: string | null; petName: string | null; petExp: number | null;
  petStage: number | null; petStageLabel: string | null; petNextExp: number | null;
  petEmoji: string | null; petAvatar: string | null; speciesColorFrom: string; speciesColorTo: string;
}
interface Preset { id: string; label: string; delta: number; reason: string; }
interface RankRow { id: string; name: string; class_name: string; points: number; rank: number; petName: string | null; petEmoji: string; petAvatar: string | null; petExp: number; petStage: number | null; petStageLabel: string | null; }

const router = useRouter();
const { pointsUnit } = useSettings();
const { headerEl } = useFrostHeader();
const tab = ref<'points' | 'rank' | 'exp' | 'history' | 'items' | 'rules' | 'levels' | 'dash' | 'settings'>('points');
const tabs: { key: 'points' | 'rank' | 'exp' | 'history' | 'items' | 'rules' | 'levels' | 'dash' | 'settings'; label: string; icon: LucideIcon }[] = [
  { key: 'points', label: '加减分', icon: Plus as LucideIcon },
  { key: 'rank', label: '排行榜', icon: TrendingUp as LucideIcon },
  { key: 'exp', label: '宠物经验', icon: PawPrint as LucideIcon },
  { key: 'items', label: '道具管理', icon: Store as LucideIcon },
  { key: 'rules', label: '状态规则', icon: Smile as LucideIcon },
  { key: 'levels', label: '宠物等级', icon: Gauge as LucideIcon },
  { key: 'history', label: '积分流水', icon: History as LucideIcon },
];

const students = ref<Student[]>([]);
const presets = ref<Preset[]>([]);
const board = ref<RankRow[]>([]);
const avatarFailed = reactive(new Set<string>());
const stats = reactive<Record<string, number>>({});
const trendData = ref<{ day: string; delta: number }[]>([]);
const maxTrend = computed(() => Math.max(1, ...trendData.value.map((p) => Math.abs(p.delta))));
const subjects = ref<{ name: string; sync: boolean; enabled: { points: boolean; pets: boolean; shop: boolean; rank: boolean; avatar: boolean } }[]>([]);
const activeSubject = ref('');
const pwForm = reactive({ old: '', next: '' });
const subjectMsg = ref('');
const subjectMsgType = ref<'ok' | 'err'>('ok');
const updateInfo = ref('');

// 三连击进入学生宠物系统
const gotoPop = ref<{ x: number; y: number; student: Student } | null>(null);
const clickCounts = reactive(new Map<string, { count: number; timer: ReturnType<typeof setTimeout> | null }>());
function onCardClick(s: Student, e: MouseEvent): void {
  toggleSelect(s.id);
  const rec = clickCounts.get(s.id) ?? { count: 0, timer: null };
  rec.count += 1;
  if (rec.timer) clearTimeout(rec.timer);
  rec.timer = setTimeout(() => {
    rec.count = 0;
    clickCounts.set(s.id, rec);
  }, 2200);
  clickCounts.set(s.id, rec);
  if (rec.count >= 3) {
    rec.count = 0;
    const w = Math.min(e.clientX + 8, window.innerWidth - 300);
    const h = Math.min(e.clientY + 8, window.innerHeight - 180);
    gotoPop.value = { x: Math.max(4, w), y: Math.max(4, h), student: s };
  }
}
function enterStudentSystem(): void {
  const s = gotoPop.value?.student;
  if (s) router.push('/students/' + s.id);
  closeGotoPop();
}
function closeGotoPop(): void {
  gotoPop.value = null;
}

// 加减分表单
const selected = reactive(new Set<string>());
const searchKey = ref('');
const sortMode = ref<'default' | 'points' | 'name' | 'class'>('default');
const delta = ref(5);
const reason = ref('');

// 快捷预设（+ 快捷添加）
const presetAddOpen = ref(false);
const presetBox = ref<HTMLElement | null>(null);
// 新增快捷预设弹窗打开时，自动把弹窗滚进可视区域（否则屏幕较小时弹到画面外）。
watch(presetAddOpen, async (open) => {
  if (open) {
    await nextTick();
    presetBox.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
const presetError = ref('');
const newPreset = reactive({ label: '', delta: 5, sign: '+' });

/** 切换新增预设的正负号（+ 加分 / - 扣分），delta 始终为正数，提交时套用符号。 */
function togglePresetSign(): void {
  newPreset.sign = newPreset.sign === '+' ? '-' : '+';
  newPreset.delta = Math.abs(newPreset.delta);
}

// 经验表单
const expAmount = ref('');
const expReason = ref('');
const expTarget = ref('');
const expFlashId = ref('');
let expFlashTimer: ReturnType<typeof setTimeout> | null = null;

// 流水
const historyStudent = ref('');
const historyList = ref<{ id: string; delta: number; reason: string; created_at: string }[]>([]);

const pointsValidation = computed<string | null>(() => {
  if (selected.size === 0) return '请先选择学生（点击左侧学生卡片）';
  if (delta.value === 0) return '当前分值为 0，无法提交，请用 +5 / −5 调整';
  if (!reason.value.trim()) return '请填写加减分理由';
  return null;
});

const filteredStudents = computed(() => {
  const base = students.value.filter((s) => !searchKey.value || s.name.includes(searchKey.value));
  if (sortMode.value === 'points') return [...base].sort((a, b) => b.points - a.points);
  if (sortMode.value === 'name') return [...base].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  if (sortMode.value === 'class') return [...base].sort((a, b) => (a.class_name || '').localeCompare(b.class_name || '') || a.name.localeCompare(b.name, 'zh'));
  return base;
});
const podiumOrdered = computed(() => {
  const byRank = (k: number) => board.value.find((r) => r.rank === k);
  return [byRank(2), byRank(1), byRank(3)].filter(Boolean) as RankRow[];
});
const floatingLeft = computed(() => board.value.filter((r) => r.rank === 4 || r.rank === 5));
const floatingRight = computed(() => board.value.filter((r) => r.rank === 6 || r.rank === 7));
const tableRows = computed(() => board.value.filter((r) => r.rank > 7));
const fmtTime = (s: string): string => new Date(s).toLocaleString('zh-CN', { hour12: false });
const podiumColor = (rank: number): string =>
  rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : '#fb923c';

function switchTab(key: 'points' | 'rank' | 'exp' | 'history' | 'items' | 'rules' | 'levels' | 'dash' | 'settings'): void {
  tab.value = key;
  if (key === 'rank' && board.value.length === 0) loadBoard();
  if (key === 'history') historyList.value = [];
  if (key === 'dash' && trendData.value.length === 0) loadTrend();
  if (key === 'settings' && subjects.value.length === 0) loadSubjects();
  }
function toggleSelect(id: string): void {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
}

function adjustDelta(n: number): void {
  delta.value = Math.round((delta.value || 0) + n);
}

function usePreset(p: Preset): void {
  delta.value = p.delta;
  reason.value = p.reason;
  toast(`已填入：${p.label}（${p.delta > 0 ? '+' : ''}${p.delta} 分）`, 'info');
}

async function addPreset(): Promise<void> {
  presetError.value = '';
  if (!newPreset.label.trim() || !newPreset.delta) {
    presetError.value = '请填写名称与分值';
    return;
  }
  try {
    const signedDelta = Math.abs(newPreset.delta) * (newPreset.sign === '-' ? -1 : 1);
    await api('/presets', {
      method: 'POST',
      body: JSON.stringify({ label: newPreset.label.trim(), delta: signedDelta, reason: newPreset.label.trim() }),
    });
    toast(`快捷预设已添加（${signedDelta > 0 ? '+' : ''}${signedDelta} 分）`, 'success');
    newPreset.label = '';
    newPreset.delta = 5;
    newPreset.sign = '+';
    presetAddOpen.value = false;
    await loadPresets();
  } catch (e) {
    presetError.value = (e as Error).message;
  }
}

async function removePreset(p: Preset): Promise<void> {
  if (!confirm(`删除快捷预设「${p.label}」？`)) return;
  try {
    await api(`/presets/${p.id}`, { method: 'DELETE' });
    toast('已删除', 'success');
    await loadPresets();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function applyPoints(): Promise<void> {
  if (selected.size === 0) {
    toast('请先选择学生', 'error');
    return;
  }
  if (delta.value === 0) {
    toast('分值为 0，无法提交', 'error');
    return;
  }
  if (!reason.value.trim()) {
    toast('请填写加减分理由', 'error');
    return;
  }
  try {
    const targetIds = [...selected];
    const r = await api<{ applied: number; totalDelta: number; events?: { eventId: string; studentId: string; delta: number; newPoints: number }[] }>('/points', {
      method: 'POST',
      body: JSON.stringify({ studentIds: targetIds, delta: delta.value, reason: reason.value.trim() }),
    });
    toast(`已对 ${r.applied} 名学生${delta.value >= 0 ? '加' : '扣'} ${Math.abs(delta.value)} 分`, 'success');
    // 乐观更新：左侧学生积分立即用服务端返回的新值刷新，不等重新拉取
    for (const ev of r.events ?? []) {
      const stu = students.value.find((s) => s.id === ev.studentId);
      if (stu) stu.points = ev.newPoints;
    }
    // 撤回按钮：记录本次产生的流水 id，底部栏按提示冲正
    const ids = (r.events ?? []).map((e) => e.eventId);
    if (ids.length > 0) {
      const label =
        r.applied === 1
          ? `${students.value.find((s) => s.id === r.events![0].studentId)?.name ?? '该学生'}`
          : `${r.applied} 名学生`;
      pushUndoable(`${label} ${delta.value >= 0 ? '+' : '-'}${Math.abs(delta.value)}`, ids);
    }
    // 记住常用操作（分值/理由），下次进入自动还原
    try {
      localStorage.setItem('teacher_last_delta', String(delta.value));
      localStorage.setItem('teacher_last_reason', reason.value || '');
    } catch { /* ignore */ }
    selected.clear();
    reason.value = '';
    delta.value = 5;
    await Promise.all([loadStudents(), loadStats(), loadBoard()]);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}
/** 全选 / 取消全选（针对当前筛选出的学生） */
const allFilteredSelected = computed(
  () => filteredStudents.value.length > 0 && filteredStudents.value.every((s) => selected.has(s.id))
);
function toggleSelectAll(): void {
  if (allFilteredSelected.value) {
    for (const s of filteredStudents.value) selected.delete(s.id);
  } else {
    for (const s of filteredStudents.value) selected.add(s.id);
  }
}

/** 撤回成功：用冲正返回的 delta 乐观回滚左侧积分，并刷新统计/榜单 */
function onReverted(res: { reverted: { studentId: string; delta: number }[] }): void {
  for (const rev of res.reverted ?? []) {
    const stu = students.value.find((s) => s.id === rev.studentId);
    if (stu) stu.points += rev.delta;
  }
  void Promise.all([loadStats(), loadBoard()]);
}

/** 新建预设的高亮 id（强调动画用） */
const presetHighlightId = ref('');

/**
 * 一键把当前「分值 + 理由」存为快捷预设：
 * 不再展开表单，直接入列并高亮新项。
 */
async function quickSavePreset(): Promise<void> {
  const label = reason.value.trim();
  if (!label) {
    toast('请先填写理由，再一键存为快捷理由', 'error');
    return;
  }
  if (!delta.value) {
    toast('分值为 0，无法保存', 'error');
    return;
  }
  try {
    const r = await api<{ id: string }>('/presets', {
      method: 'POST',
      body: JSON.stringify({ label, delta: delta.value, reason: label }),
    });
    await loadPresets();
    presetHighlightId.value = r.id;
    setTimeout(() => (presetHighlightId.value = ''), 2600);
    toast(`已存为快捷理由「${label} ${delta.value > 0 ? '+' : ''}${delta.value}」`, 'success');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function giveExp(s: Student): Promise<void> {
  if (!s.petId) return;
  const beforeStage = s.petStage ?? 0;
  try {
    await api(`/pets/${s.petId}/exp`, { method: 'POST', body: JSON.stringify({ amount: Number(expAmount.value) || 0 }) });
    await loadStudents();
    const updated = students.value.find((x) => x.id === s.id);
    const afterStage = updated?.petStage ?? beforeStage;
    // 反馈：卡片闪烁 + 升级提示动画
    expFlashId.value = s.id;
    if (expFlashTimer) clearTimeout(expFlashTimer);
    expFlashTimer = setTimeout(() => (expFlashId.value = ''), 1600);
    if (afterStage > beforeStage && updated) {
      toast(`🎉 ${s.name} 的宠物升级啦！Lv.${afterStage + 1}「${updated.petStageLabel}」`, 'success');
    } else {
      toast(`已给 ${s.name} 的宠物加 ${expAmount.value} 经验（当前 ${fmtExp(updated?.petExp ?? s.petExp)}）`, 'success');
    }
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function loadHistory(): Promise<void> {
  if (!historyStudent.value) return;
  try {
    const r = await api<{ history: { id: string; delta: number; reason: string; created_at: string }[] }>(
      `/points/history?studentId=${historyStudent.value}`
    );
    historyList.value = r.history;
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function loadStudents(): Promise<void> {
  const r = await api<{ students: Student[] }>('/students');
  students.value = r.students;
}
async function loadPresets(): Promise<void> {
  const r = await api<{ presets: Preset[] }>('/presets');
  presets.value = r.presets;
}
async function loadBoard(): Promise<void> {
  const r = await api<{ rows: RankRow[] }>('/leaderboard');
  board.value = r.rows;
}
async function loadStats(): Promise<void> {
  const r = await api<Record<string, number>>('/teacher/stats');
  Object.assign(stats, r);
}
async function loadTrend(): Promise<void> {
  try {
    const r = await api<{ trend: { day: string; delta: number }[] }>('/teacher/trend');
    trendData.value = r.trend ?? [];
  } catch {
    trendData.value = [];
  }
}
async function loadSubjects(): Promise<void> {
  try {
    const r = await api<{ activeSubject: string; subjects: typeof subjects.value }>('/subjects');
    activeSubject.value = r.activeSubject;
    subjects.value = r.subjects;
  } catch (e) {
    subjectMsg.value = (e as Error).message;
    subjectMsgType.value = 'err';
  }
}
async function saveSubjects(): Promise<void> {
  try {
    await api('/subjects', { method: 'PUT', body: JSON.stringify({ subjects: subjects.value, activeSubject: activeSubject.value }) });
    subjectMsg.value = '已保存';
    subjectMsgType.value = 'ok';
  } catch (e) {
    subjectMsg.value = (e as Error).message;
    subjectMsgType.value = 'err';
  }
}
async function changeSubject(): Promise<void> {
  try {
    await api('/subjects/active', { method: 'PUT', body: JSON.stringify({ name: activeSubject.value }) });
    await Promise.all([loadStudents(), loadStats(), loadBoard(), loadTrend()]);
    toast('已切换科目', 'success');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}
async function changeTeacherPassword(): Promise<void> {
  try {
    await api('/teacher/password', { method: 'POST', body: JSON.stringify({ oldPassword: pwForm.old, newPassword: pwForm.next }) });
    pwForm.old = '';
    pwForm.next = '';
    toast('教师口令已修改', 'success');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}
async function checkUpdate(): Promise<void> {
  try {
    const r = await api<{ currentVersion: string; latestVersion: string; hasUpdate: boolean; note: string }>('/updates/check');
    updateInfo.value = r.hasUpdate ? `发现新版本 ${r.latestVersion}，请到 Gitee 下载` : `当前 ${r.currentVersion}，已是最新`;
  } catch (e) {
    updateInfo.value = (e as Error).message;
  }
}

function exportRankCsv(): void {
  const esc = (v: unknown): string => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['名次', '姓名', '积分', '宠物', '宠物等级'];
  const lines = board.value.map((r) => [r.rank, r.name, r.points, r.petName ?? '', r.petStageLabel ? 'Lv.' + ((r.petStage ?? 0) + 1) + ' ' + r.petStageLabel : ''].map(esc).join(','));
  const blob = new Blob(['\ufeff' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ranking-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** 导出全班积分流水为 Excel (.xlsx) */
async function exportPointsXlsx(): Promise<void> {
  try {
    const token = localStorage.getItem('pet_token');
    const res = await fetch('/api/teacher/points/xlsx', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'points-' + new Date().toISOString().slice(0, 10) + '.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

function onDocClick(): void {
  if (gotoPop.value) gotoPop.value = null;
}

function goScreen(): void {
  window.open('/screen', '_blank');
}
function logout(): void {
  clearAuth();
  router.push('/login');
}

onMounted(async () => {
  await Promise.all([loadStudents(), loadPresets(), loadStats(), loadBoard()]);
  // 常用操作记忆：还原上次分值/理由
  try {
    const d = Number(localStorage.getItem('teacher_last_delta'));
    if (Number.isFinite(d)) delta.value = d;
    reason.value = localStorage.getItem('teacher_last_reason') ?? '';
  } catch { /* ignore */ }
  document.addEventListener('click', onDocClick);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
});
</script>

<style scoped>
/* 新建快捷预设的强调动画：金圈脉冲 + 轻微放大 */
.preset-pop {
  animation: preset-pop 0.9s ease-out 2;
}
@keyframes preset-pop {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(252, 211, 77, 0.7); }
  50% { transform: scale(1.12); box-shadow: 0 0 0 10px rgba(252, 211, 77, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(252, 211, 77, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .preset-pop { animation: none; }
}
</style>
