// ===== Supabase 云端同步模块 =====
// 配置信息（用户提供的 Supabase 项目）
const SUPABASE_URL = 'https://oprbqzfqqvwkymhucrgg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_C4kDwfUEp9268V_B0jwACA_mrANddhz';


// Supabase 客户端单例
let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    // 动态加载 Supabase SDK（如果还没加载）
    if (typeof window.supabase !== 'undefined') {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.warn('[Supabase] SDK 未加载，请在 index.html 中引入 supabase.js CDN');
      return null;
    }
  }
  return supabaseClient;
}


// ===== 云端同步核心方法 =====

const CloudSync = {

  // 检测连接状态
  async ping() {
    try {
      const sb = getSupabase();
      if (!sb) return { ok: false, msg: 'SDK 未就绪' };
      const { data, error } = await sb.from('students').select('id').limit(1);
      if (error) throw error;
      return { ok: true, msg: '连接正常' };
    } catch (e) {
      return { ok: false, msg: e.message || '连接失败' };
    }
  },

  // 上传全部数据到云端（覆盖式）
  // 头像（avatar/petImage）数据较大（base64），单独存储在 sync_meta.avatars 中
  // 避免 Supabase JSONB 单行超限（单个学生 data 字段不超过 ~1MB）
  async pushToCloud() {
    try {
      const sb = getSupabase();
      if (!sb) return { success: false, msg: 'SDK 未就绪' };

      const rawStudents = JSON.parse(JSON.stringify(Store.state.students));

      // ---- 将头像数据剥离，单独存入 sync_meta ----
      const avatarMap = {};   // { studentId: { avatar, petImage } }
      const studentsData = rawStudents.map(s => {
        const student = { ...s };
        // 提取并记录头像
        if (student.avatar || student.petImage) {
          avatarMap[s.id] = {};
          if (student.avatar)    { avatarMap[s.id].avatar    = student.avatar;    delete student.avatar;    }
          if (student.petImage)  { avatarMap[s.id].petImage  = student.petImage;  delete student.petImage;  }
        }
        return { id: student.id, data: student, updated_at: new Date().toISOString() };
      });

      // 1. 准备 tasks（id + data 列格式）
      const tasksData = JSON.parse(JSON.stringify(Store.state.tasks)).map(t => ({
        id: t.id,
        data: t,
        updated_at: new Date().toISOString(),
      }));

      // 2. 批量 upsert students（不含头像，避免行太大）
      if (studentsData.length > 0) {
        const { error: sErr } = await sb.from('students').upsert(studentsData, { onConflict: 'id' });
        if (sErr) throw new Error('学生数据上传失败: ' + sErr.message);
      }

      // 3. 批量 upsert tasks
      if (tasksData.length > 0) {
        const { error: tErr } = await sb.from('tasks').upsert(tasksData, { onConflict: 'id' });
        if (tErr) throw new Error('任务数据上传失败: ' + tErr.message);
      }

      // 4. 头像单独存入 sync_meta.avatars
      const avatarCount = Object.keys(avatarMap).length;
      if (avatarCount > 0) {
        const { error: aErr } = await sb.from('sync_meta').upsert(
          { key: 'avatars', value: JSON.stringify(avatarMap) },
          { onConflict: 'key' }
        );
        if (aErr) {
          // 头像上传失败不中断主流程，只记录警告
          console.warn('[CloudSync] 头像上传失败（数据可能过大）:', aErr.message);
        } else {
          console.log('[CloudSync] 头像已上传，含头像学生数:', avatarCount);
        }
      }

      // 5. 更新云端同步时间戳
      const now = new Date().toISOString();
      await sb.from('sync_meta').upsert({ key: 'last_sync', value: now }, { onConflict: 'key' });

      // 6. 主数据（students + tasks）全部上传成功后，才更新本地 IndexedDB 时间戳
      // 头像失败不影响时间戳（头像是附加数据）
      if (studentsData.length > 0) await dbStorage.storeMeta('studentsUpdatedAt', now);
      if (tasksData.length > 0)    await dbStorage.storeMeta('tasksUpdatedAt', now);

      // 7. 推送学生统计数据（供冲突检测弹窗展示）
      if (studentsData.length > 0) {
        const realStudents = studentsData.filter(s => !s._isPlaceholder);
        const scores = realStudents.map(s => s.points || 0);
        const scoreAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const scoreMax = scores.length > 0 ? Math.max(...scores) : 0;
        const stats = { count: realStudents.length, scoreAvg, scoreMax, timestamp: now };
        await sb.from('sync_meta').upsert(
          { key: 'student_stats', value: JSON.stringify(stats) },
          { onConflict: 'key' }
        ).catch(() => {}); // 统计信息上传失败不影响主流程
      }

      console.log('[CloudSync] 上传成功', { students: studentsData.length, tasks: tasksData.length, avatars: avatarCount });
      return {
        success: true,
        msg: `上传成功！学生 ${studentsData.length} 条，任务 ${tasksData.length} 条${avatarCount > 0 ? `，头像 ${avatarCount} 个` : ''}`,
      };
    } catch (e) {
      console.error('[CloudSync] 上传失败:', e);
      return { success: false, msg: e.message || '上传失败' };
    }
  },

  // ---- 获取云端数据最新更新时间 ----
  async getCloudLastUpdateTime() {
    try {
      const sb = getSupabase();
      if (!sb) return null;

      // 获取 students 表最新时间
      const { data: sData } = await sb
        .from('students')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      // 获取 tasks 表最新时间
      const { data: tData } = await sb
        .from('tasks')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      const studentsMax = sData && sData.length > 0 ? new Date(sData[0].updated_at) : null;
      const tasksMax = tData && tData.length > 0 ? new Date(tData[0].updated_at) : null;

      return {
        students: studentsMax,
        tasks: tasksMax,
      };
    } catch (e) {
      console.warn('[CloudSync] 获取云端更新时间失败:', e.message);
      return null;
    }
  },

  // ---- 获取云端"最后更新时间"（综合两个表，取最新）----
  async getCloudLastSyncTime() {
    const times = await this.getCloudLastUpdateTime();
    if (!times) return null;
    const all = [times.students, times.tasks].filter(Boolean);
    if (all.length === 0) return null;
    return new Date(Math.max(...all.map(t => t.getTime())));
  },

  // 从云端拉取数据（覆盖本地）
  // @param force - 是否强制拉取（忽略时间检测）
  // @returns { success, msg, skipped, studentsUpdated, tasksUpdated }
  async pullFromCloud(force = false) {
    try {
      const sb = getSupabase();
      if (!sb) return { success: false, msg: 'SDK 未就绪' };

      // ---- 非强制模式：时间戳冲突检测 ----
      let studentsUpdated = true;
      let tasksUpdated = true;

      if (!force) {
        try {
          // 获取本地时间戳
          const localStudentsTime = await dbStorage.getMeta('studentsUpdatedAt');
          const localTasksTime = await dbStorage.getMeta('tasksUpdatedAt');
          
          // 获取云端最新时间
          const cloudTimes = await this.getCloudLastUpdateTime();
          
          if (cloudTimes) {
            // ===== 学生数据 ====
            if (localStudentsTime && cloudTimes.students) {
              // 两者都有时间戳：云端有新数据才拉取
              const localTime = new Date(localStudentsTime);
              if (cloudTimes.students <= localTime) {
                studentsUpdated = false;
                console.log('[CloudSync] 学生数据未更新，跳过（本地:', localStudentsTime, '≥ 云端:', cloudTimes.students.toISOString(), ')');
              }
            } else if (!localStudentsTime && cloudTimes.students) {
              // 本地时间戳未初始化：检查本地是否有真实数据
              // 有真实数据 → 保护本地，不拉取（防止云端旧数据覆盖）
              const localStudents = await dbStorage.getStudents();
              const hasRealData = localStudents.some(s => !s._isPlaceholder);
              if (hasRealData) {
                studentsUpdated = false;
                console.log('[CloudSync] ⚠️ 本地有真实学生数据但时间戳未初始化，跳过拉取（保护本地数据）');
              } else {
                console.log('[CloudSync] 本地无真实数据（仅有占位），允许从云端拉取');
              }
            } else if (localStudentsTime && !cloudTimes.students) {
              // 云端没有学生数据，无需拉取
              studentsUpdated = false;
              console.log('[CloudSync] 云端无学生数据，跳过拉取');
            }
            // localStudentsTime 和 cloudTimes.students 均为 null → studentsUpdated 保持 true（但云端无数据，实际为空操作）
            
            // ===== 任务数据（同上逻辑）====
            if (localTasksTime && cloudTimes.tasks) {
              const localTime = new Date(localTasksTime);
              if (cloudTimes.tasks <= localTime) {
                tasksUpdated = false;
                console.log('[CloudSync] 任务数据未更新，跳过（本地:', localTasksTime, '≥ 云端:', cloudTimes.tasks.toISOString(), ')');
              }
            } else if (!localTasksTime && cloudTimes.tasks) {
              const localTasks = await dbStorage.getTasks();
              if (localTasks.length > 0) {
                tasksUpdated = false;
                console.log('[CloudSync] ⚠️ 本地有任务数据但时间戳未初始化，跳过低取（保护本地数据）');
              }
            } else if (localTasksTime && !cloudTimes.tasks) {
              tasksUpdated = false;
            }
            
            // 两种数据都没更新 -> 整体跳过
            if (!studentsUpdated && !tasksUpdated) {
              console.log('[CloudSync] 云端数据未更新，无需拉取');
              return {
                success: true,
                skipped: true,
                msg: '本地数据已是最新，无需拉取云端数据',
              };
            }
          }
        } catch (e) {
          console.warn('[CloudSync] 时间检测失败，强制拉取:', e.message);
          // 时间检测失败时仍继续拉取
        }
      } else {
        console.log('[CloudSync] 强制拉取模式，跳过时间检测');
      }

      // ---- 实际拉取逻辑 ----
      let studentsData = [];
      let tasksData = [];
      let avatarCount = 0;

      // 1. 拉取 students（如需更新）
      if (studentsUpdated) {
        const { data: rawStudents, error: sErr } = await sb
          .from('students')
          .select('data')
          .order('id', { ascending: true });
        if (sErr) throw new Error('拉取学生数据失败: ' + sErr.message);
        studentsData = (rawStudents || []).map(r => r.data);
      } else {
        // 保留本地数据
        studentsData = await dbStorage.getStudents();
      }

      // 2. 拉取 tasks（如需更新）
      if (tasksUpdated) {
        const { data: rawTasks, error: tErr } = await sb
          .from('tasks')
          .select('data')
          .order('id', { ascending: true });
        if (tErr) throw new Error('拉取任务数据失败: ' + tErr.message);
        tasksData = (rawTasks || []).map(r => r.data);
      } else {
        // 保留本地数据
        tasksData = await dbStorage.getTasks();
      }

      // 3. 拉取并合并头像数据（始终拉取，因为头像较小）
      try {
        const { data: avatarMeta } = await sb
          .from('sync_meta')
          .select('value')
          .eq('key', 'avatars')
          .single();
        if (avatarMeta && avatarMeta.value) {
          const avatarMap = JSON.parse(avatarMeta.value);
          studentsData = studentsData.map(s => {
            const avatarData = avatarMap[s.id] || avatarMap[String(s.id)];
            if (avatarData) {
              avatarCount++;
              return { ...s, ...avatarData };
            }
            return s;
          });
          console.log('[CloudSync] 已合并头像数据，含头像学生数:', avatarCount);
        }
      } catch (e) {
        console.warn('[CloudSync] 头像数据拉取失败（忽略）:', e.message);
      }

      // 4. 写入本地 IndexedDB
      // 仅在实际有数据变更时才写入（防止无变更时误更新时间戳）
      const studentsDataChanged = studentsUpdated || avatarCount > 0;
      const tasksDataChanged = tasksUpdated;
      
      if (studentsDataChanged) {
        await dbStorage.storeStudents(studentsData);
        await dbStorage.storeMeta('studentsUpdatedAt', new Date().toISOString());
      }
      if (tasksDataChanged) {
        await dbStorage.storeTasks(tasksData);
        await dbStorage.storeMeta('tasksUpdatedAt', new Date().toISOString());
      }

      // 5. 更新 Store 内存状态
      Store.state.students.splice(0, Store.state.students.length, ...studentsData);
      Store.state.tasks.splice(0, Store.state.tasks.length, ...tasksData);
      Store.state.taskRev++;
      Store.state.studentRev++;

      // 6. 更新同步时间戳
      const now = new Date().toISOString();
      await sb.from('sync_meta').upsert({ key: 'last_sync', value: now }, { onConflict: 'key' });

      const updateInfo = [];
      if (studentsUpdated) updateInfo.push('学生');
      if (tasksUpdated) updateInfo.push('任务');
      
      console.log('[CloudSync] 拉取成功', { students: studentsData.length, tasks: tasksData.length, avatars: avatarCount, updated: updateInfo });
      return {
        success: true,
        skipped: false,
        studentsUpdated,
        tasksUpdated,
        msg: `拉取成功！${updateInfo.join('、')}数据已更新，学生 ${studentsData.length} 条，任务 ${tasksData.length} 条${avatarCount > 0 ? `，已恢复 ${avatarCount} 个头像` : ''}`,
      };
    } catch (e) {
      console.error('[CloudSync] 拉取失败:', e);
      return { success: false, msg: e.message || '拉取失败' };
    }
  },

  // 获取上次同步时间
  async getLastSyncTime() {
    try {
      const sb = getSupabase();
      if (!sb) return null;
      const { data, error } = await sb
        .from('sync_meta')
        .select('value')
        .eq('key', 'last_sync')
        .single();
      if (error || !data) return null;
      return data.value;
    } catch (e) {
      return null;
    }
  },

  // 获取云端数据统计
  async getCloudStats() {
    try {
      const sb = getSupabase();
      if (!sb) return null;
      const [sCount, tCount] = await Promise.all([
        sb.from('students').select('id', { count: 'exact', head: true }),
        sb.from('tasks').select('id', { count: 'exact', head: true }),
      ]);
      return {
        students: sCount.count || 0,
        tasks: tCount.count || 0,
      };
    } catch (e) {
      return null;
    }
  },

  // ---- 获取云端学生统计（供冲突检测弹窗使用）----
  async getCloudStudentStats() {
    try {
      const sb = getSupabase();
      if (!sb) return null;
      const { data, error } = await sb
        .from('sync_meta')
        .select('value')
        .eq('key', 'student_stats')
        .single();
      if (error || !data) return null;
      return JSON.parse(data.value);
    } catch (e) {
      return null;
    }
  },

  // ---- 仅推送头像到云端（不影响其他数据）----
  async pushAvatarsOnly() {
    try {
      const sb = getSupabase();
      if (!sb) return { success: false, msg: 'SDK 未就绪' };

      const avatarMap = {};
      Store.state.students.forEach(s => {
        if (s.avatar || s.petImage) {
          avatarMap[s.id] = {};
          if (s.avatar)   avatarMap[s.id].avatar   = s.avatar;
          if (s.petImage) avatarMap[s.id].petImage  = s.petImage;
        }
      });

      const count = Object.keys(avatarMap).length;
      if (count === 0) return { success: true, msg: '当前没有学生有头像，无需上传', count: 0 };

      const { error } = await sb.from('sync_meta').upsert(
        { key: 'avatars', value: JSON.stringify(avatarMap) },
        { onConflict: 'key' }
      );
      if (error) throw new Error('头像上传失败: ' + error.message);

      console.log('[CloudSync] 头像专项上传成功，数量:', count);
      return { success: true, msg: `头像上传成功！已备份 ${count} 个学生头像`, count };
    } catch (e) {
      console.error('[CloudSync] 头像上传失败:', e);
      return { success: false, msg: e.message || '头像上传失败' };
    }
  },

  // ---- 仅从云端恢复头像（不影响其他数据）----
  async pullAvatarsOnly() {
    try {
      const sb = getSupabase();
      if (!sb) return { success: false, msg: 'SDK 未就绪' };

      const { data: avatarMeta, error } = await sb
        .from('sync_meta')
        .select('value')
        .eq('key', 'avatars')
        .single();

      if (error || !avatarMeta || !avatarMeta.value) {
        return { success: false, msg: '云端没有头像数据，请先在旧环境推送头像' };
      }

      const avatarMap = JSON.parse(avatarMeta.value);
      const keys = Object.keys(avatarMap);
      if (keys.length === 0) return { success: false, msg: '云端头像数据为空' };

      // 将头像合并回本地 students
      let restored = 0;
      Store.state.students.forEach(s => {
        const avatarData = avatarMap[s.id] || avatarMap[String(s.id)];
        if (avatarData) {
          if (avatarData.avatar)   s.avatar   = avatarData.avatar;
          if (avatarData.petImage) s.petImage  = avatarData.petImage;
          restored++;
        }
      });

      // 持久化到 IndexedDB
      await dbStorage.storeStudents(Store.state.students);
      Store.state.studentRev++;

      console.log('[CloudSync] 头像恢复成功，数量:', restored);
      return { success: true, msg: `头像恢复成功！已恢复 ${restored}/${keys.length} 个学生头像`, restored, total: keys.length };
    } catch (e) {
      console.error('[CloudSync] 头像恢复失败:', e);
      return { success: false, msg: e.message || '头像恢复失败' };
    }
  },

  // ---- 获取云端头像统计 ----
  async getAvatarStats() {
    try {
      const sb = getSupabase();
      if (!sb) return null;
      const { data, error } = await sb
        .from('sync_meta')
        .select('value')
        .eq('key', 'avatars')
        .single();
      if (error || !data || !data.value) return { count: 0 };
      const avatarMap = JSON.parse(data.value);
      return { count: Object.keys(avatarMap).length };
    } catch (e) {
      return null;
    }
  },

  // ---- 推送操作记录到云端（覆盖式，最多存1000条）----
  async pushAuditLog(auditLog) {
    try {
      const sb = getSupabase();
      if (!sb) return { success: false, msg: 'SDK 未就绪' };
      const payload = JSON.stringify((auditLog || []).slice(0, 1000));
      const { error } = await sb.from('sync_meta').upsert(
        { key: 'audit_log', value: payload },
        { onConflict: 'key' }
      );
      if (error) throw error;
      console.log('[CloudSync] 操作记录已推送到云端，条数:', (auditLog || []).length);
      return { success: true };
    } catch (e) {
      console.warn('[CloudSync] 推送操作记录失败:', e.message);
      return { success: false, msg: e.message };
    }
  },

  // ---- 从云端拉取操作记录 ----
  async pullAuditLog() {
    try {
      const sb = getSupabase();
      if (!sb) return null;
      const { data, error } = await sb
        .from('sync_meta')
        .select('value')
        .eq('key', 'audit_log')
        .single();
      if (error || !data) return null;
      const logs = JSON.parse(data.value);
      console.log('[CloudSync] 从云端拉取操作记录，条数:', logs.length);
      return Array.isArray(logs) ? logs : null;
    } catch (e) {
      console.warn('[CloudSync] 拉取操作记录失败:', e.message);
      return null;
    }
  },

  // ---- 清空云端操作记录 ----
  async clearCloudAuditLog() {
    try {
      const sb = getSupabase();
      if (!sb) return;
      await sb.from('sync_meta').upsert(
        { key: 'audit_log', value: '[]' },
        { onConflict: 'key' }
      );
    } catch (e) {
      console.warn('[CloudSync] 清空云端操作记录失败:', e.message);
    }
  },
};
