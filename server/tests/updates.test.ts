import { describe, it, expect } from 'vitest';
import { compareVersions, parseGiteeRepo } from '../src/routes/sync.js';

describe('更新检查：版本比较', () => {
  it('相等版本返回 0', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('v0.1.0', '0.1.0')).toBe(0);
  });
  it('更高版本返回 1', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBe(1);
    expect(compareVersions('v1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.2', '0.1.9')).toBe(1); // 段数不同
  });
  it('更低版本返回 -1', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('0.1.9', '0.2')).toBe(-1);
  });
  it('预发布尾缀按同版本处理', () => {
    expect(compareVersions('0.2.0-beta', '0.2.0')).toBe(0);
    expect(compareVersions('0.2.0', '0.2.0-rc.1')).toBe(0);
  });
});

describe('更新检查：Gitee 仓库解析', () => {
  it('接受 owner/repo', () => {
    expect(parseGiteeRepo('Aionara/classroom-pet-system')).toEqual({
      owner: 'Aionara',
      repo: 'classroom-pet-system',
    });
  });
  it('接受完整 gitee 链接并去掉 .git 后缀', () => {
    expect(parseGiteeRepo('https://gitee.com/foo/bar.git')).toEqual({ owner: 'foo', repo: 'bar' });
    expect(parseGiteeRepo('http://gitee.com/foo/bar')).toEqual({ owner: 'foo', repo: 'bar' });
  });
  it('接受尾部斜杠', () => {
    expect(parseGiteeRepo('foo/bar/')).toEqual({ owner: 'foo', repo: 'bar' });
  });
  it('拒绝空串与非 gitee 链接', () => {
    expect(parseGiteeRepo('')).toBeNull();
    expect(parseGiteeRepo('   ')).toBeNull();
    expect(parseGiteeRepo('github.com/foo/bar')).toBeNull();
    expect(parseGiteeRepo('not-a-repo')).toBeNull();
  });
});
