import { getSetting, setSetting } from '../db/settings.js';

export interface SubjectFeatureToggles {
  points: boolean;
  pets: boolean;
  shop: boolean;
  rank: boolean;
  avatar: boolean;
}

export interface SubjectConfig {
  name: string;
  sync: boolean;
  enabled: SubjectFeatureToggles;
}

export const DEFAULT_SUBJECTS: SubjectConfig[] = [
  {
    name: '默认',
    sync: true,
    enabled: { points: true, pets: true, shop: true, rank: true, avatar: true },
  },
];

export function getSubjectsConfig(): SubjectConfig[] {
  try {
    const raw = getSetting('subjects_config');
    if (!raw) return [...DEFAULT_SUBJECTS];
    const parsed = JSON.parse(raw) as SubjectConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_SUBJECTS];
    return parsed.map((s) => ({
      name: String(s.name ?? '').trim() || '默认',
      sync: s.sync !== false,
      enabled: {
        points: s.enabled?.points !== false,
        pets: s.enabled?.pets !== false,
        shop: s.enabled?.shop !== false,
        rank: s.enabled?.rank !== false,
        avatar: s.enabled?.avatar !== false,
      },
    }));
  } catch {
    return [...DEFAULT_SUBJECTS];
  }
}

export function saveSubjectsConfig(subjects: SubjectConfig[]): void {
  const list = Array.isArray(subjects) && subjects.length > 0 ? subjects : [...DEFAULT_SUBJECTS];
  const clean = list.map((s) => ({
    name: String(s.name ?? '').trim() || '默认',
    sync: s.sync !== false,
    enabled: {
      points: s.enabled?.points !== false,
      pets: s.enabled?.pets !== false,
      shop: s.enabled?.shop !== false,
      rank: s.enabled?.rank !== false,
      avatar: s.enabled?.avatar !== false,
    },
  }));
  setSetting('subjects_config', JSON.stringify(clean));
}

export function getActiveSubject(): string {
  const active = (getSetting('active_subject') ?? '').trim();
  if (active) return active;
  const subjects = getSubjectsConfig();
  return subjects[0]?.name ?? '默认';
}

export function setActiveSubject(name: string): void {
  setSetting('active_subject', String(name ?? '').trim() || getSubjectsConfig()[0]?.name || '默认');
}

export function getActiveSubjectConfig(): SubjectConfig {
  const active = getActiveSubject();
  return getSubjectsConfig().find((s) => s.name === active) ?? DEFAULT_SUBJECTS[0];
}

export function subjectFeatureEnabled(feature: keyof SubjectFeatureToggles): boolean {
  return getActiveSubjectConfig().enabled[feature] !== false;
}
