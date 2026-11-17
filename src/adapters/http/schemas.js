// 附錄 A.2 & A.5 邊界輸入驗證（僅活在 HTTP 邊界層，不污染 domain）
import { RuleError } from '../../app/ports.js';

function asString(v, field, maxLen = 500) {
  if (typeof v !== 'string' || !v.trim()) {
    throw new RuleError(`欄位 ${field} 必須為非空字串`, 400);
  }
  return v.trim().slice(0, maxLen);
}

function asOptionalString(v, maxLen = 2000) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, maxLen);
}

function asInt(v, field, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new RuleError(`欄位 ${field} 必須為 ${min}～${max} 之整數`, 400);
  }
  return n;
}

export const Schemas = {
  login(raw) {
    return { password: asString(raw?.password, 'password', 128) };
  },
  passwords(raw) {
    return {
      newFamilyPassword: asOptionalString(raw?.newFamilyPassword, 128),
      newParentPassword: asOptionalString(raw?.newParentPassword, 128)
    };
  },
  preference(raw) {
    const validMoods = ['ready', 'distracted', 'angry', 'tired'];
    const mood = raw?.mood && validMoods.includes(raw.mood) ? raw.mood : undefined;
    return {
      mood,
      focusCategory: typeof raw?.focusCategory === 'string' ? raw.focusCategory.slice(0, 40) : undefined,
      nickname: typeof raw?.nickname === 'string' ? raw.nickname.slice(0, 20) : undefined,
      extra: typeof raw?.extra === 'string' ? raw.extra.slice(0, 4000) : undefined
    };
  },
  sessionCreate(raw) {
    return {
      task: asString(raw?.task, 'task', 80),
      level: asOptionalString(raw?.level, 30) || 'easy',
      planned: asInt(raw?.planned ?? 5, 'planned', 1, 120),
      elapsed: asInt(raw?.elapsed ?? 0, 'elapsed', 0, 7200),
      distractions: asInt(raw?.distractions ?? 0, 'distractions', 0, 999),
      earnedChoice: raw?.earnedChoice ?? 'default',
      date: typeof raw?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : undefined
    };
  },
  sessionUpdate(raw) {
    return {
      date: typeof raw?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : undefined,
      level: typeof raw?.level === 'string' ? raw.level.slice(0, 30) : undefined,
      planned: raw?.planned !== undefined ? asInt(raw.planned, 'planned', 1, 120) : undefined,
      elapsed: raw?.elapsed !== undefined ? asInt(raw.elapsed, 'elapsed', 0, 7200) : undefined,
      distractions: raw?.distractions !== undefined ? asInt(raw.distractions, 'distractions', 0, 999) : undefined,
      earned: raw?.earned !== undefined ? asInt(raw.earned, 'earned', 1, 10) : undefined
    };
  },
  redemptionCreate(raw) {
    return { rewardId: asString(raw?.rewardId, 'rewardId', 80) };
  },
  logUpsert(raw) {
    const date = asString(raw?.date, 'date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RuleError('日期格式須為 YYYY-MM-DD', 400);
    const numOrEmpty = (v, max = 999) => {
      if (v === '' || v === undefined || v === null) return '';
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= max ? n : '';
    };
    return {
      id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined,
      date,
      context: asOptionalString(raw?.context, 40),
      mood: asOptionalString(raw?.mood, 40),
      energy: asOptionalString(raw?.energy, 40),
      distractions: numOrEmpty(raw?.distractions, 999),
      reminders: numOrEmpty(raw?.reminders, 999),
      homework: numOrEmpty(raw?.homework, 600),
      calmMinutes: numOrEmpty(raw?.calmMinutes, 600),
      note: asOptionalString(raw?.note, 2000),
      bed: asOptionalString(raw?.bed, 10),
      asleep: asOptionalString(raw?.asleep, 10),
      wake: asOptionalString(raw?.wake, 10),
      sleepHours: numOrEmpty(raw?.sleepHours, 24),
      snore: asOptionalString(raw?.snore, 40),
      sleepy: asOptionalString(raw?.sleepy, 40)
    };
  },
  taskUpsert(raw) {
    const diffs = ['easy', 'normal', 'challenge'];
    const difficulty = diffs.includes(raw?.difficulty) ? raw.difficulty : 'easy';
    return {
      id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined,
      icon: asOptionalString(raw?.icon, 8) || '🌱',
      title: asString(raw?.title, 'title', 100),
      category: asString(raw?.category, 'category', 40),
      target: asOptionalString(raw?.target, 20) || 'both',
      difficulty,
      minutes: asInt(raw?.minutes ?? 5, 'minutes', 1, 15),
      flowers: asInt(raw?.flowers ?? 2, 'flowers', 1, 10),
      maxDaily: asInt(raw?.maxDaily ?? 1, 'maxDaily', 1, 10),
      recommend: raw?.recommend !== false && raw?.recommend !== 'false',
      active: raw?.active !== false && raw?.active !== 'false',
      desc: asString(raw?.desc, 'desc', 300),
      promptText: asString(raw?.promptText, 'promptText', 500)
    };
  },
  rewardUpsert(raw) {
    const budgetRaw = raw?.budget;
    const budget =
      budgetRaw === '' || budgetRaw === undefined || budgetRaw === null
        ? ''
        : Math.max(0, Number(budgetRaw) || 0);
    return {
      id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined,
      icon: asOptionalString(raw?.icon, 8) || '🎁',
      title: asString(raw?.title, 'title', 100),
      category: asString(raw?.category, 'category', 40),
      cost: asInt(raw?.cost ?? 15, 'cost', 1, 500),
      target: asOptionalString(raw?.target, 20) || 'both',
      limit: asInt(raw?.limit ?? 0, 'limit', 0, 999),
      budget,
      active: raw?.active !== false && raw?.active !== 'false',
      note: asOptionalString(raw?.note, 300)
    };
  }
};
