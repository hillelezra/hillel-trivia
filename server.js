const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { generateFullQuestionBank } = require('./question-bank-generator');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 30;
const DEFAULT_POINTS = 100;
const DEFAULT_TIMER_SECONDS = 20;

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const QUESTIONS_FILE = path.join(ROOT_DIR, 'questions.json');
const SETTINGS_FILE = path.join(ROOT_DIR, 'quiz-settings.json');
const QUESTION_BANK_FILE = path.join(ROOT_DIR, 'question-bank.json');

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 5e6
});

// -------------------- Persistence & Multi-Game Store --------------------

const DEFAULT_GAME_SETTINGS = {
  title: 'הטריוויה של הלל',
  subtitle: 'ענו נכון והתחלקו שווה בשווה בקופת הנקודות של כל שאלה!',
  headerImage: '',
  backgroundImage: '',
  backgroundMusic: '',
  bgOverlayOpacity: 0.68,
  timerSeconds: DEFAULT_TIMER_SECONDS,
  autoRevealOnTimeout: true,
  teamsEnabled: false,
  teams: []
};

function normalizeQuestion(raw, fallbackTimer = DEFAULT_TIMER_SECONDS) {
  const question = String(raw?.question ?? '').trim();
  let answers = Array.isArray(raw?.answers) ? raw.answers.map((a) => String(a ?? '').trim()) : [];
  if (answers.length < 4) {
    while (answers.length < 4) answers.push('');
  } else if (answers.length > 4) {
    answers = answers.slice(0, 4);
  }
  const idx = Number(raw?.correctIndex);
  const correctIndex = Number.isInteger(idx) && idx >= 0 && idx <= 3 ? idx : 0;
  const image = typeof raw?.image === 'string' ? raw.image.trim() : '';

  const rawPoints = Number(raw?.points);
  const points =
    Number.isFinite(rawPoints) && rawPoints >= 1 ? Math.round(rawPoints) : DEFAULT_POINTS;

  const rawTimer = Math.round(Number(raw?.timerSeconds));
  const timerSeconds =
    Number.isFinite(rawTimer) && rawTimer >= 5 && rawTimer <= 300
      ? rawTimer
      : fallbackTimer;

  const questionEn = typeof raw?.questionEn === 'string' ? raw.questionEn.trim() : '';
  const answersEn =
    Array.isArray(raw?.answersEn) && raw.answersEn.length === 4
      ? raw.answersEn.map((a) => String(a ?? '').trim())
      : [];

  return {
    question,
    answers,
    correctIndex,
    image,
    points,
    timerSeconds,
    ...(questionEn ? { questionEn } : {}),
    ...(answersEn.length === 4 && answersEn.every(Boolean) ? { answersEn } : {})
  };
}

function normalizeTeamsList(rawTeams) {
  if (!Array.isArray(rawTeams)) return [];
  const seenNames = new Set();
  const result = [];
  for (const item of rawTeams) {
    const name = String(item?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 36);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const id =
      typeof item?.id === 'string' && item.id.trim()
        ? item.id.trim()
        : `team-${crypto.randomBytes(4).toString('hex')}`;
    result.push({ id, name });
  }
  return result;
}

function sanitizeSettings(input) {
  const title =
    typeof input?.title === 'string' && input.title.trim()
      ? input.title.trim().slice(0, 120)
      : DEFAULT_GAME_SETTINGS.title;
  const subtitle =
    typeof input?.subtitle === 'string'
      ? input.subtitle.slice(0, 200)
      : DEFAULT_GAME_SETTINGS.subtitle;
  const headerImage = typeof input?.headerImage === 'string' ? input.headerImage.trim() : '';
  const backgroundImage =
    typeof input?.backgroundImage === 'string' ? input.backgroundImage.trim() : '';
  const backgroundMusic =
    typeof input?.backgroundMusic === 'string' ? input.backgroundMusic.trim() : '';

  let bgOverlayOpacity = Number(input?.bgOverlayOpacity);
  if (Number.isNaN(bgOverlayOpacity)) bgOverlayOpacity = DEFAULT_GAME_SETTINGS.bgOverlayOpacity;
  bgOverlayOpacity = Math.min(0.92, Math.max(0.1, Math.round(bgOverlayOpacity * 100) / 100));

  let timerSeconds = Math.round(Number(input?.timerSeconds));
  if (!Number.isFinite(timerSeconds) || timerSeconds < 5) timerSeconds = DEFAULT_TIMER_SECONDS;
  if (timerSeconds > 300) timerSeconds = 300;

  const autoRevealOnTimeout =
    input?.autoRevealOnTimeout === undefined ? true : Boolean(input.autoRevealOnTimeout);

  const teamsEnabled = Boolean(input?.teamsEnabled);
  const teams = normalizeTeamsList(input?.teams);

  return {
    title,
    subtitle,
    headerImage,
    backgroundImage,
    backgroundMusic,
    bgOverlayOpacity,
    timerSeconds,
    autoRevealOnTimeout,
    teamsEnabled,
    teams
  };
}

function loadQuestionsFromFile(fallbackTimer = DEFAULT_TIMER_SECONDS) {
  try {
    if (!fs.existsSync(QUESTIONS_FILE)) return [];
    const rawText = fs.readFileSync(QUESTIONS_FILE, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(rawText);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.questions)
        ? parsed.questions
        : [];
    return arr
      .map((q) => normalizeQuestion(q, fallbackTimer))
      .filter((q) => q.question.length > 0);
  } catch (err) {
    console.error('Failed to load questions.json:', err.message);
    return [];
  }
}

function writeQuestionsFile(questionsArr, fallbackTimer = DEFAULT_TIMER_SECONDS) {
  const cleaned = questionsArr.map((q) => normalizeQuestion(q, fallbackTimer));
  fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(cleaned, null, 2), 'utf8');
  return cleaned;
}

function normalizePlayerWeight(rawWeight) {
  const num = Math.round(Number(rawWeight));
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.min(20, num);
}

function normalizePlayHistoryEntry(rawEntry, fallbackQuestionsCount = 0) {
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const playersArr = Array.isArray(rawEntry.players)
    ? rawEntry.players
        .filter((p) => p && typeof p.name === 'string' && p.name.trim())
        .map((p, idx) => ({
          id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `p-${idx + 1}`,
          name: p.name.trim().slice(0, 24),
          teamName: typeof p.teamName === 'string' ? p.teamName.trim() : '',
          weight: normalizePlayerWeight(p.weight),
          correctCount: Math.max(0, Math.round(Number(p.correctCount) || 0)),
          score: Math.round((Number(p.score) || 0) * 100) / 100,
          rank: Number(p.rank) || idx + 1
        }))
    : [];
  if (playersArr.length === 0) return null;
  return {
    id:
      typeof rawEntry.id === 'string' && rawEntry.id.trim()
        ? rawEntry.id.trim()
        : `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    playedAt:
      typeof rawEntry.playedAt === 'string' && rawEntry.playedAt
        ? rawEntry.playedAt
        : new Date().toISOString(),
    questionsCount:
      Math.max(0, Math.round(Number(rawEntry.questionsCount) || fallbackQuestionsCount)),
    players: playersArr
  };
}

function normalizeGameRecord(rawGame) {
  const cleanSettings = sanitizeSettings(rawGame);
  const id =
    typeof rawGame?.id === 'string' && rawGame.id.trim()
      ? rawGame.id.trim()
      : `game-${crypto.randomBytes(4).toString('hex')}`;
  const rawQuestions = Array.isArray(rawGame?.questions) ? rawGame.questions : [];
  const cleanQuestions = rawQuestions
    .map((q) => normalizeQuestion(q, cleanSettings.timerSeconds))
    .filter((q) => q.question.length > 0);

  const savedPlayers = Array.isArray(rawGame?.savedPlayers)
    ? rawGame.savedPlayers
        .filter((p) => p && typeof p.name === 'string' && p.name.trim())
        .map((p) => ({
          id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : crypto.randomUUID(),
          name: p.name.trim().slice(0, 24),
          teamId: typeof p.teamId === 'string' && p.teamId.trim() ? p.teamId.trim() : null,
          weight: normalizePlayerWeight(p.weight),
          score: Math.round((Number(p.score) || 0) * 100) / 100,
          correctCount: Math.max(0, Math.round(Number(p.correctCount) || 0)),
          joinedAt: Number(p.joinedAt) || Date.now()
        }))
    : [];

  const lastFinishedAt =
    typeof rawGame?.lastFinishedAt === 'string' && rawGame.lastFinishedAt
      ? rawGame.lastFinishedAt
      : null;

  let playHistory = Array.isArray(rawGame?.playHistory)
    ? rawGame.playHistory
        .map((entry) => normalizePlayHistoryEntry(entry, cleanQuestions.length))
        .filter(Boolean)
    : [];

  // Migrate any existing savedPlayers with scores into playHistory if playHistory is empty
  if (playHistory.length === 0 && savedPlayers.length > 0) {
    const hasScoredPlayers = savedPlayers.some((p) => p.score > 0 || p.correctCount > 0);
    if (hasScoredPlayers) {
      const sorted = [...savedPlayers].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.correctCount - a.correctCount;
      });
      const teamMap = new Map((cleanSettings.teams || []).map((t) => [t.id, t.name]));
      playHistory = [
        {
          id: `run-migrated-${id}`,
          playedAt: lastFinishedAt || new Date().toISOString(),
          questionsCount: cleanQuestions.length,
          players: sorted.map((p, idx) => ({
            id: p.id,
            name: p.name,
            teamName: p.teamId ? teamMap.get(p.teamId) || '' : '',
            weight: normalizePlayerWeight(p.weight),
            correctCount: p.correctCount,
            score: p.score,
            rank: idx + 1
          }))
        }
      ];
    }
  }

  return {
    id,
    ...cleanSettings,
    questions: cleanQuestions,
    savedPlayers,
    playHistory,
    lastFinishedAt
  };
}

const BASE_GAME_CODE = 1000;

function assignSequentialGameCodes(gamesArr) {
  if (!Array.isArray(gamesArr)) return;
  gamesArr.forEach((g, idx) => {
    g.code = String(BASE_GAME_CODE + idx);
  });
}

function extractSettingsFromGame(gameRecord) {
  return {
    id: gameRecord.id,
    code: String(gameRecord.code || BASE_GAME_CODE),
    title: gameRecord.title,
    subtitle: gameRecord.subtitle,
    headerImage: gameRecord.headerImage,
    backgroundImage: gameRecord.backgroundImage,
    backgroundMusic: gameRecord.backgroundMusic || '',
    bgOverlayOpacity: gameRecord.bgOverlayOpacity,
    timerSeconds: gameRecord.timerSeconds,
    autoRevealOnTimeout: gameRecord.autoRevealOnTimeout,
    teamsEnabled: Boolean(gameRecord.teamsEnabled),
    teams: Array.isArray(gameRecord.teams)
      ? gameRecord.teams.map((t) => ({ id: t.id, name: t.name }))
      : []
  };
}

function persistStore(targetStore) {
  assignSequentialGameCodes(targetStore.games);
  const active =
    targetStore.games.find((g) => g.id === targetStore.activeGameId) || targetStore.games[0];
  if (active) {
    targetStore.activeGameId = active.id;
    writeQuestionsFile(active.questions, active.timerSeconds);
  }
  const rootSettingsMirror = active ? extractSettingsFromGame(active) : DEFAULT_GAME_SETTINGS;
  const toSave = {
    ...rootSettingsMirror,
    activeGameId: targetStore.activeGameId,
    ...(targetStore.geminiApiKey ? { geminiApiKey: targetStore.geminiApiKey } : {}),
    games: targetStore.games
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf8');
}

function loadStore() {
  const diskQuestions = loadQuestionsFromFile(DEFAULT_TIMER_SECONDS);
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      const initialGame = normalizeGameRecord({
        id: 'game-default',
        ...DEFAULT_GAME_SETTINGS,
        questions: diskQuestions
      });
      const initialStore = {
        activeGameId: initialGame.id,
        geminiApiKey: '',
        games: [initialGame]
      };
      persistStore(initialStore);
      return initialStore;
    }

    const rawText = fs.readFileSync(SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(rawText);

    if (!Array.isArray(parsed?.games) || parsed.games.length === 0) {
      const migratedTimer =
        parsed?.timerSeconds && parsed.timerSeconds !== 30
          ? parsed.timerSeconds
          : DEFAULT_TIMER_SECONDS;
      const migratedGame = normalizeGameRecord({
        id: 'game-default',
        ...DEFAULT_GAME_SETTINGS,
        ...parsed,
        timerSeconds: migratedTimer,
        questions: diskQuestions
      });
      const migratedStore = {
        activeGameId: migratedGame.id,
        geminiApiKey: typeof parsed?.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : '',
        games: [migratedGame]
      };
      persistStore(migratedStore);
      return migratedStore;
    }

    const games = parsed.games.map(normalizeGameRecord);
    assignSequentialGameCodes(games);
    let activeGameId = parsed.activeGameId;
    if (!games.some((g) => g.id === activeGameId)) {
      activeGameId = games[0].id;
    }

    const loadedStore = {
      activeGameId,
      geminiApiKey: typeof parsed?.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : '',
      games
    };
    persistStore(loadedStore);
    return loadedStore;
  } catch (err) {
    console.error('Failed to load quiz-settings.json:', err.message);
    const fallbackGame = normalizeGameRecord({
      id: 'game-default',
      ...DEFAULT_GAME_SETTINGS,
      questions: diskQuestions
    });
    fallbackGame.code = String(BASE_GAME_CODE);
    return {
      activeGameId: fallbackGame.id,
      geminiApiKey: '',
      games: [fallbackGame]
    };
  }
}

function getLanUrls(port) {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  if (urls.length === 0) {
    urls.push(`http://localhost:${port}`);
  }
  return urls;
}

function roundScore(val) {
  return Math.round(val * 100) / 100;
}

// -------------------- In-Memory Game State --------------------

const store = loadStore();

function getActiveGameRecord() {
  assignSequentialGameCodes(store.games);
  return store.games.find((g) => g.id === store.activeGameId) || store.games[0];
}

function getGameById(gameId) {
  assignSequentialGameCodes(store.games);
  return store.games.find((g) => g.id === gameId) || getActiveGameRecord();
}

function getGameByCode(rawCode) {
  assignSequentialGameCodes(store.games);
  const cleanCode = String(rawCode ?? '').trim();
  if (!cleanCode) return null;
  return store.games.find((g) => g.code === cleanCode) || null;
}

function getActiveQuestions() {
  return getActiveGameRecord().questions;
}

function getActiveSettings() {
  return extractSettingsFromGame(getActiveGameRecord());
}

const players = new Map(); // playerId -> { id, name, gameId, gameCode, teamId, weight, score, correctCount, connected, socketId, joinedAt }
const socketToPlayerId = new Map(); // socket.id -> playerId
const currentAnswers = new Map(); // playerId -> { answerIndex, answeredAt }

// Hydrate saved players from store on startup so scores, weights & team assignments persist across restarts
for (const g of store.games) {
  if (Array.isArray(g.savedPlayers)) {
    const validTeamIds = new Set((g.teams || []).map((t) => t.id));
    for (const sp of g.savedPlayers) {
      if (!sp || !sp.id || !sp.name) continue;
      players.set(sp.id, {
        id: sp.id,
        name: sp.name,
        gameId: g.id,
        gameCode: g.code,
        teamId: sp.teamId && validTeamIds.has(sp.teamId) ? sp.teamId : null,
        weight: normalizePlayerWeight(sp.weight),
        score: roundScore(Number(sp.score) || 0),
        correctCount: Math.max(0, Math.round(Number(sp.correctCount) || 0)),
        connected: false,
        socketId: null,
        joinedAt: Number(sp.joinedAt) || Date.now()
      });
    }
  }
}

function getPlayersForGame(gameId = store.activeGameId) {
  return Array.from(players.values()).filter((p) => p.gameId === gameId);
}

function syncGamePlayersToStore(gameId = store.activeGameId) {
  const g = getGameById(gameId);
  if (!g) return;
  const gPlayers = getPlayersForGame(g.id);
  g.savedPlayers = gPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    teamId: p.teamId || null,
    weight: normalizePlayerWeight(p.weight),
    score: roundScore(p.score || 0),
    correctCount: p.correctCount || 0,
    joinedAt: p.joinedAt || Date.now()
  }));
  persistStore(store);
}

function getGamesSummaryList() {
  assignSequentialGameCodes(store.games);
  return store.games.map((g, idx) => {
    const gPlayers = getPlayersForGame(g.id);
    const totalSavedScore = gPlayers.reduce((sum, p) => sum + (p.score || 0), 0);
    const playHistory = Array.isArray(g.playHistory) ? g.playHistory : [];
    return {
      id: g.id,
      code: String(g.code || BASE_GAME_CODE + idx),
      title: g.title,
      subtitle: g.subtitle,
      headerImage: g.headerImage,
      backgroundImage: g.backgroundImage,
      backgroundMusic: g.backgroundMusic || '',
      timerSeconds: g.timerSeconds,
      teamsEnabled: Boolean(g.teamsEnabled),
      teamsCount: Array.isArray(g.teams) ? g.teams.length : 0,
      questionsCount: g.questions.length,
      playersCount: gPlayers.length,
      connectedPlayersCount: gPlayers.filter((p) => p.connected).length,
      hasSavedScores: totalSavedScore > 0 || playHistory.length > 0,
      playHistoryCount: playHistory.length,
      playHistory,
      lastFinishedAt: g.lastFinishedAt || null,
      isActive: Boolean(game.isSessionOpen && g.id === store.activeGameId),
      isSelected: g.id === store.activeGameId
    };
  });
}

const game = {
  isSessionOpen: false,
  phase: 'hub', // 'hub' | 'lobby' | 'question' | 'revealed' | 'finished'
  currentQuestionIndex: -1,
  resumableQuestionIndex: -1,
  resumableWasRevealed: false,
  questionScored: false,
  currentRunArchived: false,
  timerDuration: getActiveSettings().timerSeconds,
  questionEndsAt: 0,
  timerPaused: false,
  pausedRemainingMs: 0,
  timeExpiredAwaitingReveal: false,
  leaderboardModalOpen: false,
  lastReveal: null
};

function getRemainingMs() {
  if (game.phase !== 'question') return 0;
  if (game.timerPaused) return Math.max(0, game.pausedRemainingMs);
  return Math.max(0, game.questionEndsAt - Date.now());
}

function getTeamNameById(teamId, gameId = store.activeGameId) {
  if (!teamId) return '';
  const targetGame = getGameById(gameId);
  const found = (targetGame.teams || []).find((t) => t.id === teamId);
  return found ? found.name : '';
}

function getAvailableTeamsWithMembers(gameId = store.activeGameId) {
  const targetGame = getGameById(gameId);
  const teams = targetGame.teams || [];
  const gamePlayers = getPlayersForGame(targetGame.id);

  return teams.map((t) => {
    const members = gamePlayers
      .filter((p) => p.teamId === t.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        weight: normalizePlayerWeight(p.weight),
        score: p.score,
        correctCount: p.correctCount,
        connected: p.connected
      }));
    const combinedScore = roundScore(members.reduce((acc, m) => acc + m.score, 0));
    const combinedCorrect = members.reduce((acc, m) => acc + m.correctCount, 0);
    return {
      id: t.id,
      name: t.name,
      memberCount: members.length,
      members,
      score: combinedScore,
      correctCount: combinedCorrect
    };
  });
}

function getSortedTeamLeaderboard(gameId = store.activeGameId) {
  return getAvailableTeamsWithMembers(gameId)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return b.memberCount - a.memberCount;
    })
    .map((t, idx) => ({
      ...t,
      rank: idx + 1
    }));
}

function getSortedLeaderboard(gameId = store.activeGameId) {
  const isRevealedActive =
    gameId === store.activeGameId &&
    (game.phase === 'revealed' || game.phase === 'finished') &&
    game.lastReveal &&
    game.lastReveal.playerAwards;

  return getPlayersForGame(gameId)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.joinedAt - b.joinedAt;
    })
    .map((p, idx) => {
      const award = isRevealedActive ? game.lastReveal.playerAwards[p.id] || null : null;
      return {
        id: p.id,
        name: p.name,
        gameId: p.gameId,
        gameCode: p.gameCode,
        teamId: p.teamId || null,
        teamName: getTeamNameById(p.teamId, gameId),
        weight: normalizePlayerWeight(p.weight),
        score: p.score,
        correctCount: p.correctCount,
        connected: p.connected,
        rank: idx + 1,
        lastQuestionOutcome: award
          ? {
              answered: Boolean(award.answered),
              isCorrect: Boolean(award.isCorrect),
              pointsEarned: roundScore(Number(award.pointsEarned) || 0)
            }
          : null
      };
    });
}

function buildCurrentQuestionPublic(includeCorrect = false) {
  const questions = getActiveQuestions();
  const activeSettings = getActiveSettings();
  const q = questions[game.currentQuestionIndex];
  if (!q) return null;
  const points = Number(q.points) >= 1 ? Number(q.points) : DEFAULT_POINTS;
  const timerSeconds =
    Number(q.timerSeconds) >= 5
      ? Number(q.timerSeconds)
      : activeSettings.timerSeconds || DEFAULT_TIMER_SECONDS;

  const payload = {
    index: game.currentQuestionIndex,
    total: questions.length,
    question: q.question,
    answers: q.answers,
    ...(q.questionEn ? { questionEn: q.questionEn } : {}),
    ...(Array.isArray(q.answersEn) && q.answersEn.length === 4 ? { answersEn: q.answersEn } : {}),
    image: q.image || '',
    points,
    budget: points,
    timerSeconds
  };
  if (includeCorrect) {
    payload.correctIndex = q.correctIndex;
  }
  return payload;
}

function buildLiveAnswerStats() {
  const activeGame = getActiveGameRecord();
  const questions = activeGame.questions;
  const q = questions[game.currentQuestionIndex] || null;
  const activeGamePlayers = getPlayersForGame(activeGame.id);
  const activeGamePlayerMap = new Map(activeGamePlayers.map((p) => [p.id, p]));
  const connectedPlayers = activeGamePlayers.filter((p) => p.connected).length;
  const isRevealed = game.phase === 'revealed' || game.phase === 'finished';

  const answeredIdsInGame = [];
  const optionCounts = [0, 0, 0, 0];
  let correctCount = 0;
  let wrongCount = 0;

  for (const [pid, submission] of currentAnswers.entries()) {
    const p = activeGamePlayerMap.get(pid);
    if (!p) continue;
    const w = normalizePlayerWeight(p.weight);
    answeredIdsInGame.push(pid);
    if (submission.answerIndex >= 0 && submission.answerIndex <= 3) {
      optionCounts[submission.answerIndex] += w;
    }
    if (q && submission.answerIndex === q.correctIndex) {
      correctCount += w;
    } else {
      wrongCount += w;
    }
  }

  const answeredCount = answeredIdsInGame.length;
  const denomPlayers = connectedPlayers > 0 ? connectedPlayers : Math.max(1, activeGamePlayers.length);
  const answeredPct =
    answeredCount > 0 ? Math.min(100, Math.round((answeredCount / denomPlayers) * 100)) : 0;
  const weightedTotal = correctCount + wrongCount;
  const correctPct = weightedTotal > 0 ? Math.round((correctCount / weightedTotal) * 100) : 0;
  const wrongPct = weightedTotal > 0 ? Math.round((wrongCount / weightedTotal) * 100) : 0;

  // CRITICAL: While the question timer is running (before reveal), hide how many answered right/wrong
  // and hide per-option distribution so players cannot exploit it to change their answer!
  return {
    isDistributionVisible: isRevealed,
    answeredCount,
    answeredPct,
    correctCount: isRevealed ? correctCount : 0,
    wrongCount: isRevealed ? wrongCount : 0,
    correctPct: isRevealed ? correctPct : 0,
    wrongPct: isRevealed ? wrongPct : 0,
    optionCounts: isRevealed ? optionCounts : [0, 0, 0, 0],
    totalPlayers: activeGamePlayers.length,
    connectedPlayers,
    waitingPlayers: Math.max(0, connectedPlayers - answeredCount),
    answeredPlayerIds: answeredIdsInGame
  };
}

function buildAdminState() {
  const activeGame = getActiveGameRecord();
  const questions = activeGame.questions;
  const settings = extractSettingsFromGame(activeGame);
  const includeCorrect = game.phase === 'revealed' || game.phase === 'finished';
  const remainingMs = getRemainingMs();
  const leaderboard = getSortedLeaderboard(activeGame.id);
  const availableTeams = getAvailableTeamsWithMembers(activeGame.id);
  const teamLeaderboard = getSortedTeamLeaderboard(activeGame.id);
  const currentQPublic = buildCurrentQuestionPublic(includeCorrect);
  const liveAnswers = buildLiveAnswerStats();

  return {
    phase: game.phase,
    isSessionOpen: Boolean(game.isSessionOpen),
    activeGameId: store.activeGameId,
    gameCode: settings.code,
    nextNewGameCode: String(BASE_GAME_CODE + store.games.length),
    hasGeminiApiKey: Boolean(store.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    questionBankCount: typeof getQuestionBankCount === 'function' ? getQuestionBankCount() : 1000,
    privateQuestionBankCount: typeof getPrivateQuestionBankCount === 'function' ? getPrivateQuestionBankCount() : 0,
    questionBankTopics: typeof getQuestionBankTopicsSummary === 'function' ? getQuestionBankTopicsSummary() : [],
    games: getGamesSummaryList(),
    settings,
    playHistory: Array.isArray(activeGame.playHistory) ? activeGame.playHistory : [],
    teamsEnabled: Boolean(settings.teamsEnabled),
    availableTeams,
    teamLeaderboard,
    maxPlayers: MAX_PLAYERS,
    questionBudget: currentQPublic ? currentQPublic.points : DEFAULT_POINTS,
    totalQuestions: questions.length,
    currentQuestionIndex: game.currentQuestionIndex,
    resumableQuestionIndex: game.resumableQuestionIndex,
    currentQuestion: currentQPublic,
    timer: {
      durationSeconds: game.timerDuration,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      paused: game.timerPaused,
      timeExpiredAwaitingReveal: game.timeExpiredAwaitingReveal
    },
    answers: liveAnswers,
    leaderboardModalOpen: game.leaderboardModalOpen,
    lastReveal: game.lastReveal,
    leaderboard,
    lanUrls: getLanUrls(PORT)
  };
}

function buildPlayerState(playerId, overridePhase = null) {
  const player = players.get(playerId);
  if (!player) return null;

  const playerGame = getGameById(player.gameId);
  player.gameId = playerGame.id;
  player.gameCode = playerGame.code;

  const isPlayerInActiveGame = Boolean(game.isSessionOpen && playerGame.id === store.activeGameId);
  const effectivePhase =
    overridePhase || (isPlayerInActiveGame && game.phase !== 'hub' ? game.phase : 'lobby');

  const settings = extractSettingsFromGame(playerGame);
  const leaderboard = getSortedLeaderboard(playerGame.id);
  const availableTeams = getAvailableTeamsWithMembers(playerGame.id);
  const teamLeaderboard = getSortedTeamLeaderboard(playerGame.id);

  const myRankEntry = leaderboard.find((entry) => entry.id === playerId);
  const myTeamEntry = player.teamId
    ? teamLeaderboard.find((t) => t.id === player.teamId) || null
    : null;

  const includeCorrect = effectivePhase === 'revealed' || effectivePhase === 'finished';
  const myAnswer = isPlayerInActiveGame ? currentAnswers.get(playerId) || null : null;
  const answerChangeCount = myAnswer ? Number(myAnswer.changeCount || 0) : 0;
  const canChangeAnswer = Boolean(
    myAnswer &&
      answerChangeCount < 1 &&
      effectivePhase === 'question' &&
      !game.timeExpiredAwaitingReveal &&
      getRemainingMs() > 0
  );
  const remainingMs = isPlayerInActiveGame ? getRemainingMs() : 0;
  const currentQPublic = isPlayerInActiveGame ? buildCurrentQuestionPublic(includeCorrect) : null;
  const liveAnswers = isPlayerInActiveGame
    ? buildLiveAnswerStats()
    : {
        answeredCount: 0,
        correctCount: 0,
        wrongCount: 0,
        correctPct: 0,
        wrongPct: 0,
        totalPlayers: leaderboard.length,
        connectedPlayers: leaderboard.filter((p) => p.connected).length,
        waitingPlayers: 0
      };

  let lastQuestionOutcome = null;
  if (
    isPlayerInActiveGame &&
    effectivePhase === 'revealed' &&
    game.lastReveal &&
    game.lastReveal.questionIndex === game.currentQuestionIndex
  ) {
    const lockedIdx = myAnswer ? myAnswer.answerIndex : null;
    const isCorrect = lockedIdx !== null && lockedIdx === game.lastReveal.correctIndex;
    const award = game.lastReveal.playerAwards ? game.lastReveal.playerAwards[playerId] : null;
    lastQuestionOutcome = {
      answered: lockedIdx !== null,
      lockedAnswerIndex: lockedIdx,
      correctIndex: game.lastReveal.correctIndex,
      isCorrect,
      everyoneSplit: Boolean(game.lastReveal.everyoneSplit),
      pointsEarned: award ? award.pointsEarned : 0,
      totalScore: player.score,
      speedRank: award ? award.speedRank : null,
      parts: award ? award.parts : 0,
      totalParts: award ? award.totalParts : 0,
      singlePartValue: award ? award.singlePartValue : 0,
      winnersCount: game.lastReveal.winnersCount,
      recipientCount: game.lastReveal.recipientCount || 0,
      pointsPerWinner: game.lastReveal.pointsPerWinner,
      questionBudget: game.lastReveal.questionBudget
    };
  }

  return {
    phase: effectivePhase,
    gameCode: settings.code,
    settings,
    teamsEnabled: Boolean(settings.teamsEnabled),
    availableTeams: availableTeams.map((t) => ({
      id: t.id,
      name: t.name,
      memberCount: t.memberCount,
      score: t.score
    })),
    questionBudget: currentQPublic ? currentQPublic.points : DEFAULT_POINTS,
    player: {
      id: player.id,
      name: player.name,
      gameId: playerGame.id,
      gameCode: settings.code,
      gameTitle: settings.title,
      teamId: myTeamEntry ? myTeamEntry.id : null,
      teamName: myTeamEntry ? myTeamEntry.name : '',
      teamScore: myTeamEntry ? myTeamEntry.score : 0,
      teamRank: myTeamEntry ? myTeamEntry.rank : null,
      totalTeams: teamLeaderboard.length,
      weight: normalizePlayerWeight(player.weight),
      score: player.score,
      correctCount: player.correctCount,
      rank: myRankEntry ? myRankEntry.rank : leaderboard.length,
      totalPlayers: leaderboard.length
    },
    currentQuestion: currentQPublic,
    lockedAnswerIndex: myAnswer ? myAnswer.answerIndex : null,
    answerChangeCount,
    canChangeAnswer,
    answers: {
      answeredCount: liveAnswers.answeredCount,
      correctCount: liveAnswers.correctCount,
      wrongCount: liveAnswers.wrongCount,
      correctPct: liveAnswers.correctPct,
      wrongPct: liveAnswers.wrongPct,
      totalPlayers: liveAnswers.totalPlayers,
      connectedPlayers: liveAnswers.connectedPlayers,
      waitingPlayers: liveAnswers.waitingPlayers
    },
    timer: {
      durationSeconds: game.timerDuration,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      paused: game.timerPaused,
      timeExpiredAwaitingReveal: game.timeExpiredAwaitingReveal
    },
    lastQuestionOutcome,
    topLeaderboard: leaderboard.slice(0, 10),
    topTeamLeaderboard: teamLeaderboard.slice(0, 10)
  };
}

function broadcastAllStates() {
  io.to('admins').emit('admin:state', buildAdminState());
  for (const [socketId, pid] of socketToPlayerId.entries()) {
    const pState = buildPlayerState(pid);
    if (pState) {
      io.to(socketId).emit('player:state', pState);
    }
  }
}

// -------------------- Game History Archiving & Transitions --------------------

function archiveCurrentGameRunIfNeeded(gameId = store.activeGameId) {
  if (game.currentRunArchived) return false;
  const targetGame = getGameById(gameId);
  if (!targetGame) return false;

  const gamePlayers = getPlayersForGame(targetGame.id);
  const hasAnyActivity = gamePlayers.some((p) => (p.score || 0) > 0 || (p.correctCount || 0) > 0);
  if (gamePlayers.length === 0 || !hasAnyActivity) return false;

  const sortedLb = getSortedLeaderboard(targetGame.id);
  const runEntry = {
    id: `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    playedAt: new Date().toISOString(),
    questionsCount: Array.isArray(targetGame.questions) ? targetGame.questions.length : 0,
    players: sortedLb.map((p, idx) => ({
      id: p.id,
      name: p.name,
      teamName: p.teamName || '',
      weight: normalizePlayerWeight(p.weight),
      correctCount: p.correctCount || 0,
      score: roundScore(p.score || 0),
      rank: idx + 1
    }))
  };

  if (!Array.isArray(targetGame.playHistory)) {
    targetGame.playHistory = [];
  }
  targetGame.playHistory.unshift(runEntry);
  if (targetGame.playHistory.length > 50) {
    targetGame.playHistory = targetGame.playHistory.slice(0, 50);
  }
  targetGame.lastFinishedAt = runEntry.playedAt;
  game.currentRunArchived = true;
  persistStore(store);
  return true;
}

function resetPlayersForNewRun(gameId = store.activeGameId, { removeOfflinePlayers = false } = {}) {
  for (const [pid, p] of players.entries()) {
    if (p.gameId !== gameId) continue;
    if (removeOfflinePlayers && !p.connected) {
      players.delete(pid);
      currentAnswers.delete(pid);
    } else {
      p.score = 0;
      p.correctCount = 0;
    }
  }
  syncGamePlayersToStore(gameId);
}

function startQuestion(index) {
  const questions = getActiveQuestions();
  const settings = getActiveSettings();
  if (index < 0 || index >= questions.length) return false;

  if (index === 0) {
    game.currentRunArchived = false;
  }

  const q = questions[index];
  const qTimer = Math.round(Number(q.timerSeconds));
  const duration =
    Number.isFinite(qTimer) && qTimer >= 5
      ? qTimer
      : settings.timerSeconds || DEFAULT_TIMER_SECONDS;

  currentAnswers.clear();
  game.isSessionOpen = true;
  game.phase = 'question';
  game.currentQuestionIndex = index;
  game.resumableQuestionIndex = index;
  game.resumableWasRevealed = false;
  game.questionScored = false;
  game.timerDuration = duration;
  game.timerPaused = false;
  game.pausedRemainingMs = 0;
  game.timeExpiredAwaitingReveal = false;
  game.leaderboardModalOpen = false;
  game.lastReveal = null;
  game.questionEndsAt = Date.now() + game.timerDuration * 1000;
  broadcastAllStates();
  return true;
}

function revealCurrentQuestion() {
  const questions = getActiveQuestions();
  const settings = getActiveSettings();
  if (game.currentQuestionIndex < 0 || game.currentQuestionIndex >= questions.length) {
    return false;
  }
  if (game.questionScored) {
    game.phase = 'revealed';
    broadcastAllStates();
    return true;
  }

  const q = questions[game.currentQuestionIndex];
  const questionBudget = Number(q.points) >= 1 ? Math.round(Number(q.points)) : DEFAULT_POINTS;
  const optionCounts = [0, 0, 0, 0];
  const correctSubmissions = [];
  let weightedCorrectCount = 0;
  let wrongCount = 0;

  for (const [pid, submission] of currentAnswers.entries()) {
    const p = players.get(pid);
    if (!p || p.gameId !== store.activeGameId) continue;
    const pWeight = normalizePlayerWeight(p.weight);
    if (submission.answerIndex >= 0 && submission.answerIndex <= 3) {
      optionCounts[submission.answerIndex] += pWeight;
    }
    if (submission.answerIndex === q.correctIndex) {
      weightedCorrectCount += pWeight;
      correctSubmissions.push({
        pid,
        player: p,
        weight: pWeight,
        answeredAt: Number(submission.answeredAt) || 0
      });
    } else {
      wrongCount += pWeight;
    }
  }

  // Sort correct answers by speed (fastest first)
  correctSubmissions.sort((a, b) => {
    if (a.answeredAt !== b.answeredAt) return a.answeredAt - b.answeredAt;
    return (a.player.joinedAt || 0) - (b.player.joinedAt || 0);
  });

  const winnersCount = correctSubmissions.length;
  const winnerIds = correctSubmissions.map((item) => item.pid);
  const winnerDetails = [];
  const winnerNames = [];
  const playerAwards = {};

  let everyoneSplit = false;
  let equalShare = 0;
  let recipientCount = 0;
  let totalParts = 0;
  let singlePartValue = 0;

  if (winnersCount > 0) {
    // Weighted speed scoring: base parts = (winnersCount - idx), multiplied by player weight (1, 2, 3...)
    const entriesWithParts = correctSubmissions.map((entry, idx) => {
      const baseParts = winnersCount - idx;
      const weight = normalizePlayerWeight(entry.weight);
      const parts = baseParts * weight;
      return {
        ...entry,
        speedRank: idx + 1,
        baseParts,
        weight,
        parts
      };
    });

    totalParts = entriesWithParts.reduce((sum, item) => sum + item.parts, 0);
    const rawPartValue = questionBudget / totalParts;
    singlePartValue = roundScore(rawPartValue);

    entriesWithParts.forEach((entry) => {
      const p = entry.player;
      const { speedRank, weight, parts } = entry;
      const pointsEarned = roundScore(parts * rawPartValue);

      p.score = roundScore(p.score + pointsEarned);
      p.correctCount += 1;

      const tName =
        settings.teamsEnabled && p.teamId ? getTeamNameById(p.teamId, store.activeGameId) : '';
      const weightSuffix = weight > 1 ? ` ×${weight}` : '';
      const displayName = tName
        ? `${p.name}${weightSuffix} (${tName})`
        : `${p.name}${weightSuffix}`;

      playerAwards[p.id] = {
        answered: true,
        isCorrect: true,
        pointsEarned,
        totalScore: p.score,
        speedRank,
        totalWinners: winnersCount,
        weight,
        parts,
        totalParts,
        singlePartValue,
        everyoneSplit: false
      };

      winnerDetails.push({
        id: p.id,
        name: p.name,
        weight,
        teamName: tName,
        displayName,
        speedRank,
        parts,
        totalParts,
        pointsEarned
      });

      if (winnersCount === 1) {
        winnerNames.push(`${displayName} (+${pointsEarned} נק')`);
      } else {
        winnerNames.push(
          `מקום ${speedRank}: ${displayName} (+${pointsEarned} נק' • ${parts}/${totalParts} חלקים)`
        );
      }
    });
  } else {
    // Nobody answered right -> split the pot among ALL players in the game proportional to each player's weight!
    const allGamePlayers = getPlayersForGame(store.activeGameId);
    const connectedGamePlayers = allGamePlayers.filter((p) => p.connected);
    const targetRecipients =
      connectedGamePlayers.length > 0 ? connectedGamePlayers : allGamePlayers;

    recipientCount = targetRecipients.length;
    if (recipientCount > 0) {
      everyoneSplit = true;
      totalParts = targetRecipients.reduce((sum, p) => sum + normalizePlayerWeight(p.weight), 0);
      const rawPartValue = questionBudget / totalParts;
      singlePartValue = roundScore(rawPartValue);
      equalShare = singlePartValue;

      for (const p of targetRecipients) {
        const w = normalizePlayerWeight(p.weight);
        const earned = roundScore(w * rawPartValue);
        const sub = currentAnswers.get(p.id);
        p.score = roundScore(p.score + earned);
        playerAwards[p.id] = {
          answered: Boolean(sub),
          isCorrect: false,
          pointsEarned: earned,
          totalScore: p.score,
          speedRank: null,
          totalWinners: 0,
          weight: w,
          parts: w,
          totalParts,
          singlePartValue,
          everyoneSplit: true
        };
      }
    }
  }

  // Ensure every player in the active game has an award summary entry (for wrong/unanswered players when winnersCount > 0)
  for (const p of getPlayersForGame(store.activeGameId)) {
    if (!playerAwards[p.id]) {
      const sub = currentAnswers.get(p.id);
      playerAwards[p.id] = {
        answered: Boolean(sub),
        isCorrect: false,
        pointsEarned: 0,
        totalScore: p.score,
        speedRank: null,
        totalWinners: winnersCount,
        weight: normalizePlayerWeight(p.weight),
        parts: 0,
        totalParts,
        singlePartValue,
        everyoneSplit: false
      };
    }
  }

  const pointsPerWinner =
    winnersCount > 0 ? roundScore(questionBudget / winnersCount) : equalShare;

  game.phase = 'revealed';
  game.questionScored = true;
  game.resumableQuestionIndex = game.currentQuestionIndex;
  game.resumableWasRevealed = true;
  game.timerPaused = false;
  game.pausedRemainingMs = 0;
  game.questionEndsAt = 0;
  game.timeExpiredAwaitingReveal = false;
  game.lastReveal = {
    questionIndex: game.currentQuestionIndex,
    correctIndex: q.correctIndex,
    optionCounts,
    totalAnswers: optionCounts.reduce((a, b) => a + b, 0),
    correctCount: weightedCorrectCount,
    wrongCount,
    winnersCount,
    pointsPerWinner,
    questionBudget,
    totalParts,
    singlePartValue,
    everyoneSplit,
    equalShare,
    recipientCount,
    winnerNames,
    winnerIds,
    winnerDetails,
    playerAwards
  };

  syncGamePlayersToStore(store.activeGameId);
  broadcastAllStates();
  return true;
}

function returnToMainScreen() {
  const prevGameId = store.activeGameId;
  const wasPlayedOrFinished =
    game.phase === 'question' || game.phase === 'revealed' || game.phase === 'finished';

  archiveCurrentGameRunIfNeeded(prevGameId);
  syncGamePlayersToStore(prevGameId);

  // If the game had started or finished, show connected players the "Game Finished!" screen
  // with their final score & leaderboard rather than kicking them to the join form.
  for (const p of players.values()) {
    if (p.gameId === prevGameId && p.socketId) {
      if (wasPlayedOrFinished) {
        const finishedState = buildPlayerState(p.id, 'finished');
        io.to(p.socketId).emit('player:state', finishedState);
      } else {
        io.to(p.socketId).emit('player:kicked', {
          reason: 'המשחק נסגר על ידי המנחה.'
        });
      }
      socketToPlayerId.delete(p.socketId);
      p.socketId = null;
      p.connected = false;
    }
  }

  currentAnswers.clear();
  game.isSessionOpen = false;
  game.phase = 'hub';
  game.currentQuestionIndex = -1;
  game.resumableQuestionIndex = -1;
  game.resumableWasRevealed = false;
  game.questionScored = false;
  game.timerPaused = false;
  game.pausedRemainingMs = 0;
  game.questionEndsAt = 0;
  game.timeExpiredAwaitingReveal = false;
  game.leaderboardModalOpen = false;
  game.lastReveal = null;
  syncGamePlayersToStore(prevGameId);
  broadcastAllStates();
}

function finishQuiz() {
  if (game.phase === 'question' && !game.questionScored) {
    revealCurrentQuestion();
  }
  const activeGame = getActiveGameRecord();
  activeGame.lastFinishedAt = new Date().toISOString();
  game.phase = 'finished';
  game.resumableQuestionIndex = -1;
  game.resumableWasRevealed = false;
  game.leaderboardModalOpen = false;
  game.timerPaused = false;
  game.questionEndsAt = 0;
  archiveCurrentGameRunIfNeeded(store.activeGameId);
  syncGamePlayersToStore(store.activeGameId);
  broadcastAllStates();
}

function switchActiveGame(targetGame, { openSession = true } = {}) {
  const prevGameId = store.activeGameId;
  archiveCurrentGameRunIfNeeded(prevGameId);
  syncGamePlayersToStore(prevGameId);

  if (prevGameId && prevGameId !== targetGame.id) {
    for (const p of players.values()) {
      if (p.gameId === prevGameId && p.socketId) {
        const finishedState = buildPlayerState(p.id, 'finished');
        io.to(p.socketId).emit('player:state', finishedState);
        socketToPlayerId.delete(p.socketId);
        p.socketId = null;
        p.connected = false;
      }
    }
  }

  store.activeGameId = targetGame.id;
  currentAnswers.clear();
  game.isSessionOpen = Boolean(openSession);
  game.phase = openSession ? 'lobby' : 'hub';
  game.currentQuestionIndex = -1;
  game.resumableQuestionIndex = -1;
  game.resumableWasRevealed = false;
  game.questionScored = false;
  game.currentRunArchived = false;
  game.timerPaused = false;
  game.pausedRemainingMs = 0;
  game.questionEndsAt = 0;
  game.timeExpiredAwaitingReveal = false;
  game.leaderboardModalOpen = false;
  game.lastReveal = null;

  // When opening a game session to play again, archive any prior unarchived scores into playHistory
  // and reset all players for the new run to start from 0!
  if (openSession) {
    const existingPlayers = getPlayersForGame(targetGame.id);
    const hadOldScores = existingPlayers.some((p) => (p.score || 0) > 0 || (p.correctCount || 0) > 0);
    if (hadOldScores) {
      archiveCurrentGameRunIfNeeded(targetGame.id);
      game.currentRunArchived = false;
    }
    resetPlayersForNewRun(targetGame.id, { removeOfflinePlayers: true });
  }

  const validTeamIds = new Set((targetGame.teams || []).map((t) => t.id));
  for (const p of players.values()) {
    if (p.gameId !== targetGame.id) continue;
    if (p.teamId && !validTeamIds.has(p.teamId)) {
      p.teamId = null;
    }
  }

  syncGamePlayersToStore(targetGame.id);
  io.emit('settings:updated', getActiveSettings());
  broadcastAllStates();
}

function resetQuiz({ keepPlayers = true, clearTeamAssignments = false, keepSessionOpen = false } = {}) {
  currentAnswers.clear();
  game.isSessionOpen = Boolean(keepSessionOpen);
  game.phase = keepSessionOpen ? 'lobby' : 'hub';
  game.currentQuestionIndex = -1;
  game.resumableQuestionIndex = -1;
  game.resumableWasRevealed = false;
  game.questionScored = false;
  game.timerPaused = false;
  game.pausedRemainingMs = 0;
  game.questionEndsAt = 0;
  game.timeExpiredAwaitingReveal = false;
  game.leaderboardModalOpen = false;
  game.lastReveal = null;

  const activeGame = getActiveGameRecord();
  if (keepPlayers) {
    const validTeamIds = new Set((activeGame.teams || []).map((t) => t.id));
    for (const p of players.values()) {
      if (p.gameId !== activeGame.id) continue;
      p.score = 0;
      p.correctCount = 0;
      if (clearTeamAssignments || (p.teamId && !validTeamIds.has(p.teamId))) {
        p.teamId = null;
      }
    }
  } else {
    for (const [pid, p] of players.entries()) {
      if (p.gameId !== activeGame.id) continue;
      if (p.socketId) {
        io.to(p.socketId).emit('player:kicked', { reason: 'המשחק אופס על ידי המנחה.' });
        socketToPlayerId.delete(p.socketId);
      }
      players.delete(pid);
    }
  }

  syncGamePlayersToStore(activeGame.id);
  broadcastAllStates();
}

// Periodic timer check & sync
let lastBroadcastSecond = -1;
setInterval(() => {
  if (game.phase !== 'question') {
    lastBroadcastSecond = -1;
    return;
  }
  if (game.timerPaused) return;

  const remainingMs = getRemainingMs();
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const settings = getActiveSettings();

  if (remainingMs <= 0) {
    revealCurrentQuestion();
    return;
  }

  lastBroadcastSecond = remainingSeconds;
  io.emit('timer:tick', {
    remainingMs,
    remainingSeconds,
    durationSeconds: game.timerDuration,
    paused: false
  });
}, 200);

// -------------------- Middleware & HTTP Routes --------------------

app.use(express.json({ limit: '25mb' }));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.use(express.static(PUBLIC_DIR));

app.get('/api/info', (_req, res) => {
  res.json({
    ok: true,
    settings: getActiveSettings(),
    activeGameId: store.activeGameId,
    isSessionOpen: Boolean(game.isSessionOpen),
    games: getGamesSummaryList(),
    lanUrls: getLanUrls(PORT),
    port: PORT,
    maxPlayers: MAX_PLAYERS,
    totalQuestions: getActiveQuestions().length
  });
});

// -------------------- Self-Contained ISO/IEC 18004 QR Code SVG Generator --------------------
const QR_VERSIONS_L = [
  null,
  { size: 21, total: 26, data: 19, ec: 7, align: [] },
  { size: 25, total: 44, data: 34, ec: 10, align: [6, 18] },
  { size: 29, total: 70, data: 55, ec: 15, align: [6, 22] },
  { size: 33, total: 100, data: 80, ec: 20, align: [6, 26] },
  { size: 37, total: 134, data: 108, ec: 26, align: [6, 30] }
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function computeReedSolomonEc(dataBytes, ecLen) {
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const nextGen = new Array(gen.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < gen.length; j++) {
      nextGen[j] ^= gen[j];
      nextGen[j + 1] ^= gfMul(gen[j], root);
    }
    gen = nextGen;
  }
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < dataBytes.length; i++) {
    const factor = dataBytes[i] ^ rem[0];
    for (let j = 0; j < ecLen - 1; j++) {
      rem[j] = rem[j + 1];
    }
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function generateQrSvg(rawText) {
  const bytes = Buffer.from(String(rawText || ''), 'utf8');
  let ver = 1;
  while (ver < 5 && bytes.length + 2 > QR_VERSIONS_L[ver].data) {
    ver++;
  }
  const spec = QR_VERSIONS_L[ver];
  const maxPayload = spec.data - 2;
  const payload = bytes.length > maxPayload ? bytes.subarray(0, maxPayload) : bytes;

  // Build bit stream: Byte mode (0100) + 8-bit length + bytes + terminator
  const bits = [];
  const pushBits = (val, count) => {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };
  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  for (let i = 0; i < payload.length; i++) {
    pushBits(payload[i], 8);
  }
  const maxDataBits = spec.data * 8;
  const termCount = Math.min(4, maxDataBits - bits.length);
  pushBits(0, termCount);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataWords = new Uint8Array(spec.data);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let bit = 0; bit < 8; bit++) {
      b = (b << 1) | bits[i * 8 + bit];
    }
    dataWords[i] = b;
  }
  let padToggle = true;
  for (let i = bits.length / 8; i < spec.data; i++) {
    dataWords[i] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  const ecWords = computeReedSolomonEc(dataWords, spec.ec);
  const allWords = new Uint8Array(spec.total);
  allWords.set(dataWords, 0);
  allWords.set(ecWords, spec.data);

  const size = spec.size;
  const grid = Array.from({ length: size }, () => new Uint8Array(size));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  const setModule = (r, c, val) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      grid[r][c] = val ? 1 : 0;
      reserved[r][c] = 1;
    }
  };

  const placeFinder = (topR, leftC) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setModule(r, c, inOuter && (onBorder || inCenter) ? 1 : 0);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment patterns
  for (const ar of spec.align) {
    for (const ac of spec.align) {
      if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 8) || (ar >= size - 8 && ac <= 8)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const onRing = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const isCenter = dr === 0 && dc === 0;
          setModule(ar + dr, ac + dc, onRing || isCenter ? 1 : 0);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0 ? 1 : 0);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Dark module & reserve format info slots
  setModule(size - 8, 8, 1);
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = 1;
    if (!reserved[i][8]) reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][size - 1 - i]) reserved[8][size - 1 - i] = 1;
    if (!reserved[size - 1 - i][8]) reserved[size - 1 - i][8] = 1;
  }

  // Place data + EC bits with Mask 0: (r + c) % 2 === 0
  let bitIdx = 0;
  const totalBits = allWords.length * 8;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = rightCol - dc;
        if (reserved[r][c]) continue;
        let bit = 0;
        if (bitIdx < totalBits) {
          const byteVal = allWords[bitIdx >>> 3];
          bit = (byteVal >>> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
        }
        if ((r + c) % 2 === 0) bit ^= 1;
        grid[r][c] = bit;
      }
    }
    upward = !upward;
  }

  // Format information for Level L (01) + Mask 0 (000) -> 0x77c4
  const formatWord = 0x77c4;
  const fBit = (idx) => (formatWord >>> idx) & 1;

  const tlRowCols = [0, 1, 2, 3, 4, 5, 7, 8];
  for (let i = 0; i < 8; i++) grid[8][tlRowCols[i]] = fBit(14 - i);

  const tlColRows = [7, 5, 4, 3, 2, 1, 0];
  for (let i = 0; i < 7; i++) grid[tlColRows[i]][8] = fBit(6 - i);

  for (let i = 0; i < 7; i++) grid[size - 1 - i][8] = fBit(14 - i);
  for (let i = 0; i < 8; i++) grid[8][size - 8 + i] = fBit(7 - i);

  const quiet = 3;
  const fullSize = size + quiet * 2;
  let pathData = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) {
        pathData += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fullSize} ${fullSize}" shape-rendering="crispEdges"><rect width="${fullSize}" height="${fullSize}" fill="#ffffff" rx="2"/><path d="${pathData}" fill="#090d1a"/></svg>`;
}

app.get('/api/qr', (req, res) => {
  const text = String(req.query.text || '').trim() || `http://localhost:${PORT}`;
  const svg = generateQrSvg(text);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(svg);
});

const ALLOWED_MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm'
};
const ALLOWED_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'avif',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'webm'
]);

app.post(
  '/api/upload',
  express.raw({
    type: ['image/*', 'audio/*', 'application/octet-stream'],
    limit: '35mb'
  }),
  (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ ok: false, error: 'לא התקבל קובץ תקין להעלאה.' });
      }

      const rawCategory = String(req.query.category || 'image').replace(/[^a-z0-9_-]/gi, '');
      const category = ['header', 'bg', 'question', 'music'].includes(rawCategory)
        ? rawCategory
        : 'asset';

      const contentType = String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      const queryExt = String(req.query.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

      let ext = ALLOWED_MIME_TO_EXT[contentType] || '';
      if (!ext && ALLOWED_EXTS.has(queryExt)) {
        ext = queryExt === 'jpeg' ? 'jpg' : queryExt;
      }
      if (!ext) {
        return res.status(400).json({
          ok: false,
          error:
            category === 'music'
              ? 'סוג קובץ המוזיקה אינו נתמך. אנא העלו קובץ MP3, WAV, OGG או M4A.'
              : 'סוג הקובץ אינו נתמך. אנא העלו תמונה בפורמט PNG, JPG, WEBP, GIF או SVG.'
        });
      }

      const filename = `${category}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const fullPath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(fullPath, req.body);

      return res.json({
        ok: true,
        url: `/uploads/${filename}`
      });
    } catch (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ ok: false, error: 'שגיאה בשמירת הקובץ בשרת.' });
    }
  }
);

// --- Multi-Game Management Endpoints ---

app.get('/api/admin/games', (_req, res) => {
  const active = getActiveGameRecord();
  res.json({
    ok: true,
    activeGameId: store.activeGameId,
    activeGameCode: active.code,
    games: getGamesSummaryList()
  });
});

app.post('/api/admin/games', (req, res) => {
  try {
    const rawTitle = String(req.body?.title || '').trim();
    if (!rawTitle) {
      return res.status(400).json({ ok: false, error: 'יש להזין שם למשחק החדש.' });
    }

    const cleanSettings = sanitizeSettings({
      ...DEFAULT_GAME_SETTINGS,
      ...req.body,
      title: rawTitle
    });

    const newGame = {
      id: `game-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ...cleanSettings,
      questions: Array.isArray(req.body?.questions)
        ? req.body.questions
            .map((q) => normalizeQuestion(q, cleanSettings.timerSeconds))
            .filter((q) => q.question.length > 0)
        : []
    };

    store.games.push(newGame);
    store.activeGameId = newGame.id;
    persistStore(store);

    const privateSync = autoSyncUserWrittenQuestionsToPrivateBank(
      Array.isArray(req.body?.questions) ? req.body.questions : [],
      'שאלות פרטיות'
    );

    resetQuiz({ keepPlayers: true, clearTeamAssignments: true });
    io.emit('settings:updated', getActiveSettings());
    broadcastAllStates();

    return res.json({
      ok: true,
      game: newGame,
      activeGameId: store.activeGameId,
      activeGameCode: newGame.code,
      games: getGamesSummaryList(),
      privateSync
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה ביצירת משחק חדש.' });
  }
});

function detectQuestionVisualTheme(questionText = '', topicName = '') {
  const combined = `${questionText} ${topicName}`.toLowerCase();
  if (combined.includes('כוכב') || combined.includes('שמש') || combined.includes('חלל') || combined.includes('מאדים') || combined.includes('ירח')) {
    return { theme: 'space', badge: topicName || 'חלל ומערכת השמש' };
  }
  if (combined.includes('אוקיינוס') || combined.includes('ים ') || combined.includes('נהר') || combined.includes('טיטאניק') || combined.includes('מצר')) {
    return { theme: 'ocean', badge: topicName || 'ימים ואוקיינוסים' };
  }
  if (combined.includes('הר ') || combined.includes('יבשת') || combined.includes('יבשות') || combined.includes('בירת') || combined.includes('מדינה') || combined.includes('גיאוגרפ')) {
    return { theme: 'globe', badge: topicName || 'גיאוגרפיה ועולם' };
  }
  if (combined.includes('שחמט') || combined.includes('משבצות')) {
    return { theme: 'chess', badge: topicName || 'משחקי חשיבה' };
  }
  if (combined.includes('אולימפ') || combined.includes('מדליית') || combined.includes('מרתון')) {
    return { theme: 'olympics', badge: topicName || 'המשחקים האולימפיים' };
  }
  if (combined.includes('כדורגל') || combined.includes('כדורסל') || combined.includes('מונדיאל') || combined.includes('מגרש') || combined.includes('ספורט')) {
    return { theme: 'sports', badge: topicName || 'ספורט ואליפויות' };
  }
  if (combined.includes('שיר') || combined.includes('אירוויזיון') || combined.includes('גיטרה') || combined.includes('מיתרים') || combined.includes('הלחין') || combined.includes('להק') || combined.includes('מוזיק')) {
    return { theme: 'music', badge: topicName || 'מוזיקה ובמה' };
  }
  if (combined.includes('ציור') || combined.includes('צייר') || combined.includes('סרט') || combined.includes('קולנוע') || combined.includes('ספרות') || combined.includes('תרבות')) {
    return { theme: 'culture', badge: topicName || 'תרבות, קולנוע ואמנות' };
  }
  if (combined.includes('חנוכ') || combined.includes('סביבון') || combined.includes('שבועות') || combined.includes('סוכות') || combined.includes('פורים') || combined.includes('מגיל') || combined.includes('תורה') || combined.includes('חג')) {
    return { theme: 'holidays', badge: topicName || 'חגי ישראל ומסורת' };
  }
  if (combined.includes('ישראל') || combined.includes('ממשלה') || combined.includes('נשיא') || combined.includes('התקווה') || combined.includes('ציונ') || combined.includes('מושב') || combined.includes('מבצע')) {
    return { theme: 'israel', badge: topicName || 'היסטוריה של ישראל' };
  }
  if (combined.includes('בעל החיים') || combined.includes('תמנון') || combined.includes('חיות') || combined.includes('צמח')) {
    return { theme: 'nature', badge: topicName || 'טבע ובעלי חיים' };
  }
  if (combined.includes('כימי') || combined.includes('מתכת') || combined.includes('ויטמין') || combined.includes('חשמל') || combined.includes('מדען') || combined.includes('יהלום') || combined.includes('גז') || combined.includes('מדע')) {
    return { theme: 'science', badge: topicName || 'מדע ותגליות' };
  }
  if (combined.includes('חומוס') || combined.includes('פיצה') || combined.includes('טחינה') || combined.includes('תבלין') || combined.includes('רוטב') || combined.includes('אוכל') || combined.includes('קולינר')) {
    return { theme: 'food', badge: topicName || 'אוכל וקולינריה' };
  }
  if (combined.includes('אייפון') || combined.includes('מחשב') || combined.includes('אפליקצי') || combined.includes('נורת') || combined.includes('ממציא') || combined.includes('cpu') || combined.includes('טכנולוג')) {
    return { theme: 'tech', badge: topicName || 'טכנולוגיה והמצאות' };
  }
  return { theme: 'general', badge: topicName || 'שאלת טריוויה' };
}

function buildQuestionIllustrationUrl(questionText, topicName = '', seed = 0) {
  const { theme, badge } = detectQuestionVisualTheme(questionText, topicName);
  return `/api/question-illustration?theme=${encodeURIComponent(theme)}&badge=${encodeURIComponent(badge)}&s=${encodeURIComponent(String(seed))}`;
}

app.get('/api/question-illustration', (req, res) => {
  const theme = String(req.query.theme || 'general').replace(/[^a-z]/gi, '').toLowerCase();
  const rawBadge = String(req.query.badge || 'טריוויה').slice(0, 42);
  const safeBadge = rawBadge
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const palettes = {
    space: { c1: '#090d26', c2: '#1e1b4b', c3: '#4338ca', accent: '#38bdf8', glow: '#f472b6' },
    ocean: { c1: '#042f2e', c2: '#0c4a6e', c3: '#0284c7', accent: '#38bdf8', glow: '#2dd4bf' },
    globe: { c1: '#064e3b', c2: '#0f766e', c3: '#0369a1', accent: '#34d399', glow: '#fde047' },
    chess: { c1: '#1e1b4b', c2: '#312e81', c3: '#4c1d95', accent: '#fbbf24', glow: '#a78bfa' },
    olympics: { c1: '#1e293b', c2: '#0f172a', c3: '#1d4ed8', accent: '#facc15', glow: '#fb7185' },
    sports: { c1: '#052e16', c2: '#14532d', c3: '#15803d', accent: '#4ade80', glow: '#facc15' },
    music: { c1: '#2e1065', c2: '#581c87', c3: '#be185d', accent: '#f472b6', glow: '#38bdf8' },
    culture: { c1: '#450a0a', c2: '#7f1d1d', c3: '#9a3412', accent: '#fbbf24', glow: '#fb923c' },
    holidays: { c1: '#172554', c2: '#1e3a8a', c3: '#3b82f6', accent: '#fde047', glow: '#60a5fa' },
    israel: { c1: '#0c4a6e', c2: '#1e3a8a', c3: '#2563eb', accent: '#bae6fd', glow: '#fde047' },
    nature: { c1: '#064e3b', c2: '#166534', c3: '#15803d', accent: '#86efac', glow: '#fde047' },
    science: { c1: '#0f172a', c2: '#1e1b4b', c3: '#0369a1', accent: '#22d3ee', glow: '#a855f7' },
    food: { c1: '#431407', c2: '#7c2d12', c3: '#b45309', accent: '#fde047', glow: '#fb923c' },
    tech: { c1: '#020617', c2: '#0f172a', c3: '#1e3a8a', accent: '#38bdf8', glow: '#818cf8' },
    general: { c1: '#0f172a', c2: '#1e1b4b', c3: '#3730a3', accent: '#fbbf24', glow: '#38bdf8' }
  };

  const pal = palettes[theme] || palettes.general;

  const artworkByTheme = {
    space: `
      <circle cx="400" cy="200" r="74" fill="url(#accentGrad)" />
      <ellipse cx="400" cy="200" rx="145" ry="34" fill="none" stroke="#bae6fd" stroke-width="8" transform="rotate(-18 400 200)" opacity="0.88" />
      <circle cx="245" cy="110" r="14" fill="#fde047" />
      <circle cx="555" cy="120" r="9" fill="#f472b6" />
      <circle cx="290" cy="285" r="6" fill="#ffffff" />
      <circle cx="535" cy="275" r="7" fill="#ffffff" />
    `,
    ocean: `
      <circle cx="400" cy="145" r="46" fill="#fde047" opacity="0.9" />
      <path d="M160 225 Q220 185 280 225 T400 225 T520 225 T640 225" fill="none" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" />
      <path d="M190 265 Q250 225 310 265 T430 265 T550 265 T610 265" fill="none" stroke="#2dd4bf" stroke-width="12" stroke-linecap="round" opacity="0.85" />
      <path d="M220 305 Q280 270 340 305 T460 305 T580 305" fill="none" stroke="#bae6fd" stroke-width="10" stroke-linecap="round" opacity="0.7" />
    `,
    globe: `
      <circle cx="400" cy="195" r="86" fill="none" stroke="#34d399" stroke-width="8" />
      <ellipse cx="400" cy="195" rx="46" ry="86" fill="none" stroke="#38bdf8" stroke-width="5" />
      <line x1="314" y1="195" x2="486" y2="195" stroke="#38bdf8" stroke-width="5" />
      <path d="M325 155 Q400 175 475 155" fill="none" stroke="#34d399" stroke-width="4" />
      <path d="M325 235 Q400 215 475 235" fill="none" stroke="#34d399" stroke-width="4" />
    `,
    chess: `
      <rect x="304" y="105" width="192" height="192" rx="18" fill="none" stroke="#fbbf24" stroke-width="6" />
      <rect x="304" y="105" width="64" height="64" fill="#fbbf24" opacity="0.85" />
      <rect x="432" y="105" width="64" height="64" fill="#fbbf24" opacity="0.85" />
      <rect x="368" y="169" width="64" height="64" fill="#fbbf24" opacity="0.85" />
      <rect x="304" y="233" width="64" height="64" fill="#fbbf24" opacity="0.85" />
      <rect x="432" y="233" width="64" height="64" fill="#fbbf24" opacity="0.85" />
    `,
    olympics: `
      <circle cx="310" cy="175" r="38" fill="none" stroke="#38bdf8" stroke-width="8" />
      <circle cx="400" cy="175" r="38" fill="none" stroke="#f8fafc" stroke-width="8" />
      <circle cx="490" cy="175" r="38" fill="none" stroke="#fb7185" stroke-width="8" />
      <circle cx="355" cy="215" r="38" fill="none" stroke="#facc15" stroke-width="8" />
      <circle cx="445" cy="215" r="38" fill="none" stroke="#4ade80" stroke-width="8" />
    `,
    sports: `
      <circle cx="400" cy="195" r="82" fill="url(#accentGrad)" stroke="#ffffff" stroke-width="6" />
      <path d="M335 145 Q400 195 335 245" fill="none" stroke="#052e16" stroke-width="6" />
      <path d="M465 145 Q400 195 465 245" fill="none" stroke="#052e16" stroke-width="6" />
      <line x1="318" y1="195" x2="482" y2="195" stroke="#052e16" stroke-width="6" />
      <line x1="400" y1="113" x2="400" y2="277" stroke="#052e16" stroke-width="6" />
    `,
    music: `
      <path d="M360 245 V125 L470 105 V225" fill="none" stroke="#f472b6" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="342" cy="248" r="24" fill="#38bdf8" />
      <circle cx="452" cy="228" r="24" fill="#fde047" />
      <circle cx="265" cy="145" r="10" fill="#f472b6" opacity="0.7" />
      <circle cx="535" cy="165" r="12" fill="#38bdf8" opacity="0.7" />
    `,
    culture: `
      <rect x="290" y="120" width="220" height="150" rx="18" fill="none" stroke="#fbbf24" stroke-width="7" />
      <circle cx="330" cy="160" r="16" fill="#fb7185" />
      <circle cx="330" cy="230" r="16" fill="#38bdf8" />
      <polygon points="385,155 385,235 455,195" fill="#fde047" />
    `,
    holidays: `
      <line x1="400" y1="110" x2="400" y2="285" stroke="#fde047" stroke-width="10" stroke-linecap="round" />
      <path d="M320 150 C320 220 480 220 480 150" fill="none" stroke="#fde047" stroke-width="8" stroke-linecap="round" />
      <path d="M280 135 C280 250 520 250 520 135" fill="none" stroke="#fde047" stroke-width="8" stroke-linecap="round" />
      <line x1="350" y1="285" x2="450" y2="285" stroke="#fde047" stroke-width="10" stroke-linecap="round" />
      <circle cx="400" cy="95" r="10" fill="#fb923c" />
      <circle cx="320" cy="135" r="8" fill="#fb923c" />
      <circle cx="480" cy="135" r="8" fill="#fb923c" />
      <circle cx="280" cy="120" r="8" fill="#fb923c" />
      <circle cx="520" cy="120" r="8" fill="#fb923c" />
    `,
    israel: `
      <polygon points="400,105 468,225 332,225" fill="none" stroke="#bae6fd" stroke-width="8" stroke-linejoin="round" />
      <polygon points="400,265 468,145 332,145" fill="none" stroke="#bae6fd" stroke-width="8" stroke-linejoin="round" />
      <line x1="250" y1="88" x2="550" y2="88" stroke="#60a5fa" stroke-width="10" stroke-linecap="round" />
      <line x1="250" y1="285" x2="550" y2="285" stroke="#60a5fa" stroke-width="10" stroke-linecap="round" />
    `,
    nature: `
      <path d="M400 105 C455 105 495 155 495 210 C495 255 450 280 400 280 C350 280 305 255 305 210 C305 155 345 105 400 105 Z" fill="url(#accentGrad)" opacity="0.88" />
      <line x1="400" y1="135" x2="400" y2="305" stroke="#fef08a" stroke-width="8" stroke-linecap="round" />
      <line x1="400" y1="190" x2="440" y2="160" stroke="#fef08a" stroke-width="6" stroke-linecap="round" />
      <line x1="400" y1="225" x2="358" y2="195" stroke="#fef08a" stroke-width="6" stroke-linecap="round" />
    `,
    science: `
      <ellipse cx="400" cy="195" rx="115" ry="42" fill="none" stroke="#22d3ee" stroke-width="6" transform="rotate(30 400 195)" />
      <ellipse cx="400" cy="195" rx="115" ry="42" fill="none" stroke="#a855f7" stroke-width="6" transform="rotate(-30 400 195)" />
      <ellipse cx="400" cy="195" rx="115" ry="42" fill="none" stroke="#38bdf8" stroke-width="6" transform="rotate(90 400 195)" />
      <circle cx="400" cy="195" r="20" fill="#fde047" />
    `,
    food: `
      <circle cx="400" cy="200" r="84" fill="none" stroke="#fde047" stroke-width="8" />
      <circle cx="400" cy="200" r="56" fill="url(#accentGrad)" opacity="0.85" />
      <circle cx="380" cy="180" r="9" fill="#fef08a" />
      <circle cx="422" cy="195" r="8" fill="#fef08a" />
      <circle cx="395" cy="222" r="10" fill="#fef08a" />
    `,
    tech: `
      <rect x="325" y="120" width="150" height="150" rx="22" fill="none" stroke="#38bdf8" stroke-width="7" />
      <rect x="360" y="155" width="80" height="80" rx="12" fill="url(#accentGrad)" />
      <line x1="355" y1="95" x2="355" y2="120" stroke="#818cf8" stroke-width="6" stroke-linecap="round" />
      <line x1="400" y1="95" x2="400" y2="120" stroke="#818cf8" stroke-width="6" stroke-linecap="round" />
      <line x1="445" y1="95" x2="445" y2="120" stroke="#818cf8" stroke-width="6" stroke-linecap="round" />
      <line x1="355" y1="270" x2="355" y2="295" stroke="#818cf8" stroke-width="6" stroke-linecap="round" />
      <line x1="400" y1="270" x2="400" y2="295" stroke="#818cf8" stroke-width="6" stroke-linecap="round" />
      <line x1="445" y1="270" x2="445" y2="295" stroke="#818cf8" stroke-width="6" stroke-linecap="round" />
    `,
    general: `
      <circle cx="400" cy="190" r="82" fill="url(#accentGrad)" opacity="0.22" stroke="#fbbf24" stroke-width="6" />
      <text x="400" y="222" text-anchor="middle" font-family="system-ui, sans-serif" font-size="96" font-weight="900" fill="#fde047">?</text>
    `
  };

  const centerArt = artworkByTheme[theme] || artworkByTheme.general;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${pal.c1}" />
      <stop offset="55%" stop-color="${pal.c2}" />
      <stop offset="100%" stop-color="${pal.c3}" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${pal.accent}" />
      <stop offset="100%" stop-color="${pal.glow}" />
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#bgGrad)" rx="24" />
  <circle cx="110" cy="80" r="160" fill="${pal.glow}" opacity="0.12" />
  <circle cx="700" cy="370" r="190" fill="${pal.accent}" opacity="0.12" />
  ${centerArt}
  <rect x="230" y="348" width="340" height="54" rx="27" fill="rgba(15, 23, 42, 0.76)" stroke="rgba(255, 255, 255, 0.22)" stroke-width="2" />
  <text x="400" y="383" text-anchor="middle" direction="rtl" font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-size="24" font-weight="800" fill="#ffffff">${safeBadge}</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});

const BUILTIN_TRIVIA_BANK = [
  // --- ידע כללי ---
  { topic: 'ידע כללי', difficulty: 'easy', question: 'כמה ימים יש בשנה לועזית רגילה (שאינה מעוברת)?', answers: ['365', '360', '366', '354'], correctIndex: 0 },
  { topic: 'ידע כללי', difficulty: 'easy', question: 'איזה צבע מתקבל מערבוב של כחול וצהוב?', answers: ['ירוק', 'סגול', 'כתום', 'חום'], correctIndex: 0 },
  { topic: 'ידע כללי', difficulty: 'easy', question: 'כמה יבשות יש בכדור הארץ (לפי החלוקה המקובלת ל-7)?', answers: ['7', '5', '6', '8'], correctIndex: 0 },
  { topic: 'ידע כללי', difficulty: 'medium', question: 'איזו מתכת היא נוזלית בטמפרטורת החדר?', answers: ['כספית', 'עופרת', 'אבץ', 'נחושת'], correctIndex: 0 },
  { topic: 'ידע כללי', difficulty: 'medium', question: 'מהי השפה הרשמית במדינת ברזיל?', answers: ['פורטוגזית', 'ספרדית', 'אנגלית', 'צרפתית'], correctIndex: 0 },
  { topic: 'ידע כללי', difficulty: 'medium', question: 'כמה משבצות יש בלוח שחמט תקני?', answers: ['64', '49', '81', '100'], correctIndex: 0 },
  { topic: 'ידע כללי', difficulty: 'hard', question: 'איזה יסוד כימי מסומן באותיות Au בטבלה המחזורית?', answers: ['זהב', 'כסף', 'נחושת', 'אלומיניום'], correctIndex: 0 },
  { topic: 'ידע כללי', difficulty: 'hard', question: 'באיזו שנה טבעה אוניית הפאר טיטאניק?', answers: ['1912', '1905', '1918', '1923'], correctIndex: 0 },
  { topic: 'ידע כללי', difficulty: 'hard', question: 'מהי בירת אוסטרליה?', answers: ['קנברה', 'סידני', 'מלבורן', 'פרת׳'], correctIndex: 0 },

  // --- היסטוריה של ישראל ---
  { topic: 'היסטוריה של ישראל', difficulty: 'easy', question: 'באיזו שנה הוכרזה הקמת מדינת ישראל?', answers: ['1948', '1945', '1950', '1967'], correctIndex: 0 },
  { topic: 'היסטוריה של ישראל', difficulty: 'easy', question: 'מי היה ראש הממשלה הראשון של מדינת ישראל?', answers: ['דוד בן-גוריון', 'חיים ויצמן', 'משה שרת', 'לוי אשכול'], correctIndex: 0 },
  { topic: 'היסטוריה של ישראל', difficulty: 'easy', question: 'מי כתב את מילות ההמנון הלאומי "התקווה"?', answers: ['נפתלי הרץ אימבר', 'חיים נחמן ביאליק', 'נתן אלתרמן', 'שאול טשרניחובסקי'], correctIndex: 0 },
  { topic: 'היסטוריה של ישראל', difficulty: 'medium', question: 'מי היה הנשיא הראשון של מדינת ישראל?', answers: ['חיים ויצמן', 'יצחק בן-צבי', 'זלמן שזר', 'אפרים קציר'], correctIndex: 0 },
  { topic: 'היסטוריה של ישראל', difficulty: 'medium', question: 'באיזו עיר הוכרזה הקמת מדינת ישראל בה׳ באייר תש"ח?', answers: ['תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון'], correctIndex: 0 },
  { topic: 'היסטוריה של ישראל', difficulty: 'medium', question: 'באיזו שנה נחתם הסכם השלום בין ישראל למצרים?', answers: ['1979', '1973', '1982', '1994'], correctIndex: 0 },
  { topic: 'היסטוריה של ישראל', difficulty: 'hard', question: 'באיזו שנה נערך הקונגרס הציוני הראשון בבאזל?', answers: ['1897', '1901', '1882', '1917'], correctIndex: 0 },
  { topic: 'היסטוריה של ישראל', difficulty: 'hard', question: 'איזה מבצע צבאי נודע גם בשם "מבצע יונתן" בשנת 1976?', answers: ['מבצע אנטבה', 'מבצע קדש', 'מבצע שלמה', 'מבצע משה'], correctIndex: 0 },
  { topic: 'היסטוריה של ישראל', difficulty: 'hard', question: 'איזו מושבה כונתה "אם המושבות"?', answers: ['פתח תקווה', 'ראש פינה', 'זכרון יעקב', 'נס ציונה'], correctIndex: 0 },

  // --- גיאוגרפיה ועולם ---
  { topic: 'גיאוגרפיה ועולם', difficulty: 'easy', question: 'מהו האוקיינוס הגדול ביותר בעולם?', answers: ['האוקיינוס השקט', 'האוקיינוס האטלנטי', 'האוקיינוס ההודי', 'האוקיינוס הארקטי'], correctIndex: 0 },
  { topic: 'גיאוגרפיה ועולם', difficulty: 'easy', question: 'מהו המקום הנמוך ביותר בעולם על פני היבשה?', answers: ['ים המלח', 'הכנרת', 'הבקעה הגדולה', 'עמק המוות'], correctIndex: 0 },
  { topic: 'גיאוגרפיה ועולם', difficulty: 'easy', question: 'באיזו מדינה נמצא מגדל אייפל?', answers: ['צרפת', 'איטליה', 'אנגליה', 'ספרד'], correctIndex: 0 },
  { topic: 'גיאוגרפיה ועולם', difficulty: 'medium', question: 'מהו הנהר הארוך ביותר בישראל?', answers: ['נהר הירדן', 'נחל הירקון', 'נחל הקישון', 'נחל הבשור'], correctIndex: 0 },
  { topic: 'גיאוגרפיה ועולם', difficulty: 'medium', question: 'מהי בירת יפן?', answers: ['טוקיו', 'קיוטו', 'אוסקה', 'סיאול'], correctIndex: 0 },
  { topic: 'גיאוגרפיה ועולם', difficulty: 'medium', question: 'איזה הר הוא הגבוה ביותר בעולם?', answers: ['הר האוורסט', 'הר קילימנג׳רו', 'הר מון בלאן', 'הר פוג׳י'], correctIndex: 0 },
  { topic: 'גיאוגרפיה ועולם', difficulty: 'hard', question: 'מהי המדינה הקטנה ביותר בעולם בשטחה?', answers: ['קריית הוותיקן', 'מונקו', 'סן מרינו', 'ליכטנשטיין'], correctIndex: 0 },
  { topic: 'גיאוגרפיה ועולם', difficulty: 'hard', question: 'איזה מצר ים מפריד בין יבשת אירופה ליבשת אפריקה?', answers: ['מצר גיברלטר', 'מצר בוספורוס', 'מצר הורמוז', 'מצר ברינג'], correctIndex: 0 },
  { topic: 'גיאוגרפיה ועולם', difficulty: 'hard', question: 'באיזו מדינה נמצאת העיר העתיקה מאצ׳ו פיצ׳ו?', answers: ['פרו', 'צ׳ילה', 'בוליביה', 'מקסיקו'], correctIndex: 0 },

  // --- מדע וטבע ---
  { topic: 'מדע וטבע', difficulty: 'easy', question: 'איזה כוכב לכת מכונה "כוכב הלכת האדום"?', answers: ['מאדים', 'נוגה', 'צדק', 'שבתאי'], correctIndex: 0 },
  { topic: 'מדע וטבע', difficulty: 'easy', question: 'איזה גז בני אדם נושמים פנימה לצורך קיום חיים?', answers: ['חמצן', 'פחמן דו-חמצני', 'הליום', 'מימן'], correctIndex: 0 },
  { topic: 'מדע וטבע', difficulty: 'easy', question: 'מהו בעל החיים היבשתי המהיר ביותר בעולם?', answers: ['ברדלס (צ׳יטה)', 'אריה', 'סוס מרוץ', 'אנטילופה'], correctIndex: 0 },
  { topic: 'מדע וטבע', difficulty: 'medium', question: 'מהו כוכב הלכת הגדול ביותר במערכת השמש?', answers: ['צדק (יופיטר)', 'שבתאי', 'כדור הארץ', 'רהב (נפטון)'], correctIndex: 0 },
  { topic: 'מדע וטבע', difficulty: 'medium', question: 'כמה לבבות יש לתמנון?', answers: ['3', '1', '2', '4'], correctIndex: 0 },
  { topic: 'מדע וטבע', difficulty: 'medium', question: 'איזה ויטמין מיוצר בגוף האדם בעקבות חשיפה לאור השמש?', answers: ['ויטמין D', 'ויטמין C', 'ויטמין B12', 'ויטמין A'], correctIndex: 0 },
  { topic: 'מדע וטבע', difficulty: 'hard', question: 'מהי יחידת המידה של התנגדות חשמלית?', answers: ['אוהם (Ohm)', 'וולט (Volt)', 'אמפר (Ampere)', 'וואט (Watt)'], correctIndex: 0 },
  { topic: 'מדע וטבע', difficulty: 'hard', question: 'איזה מדען גילה את הפניצילין בשנת 1928?', answers: ['אלכסנדר פלמינג', 'לואי פסטר', 'רוברט קוך', 'אדוארד ג׳נר'], correctIndex: 0 },
  { topic: 'מדע וטבע', difficulty: 'hard', question: 'מהו החומר הטבעי הקשה ביותר בטבע?', answers: ['יהלום', 'טיטניום', 'קוורץ', 'גרפיט'], correctIndex: 0 },

  // --- ספורט ---
  { topic: 'ספורט', difficulty: 'easy', question: 'כמה שחקנים מקבוצה אחת נמצאים על המגרש במשחק כדורגל תקני?', answers: ['11', '9', '10', '12'], correctIndex: 0 },
  { topic: 'ספורט', difficulty: 'easy', question: 'כל כמה שנים מתקיימים המשחקים האולימפיים (אולימפיאדת הקיץ)?', answers: ['4 שנים', 'שנתיים', '3 שנים', '5 שנים'], correctIndex: 0 },
  { topic: 'ספורט', difficulty: 'easy', question: 'כמה נקודות שווה קליעה מחוץ לקשת בכדורסל?', answers: ['3 נקודות', '2 נקודות', '4 נקודות', 'נקודה אחת'], correctIndex: 0 },
  { topic: 'ספורט', difficulty: 'medium', question: 'באיזה ענף ספורט זכתה לינוי אשרם במדליית זהב אולימפית?', answers: ['התעמלות אמנותית', 'ג׳ודו', 'שיט', 'התעמלות מכשירים'], correctIndex: 0 },
  { topic: 'ספורט', difficulty: 'medium', question: 'איזו נבחרת זכתה במונדיאל 2022 שנערך בקטאר?', answers: ['ארגנטינה', 'צרפת', 'ברזיל', 'קרואטיה'], correctIndex: 0 },
  { topic: 'ספורט', difficulty: 'medium', question: 'מי היה הישראלי הראשון שזכה במדליית זהב אולימפית?', answers: ['גל פרידמן', 'אריק זאבי', 'ארטיום דולגופיאט', 'ירדן ג׳רבי'], correctIndex: 0 },
  { topic: 'ספורט', difficulty: 'hard', question: 'מהו אורכו המדויק (בקילומטרים) של מרוץ מרתון אולימפי?', answers: ['42.195 ק"מ', '40.000 ק"מ', '45.500 ק"מ', '38.250 ק"מ'], correctIndex: 0 },
  { topic: 'ספורט', difficulty: 'hard', question: 'באיזו שנה זכתה מכבי תל אביב לראשונה בגביע אירופה בכדורסל?', answers: ['1977', '1981', '1972', '2001'], correctIndex: 0 },
  { topic: 'ספורט', difficulty: 'hard', question: 'כמה טבעות משולבות בסמל המשחקים האולימפיים?', answers: ['5', '6', '4', '7'], correctIndex: 0 },

  // --- מוזיקה, תרבות וקולנוע ---
  { topic: 'מוזיקה ותרבות', difficulty: 'easy', question: 'איזה שיר של נטע ברזילי זכה באירוויזיון 2018?', answers: ['Toy', 'Unicorn', 'Diva', 'Hallelujah'], correctIndex: 0 },
  { topic: 'מוזיקה ותרבות', difficulty: 'easy', question: 'כמה מיתרים יש בגיטרה קלאסית רגילה?', answers: ['6', '4', '5', '8'], correctIndex: 0 },
  { topic: 'מוזיקה ותרבות', difficulty: 'easy', question: 'מי צייר את הציור המפורסם "המונה ליזה"?', answers: ['לאונרדו דה וינצ׳י', 'פבלו פיקאסו', 'וינסנט ואן גוך', 'מיכלאנג׳לו'], correctIndex: 0 },
  { topic: 'מוזיקה ותרבות', difficulty: 'medium', question: 'איזו להקה ישראלית שרה את השיר "נתתי לה חיי"?', answers: ['כוורת', 'משינה', 'תיסלם', 'אתניקס'], correctIndex: 0 },
  { topic: 'מוזיקה ותרבות', difficulty: 'medium', question: 'מי גילם את דמותו של סלאח שבתי בסרט הקולנוע של אפרים קישון?', answers: ['חיים טופול', 'שייקה אופיר', 'זאב רווח', 'יהורם גאון'], correctIndex: 0 },
  { topic: 'מוזיקה ותרבות', difficulty: 'medium', question: 'באיזו עיר באנגליה הוקמה להקת הביטלס?', answers: ['ליברפול', 'לונדון', 'מנצ׳סטר', 'ברמינגהאם'], correctIndex: 0 },
  { topic: 'מוזיקה ותרבות', difficulty: 'hard', question: 'מי זכה בפרס נובל לספרות בשנת 1966 כנציג ישראל?', answers: ['ש"י עגנון', 'עמוס עוז', 'א.ב. יהושע', 'דוד גרוסמן'], correctIndex: 0 },
  { topic: 'מוזיקה ותרבות', difficulty: 'hard', question: 'מי הלחין את היצירה המפורסמת "ארבע העונות"?', answers: ['אנטוניו ויוואלדי', 'יוהאן סבסטיאן באך', 'וולפגנג אמדאוס מוצרט', 'לודוויג ואן בטהובן'], correctIndex: 0 },
  { topic: 'מוזיקה ותרבות', difficulty: 'hard', question: 'איזה סרט ישראלי זכה בפרס אופיר וייצג את ישראל באוסקר בקטגוריית הסרט הזר עם הבמאי יוסף סידר ("בופור" / "הערת שוליים")?', answers: ['שניהם (בופור והערת שוליים)', 'רק בופור', 'רק הערת שוליים', 'אף אחד מהם'], correctIndex: 0 },

  // --- חגי ישראל ומסורת ---
  { topic: 'חגי ישראל ומסורת', difficulty: 'easy', question: 'כמה נרות בסך הכל מדליקים בחנוכייה בכל שמונת ימי חג החנוכה (כולל השמש)?', answers: ['44', '36', '40', '48'], correctIndex: 0 },
  { topic: 'חגי ישראל ומסורת', difficulty: 'easy', question: 'באיזה חג נוהגים לאכול מאכלי חלב ולקרוא את מגילת רות?', answers: ['שבועות', 'פורים', 'סוכות', 'ט"ו בשבט'], correctIndex: 0 },
  { topic: 'חגי ישראל ומסורת', difficulty: 'easy', question: 'כמה מינים נוטלים בחג הסוכות?', answers: ['ארבעה מינים', 'שלושה מינים', 'שבעה מינים', 'חמישה מינים'], correctIndex: 0 },
  { topic: 'חגי ישראל ומסורת', difficulty: 'medium', question: 'איזו מגילה קוראים בבית הכנסת בחג הפורים?', answers: ['מגילת אסתר', 'מגילת רות', 'מגילת קהלת', 'מגילת שיר השירים'], correctIndex: 0 },
  { topic: 'חגי ישראל ומסורת', difficulty: 'medium', question: 'כמה ימים נמשכת ספירת העומר מפסח ועד שבועות?', answers: ['49 ימים', '40 ימים', '50 ימים', '33 ימים'], correctIndex: 0 },
  { topic: 'חגי ישראל ומסורת', difficulty: 'medium', question: 'מהם ארבעת האותיות המופיעות על סביבון חנוכה בארץ ישראל?', answers: ['נ.ג.ה.פ (נס גדול היה פה)', 'נ.ג.ה.ש (נס גדול היה שם)', 'ח.נ.ו.כ', 'א.ב.ג.ד'], correctIndex: 0 },
  { topic: 'חגי ישראל ומסורת', difficulty: 'hard', question: 'באיזה תאריך עברי חל חג החנוכה?', answers: ['כ"ה בכסלו', 'י"ד באדר', 'ט"ו בשבט', 'ט"ו בניסן'], correctIndex: 0 },
  { topic: 'חגי ישראל ומסורת', difficulty: 'hard', question: 'כמה חומשים יש בתורה?', answers: ['5', '4', '6', '7'], correctIndex: 0 },
  { topic: 'חגי ישראל ומסורת', difficulty: 'hard', question: 'איזה מבין שבעת המינים שנשתבחה בהם ארץ ישראל אינו פרי עץ?', answers: ['חיטה ושעורה', 'תאנה ורימון', 'זית ותמר', 'גפן'], correctIndex: 0 },

  // --- אוכל וקולינריה ---
  { topic: 'אוכל וקולינריה', difficulty: 'easy', question: 'מאיזה צמח או קטנייה מכינים ממרח חומוס מסורתי?', answers: ['גרגירי חומוס וטחינה', 'עדשים כתומות', 'שעועית לבנה', 'פולי סויה'], correctIndex: 0 },
  { topic: 'אוכל וקולינריה', difficulty: 'easy', question: 'מאיזו מדינה הגיעה הפיצה המקורית (נפוליטנית)?', answers: ['איטליה', 'צרפת', 'יוון', 'ספרד'], correctIndex: 0 },
  { topic: 'אוכל וקולינריה', difficulty: 'medium', question: 'מאיזה חומר גלם מכינים טחינה גולמית?', answers: ['שומשום', 'בוטנים', 'גרעיני חמנייה', 'שקדים'], correctIndex: 0 },
  { topic: 'אוכל וקולינריה', difficulty: 'medium', question: 'מהו התבלין היקר ביותר בעולם לפי משקל?', answers: ['זעפרן', 'וניל', 'הל', 'קינמון'], correctIndex: 0 },
  { topic: 'אוכל וקולינריה', difficulty: 'hard', question: 'איזו עיר באיטליה נחשבת למולדת רוטב הבולונז (ראגו)?', answers: ['בולוניה', 'רומא', 'נאפולי', 'מילאנו'], correctIndex: 0 },

  // --- טכנולוגיה והמצאות ---
  { topic: 'טכנולוגיה והמצאות', difficulty: 'easy', question: 'מי נחשב לממציא נורת הליבון החשמלית המסחרית?', answers: ['תומאס אדיסון', 'אלכסנדר גרהם בל', 'ניקולה טסלה', 'אלברט איינשטיין'], correctIndex: 0 },
  { topic: 'טכנולוגיה והמצאות', difficulty: 'easy', question: 'איזו חברה פיתחה את מכשיר האייפון (iPhone)?', answers: ['אפל (Apple)', 'סמסונג (Samsung)', 'גוגל (Google)', 'מיקרוסופט (Microsoft)'], correctIndex: 0 },
  { topic: 'טכנולוגיה והמצאות', difficulty: 'medium', question: 'איזו אפליקציית ניווט ישראלית נמכרה לחברת גוגל בשנת 2013?', answers: ['Waze', 'Moovit', 'Gett', 'Mobileye'], correctIndex: 0 },
  { topic: 'טכנולוגיה והמצאות', difficulty: 'medium', question: 'מהי משמעות הקיצור CPU במחשב?', answers: ['יחידת עיבוד מרכזית', 'זיכרון גישה אקראית', 'כרטיס מסך גרפי', 'כונן אחסון קשיח'], correctIndex: 0 },
  { topic: 'טכנולוגיה והמצאות', difficulty: 'hard', question: 'באיזו שנה הושק האייפון הראשון על ידי סטיב ג׳ובס?', answers: ['2007', '2005', '2009', '2010'], correctIndex: 0 }
];

function normalizeBankQuestionEntry(rawItem, indexFallback = 1) {
  const question = String(rawItem?.question || '').trim();
  if (!question) return null;
  let answers = Array.isArray(rawItem?.answers)
    ? rawItem.answers.map((a) => String(a ?? '').trim())
    : [];
  if (answers.length < 4) {
    while (answers.length < 4) answers.push(`תשובה ${answers.length + 1}`);
  } else if (answers.length > 4) {
    answers = answers.slice(0, 4);
  }
  const idx = Number(rawItem?.correctIndex);
  const correctIndex = Number.isInteger(idx) && idx >= 0 && idx <= 3 ? idx : 0;
  const topic = String(rawItem?.topic || 'ידע כללי').trim() || 'ידע כללי';
  const rawDiff = String(rawItem?.difficulty || 'medium').toLowerCase();
  const difficulty = ['easy', 'medium', 'hard'].includes(rawDiff) ? rawDiff : 'medium';
  const id =
    typeof rawItem?.id === 'string' && rawItem.id.trim()
      ? rawItem.id.trim()
      : `qbank-${indexFallback}`;
  const isCustom = Boolean(rawItem?.isCustom);
  const questionEn = typeof rawItem?.questionEn === 'string' ? rawItem.questionEn.trim() : '';
  const answersEn =
    Array.isArray(rawItem?.answersEn) && rawItem.answersEn.length === 4
      ? rawItem.answersEn.map((a) => String(a ?? '').trim())
      : [];

  return {
    id,
    topic,
    difficulty,
    question,
    answers,
    correctIndex,
    ...(questionEn ? { questionEn } : {}),
    ...(answersEn.length === 4 && answersEn.every(Boolean) ? { answersEn } : {}),
    ...(isCustom ? { isCustom: true } : {})
  };
}

let persistentQuestionBank = [];
const BUILTIN_QUESTION_TEXTS_SET = new Set();

function normalizeQuestionKeyText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function savePersistentQuestionBank() {
  try {
    fs.writeFileSync(QUESTION_BANK_FILE, JSON.stringify(persistentQuestionBank, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save question-bank.json:', err.message);
  }
}

function loadOrInitializeQuestionBank() {
  const seenQuestions = new Set();
  const merged = [];

  // 0. Build the canonical set of all built-in questions so we can accurately identify user-written questions
  BUILTIN_QUESTION_TEXTS_SET.clear();
  const generated1000 = generateFullQuestionBank();
  for (const item of generated1000) {
    if (item && item.question) {
      BUILTIN_QUESTION_TEXTS_SET.add(normalizeQuestionKeyText(item.question));
    }
  }
  for (const item of BUILTIN_TRIVIA_BANK) {
    if (item && item.question) {
      BUILTIN_QUESTION_TEXTS_SET.add(normalizeQuestionKeyText(item.question));
    }
  }

  function pushUnique(rawItem) {
    const clean = normalizeBankQuestionEntry(rawItem, merged.length + 1);
    if (!clean) return false;
    const key = normalizeQuestionKeyText(clean.question);
    if (seenQuestions.has(key)) return false;
    seenQuestions.add(key);
    merged.push(clean);
    return true;
  }

  // 1. Load any existing custom or disk questions first so user-added questions take precedence
  try {
    if (fs.existsSync(QUESTION_BANK_FILE)) {
      const rawText = fs.readFileSync(QUESTION_BANK_FILE, 'utf8').replace(/^\uFEFF/, '');
      const parsed = JSON.parse(rawText);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.questions)
          ? parsed.questions
          : [];
      for (const item of arr) {
        pushUnique(item);
      }
    }
  } catch (err) {
    console.warn('Could not read existing question-bank.json, rebuilding:', err.message);
  }

  const initialCount = merged.length;

  // 2. Ensure all 1,000+ generated questions and built-in questions are present
  for (const item of generated1000) {
    pushUnique(item);
  }
  for (const item of BUILTIN_TRIVIA_BANK) {
    pushUnique(item);
  }

  persistentQuestionBank = merged;
  if (!fs.existsSync(QUESTION_BANK_FILE) || merged.length !== initialCount) {
    savePersistentQuestionBank();
  }
  return persistentQuestionBank;
}

loadOrInitializeQuestionBank();

function getQuestionBankCount() {
  return persistentQuestionBank.length;
}

function getPrivateQuestionBankCount() {
  return persistentQuestionBank.filter((q) => q.isCustom || q.topic === 'שאלות פרטיות').length;
}

function getQuestionBankTopicsSummary() {
  const counts = new Map();
  for (const q of persistentQuestionBank) {
    const t = q.topic || 'ידע כללי';
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

function addQuestionsToPersistentBank(rawItems, { markCustom = true, defaultTopic = 'שאלות פרטיות' } = {}) {
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];
  const seenQuestions = new Set(
    persistentQuestionBank.map((q) => normalizeQuestionKeyText(q.question))
  );
  const added = [];

  for (const raw of list) {
    const clean = normalizeBankQuestionEntry(
      {
        ...raw,
        topic: String(raw?.topic || defaultTopic || 'שאלות פרטיות').trim() || 'שאלות פרטיות',
        id: `qbank-custom-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        isCustom: Boolean(markCustom)
      },
      persistentQuestionBank.length + 1
    );
    if (!clean) continue;
    const key = normalizeQuestionKeyText(clean.question);
    if (seenQuestions.has(key)) continue;
    seenQuestions.add(key);
    persistentQuestionBank.unshift(clean);
    added.push(clean);
  }

  if (added.length > 0) {
    savePersistentQuestionBank();
  }
  return added;
}

function isPlaceholderQuestionEntry(q) {
  const qText = String(q?.question || '').trim();
  if (!qText || qText.length < 4) return true;
  if (qText.includes('שאלה חדשה – הקלידו כאן')) return true;
  const answers = Array.isArray(q?.answers) ? q.answers.map((a) => String(a ?? '').trim()) : [];
  if (answers.length < 4 || answers.some((a) => !a)) return true;
  // Check if all 4 answers are still default placeholders ("תשובה 1", "תשובה 2", ...)
  const allPlaceholderAnswers = answers.every((a, idx) => a === `תשובה ${idx + 1}` || a === `אפשרות ${idx + 1}`);
  if (allPlaceholderAnswers) return true;
  return false;
}

/**
 * Automatically saves any user-written (or user-modified) questions to the Private Question Bank (`מאגר שאלות פרטיות`).
 * Questions that belong unaltered to the 1,100+ built-in bank are skipped so only genuine user-written questions are added.
 */
function autoSyncUserWrittenQuestionsToPrivateBank(questionsList, fallbackTopic = 'שאלות פרטיות') {
  const list = Array.isArray(questionsList) ? questionsList : [questionsList];
  let addedCount = 0;
  let updatedCount = 0;

  for (const raw of list) {
    if (!raw || isPlaceholderQuestionEntry(raw)) continue;
    const qText = String(raw.question || '').trim();
    const key = normalizeQuestionKeyText(qText);
    const explicitlyUserWritten = Boolean(raw.isUserWritten || raw.isCustom || raw.isPrivate);

    // If this question is an unmodified built-in question and wasn't explicitly written by the user, skip it
    if (BUILTIN_QUESTION_TEXTS_SET.has(key) && !explicitlyUserWritten) {
      continue;
    }

    const answers = Array.isArray(raw.answers)
      ? raw.answers.slice(0, 4).map((a) => String(a ?? '').trim())
      : [];
    if (answers.length < 4 || answers.some((a) => !a)) continue;

    const correctIndex =
      Number.isInteger(Number(raw.correctIndex)) &&
      Number(raw.correctIndex) >= 0 &&
      Number(raw.correctIndex) <= 3
        ? Number(raw.correctIndex)
        : 0;

    const existingIdx = persistentQuestionBank.findIndex(
      (item) => normalizeQuestionKeyText(item.question) === key
    );

    if (existingIdx !== -1) {
      const existing = persistentQuestionBank[existingIdx];
      if (existing.isCustom || explicitlyUserWritten) {
        const answersChanged =
          existing.correctIndex !== correctIndex ||
          existing.answers.some((a, i) => a !== answers[i]);
        if (answersChanged || !existing.isCustom) {
          persistentQuestionBank[existingIdx] = {
            ...existing,
            answers,
            correctIndex,
            isCustom: true,
            topic: existing.topic || fallbackTopic || 'שאלות פרטיות'
          };
          updatedCount++;
        }
      }
    } else {
      const cleanEntry = normalizeBankQuestionEntry(
        {
          id: `qbank-private-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          topic: String(raw.topic || raw._topic || fallbackTopic || 'שאלות פרטיות').trim() || 'שאלות פרטיות',
          difficulty: String(raw.difficulty || 'medium').toLowerCase(),
          question: qText,
          answers,
          correctIndex,
          isCustom: true
        },
        persistentQuestionBank.length + 1
      );
      if (cleanEntry) {
        persistentQuestionBank.unshift(cleanEntry);
        addedCount++;
      }
    }
  }

  if (addedCount > 0 || updatedCount > 0) {
    savePersistentQuestionBank();
  }

  return { addedCount, updatedCount, totalPrivateCount: getPrivateQuestionBankCount() };
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shuffleQuestionAnswers(qObj, defaultTimer, defaultPoints) {
  const answers = Array.isArray(qObj.answers) ? qObj.answers.slice(0, 4).map(String) : [];
  while (answers.length < 4) answers.push(`תשובה ${answers.length + 1}`);
  const hasAnswersEn =
    Array.isArray(qObj.answersEn) && qObj.answersEn.length === 4 && qObj.answersEn.every(Boolean);
  const answersEn = hasAnswersEn ? qObj.answersEn.slice(0, 4).map(String) : null;

  const origCorrectIdx =
    Number.isInteger(Number(qObj.correctIndex)) &&
    Number(qObj.correctIndex) >= 0 &&
    Number(qObj.correctIndex) <= 3
      ? Number(qObj.correctIndex)
      : 0;

  const indexed = answers.map((text, idx) => ({
    text,
    textEn: answersEn ? answersEn[idx] : '',
    isCorrect: idx === origCorrectIdx
  }));
  const shuffled = shuffleArray(indexed);
  const newCorrectIdx = Math.max(
    0,
    shuffled.findIndex((item) => item.isCorrect)
  );

  return normalizeQuestion(
    {
      question: qObj.question,
      answers: shuffled.map((item) => item.text),
      correctIndex: newCorrectIdx,
      ...(qObj.questionEn ? { questionEn: qObj.questionEn } : {}),
      ...(answersEn ? { answersEn: shuffled.map((item) => item.textEn) } : {}),
      image: qObj.image || '',
      points: Number(qObj.points) >= 1 ? Number(qObj.points) : defaultPoints,
      timerSeconds: Number(qObj.timerSeconds) >= 5 ? Number(qObj.timerSeconds) : defaultTimer
    },
    defaultTimer
  );
}

function matchBuiltInTopic(rawTopic) {
  const t = String(rawTopic || '').trim().toLowerCase();
  if (!t) return null;
  if (t === '__private_bank__' || t.includes('שאלות פרטיות') || t.includes('מאגר פרטי')) {
    return '__PRIVATE_BANK__';
  }
  // 1. Exact match against any topic in persistentQuestionBank first
  for (const q of persistentQuestionBank) {
    if (String(q.topic || '').toLowerCase() === t) {
      return q.topic;
    }
  }
  // 2. Check Israeli Cinema & Television BEFORE generic 'ישראל' so "קולנוע ישראלי" or "סרטים ישראלים" matches 'קולנוע ישראלי'!
  if (
    t.includes('קולנוע') ||
    t.includes('סרט') ||
    t.includes('במאי') ||
    t.includes('שחקן') ||
    t.includes('שחקנ') ||
    t.includes('אופיר') ||
    t.includes('בורקס') ||
    t.includes('גשש') ||
    t.includes('טלוויזיה') ||
    t.includes('סדרה') ||
    t.includes('סדרות')
  ) {
    return 'קולנוע ישראלי';
  }
  if (t.includes('תנ"ך') || t.includes('תנך') || t.includes('מקרא') || t.includes('מורשת')) return 'תנ"ך ומורשת';
  if (t.includes('עברית') || t.includes('לשון') || t.includes('שפה') || t.includes('ניב') || t.includes('פתגם')) return 'השפה העברית';
  if (t.includes('חלל') || t.includes('אסטרונומ') || t.includes('כוכב') || t.includes('גלקסי') || t.includes('מאדים')) return 'חלל ואסטרונומיה';
  if (t.includes('מדע') || t.includes('טבע') || t.includes('חיות') || t.includes('בעלי חיים') || t.includes('ביולוג') || t.includes('פיזיק') || t.includes('כימי')) return 'מדע וטבע';
  if (t.includes('ספורט') || t.includes('כדורגל') || t.includes('כדורסל') || t.includes('אולימפ') || t.includes('מונדיאל')) return 'ספורט וכדורגל';
  if (t.includes('מוזיק') || t.includes('תרבות') || t.includes('שיר') || t.includes('זמר') || t.includes('להק') || t.includes('אירוויזיון') || t.includes('ספרות') || t.includes('אמנות')) return 'תרבות, קולנוע ומוזיקה';
  if (t.includes('חג') || t.includes('מסורת') || t.includes('יהדות') || t.includes('חנוכ') || t.includes('פסח') || t.includes('פורים') || t.includes('סוכות') || t.includes('שבועות')) return 'חגי ישראל ומסורת';
  if (t.includes('אוכל') || t.includes('קולינר') || t.includes('מטבח') || t.includes('בישול') || t.includes('מאכל') || t.includes('מסעד')) return 'אוכל וקולינריה';
  if (t.includes('טכנולוג') || t.includes('מחשב') || t.includes('המצא') || t.includes('הייטק') || t.includes('אינטרנט') || t.includes('סמארטפון')) return 'טכנולוגיה והמצאות';
  if (t.includes('גיאוגרפ') || t.includes('גאוגרפ') || t.includes('עולם') || t.includes('מדינ') || t.includes('בירות') || t.includes('יבשת')) return 'גיאוגרפיה ועולם';
  if (t.includes('היסטור') || t.includes('ציונ') || t.includes('מלחמת') || t.includes('ראש ממשלה') || t.includes('ישראל')) return 'היסטוריה של ישראל';
  if (t.includes('כללי')) return 'ידע כללי';
  return null;
}

const HEBREW_SEARCH_STOPWORDS = new Set([
  'אני', 'רוצה', 'מבקש', 'מבקשת', 'תעשה', 'תעשו', 'תכין', 'תכינו', 'תיצור', 'לי', 'לנו',
  'שאלות', 'שאלה', 'שאלון', 'טריוויה', 'חידון', 'משחק', 'בנושא', 'בנושאים', 'נושא', 'על',
  'של', 'עם', 'מתוך', 'בבקשה', 'רק', 'הרבה', 'קצת', 'קשות', 'קלות', 'בינוניות', 'רמה',
  'רמת', 'קושי', 'קשה', 'קל', 'קלה', 'בינוני', 'בינונית', 'מעורב', 'מעורבת', 'אמריקאיות'
]);

function extractHebrewSearchKeywords(rawText) {
  const cleaned = String(rawText || '')
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9\s"]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !HEBREW_SEARCH_STOPWORDS.has(w));

  const keywords = new Set();
  for (const word of cleaned) {
    keywords.add(word);
    // Strip common Hebrew single-letter prefixes (ה, ו, ב, ל, מ, כ, ש) if root >= 3 chars
    if (word.length >= 4 && /^[הובלמכש]/.test(word)) {
      const stripped = word.slice(1);
      if (!HEBREW_SEARCH_STOPWORDS.has(stripped)) {
        keywords.add(stripped);
      }
    }
    // Strip plural suffixes (ים / ות) if root >= 3 chars
    if (word.length >= 5 && (word.endsWith('ים') || word.endsWith('ות'))) {
      keywords.add(word.slice(0, -2));
    }
  }
  return Array.from(keywords);
}

function generateQuestionsFromBuiltInBank({
  mode = 'random',
  topics = [],
  selectedTopics = [],
  privateOnly = false,
  randomCount = 10,
  difficulty = 'mixed',
  defaultTimer = DEFAULT_TIMER_SECONDS,
  defaultPoints = DEFAULT_POINTS
}) {
  const fullBankPool =
    Array.isArray(persistentQuestionBank) && persistentQuestionBank.length > 0
      ? persistentQuestionBank
      : BUILTIN_TRIVIA_BANK;
  const privatePool = fullBankPool.filter((q) => q.isCustom || q.topic === 'שאלות פרטיות');
  const bankPool =
    privateOnly && privatePool.length > 0 ? privatePool : fullBankPool;

  const usedQuestions = new Set();
  const result = [];

  function pickFromPool(pool, count, fallbackTopicLabel = '', strictPoolFallback = null, allowGlobalFallback = true) {
    const picked = [];
    const shuffledPool = shuffleArray(pool);
    for (const item of shuffledPool) {
      if (picked.length >= count) break;
      if (usedQuestions.has(item.question)) continue;
      usedQuestions.add(item.question);
      const qNorm = shuffleQuestionAnswers(item, defaultTimer, defaultPoints);
      qNorm._topic = fallbackTopicLabel || item.topic || 'ידע כללי';
      picked.push(qNorm);
    }

    if (picked.length < count && Array.isArray(strictPoolFallback) && strictPoolFallback.length > 0) {
      const remainingTopicPool = shuffleArray(strictPoolFallback);
      for (const item of remainingTopicPool) {
        if (picked.length >= count) break;
        if (usedQuestions.has(item.question)) continue;
        usedQuestions.add(item.question);
        const qNorm = shuffleQuestionAnswers(item, defaultTimer, defaultPoints);
        qNorm._topic = fallbackTopicLabel || item.topic || 'ידע כללי';
        picked.push(qNorm);
      }
    }

    if (picked.length < count && allowGlobalFallback) {
      const remainingAll = shuffleArray(bankPool);
      for (const item of remainingAll) {
        if (picked.length >= count) break;
        if (usedQuestions.has(item.question)) continue;
        usedQuestions.add(item.question);
        const qNorm = shuffleQuestionAnswers(item, defaultTimer, defaultPoints);
        qNorm._topic = fallbackTopicLabel || item.topic || 'ידע כללי';
        picked.push(qNorm);
      }
    }
    return picked;
  }

  // Filter by multiple selected existing topics from the bank (Option ד)
  const cleanSelectedTopics = Array.isArray(selectedTopics)
    ? selectedTopics.map((t) => String(t || '').trim()).filter((t) => t && t !== 'all')
    : [];
  if (cleanSelectedTopics.length > 0) {
    const wantsPrivateBank = cleanSelectedTopics.includes('__PRIVATE_BANK__');
    const topicSet = new Set(cleanSelectedTopics.filter((t) => t !== '__PRIVATE_BANK__'));
    let topicFilteredPool = fullBankPool.filter(
      (q) =>
        topicSet.has(q.topic) ||
        (wantsPrivateBank && (q.isCustom || q.topic === 'שאלות פרטיות'))
    );
    if (topicFilteredPool.length === 0) topicFilteredPool = bankPool;
    const diff = String(difficulty || 'mixed').toLowerCase();
    let prioritizedPool = topicFilteredPool;
    if (diff === 'easy' || diff === 'medium' || diff === 'hard') {
      const diffMatches = topicFilteredPool.filter((q) => q.difficulty === diff);
      if (diffMatches.length > 0) {
        prioritizedPool = diffMatches;
      }
    }
    const totalWanted = Math.max(1, Math.min(1500, Math.round(Number(randomCount) || 10)));
    return pickFromPool(prioritizedPool, totalWanted, '', topicFilteredPool, false);
  }

  if (mode === 'topics' && Array.isArray(topics) && topics.length > 0) {
    for (const reqRow of topics) {
      const rawTopic = String(reqRow?.topic || 'ידע כללי').trim();
      const count = Math.max(1, Math.min(1500, Math.round(Number(reqRow?.count) || 3)));
      const diff = String(reqRow?.difficulty || difficulty || 'mixed').toLowerCase();
      const matchedCategory = matchBuiltInTopic(rawTopic);
      const searchKeywords = extractHebrewSearchKeywords(rawTopic);

      let topicPool = [];
      if (matchedCategory === '__PRIVATE_BANK__') {
        topicPool = privatePool;
      } else {
        topicPool = bankPool.filter((q) => q.topic === rawTopic);
      }

      if (topicPool.length === 0 && matchedCategory) {
        topicPool = bankPool.filter((q) => {
          if (q.topic === matchedCategory) return true;
          if (matchedCategory === 'קולנוע ישראלי') {
            return (
              q.topic === 'קולנוע ישראלי' ||
              ((q.topic === 'תרבות, קולנוע ומוזיקה' || q.topic === 'מוזיקה ותרבות') &&
                /(?:סרט|קולנוע|במאי|שחקן|שחקנית|אופיר|אוסקר|סלאח|גבעת חלפון|השוטר אזולאי|סדרה|טלוויזיה)/.test(
                  `${q.question} ${(q.answers || []).join(' ')}`
                ))
            );
          }
          if (matchedCategory === 'ספורט וכדורגל' && q.topic === 'ספורט') return true;
          if (matchedCategory === 'תרבות, קולנוע ומוזיקה' && (q.topic === 'מוזיקה ותרבות' || q.topic === 'קולנוע ישראלי')) return true;
          return false;
        });
      }

      // Also score questions across the bank by keyword match against the user's free text
      if (searchKeywords.length > 0) {
        const scoredMatches = [];
        const baseCandidates = topicPool.length > 0 ? topicPool : bankPool;
        for (const q of baseCandidates) {
          const hay = `${q.topic || ''} ${q.question || ''} ${(q.answers || []).join(' ')}`.toLowerCase();
          let score = 0;
          for (const kw of searchKeywords) {
            if (hay.includes(kw)) score++;
          }
          if (score > 0) {
            scoredMatches.push({ q, score });
          }
        }
        if (scoredMatches.length > 0 && topicPool.length === 0) {
          scoredMatches.sort((a, b) => b.score - a.score);
          topicPool = scoredMatches.map((item) => item.q);
        }
      }

      if (topicPool.length === 0) {
        topicPool = bankPool;
      }

      let pool = topicPool;
      if (diff === 'easy' || diff === 'medium' || diff === 'hard') {
        const diffFiltered = topicPool.filter((q) => q.difficulty === diff);
        if (diffFiltered.length > 0) {
          pool = diffFiltered;
        }
      }

      const rowQuestions = pickFromPool(
        pool,
        count,
        matchedCategory && matchedCategory !== '__PRIVATE_BANK__' ? matchedCategory : rawTopic,
        topicPool,
        topicPool.length < count
      );
      rowQuestions.forEach((rq) => {
        rq._topic = matchedCategory && matchedCategory !== '__PRIVATE_BANK__' ? matchedCategory : rawTopic;
      });
      result.push(...rowQuestions);
    }
    return result;
  }

  const totalRandom = Math.max(1, Math.min(1500, Math.round(Number(randomCount) || 10)));
  const cleanDiff = String(difficulty || 'mixed').toLowerCase();
  let randomPool = bankPool;
  if (cleanDiff === 'easy' || cleanDiff === 'medium' || cleanDiff === 'hard') {
    const diffFiltered = bankPool.filter((q) => q.difficulty === cleanDiff);
    if (diffFiltered.length > 0) {
      randomPool = diffFiltered;
    }
  }
  return pickFromPool(randomPool, totalRandom, '', bankPool, !privateOnly);
}

function getEffectiveGeminiApiKey(overrideKey = '') {
  const trimmedOverride = String(overrideKey || '').trim();
  if (trimmedOverride) return trimmedOverride;
  if (store.geminiApiKey) return store.geminiApiKey;
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

async function generateQuestionsViaGeminiAI({
  mode = 'random',
  topics = [],
  randomCount = 10,
  customInstructions = '',
  defaultTimer = DEFAULT_TIMER_SECONDS,
  defaultPoints = DEFAULT_POINTS,
  apiKey = ''
}) {
  const effectiveKey = getEffectiveGeminiApiKey(apiKey);
  if (!effectiveKey) {
    return null;
  }

  const diffLabels = {
    easy: 'קלה (מתאימה לכל המשפחה וילדים)',
    medium: 'בינונית (מאתגרת ומעניינת)',
    hard: 'קשה (למומחים וחובבי טריוויה)',
    mixed: 'מעורבת (שילוב של שאלות קלות, בינוניות וקשות)'
  };

  let promptInstruction = '';
  if (mode === 'topics' && Array.isArray(topics) && topics.length > 0) {
    const lines = topics.map((t, idx) => {
      const topicName = String(t?.topic || 'ידע כללי').trim();
      const count = Math.max(1, Math.min(50, Math.round(Number(t?.count) || 3)));
      const diffKey = String(t?.difficulty || 'mixed').toLowerCase();
      const diffDesc = diffLabels[diffKey] || diffLabels.mixed;
      return `${idx + 1}. נושא מבוקש: "${topicName}" — בדיוק ${count} שאלות טריוויה בנושא זה בלבד, ברמת קושי: ${diffDesc}.`;
    });
    promptInstruction = `צור שאלות טריוויה אמריקאיות מקוריות, מדויקות ומרתקות בעברית תקנית אך ורק על הנושא המבוקש:\n${lines.join('\n')}`;
  } else {
    const count = Math.max(1, Math.min(50, Math.round(Number(randomCount) || 10)));
    promptInstruction = `צור בדיוק ${count} שאלות טריוויה אמריקאיות מגוונות, מהנות ומפתיעות בעברית תקנית במגוון נושאים אקראיים (ידע כללי, ישראל, מדע, תרבות, היסטוריה, ספורט, טבע ואוכל) ברמת קושי מעורבת.`;
  }

  const cleanCustomInstructions = String(customInstructions || '').trim();
  const customSection = cleanCustomInstructions
    ? `\nהנחיות מפורטות ומיוחדות מהמנחה (יש לפעול לפיהן בעדיפות עליונה):\n"${cleanCustomInstructions}"\n`
    : '';

  const fullPrompt = `${promptInstruction}${customSection}
כל שאלה חייבת להכיל:
- question: נוסח השאלה בעברית ברורה.
- answers: מערך של בדיוק 4 תשובות אפשריות בעברית (רק אחת מהן נכונה).
- correctIndex: מספר שלם בין 0 ל-3 המציין את מיקום התשובה הנכונה במערך answers (פזר את מיקום התשובה הנכונה באופן אקראי בין 0, 1, 2, 3).
החזר אובייקט JSON בלבד במבנה: { "questions": [ { "question": "...", "answers": ["...", "...", "...", "..."], "correctIndex": 0 } ] }`;

  const schema = {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answers: {
              type: 'array',
              items: { type: 'string' }
            },
            correctIndex: { type: 'integer' }
          },
          required: ['question', 'answers', 'correctIndex']
        }
      }
    },
    required: ['questions']
  };

  function parseGeminiQuestionsArray(rawJsonText) {
    if (!rawJsonText) return null;
    const cleaned = String(rawJsonText)
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr
      .map((q) => shuffleQuestionAnswers(q, defaultTimer, defaultPoints))
      .filter((q) => q.question.length > 0 && q.answers.every((a) => a.length > 0));
  }

  // Try standard Google AI Studio generateContent endpoints (gemini-2.5-flash, gemini-2.0-flash) and interactions
  const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError = null;

  for (const modelName of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(effectiveKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: schema,
              temperature: 0.7
            }
          }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini ${modelName} status ${response.status}`);
      }

      const data = await response.json();
      const textCandidate =
        data?.candidates?.[0]?.content?.parts?.find((p) => typeof p?.text === 'string')?.text || '';
      const validQuestions = parseGeminiQuestionsArray(textCandidate);
      if (validQuestions && validQuestions.length > 0) {
        return validQuestions;
      }
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Fallback to v1beta/interactions
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(effectiveKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Revision': '2026-05-20'
        },
        body: JSON.stringify({
          model: 'gemini-3.8-flash',
          input: fullPrompt,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema
          }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API status ${response.status}`);
    }

    const data = await response.json();
    let jsonText = data?.output_text || '';
    if (!jsonText && Array.isArray(data?.steps)) {
      for (let i = data.steps.length - 1; i >= 0; i--) {
        const step = data.steps[i];
        if (step?.type === 'model_output' && Array.isArray(step.content)) {
          const textPart = step.content.find((c) => c.type === 'text' && c.text);
          if (textPart) {
            jsonText = textPart.text;
            break;
          }
        }
      }
    }

    const validQuestions = parseGeminiQuestionsArray(jsonText);
    if (!validQuestions || validQuestions.length === 0) {
      throw lastError || new Error('No questions array in Gemini response');
    }
    return validQuestions;
  } finally {
    clearTimeout(timeoutId);
  }
}

// -------------------- Word (.docx / .doc), PDF (.pdf) & Free-Text Questions Extractor --------------------

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function extractTextFromDocxBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30) return '';
  let xmlContent = '';

  // Try Central Directory (handles streaming data descriptors where local header sizes are 0)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const cdEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    let ptr = cdOffset;
    for (let e = 0; e < cdEntries && ptr + 46 <= buf.length; e++) {
      if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
      const compressionMethod = buf.readUInt16LE(ptr + 10);
      const compressedSize = buf.readUInt32LE(ptr + 20);
      const fileNameLen = buf.readUInt16LE(ptr + 28);
      const extraLen = buf.readUInt16LE(ptr + 30);
      const commentLen = buf.readUInt16LE(ptr + 32);
      const localHeaderOffset = buf.readUInt32LE(ptr + 42);
      const entryName = buf.subarray(ptr + 46, ptr + 46 + fileNameLen).toString('utf8');

      if (entryName === 'word/document.xml' && localHeaderOffset + 30 <= buf.length) {
        const lhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
        const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
        const rawSlice = buf.subarray(dataStart, dataStart + compressedSize);
        try {
          if (compressionMethod === 0) {
            xmlContent = rawSlice.toString('utf8');
          } else if (compressionMethod === 8) {
            xmlContent = zlib.inflateRawSync(rawSlice).toString('utf8');
          }
        } catch {
          // fallback below
        }
        break;
      }
      ptr += 46 + fileNameLen + extraLen + commentLen;
    }
  }

  // Fallback: scan local file headers directly
  if (!xmlContent) {
    let offset = 0;
    while (offset + 30 <= buf.length) {
      if (buf.readUInt32LE(offset) !== 0x04034b50) {
        offset++;
        continue;
      }
      const method = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
      const dataStart = offset + 30 + nameLen + extraLen;

      if (name === 'word/document.xml' && compSize > 0 && dataStart + compSize <= buf.length) {
        const rawSlice = buf.subarray(dataStart, dataStart + compSize);
        try {
          xmlContent =
            method === 0
              ? rawSlice.toString('utf8')
              : zlib.inflateRawSync(rawSlice).toString('utf8');
        } catch {
          // ignore
        }
        break;
      }
      offset = compSize > 0 ? dataStart + compSize : dataStart + 1;
    }
  }

  if (!xmlContent) return '';

  const textWithBreaks = xmlContent
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<\/w:tr>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeXmlEntities(textWithBreaks)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function decodePdfLiteralString(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && i + 1 < str.length) {
      const next = str[++i];
      if (next === 'n') out += '\n';
      else if (next === 'r') out += '\r';
      else if (next === 't') out += '\t';
      else if (next >= '0' && next <= '7') {
        let oct = next;
        if (i + 1 < str.length && str[i + 1] >= '0' && str[i + 1] <= '7') oct += str[++i];
        if (i + 1 < str.length && str[i + 1] >= '0' && str[i + 1] <= '7') oct += str[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else {
        out += next;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function decodePdfHexString(hexStr) {
  const clean = hexStr.replace(/\s+/g, '');
  if (!clean) return '';
  const bytes = Buffer.from(clean.length % 2 === 0 ? clean : `${clean}0`, 'hex');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let u16 = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      u16 += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return u16;
  }
  if (bytes.length >= 2 && bytes.every((b, idx) => (idx % 2 === 0 ? b === 0x05 || b === 0x00 : true))) {
    let u16 = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code >= 0x20) u16 += String.fromCharCode(code);
    }
    if (u16.trim()) return u16;
  }
  return bytes.toString('utf8');
}

function extractTextFromPdfBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return '';
  const rawLatin = buf.toString('latin1');
  const chunks = [];

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRegex.exec(rawLatin)) !== null) {
    const startIdx = match.index + match[0].indexOf('\n') + 1;
    const endIdx = match.index + match[0].lastIndexOf('endstream');
    let slice = buf.subarray(startIdx, endIdx);
    if (slice.length > 0 && slice[slice.length - 1] === 0x0a) slice = slice.subarray(0, slice.length - 1);
    if (slice.length > 0 && slice[slice.length - 1] === 0x0d) slice = slice.subarray(0, slice.length - 1);

    let decodedStream = '';
    try {
      decodedStream = zlib.inflateSync(slice).toString('latin1');
    } catch {
      try {
        decodedStream = zlib.inflateRawSync(slice).toString('latin1');
      } catch {
        decodedStream = slice.toString('latin1');
      }
    }

    if (!decodedStream) continue;

    const btEtRegex = /BT([\s\S]*?)ET/g;
    let btMatch;
    while ((btMatch = btEtRegex.exec(decodedStream)) !== null) {
      const block = btMatch[1];
      const lineParts = [];
      const tokenRegex = /\((?:\\.|[^\\()])*\)|<([0-9a-fA-F\s]+)>|\b(?:Td|TD|T\*|ET)\b/g;
      let tok;
      while ((tok = tokenRegex.exec(block)) !== null) {
        const full = tok[0];
        if (full === 'Td' || full === 'TD' || full === 'T*') {
          lineParts.push('\n');
        } else if (full.startsWith('(') && full.endsWith(')')) {
          const lit = decodePdfLiteralString(full.slice(1, -1));
          const utf8Attempt = Buffer.from(lit, 'latin1').toString('utf8');
          lineParts.push(utf8Attempt);
        } else if (tok[1]) {
          lineParts.push(decodePdfHexString(tok[1]));
        }
      }
      const joined = lineParts.join('').trim();
      if (joined) chunks.push(joined);
    }
  }

  const combined = chunks
    .join('\n')
    .replace(/\x00/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && /[א-תa-zA-Z0-9]/.test(l))
    .join('\n');

  return combined;
}

function extractTextFromUploadedDocument({ fileName = '', mimeType = '', buffer }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return '';
  const lowerName = String(fileName || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();

  if (
    lowerName.endsWith('.docx') ||
    lowerMime.includes('officedocument.wordprocessingml.document') ||
    (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50)
  ) {
    const docxText = extractTextFromDocxBuffer(buffer);
    if (docxText) return docxText;
  }

  if (
    lowerName.endsWith('.pdf') ||
    lowerMime.includes('application/pdf') ||
    buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return extractTextFromPdfBuffer(buffer);
  }

  // Plain text / .doc / .rtf fallback
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  const utf8Text = buffer.toString('utf8');
  if (/[א-תa-zA-Z0-9]{2,}/.test(utf8Text) && !utf8Text.includes('\ufffd\ufffd\ufffd')) {
    return utf8Text;
  }
  return buffer.toString('utf16le');
}

function generateSmartDistractors(questionText, correctAnswer, otherAnswersInDoc = []) {
  const cleanCorrect = String(correctAnswer || '').trim();
  const distractors = [];
  const used = new Set([cleanCorrect.toLowerCase()]);

  function addCandidate(cand) {
    const c = String(cand || '').trim();
    if (!c || used.has(c.toLowerCase()) || distractors.length >= 3) return;
    used.add(c.toLowerCase());
    distractors.push(c);
  }

  // 1. If the correct answer is a number or year, generate plausible numeric distractors
  if (/^\d{1,6}$/.test(cleanCorrect)) {
    const num = parseInt(cleanCorrect, 10);
    if (num >= 1800 && num <= 2100) {
      for (const delta of [-3, 2, -7, 5, -1, 4, -10]) {
        addCandidate(String(num + delta));
      }
    } else {
      const offsets = num <= 10 ? [1, -1, 2, 3, -2, 4] : [Math.max(1, Math.round(num * 0.15)), -Math.max(1, Math.round(num * 0.12)), Math.max(2, Math.round(num * 0.28)), 5, -5];
      for (const delta of offsets) {
        if (num + delta > 0) addCandidate(String(num + delta));
      }
    }
  }

  // 2. Pull other distinct answers from the same document (similar length/style)
  for (const other of shuffleArray(otherAnswersInDoc)) {
    if (distractors.length >= 3) break;
    addCandidate(other);
  }

  // 3. Pull plausible answers from matching category in built-in bank
  const matchedTopic = matchBuiltInTopic(questionText);
  const bankPool = matchedTopic
    ? BUILTIN_TRIVIA_BANK.filter((q) => q.topic === matchedTopic)
    : BUILTIN_TRIVIA_BANK;
  for (const item of shuffleArray(bankPool)) {
    if (distractors.length >= 3) break;
    for (const ans of item.answers) {
      addCandidate(ans);
    }
  }

  while (distractors.length < 3) {
    addCandidate(`אפשרות ${distractors.length + 2}`);
  }
  return distractors.slice(0, 3);
}

function parseFreeformQuestionsText(rawText, defaultTimer = DEFAULT_TIMER_SECONDS, defaultPoints = DEFAULT_POINTS) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  // 1. Check if text is already JSON
  try {
    const cleanedJson = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    if (cleanedJson.startsWith('[') || cleanedJson.startsWith('{')) {
      const parsed = JSON.parse(cleanedJson);
      const arr = Array.isArray(parsed) ? parsed : parsed?.questions;
      if (Array.isArray(arr) && arr.length > 0) {
        return arr
          .map((q) => shuffleQuestionAnswers(q, defaultTimer, defaultPoints))
          .filter((q) => q.question.length > 0);
      }
    }
  } catch {
    // Not JSON, proceed with free-form parsing
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  const rawItems = []; // { question: string, options: [{ text, isCorrect }] }

  const isAnswerPrefix = (line) => /^(?:תשובה(?:\s+נכונה)?|ת|answer|ans|a)\s*[:\-–]\s*/i.test(line);
  const stripAnswerPrefix = (line) =>
    line.replace(/^(?:תשובה(?:\s+נכונה)?|ת|answer|ans|a)\s*[:\-–]\s*/i, '').trim();

  const isQuestionPrefix = (line) => /^(?:שאלה\s*\d*|ש\s*\d*|question\s*\d*|q\s*\d*)\s*[:.\-–)]\s*/i.test(line);
  const stripQuestionPrefix = (line) =>
    line
      .replace(/^(?:שאלה\s*\d*|ש\s*\d*|question\s*\d*|q\s*\d*)\s*[:.\-–)]\s*/i, '')
      .replace(/^\d{1,3}\s*[.):\-–]\s*/, '')
      .trim();

  const isOptionPrefix = (line) => /^(?:[א-ד]|[a-dA-D]|[1-4])\s*[.):\-–]\s+/.test(line);

  function extractInlineOptions(str) {
    // Check if a single line has multiple inline options like: א) ... ב) ... ג) ... ד) ...
    const parts = str.split(/(?=(?:^|\s)(?:[א-ד]|[a-dA-D])\s*[.):\-–]\s+)/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts.map((p) => {
        const hasStar = /[*✓✔]|(?:\(\s*נכון\s*\))|(?:\[\s*נכון\s*\])/.test(p);
        const clean = p
          .replace(/^(?:[א-ד]|[a-dA-D])\s*[.):\-–]\s+/, '')
          .replace(/[*✓✔]|(?:\(\s*נכון\s*\))|(?:\[\s*נכון\s*\])/g, '')
          .trim();
        return { text: clean, isCorrect: hasStar };
      });
    }
    return null;
  }

  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if a single line contains BOTH question and answer: e.g. "מהי בירת ישראל? ירושלים" or "שאלה: ... תשובה: ..."
    const inlineQaLabelMatch = line.match(/^(.*?)\s+(?:תשובה(?:\s+נכונה)?|ת|answer)\s*[:\-–]\s*(.+)$/i);
    if (inlineQaLabelMatch) {
      if (current && current.question && current.options.length > 0) rawItems.push(current);
      const qPart = stripQuestionPrefix(inlineQaLabelMatch[1]);
      const aPart = inlineQaLabelMatch[2].trim();
      rawItems.push({
        question: qPart.endsWith('?') ? qPart : `${qPart}?`,
        options: [{ text: aPart, isCorrect: true }]
      });
      current = null;
      continue;
    }

    const qMarkSplit = line.match(/^([^?]+\?)\s+(.+)$/);
    if (qMarkSplit && !isOptionPrefix(line) && !isAnswerPrefix(line)) {
      const qPart = stripQuestionPrefix(qMarkSplit[1]);
      const restPart = qMarkSplit[2].trim();
      const inlineOpts = extractInlineOptions(restPart);
      if (current && current.question && current.options.length > 0) rawItems.push(current);
      if (inlineOpts && inlineOpts.length >= 2) {
        if (!inlineOpts.some((o) => o.isCorrect)) inlineOpts[0].isCorrect = true;
        rawItems.push({ question: qPart, options: inlineOpts });
      } else {
        rawItems.push({
          question: qPart,
          options: [{ text: stripAnswerPrefix(restPart), isCorrect: true }]
        });
      }
      current = null;
      continue;
    }

    // Check if line is an explicit question or ends with '?' or starts with "1. " when not inside options
    const looksLikeQuestion =
      isQuestionPrefix(line) ||
      line.endsWith('?') ||
      line.endsWith('؟') ||
      (/^\d{1,3}\s*[.):\-–]\s+/.test(line) && (!current || current.options.length > 0));

    if (looksLikeQuestion && !isAnswerPrefix(line) && !isOptionPrefix(line)) {
      if (current && current.question && current.options.length > 0) {
        rawItems.push(current);
      }
      // Also check if question has " - תשובה" on the same line without '?'
      const dashSplit = stripQuestionPrefix(line).match(/^(.{6,}?)\s+[–—\-|]\s+(.+)$/);
      if (dashSplit && !line.endsWith('?')) {
        rawItems.push({
          question: dashSplit[1].trim().endsWith('?') ? dashSplit[1].trim() : `${dashSplit[1].trim()}?`,
          options: [{ text: stripAnswerPrefix(dashSplit[2]), isCorrect: true }]
        });
        current = null;
      } else {
        current = {
          question: stripQuestionPrefix(line),
          options: []
        };
      }
      continue;
    }

    // If we have a current question, collect answers/options for it
    if (current) {
      if (isAnswerPrefix(line)) {
        const ansVal = stripAnswerPrefix(line);
        // Check if ansVal refers to an option letter like "א" or "ב"
        const letterMap = { א: 0, ב: 1, ג: 2, ד: 3, a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        const letterKey = ansVal.replace(/[.):\-–]/g, '').trim().toLowerCase();
        if (current.options.length >= 2 && letterKey in letterMap) {
          const targetIdx = letterMap[letterKey];
          current.options.forEach((o, idx) => {
            o.isCorrect = idx === targetIdx;
          });
        } else if (ansVal) {
          const existing = current.options.find((o) => o.text === ansVal);
          if (existing) {
            current.options.forEach((o) => {
              o.isCorrect = o === existing;
            });
          } else {
            current.options.unshift({ text: ansVal, isCorrect: true });
          }
        }
        rawItems.push(current);
        current = null;
        continue;
      }

      const inlineOpts = extractInlineOptions(line);
      if (inlineOpts && inlineOpts.length >= 2) {
        current.options.push(...inlineOpts);
        continue;
      }

      const hasCorrectMark = /[*✓✔]|(?:\(\s*נכון\s*\))|(?:\[\s*נכון\s*\])/.test(line);
      const cleanOpt = line
        .replace(/^(?:[א-ד]|[a-dA-D]|[1-4]|[•\-*])\s*[.):\-–]?\s*/, '')
        .replace(/[*✓✔]|(?:\(\s*נכון\s*\))|(?:\[\s*נכון\s*\])/g, '')
        .trim();

      if (cleanOpt) {
        current.options.push({ text: cleanOpt, isCorrect: hasCorrectMark });
        if (current.options.length >= 4) {
          rawItems.push(current);
          current = null;
        }
      }
    } else {
      // No active question yet: treat line as a free-form question even if it didn't have '?'
      const dashSplit = line.match(/^(.{4,}?)\s*[:–—\-|]\s*(.+)$/);
      if (dashSplit) {
        rawItems.push({
          question: stripQuestionPrefix(dashSplit[1]),
          options: [{ text: stripAnswerPrefix(dashSplit[2]), isCorrect: true }]
        });
      } else {
        current = {
          question: stripQuestionPrefix(line),
          options: []
        };
      }
    }
  }

  if (current && current.question && current.options.length > 0) {
    rawItems.push(current);
  }

  // Gather all known correct answers in the document to help generate contextual distractors
  const allDocCorrectAnswers = rawItems
    .map((item) => {
      const corr = item.options.find((o) => o.isCorrect) || item.options[0];
      return corr ? corr.text : '';
    })
    .filter(Boolean);

  return rawItems
    .map((item) => {
      const qText = item.question.endsWith('?') || item.question.endsWith(':') ? item.question : `${item.question}?`;
      if (!item.options.some((o) => o.isCorrect) && item.options.length > 0) {
        item.options[0].isCorrect = true;
      }
      const correctOpt = item.options.find((o) => o.isCorrect) || item.options[0];
      const correctText = correctOpt ? correctOpt.text : 'תשובה 1';
      const otherOpts = item.options.filter((o) => o !== correctOpt).map((o) => o.text);

      if (otherOpts.length < 3) {
        const extra = generateSmartDistractors(qText, correctText, allDocCorrectAnswers);
        for (const ex of extra) {
          if (otherOpts.length >= 3) break;
          if (!otherOpts.includes(ex) && ex !== correctText) {
            otherOpts.push(ex);
          }
        }
      }

      const fourAnswers = [correctText, ...otherOpts.slice(0, 3)];
      return shuffleQuestionAnswers(
        {
          question: qText,
          answers: fourAnswers,
          correctIndex: 0
        },
        defaultTimer,
        defaultPoints
      );
    })
    .filter((q) => q.question.length > 1);
}

async function parseDocumentViaGeminiAI({
  extractedText = '',
  pdfBase64 = '',
  customInstructions = '',
  defaultTimer = DEFAULT_TIMER_SECONDS,
  defaultPoints = DEFAULT_POINTS,
  apiKey = ''
}) {
  const effectiveKey = getEffectiveGeminiApiKey(apiKey);
  if (!effectiveKey) return null;

  const extraGuide = String(customInstructions || '').trim()
    ? `\nהנחיות נוספות מהמנחה: "${String(customInstructions).trim()}"`
    : '';

  const promptText = `חלץ מתוך המסמך / הטקסט החופשי המצורף את כל השאלות והתשובות והפוך אותן לשאלות טריוויה אמריקאיות בעברית תקנית.
שים לב: המסמך נכתב באופן חופשי וללא מבנה מוגדר.
- אם לשאלה מופיעה רק תשובה נכונה אחת (או פחות מ-4 אפשרויות), השלם עבורה מעצמך תשובות מסיחות (שגויות אך הגיוניות ומשכנעות באותו נושא) כך שלכל שאלה יהיו בדיוק 4 אפשרויות תשובה ורק אחת נכונה.
- אם מופיע חומר/מידע חופשי, הפוך אותו לשאלות טריוויה אמריקאיות עם 4 אפשרויות תשובה.${extraGuide}
כל שאלה חייבת להכיל:
- question: נוסח השאלה בעברית.
- answers: מערך של בדיוק 4 תשובות אפשריות בעברית.
- correctIndex: אינדקס התשובה הנכונה (0 עד 3).`;

  const inputParts = [];
  if (pdfBase64) {
    inputParts.push({
      type: 'document',
      data: pdfBase64,
      mime_type: 'application/pdf'
    });
  }
  if (extractedText) {
    inputParts.push({
      type: 'text',
      text: `תוכן המסמך / הטקסט החופשי:\n"""\n${extractedText.slice(0, 45000)}\n"""\n\n${promptText}`
    });
  } else {
    inputParts.push({
      type: 'text',
      text: promptText
    });
  }

  const schema = {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answers: {
              type: 'array',
              items: { type: 'string' }
            },
            correctIndex: { type: 'integer' }
          },
          required: ['question', 'answers', 'correctIndex']
        }
      }
    },
    required: ['questions']
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(effectiveKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Revision': '2026-05-20'
        },
        body: JSON.stringify({
          model: 'gemini-3.8-flash',
          input: inputParts,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema
          }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API status ${response.status}`);
    }

    const data = await response.json();
    let jsonText = data?.output_text || '';
    if (!jsonText && Array.isArray(data?.steps)) {
      for (let i = data.steps.length - 1; i >= 0; i--) {
        const step = data.steps[i];
        if (step?.type === 'model_output' && Array.isArray(step.content)) {
          const textPart = step.content.find((c) => c.type === 'text' && c.text);
          if (textPart) {
            jsonText = textPart.text;
            break;
          }
        }
      }
    }

    if (!jsonText) throw new Error('Empty output from Gemini document parser');
    const parsed = JSON.parse(jsonText);
    const arr = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error('No questions extracted by Gemini');
    }

    return arr
      .map((q) => shuffleQuestionAnswers(q, defaultTimer, defaultPoints))
      .filter((q) => q.question.length > 0 && q.answers.every((a) => a.length > 0));
  } finally {
    clearTimeout(timeoutId);
  }
}

app.post('/api/admin/parse-document', async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    const mimeType = String(req.body?.mimeType || '').trim();
    const dataUrlOrBase64 = String(req.body?.fileData || '').trim();
    const rawTextInput = String(req.body?.rawText || '').trim();
    const customInstructions = String(req.body?.customInstructions || '').trim();
    const inlineApiKey = String(req.body?.apiKey || '').trim();
    const defaultTimer = Math.max(5, Math.min(300, Math.round(Number(req.body?.timerSeconds) || DEFAULT_TIMER_SECONDS)));
    const defaultPoints = Math.max(1, Math.min(100000, Math.round(Number(req.body?.points) || DEFAULT_POINTS)));

    if (inlineApiKey) {
      store.geminiApiKey = inlineApiKey;
      persistStore(store);
    }

    let fileBuffer = null;
    let base64Clean = '';
    if (dataUrlOrBase64) {
      const commaIdx = dataUrlOrBase64.indexOf(',');
      base64Clean = commaIdx !== -1 ? dataUrlOrBase64.slice(commaIdx + 1) : dataUrlOrBase64;
      fileBuffer = Buffer.from(base64Clean, 'base64');
    }

    const isPdf =
      fileName.toLowerCase().endsWith('.pdf') ||
      mimeType.toLowerCase().includes('pdf') ||
      (fileBuffer && fileBuffer.subarray(0, 5).toString('ascii') === '%PDF-');

    let extractedText = rawTextInput;
    if (!extractedText && fileBuffer) {
      extractedText = extractTextFromUploadedDocument({
        fileName,
        mimeType,
        buffer: fileBuffer
      });
    }

    let questions = [];
    let source = 'smart-parser';

    // Try Gemini AI multimodal/document parser first if key is available
    if (getEffectiveGeminiApiKey(inlineApiKey) && (extractedText || (isPdf && base64Clean))) {
      try {
        const aiParsed = await parseDocumentViaGeminiAI({
          extractedText,
          pdfBase64: isPdf ? base64Clean : '',
          customInstructions,
          defaultTimer,
          defaultPoints,
          apiKey: inlineApiKey
        });
        if (Array.isArray(aiParsed) && aiParsed.length > 0) {
          questions = aiParsed;
          source = 'gemini-ai';
        }
      } catch (aiErr) {
        console.warn('Gemini document parse fallback to built-in smart parser:', aiErr.message);
      }
    }

    if (questions.length === 0 && extractedText) {
      questions = parseFreeformQuestionsText(extractedText, defaultTimer, defaultPoints);
      source = 'smart-parser';
    }

    if (questions.length === 0) {
      return res.status(400).json({
        ok: false,
        extractedText: extractedText || '',
        error: isPdf && !extractedText
          ? 'קובץ ה-PDF סרוק כתמונה או מוצפן. ניתן להזין מפתח Gemini API לקריאה ישירה של PDF סרוק, או להעתיק את הטקסט מהקובץ לתיבה למטה.'
          : 'לא הצלחנו לזהות שאלות ותשובות בקובץ. ודאו שהקובץ מכיל טקסט של שאלות ותשובות.'
      });
    }

    return res.json({
      ok: true,
      questions,
      extractedText: extractedText || '',
      count: questions.length,
      source
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'שגיאה בפענוח הקובץ.'
    });
  }
});

app.post('/api/admin/ai-key', (req, res) => {
  try {
    const key = String(req.body?.apiKey ?? '').trim();
    store.geminiApiKey = key;
    persistStore(store);
    broadcastAllStates();
    return res.json({
      ok: true,
      hasGeminiApiKey: Boolean(getEffectiveGeminiApiKey())
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בשמירת מפתח ה-AI.' });
  }
});

app.post('/api/admin/games/generate', async (req, res) => {
  try {
    const mode = req.body?.mode === 'topics' ? 'topics' : req.body?.mode === 'document' ? 'document' : 'random';
    const topics = Array.isArray(req.body?.topics) ? req.body.topics : [];
    const selectedTopics = Array.isArray(req.body?.selectedTopics) ? req.body.selectedTopics : [];
    const privateOnly = Boolean(req.body?.privateOnly);
    const randomCount = Math.max(1, Math.min(1500, Math.round(Number(req.body?.randomCount) || 10)));
    const difficulty = String(req.body?.difficulty || 'mixed').trim().toLowerCase();
    const forceBankOnly = Boolean(req.body?.forceBankOnly);
    const customInstructions = String(req.body?.customInstructions || '').trim();
    const defaultTimer = Math.max(5, Math.min(300, Math.round(Number(req.body?.timerSeconds) || DEFAULT_TIMER_SECONDS)));
    const defaultPoints = Math.max(1, Math.min(100000, Math.round(Number(req.body?.points) || DEFAULT_POINTS)));
    const inlineApiKey = String(req.body?.apiKey || '').trim();

    if (inlineApiKey) {
      store.geminiApiKey = inlineApiKey;
    }

    let rawTitle = String(req.body?.title || '').trim();
    if (!rawTitle) {
      if (mode === 'document') {
        rawTitle = 'טריוויה מקובץ';
      } else if (selectedTopics.length > 0) {
        rawTitle = `טריוויה: ${selectedTopics.slice(0, 2).join(' ו')}`;
      } else if (mode === 'topics' && topics.length > 0) {
        const topicNames = topics
          .map((t) => String(t?.topic || '').trim())
          .filter(Boolean)
          .slice(0, 2);
        rawTitle = topicNames.length > 0 ? `טריוויה: ${topicNames.join(' ו')}` : 'טריוויה לפי דרישה';
      } else {
        rawTitle = `טריוויה רנדומלית (${randomCount} שאלות)`;
      }
    }

    let generatedQuestions = [];
    let generationSource = 'builtin-bank';

    const requestedTotalCount =
      mode === 'topics' && topics.length > 0 && selectedTopics.length === 0
        ? topics.reduce((sum, r) => sum + Math.max(1, Math.round(Number(r?.count) || 3)), 0)
        : randomCount;

    // Option 0: Questions extracted from an uploaded Word / PDF / Text document
    if (Array.isArray(req.body?.uploadedQuestions) && req.body.uploadedQuestions.length > 0) {
      generatedQuestions = req.body.uploadedQuestions
        .map((q) => shuffleQuestionAnswers(q, defaultTimer, defaultPoints))
        .filter((q) => q.question.length > 0);
      generationSource = 'uploaded-document';
    }

    // Option 1: Pasted JSON or Free-form text from user's Gemini Chat subscription
    const pastedText = String(req.body?.pastedJson || '').trim();
    if (generatedQuestions.length === 0 && pastedText) {
      const parsedFromPaste = parseFreeformQuestionsText(pastedText, defaultTimer, defaultPoints);
      if (parsedFromPaste.length > 0) {
        generatedQuestions = parsedFromPaste;
        generationSource = 'gemini-chat-paste';
      } else {
        return res.status(400).json({
          ok: false,
          error: 'לא הצלחנו לפענח שאלות מהטקסט שהודבק. ודאו שהדבקתם שאלות ותשובות או JSON תקין.'
        });
      }
    }

    // Option 2: Live Gemini AI API (when not forceBankOnly, key is present, and count <= 40 or customInstructions given)
    if (
      !forceBankOnly &&
      generatedQuestions.length === 0 &&
      getEffectiveGeminiApiKey(inlineApiKey) &&
      (requestedTotalCount <= 40 || customInstructions)
    ) {
      try {
        const aiQuestions = await generateQuestionsViaGeminiAI({
          mode,
          topics:
            mode === 'topics' && topics.length > 0
              ? topics
              : customInstructions
                ? [{ topic: customInstructions, count: Math.min(40, randomCount), difficulty }]
                : [],
          randomCount: Math.min(40, randomCount),
          customInstructions,
          defaultTimer,
          defaultPoints,
          apiKey: inlineApiKey
        });
        if (Array.isArray(aiQuestions) && aiQuestions.length > 0) {
          generatedQuestions = aiQuestions;
          generationSource = 'gemini-ai';
          const aiTopicLabel =
            (mode === 'topics' && topics[0]?.topic) ||
            matchBuiltInTopic(customInstructions) ||
            customInstructions ||
            'ידע כללי';
          addQuestionsToPersistentBank(aiQuestions, {
            markCustom: false,
            defaultTopic: String(aiTopicLabel).slice(0, 48)
          });
        }
      } catch (aiErr) {
        console.warn('Gemini AI generation fallback to built-in bank:', aiErr.message);
      }
    }

    // Option 3: Instant 1,000+ Built-in Hebrew Trivia Bank
    if (generatedQuestions.length < requestedTotalCount && mode !== 'document') {
      let effectiveMode = mode;
      let effectiveTopics = topics;
      const neededCount = requestedTotalCount - generatedQuestions.length;
      if (customInstructions && effectiveMode === 'random' && selectedTopics.length === 0) {
        const matchedTopicFromInstructions = matchBuiltInTopic(customInstructions);
        effectiveMode = 'topics';
        effectiveTopics = [
          {
            topic: matchedTopicFromInstructions || customInstructions,
            count: neededCount,
            difficulty
          }
        ];
      }
      const bankQuestions = generateQuestionsFromBuiltInBank({
        mode: generatedQuestions.length > 0 ? 'random' : effectiveMode,
        topics: effectiveTopics,
        selectedTopics,
        privateOnly,
        randomCount: neededCount,
        difficulty,
        defaultTimer,
        defaultPoints
      });
      const existingQSet = new Set(generatedQuestions.map((q) => q.question));
      for (const bq of bankQuestions) {
        if (generatedQuestions.length >= requestedTotalCount) break;
        if (!existingQSet.has(bq.question)) {
          existingQSet.add(bq.question);
          generatedQuestions.push(bq);
        }
      }
      if (generationSource !== 'gemini-ai') {
        generationSource = 'builtin-bank';
      }
    }

    const shuffleQuestionsOrder =
      req.body?.shuffleQuestionsOrder === undefined
        ? true
        : Boolean(req.body.shuffleQuestionsOrder);
    const includeImages =
      req.body?.includeImages === undefined
        ? true
        : Boolean(req.body.includeImages);

    if (shuffleQuestionsOrder && generatedQuestions.length > 1) {
      generatedQuestions = shuffleArray(generatedQuestions);
    }

    generatedQuestions = generatedQuestions.map((q, idx) => {
      const topicHint = q._topic || '';
      const imgUrl = includeImages
        ? q.image || buildQuestionIllustrationUrl(q.question, topicHint, idx + 1)
        : q.image || '';
      return normalizeQuestion(
        {
          ...q,
          image: imgUrl
        },
        defaultTimer
      );
    });

    const cleanSettings = sanitizeSettings({
      ...DEFAULT_GAME_SETTINGS,
      ...req.body,
      title: rawTitle,
      timerSeconds: defaultTimer
    });

    const newGame = {
      id: `game-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ...cleanSettings,
      questions: generatedQuestions
    };

    store.games.push(newGame);
    store.activeGameId = newGame.id;
    persistStore(store);

    resetQuiz({ keepPlayers: true, clearTeamAssignments: true });
    io.emit('settings:updated', getActiveSettings());
    broadcastAllStates();

    return res.json({
      ok: true,
      source: generationSource,
      generatedCount: generatedQuestions.length,
      game: newGame,
      activeGameId: store.activeGameId,
      activeGameCode: newGame.code,
      games: getGamesSummaryList()
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה ביצירת המשחק האוטומטי.' });
  }
});

app.post('/api/admin/games/:gameId/select', (req, res) => {
  const target =
    store.games.find((g) => g.id === req.params.gameId) ||
    store.games.find((g) => g.code === req.params.gameId);
  if (!target) {
    return res.status(404).json({ ok: false, error: 'המשחק המבוקש לא נמצא.' });
  }

  const openSession =
    req.body?.openSession === undefined ? true : Boolean(req.body.openSession);
  switchActiveGame(target, { openSession });

  return res.json({
    ok: true,
    activeGameId: store.activeGameId,
    isSessionOpen: Boolean(game.isSessionOpen),
    gameCode: target.code,
    settings: getActiveSettings(),
    games: getGamesSummaryList()
  });
});

app.post('/api/admin/games/:gameId/duplicate', (req, res) => {
  try {
    const sourceGame =
      store.games.find((g) => g.id === req.params.gameId) ||
      store.games.find((g) => g.code === req.params.gameId);
    if (!sourceGame) {
      return res.status(404).json({ ok: false, error: 'המשחק לשכפול לא נמצא.' });
    }

    const baseTitle = String(sourceGame.title || 'משחק טריוויה').trim();
    const duplicatedTitle = `${baseTitle} (עותק)`.slice(0, 80);

    const clonedTeams = Array.isArray(sourceGame.teams)
      ? sourceGame.teams.map((t) => ({
          id: `team-${crypto.randomBytes(4).toString('hex')}`,
          name: String(t.name || '').trim()
        }))
      : [];

    const clonedQuestions = Array.isArray(sourceGame.questions)
      ? sourceGame.questions.map((q) =>
          normalizeQuestion(
            {
              ...q,
              answers: Array.isArray(q.answers) ? [...q.answers] : []
            },
            sourceGame.timerSeconds
          )
        )
      : [];

    const duplicatedGame = normalizeGameRecord({
      id: `game-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      title: duplicatedTitle,
      subtitle: sourceGame.subtitle || '',
      headerImage: sourceGame.headerImage || '',
      backgroundImage: sourceGame.backgroundImage || '',
      backgroundMusic: sourceGame.backgroundMusic || '',
      bgOverlayOpacity: sourceGame.bgOverlayOpacity,
      timerSeconds: sourceGame.timerSeconds,
      autoRevealOnTimeout: sourceGame.autoRevealOnTimeout,
      teamsEnabled: Boolean(sourceGame.teamsEnabled),
      teams: clonedTeams,
      questions: clonedQuestions,
      savedPlayers: [],
      playHistory: [],
      lastFinishedAt: null
    });

    store.games.push(duplicatedGame);
    if (!game.isSessionOpen) {
      store.activeGameId = duplicatedGame.id;
    }
    persistStore(store);

    io.emit('settings:updated', getActiveSettings());
    broadcastAllStates();

    return res.json({
      ok: true,
      game: duplicatedGame,
      activeGameId: store.activeGameId,
      activeGameCode: duplicatedGame.code,
      games: getGamesSummaryList()
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בשכפול המשחק.' });
  }
});

app.get('/api/admin/games/:gameId/history', (req, res) => {
  const target =
    store.games.find((g) => g.id === req.params.gameId) ||
    store.games.find((g) => g.code === req.params.gameId);
  if (!target) {
    return res.status(404).json({ ok: false, error: 'המשחק המבוקש לא נמצא.' });
  }

  const liveLeaderboard = getSortedLeaderboard(target.id);
  const hasLiveScores = liveLeaderboard.some((p) => (p.score || 0) > 0 || (p.correctCount || 0) > 0);
  const historyList = Array.isArray(target.playHistory) ? [...target.playHistory] : [];

  return res.json({
    ok: true,
    gameId: target.id,
    gameCode: target.code,
    title: target.title,
    questionsCount: Array.isArray(target.questions) ? target.questions.length : 0,
    playHistory: historyList,
    currentLiveRun:
      hasLiveScores && !game.currentRunArchived
        ? {
            id: 'live-current',
            isLive: true,
            playedAt: new Date().toISOString(),
            questionsCount: Array.isArray(target.questions) ? target.questions.length : 0,
            players: liveLeaderboard.map((p, idx) => ({
              id: p.id,
              name: p.name,
              teamName: p.teamName || '',
              weight: normalizePlayerWeight(p.weight),
              correctCount: p.correctCount || 0,
              score: roundScore(p.score || 0),
              rank: idx + 1
            }))
          }
        : null
  });
});

// --- Central 1,000+ Question Bank Management & Random Raffle Endpoints ---

app.get('/api/admin/question-bank', (req, res) => {
  const topicFilter = String(req.query.topic || '').trim();
  const diffFilter = String(req.query.difficulty || '').trim().toLowerCase();
  const searchFilter = String(req.query.q || '').trim().toLowerCase();
  const customOnly = req.query.customOnly === '1' || req.query.customOnly === 'true';
  const limit = Math.max(1, Math.min(2000, Number(req.query.limit) || 1500));

  let filtered = persistentQuestionBank;
  if (customOnly) {
    filtered = filtered.filter((item) => item.isCustom);
  }
  if (topicFilter && topicFilter !== 'all') {
    filtered = filtered.filter((item) => item.topic === topicFilter);
  }
  if (diffFilter && diffFilter !== 'all' && diffFilter !== 'mixed') {
    filtered = filtered.filter((item) => item.difficulty === diffFilter);
  }
  if (searchFilter) {
    filtered = filtered.filter(
      (item) =>
        item.question.toLowerCase().includes(searchFilter) ||
        (item.topic && item.topic.toLowerCase().includes(searchFilter)) ||
        (Array.isArray(item.answers) &&
          item.answers.some((a) => String(a).toLowerCase().includes(searchFilter)))
    );
  }

  return res.json({
    ok: true,
    totalCount: persistentQuestionBank.length,
    customCount: persistentQuestionBank.filter((q) => q.isCustom).length,
    filteredCount: filtered.length,
    topicsSummary: getQuestionBankTopicsSummary(),
    questions: filtered.slice(0, limit)
  });
});

// Manual selection of specific questions by ID from the 1,000+ Question Bank (סעיף ד)
app.post('/api/admin/question-bank/select', (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.questionIds) ? req.body.questionIds : [];
    const wantedIds = rawIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (wantedIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'לא נבחרו שאלות מהמאגר. סמנו לפחות שאלה אחת.' });
    }

    const activeGame = getActiveGameRecord();
    const defaultTimer = Math.max(
      5,
      Math.min(300, Math.round(Number(req.body?.timerSeconds) || activeGame.timerSeconds || DEFAULT_TIMER_SECONDS))
    );
    const defaultPoints = Math.max(
      1,
      Math.min(100000, Math.round(Number(req.body?.points) || DEFAULT_POINTS))
    );
    const includeImages = req.body?.includeImages === undefined ? true : Boolean(req.body.includeImages);

    const bankById = new Map(persistentQuestionBank.map((q) => [String(q.id), q]));
    const selectedQuestions = [];

    wantedIds.forEach((id, idx) => {
      const item = bankById.get(id);
      if (!item) return;
      const shuffled = shuffleQuestionAnswers(item, defaultTimer, defaultPoints);
      const imgUrl = includeImages
        ? item.image || buildQuestionIllustrationUrl(item.question, item.topic || 'ידע כללי', idx + 1)
        : item.image || '';
      selectedQuestions.push(
        normalizeQuestion(
          {
            ...shuffled,
            image: imgUrl
          },
          defaultTimer
        )
      );
    });

    if (selectedQuestions.length === 0) {
      return res.status(404).json({ ok: false, error: 'השאלות שנבחרו לא נמצאו במאגר.' });
    }

    if (req.body?.createNewGame) {
      const rawTitle =
        String(req.body?.title || '').trim() ||
        `שאלון נבחר מהמאגר (${selectedQuestions.length} שאלות)`;
      const cleanSettings = sanitizeSettings({
        ...DEFAULT_GAME_SETTINGS,
        ...req.body,
        title: rawTitle,
        timerSeconds: defaultTimer
      });
      const newGame = {
        id: `game-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        ...cleanSettings,
        questions: selectedQuestions
      };
      store.games.push(newGame);
      store.activeGameId = newGame.id;
      persistStore(store);

      resetQuiz({ keepPlayers: true, clearTeamAssignments: true });
      io.emit('settings:updated', getActiveSettings());
      broadcastAllStates();

      return res.json({
        ok: true,
        createdGame: true,
        count: selectedQuestions.length,
        game: newGame,
        activeGameId: store.activeGameId,
        activeGameCode: newGame.code,
        games: getGamesSummaryList()
      });
    }

    return res.json({
      ok: true,
      createdGame: false,
      count: selectedQuestions.length,
      questions: selectedQuestions
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בטעינת השאלות שנבחרו מהמאגר.' });
  }
});

// Add Gemini AI Questions by Topic directly into the Question Editor (סעיף ג)
app.post('/api/admin/questions/generate-topic', async (req, res) => {
  try {
    const topic = String(req.body?.topic || 'ידע כללי').trim() || 'ידע כללי';
    const count = Math.max(1, Math.min(100, Math.round(Number(req.body?.count) || 5)));
    const difficulty = String(req.body?.difficulty || 'mixed').trim().toLowerCase();
    const customInstructions = String(req.body?.customInstructions || '').trim();
    const inlineApiKey = String(req.body?.apiKey || '').trim();
    const pastedText = String(req.body?.pastedJson || '').trim();
    const activeGame = getActiveGameRecord();
    const defaultTimer = Math.max(
      5,
      Math.min(300, Math.round(Number(req.body?.timerSeconds) || activeGame.timerSeconds || DEFAULT_TIMER_SECONDS))
    );
    const defaultPoints = Math.max(
      1,
      Math.min(100000, Math.round(Number(req.body?.points) || DEFAULT_POINTS))
    );
    const includeImages = req.body?.includeImages === undefined ? true : Boolean(req.body.includeImages);

    if (inlineApiKey) {
      store.geminiApiKey = inlineApiKey;
      persistStore(store);
    }

    let generated = [];
    let source = 'gemini-ai';

    if (pastedText) {
      const parsedFromPaste = parseFreeformQuestionsText(pastedText, defaultTimer, defaultPoints);
      if (parsedFromPaste.length > 0) {
        generated = parsedFromPaste;
        source = 'gemini-chat-paste';
      } else {
        return res.status(400).json({
          ok: false,
          error: 'לא הצלחנו לפענח שאלות מהטקסט שהודבק. ודאו שהדבקתם שאלות ותשובות או JSON תקין.'
        });
      }
    }

    if (generated.length === 0 && getEffectiveGeminiApiKey(inlineApiKey)) {
      try {
        const aiQuestions = await generateQuestionsViaGeminiAI({
          mode: 'topics',
          topics: [{ topic, count: Math.min(40, count), difficulty }],
          randomCount: Math.min(40, count),
          customInstructions,
          defaultTimer,
          defaultPoints,
          apiKey: inlineApiKey
        });
        if (Array.isArray(aiQuestions) && aiQuestions.length > 0) {
          generated = aiQuestions;
          source = 'gemini-ai';
          addQuestionsToPersistentBank(aiQuestions, {
            markCustom: false,
            defaultTopic: String(matchBuiltInTopic(topic) || topic).slice(0, 48)
          });
        }
      } catch (aiErr) {
        console.warn('Gemini topic generation fallback to bank:', aiErr.message);
      }
    }

    if (source === 'gemini-chat-paste' && generated.length > 0) {
      autoSyncUserWrittenQuestionsToPrivateBank(generated, 'שאלות פרטיות');
    }

    if (generated.length < count) {
      const needed = count - generated.length;
      const bankQuestions = generateQuestionsFromBuiltInBank({
        mode: 'topics',
        topics: [{ topic, count: needed, difficulty }],
        randomCount: needed,
        defaultTimer,
        defaultPoints
      });
      const seen = new Set(generated.map((q) => q.question));
      for (const bq of bankQuestions) {
        if (generated.length >= count) break;
        if (!seen.has(bq.question)) {
          seen.add(bq.question);
          generated.push(bq);
        }
      }
      if (source !== 'gemini-ai' || generated.length === bankQuestions.length) {
        source = 'builtin-bank';
      }
    }

    const normalized = generated.map((q, idx) =>
      normalizeQuestion(
        {
          ...q,
          image: includeImages
            ? q.image || buildQuestionIllustrationUrl(q.question, topic, idx + 1)
            : q.image || ''
        },
        defaultTimer
      )
    );

    return res.json({
      ok: true,
      source,
      topic,
      count: normalized.length,
      questions: normalized
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בייצור שאלות לפי נושא.' });
  }
});

app.post('/api/admin/question-bank', (req, res) => {
  try {
    const incomingList = Array.isArray(req.body?.questions)
      ? req.body.questions
      : req.body?.question
        ? [req.body]
        : [];

    if (incomingList.length === 0) {
      return res.status(400).json({ ok: false, error: 'אנא הזינו שאלה ו-4 תשובות להוספה למאגר.' });
    }

    for (let i = 0; i < incomingList.length; i++) {
      const item = incomingList[i];
      const qText = String(item?.question || '').trim();
      const ans = Array.isArray(item?.answers)
        ? item.answers.map((a) => String(a ?? '').trim()).filter(Boolean)
        : [];
      if (!qText || ans.length < 4) {
        return res.status(400).json({
          ok: false,
          error: `בשאלה ${i + 1} חסר נוסח שאלה או אחת מ-4 התשובות.`
        });
      }
    }

    const added = addQuestionsToPersistentBank(incomingList);
    broadcastAllStates();

    return res.json({
      ok: true,
      addedCount: added.length,
      addedQuestions: added,
      totalCount: persistentQuestionBank.length,
      customCount: persistentQuestionBank.filter((q) => q.isCustom).length,
      topicsSummary: getQuestionBankTopicsSummary()
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בהוספת השאלה למאגר השאלות.' });
  }
});

app.put('/api/admin/question-bank/:id', (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim();
    const idx = persistentQuestionBank.findIndex((q) => q.id === targetId);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: 'השאלה לעריכה לא נמצאה במאגר.' });
    }

    const existing = persistentQuestionBank[idx];
    const qText = String(req.body?.question ?? existing.question ?? '').trim();
    const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : existing.answers;
    const answers = Array.isArray(rawAnswers)
      ? rawAnswers.slice(0, 4).map((a) => String(a ?? '').trim())
      : [];
    if (!qText || answers.length < 4 || answers.some((a) => !a)) {
      return res.status(400).json({
        ok: false,
        error: 'נוסח השאלה וכל 4 התשובות חייבים להיות מלאים.'
      });
    }

    const correctIndex = Math.max(0, Math.min(3, Math.round(Number(req.body?.correctIndex ?? existing.correctIndex) || 0)));
    const topic = String(req.body?.topic ?? existing.topic ?? 'ידע כללי').trim() || 'ידע כללי';
    const rawDiff = String(req.body?.difficulty ?? existing.difficulty ?? 'medium').trim().toLowerCase();
    const difficulty = ['easy', 'medium', 'hard'].includes(rawDiff) ? rawDiff : 'medium';

    persistentQuestionBank[idx] = {
      ...existing,
      topic,
      difficulty,
      question: qText,
      answers,
      correctIndex
    };
    savePersistentQuestionBank();
    broadcastAllStates();

    return res.json({
      ok: true,
      question: persistentQuestionBank[idx],
      totalCount: persistentQuestionBank.length,
      customCount: persistentQuestionBank.filter((q) => q.isCustom).length,
      topicsSummary: getQuestionBankTopicsSummary()
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בעדכון השאלה במאגר.' });
  }
});

app.post('/api/admin/question-bank/categories/rename', (req, res) => {
  try {
    const oldTopic = String(req.body?.oldTopic || '').trim();
    const newTopic = String(req.body?.newTopic || '').trim();
    if (!oldTopic || !newTopic) {
      return res.status(400).json({ ok: false, error: 'יש להזין את שם הקטגוריה הנוכחי ואת השם החדש.' });
    }

    let updatedCount = 0;
    for (const q of persistentQuestionBank) {
      if (q.topic === oldTopic) {
        q.topic = newTopic;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      savePersistentQuestionBank();
      broadcastAllStates();
    }

    return res.json({
      ok: true,
      oldTopic,
      newTopic,
      updatedCount,
      totalCount: persistentQuestionBank.length,
      topicsSummary: getQuestionBankTopicsSummary()
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בשינוי שם הקטגוריה במאגר.' });
  }
});

app.delete('/api/admin/question-bank/:id', (req, res) => {
  const targetId = String(req.params.id || '').trim();
  const idx = persistentQuestionBank.findIndex((q) => q.id === targetId);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'השאלה לא נמצאה במאגר.' });
  }
  persistentQuestionBank.splice(idx, 1);
  savePersistentQuestionBank();
  broadcastAllStates();
  return res.json({
    ok: true,
    totalCount: persistentQuestionBank.length,
    customCount: persistentQuestionBank.filter((q) => q.isCustom).length,
    topicsSummary: getQuestionBankTopicsSummary()
  });
});

app.post('/api/admin/question-bank/raffle', (req, res) => {
  try {
    const count = Math.max(1, Math.min(1500, Math.round(Number(req.body?.count) || 10)));
    const topic = String(req.body?.topic || '').trim();
    const selectedTopics = Array.isArray(req.body?.selectedTopics)
      ? req.body.selectedTopics.map((t) => String(t || '').trim()).filter((t) => t && t !== 'all')
      : [];
    const privateOnly = Boolean(req.body?.privateOnly);
    const difficulty = String(req.body?.difficulty || 'mixed').trim().toLowerCase();
    const activeGame = getActiveGameRecord();
    const defaultTimer =
      Math.max(5, Math.min(300, Math.round(Number(req.body?.timerSeconds) || activeGame.timerSeconds || DEFAULT_TIMER_SECONDS)));
    const defaultPoints =
      Math.max(1, Math.min(100000, Math.round(Number(req.body?.points) || DEFAULT_POINTS)));

    const drawn = generateQuestionsFromBuiltInBank({
      mode: topic && topic !== 'all' ? 'topics' : 'random',
      topics: topic && topic !== 'all' ? [{ topic, count, difficulty }] : [],
      selectedTopics,
      privateOnly,
      randomCount: count,
      difficulty,
      defaultTimer,
      defaultPoints
    }).map((q, idx) =>
      normalizeQuestion(
        {
          ...q,
          image: q.image || buildQuestionIllustrationUrl(q.question, q._topic || topic, idx + 1)
        },
        defaultTimer
      )
    );

    return res.json({
      ok: true,
      count: drawn.length,
      totalBankCount: persistentQuestionBank.length,
      questions: drawn
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בהגרלת שאלות מהמאגר.' });
  }
});

// --- Player Question & Answers English Translation Endpoint ---

const translationCache = new Map();

function translateSingleTextViaGoogle(textHe) {
  return new Promise((resolve) => {
    const clean = String(textHe || '').trim();
    if (!clean) return resolve('');
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=iw&tl=en&dt=t&q=${encodeURIComponent(clean)}`;
    const req = https.get(url, { timeout: 6000 }, (resp) => {
      let raw = '';
      resp.on('data', (chunk) => {
        raw += chunk;
      });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.[0])) {
            const joined = parsed[0].map((part) => part?.[0] || '').join('').trim();
            if (joined) return resolve(joined);
          }
        } catch {
          // ignore
        }
        resolve(clean);
      });
    });
    req.on('error', () => resolve(clean));
    req.on('timeout', () => {
      req.destroy();
      resolve(clean);
    });
  });
}

app.post('/api/translate-question', async (req, res) => {
  try {
    const questionHe = String(req.body?.question || '').trim();
    const answersHe = Array.isArray(req.body?.answers)
      ? req.body.answers.slice(0, 4).map((a) => String(a ?? '').trim())
      : [];
    if (!questionHe) {
      return res.status(400).json({ ok: false, error: 'Missing question text' });
    }

    const cacheKey = `${questionHe}||${answersHe.join('||')}`;
    if (translationCache.has(cacheKey)) {
      return res.json({ ok: true, ...translationCache.get(cacheKey) });
    }

    // 1. Check if this question exists in our 1,000+ persistentQuestionBank with pre-built English translations
    const normalizedHe = questionHe.replace(/\s+/g, ' ').toLowerCase();
    const bankMatch = persistentQuestionBank.find(
      (item) =>
        item.questionEn &&
        item.question.replace(/\s+/g, ' ').toLowerCase() === normalizedHe
    );

    if (bankMatch && Array.isArray(bankMatch.answersEn) && bankMatch.answersEn.length === 4) {
      // Map each shuffled Hebrew answer to its corresponding English answer from bankMatch
      const heToEnMap = new Map();
      bankMatch.answers.forEach((ansHe, idx) => {
        heToEnMap.set(String(ansHe).trim(), bankMatch.answersEn[idx] || ansHe);
      });
      const mappedAnswersEn = [];
      let allMatched = true;
      for (const aHe of answersHe) {
        if (heToEnMap.has(aHe)) {
          mappedAnswersEn.push(heToEnMap.get(aHe));
        } else {
          allMatched = false;
          break;
        }
      }
      if (allMatched && mappedAnswersEn.length === 4) {
        const payload = { questionEn: bankMatch.questionEn, answersEn: mappedAnswersEn };
        translationCache.set(cacheKey, payload);
        return res.json({ ok: true, ...payload });
      }
    }

    // 2. Translate question and 4 answers in parallel via Google Translate HTTPS endpoint
    const [questionEn, ...answersEn] = await Promise.all([
      translateSingleTextViaGoogle(questionHe),
      ...answersHe.map((a) => translateSingleTextViaGoogle(a))
    ]);

    const payload = {
      questionEn: questionEn || questionHe,
      answersEn: answersEn.length === 4 ? answersEn : answersHe
    };
    translationCache.set(cacheKey, payload);

    // Save back onto active question if it matches so future players receive it immediately
    const activeQ = getActiveQuestions()[game.currentQuestionIndex];
    if (activeQ && activeQ.question === questionHe) {
      activeQ.questionEn = payload.questionEn;
      activeQ.answersEn = payload.answersEn;
    }

    return res.json({ ok: true, ...payload });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Translation failed' });
  }
});

app.delete('/api/admin/games/:gameId', (req, res) => {
  if (store.games.length <= 1) {
    return res.status(400).json({
      ok: false,
      error: 'לא ניתן למחוק את המשחק היחיד במערכת.'
    });
  }

  const idx = store.games.findIndex((g) => g.id === req.params.gameId);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'המשחק לא נמצא.' });
  }

  const removedGameId = store.games[idx].id;
  const wasActive = removedGameId === store.activeGameId;
  store.games.splice(idx, 1);

  for (const [pid, p] of players.entries()) {
    if (p.gameId === removedGameId) {
      if (p.socketId) {
        io.to(p.socketId).emit('player:kicked', { reason: 'המשחק נמחק על ידי המנחה.' });
        socketToPlayerId.delete(p.socketId);
      }
      players.delete(pid);
      currentAnswers.delete(pid);
    }
  }

  if (wasActive) {
    store.activeGameId = store.games[0].id;
    resetQuiz({ keepPlayers: true, clearTeamAssignments: false });
  }

  persistStore(store);
  io.emit('settings:updated', getActiveSettings());
  broadcastAllStates();

  return res.json({
    ok: true,
    activeGameId: store.activeGameId,
    games: getGamesSummaryList()
  });
});

// --- Active Game Settings & Questions Endpoints ---

app.put('/api/admin/settings', (req, res) => {
  try {
    const activeGame = getActiveGameRecord();
    const updatedSettings = sanitizeSettings({ ...activeGame, ...req.body });
    Object.assign(activeGame, updatedSettings);

    // Ensure players in this game aren't pointing to removed team IDs
    const validTeamIds = new Set((activeGame.teams || []).map((t) => t.id));
    for (const p of players.values()) {
      if (p.gameId === activeGame.id && p.teamId && !validTeamIds.has(p.teamId)) {
        p.teamId = null;
      }
    }

    persistStore(store);

    const publicSettings = getActiveSettings();
    io.emit('settings:updated', publicSettings);
    broadcastAllStates();
    return res.json({ ok: true, settings: publicSettings, games: getGamesSummaryList() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בעדכון ההגדרות.' });
  }
});

app.get('/api/admin/questions', (_req, res) => {
  res.json({
    ok: true,
    activeGameId: store.activeGameId,
    questions: getActiveQuestions()
  });
});

app.put('/api/admin/questions', (req, res) => {
  try {
    const incoming = req.body?.questions;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ ok: false, error: 'יש להזין לפחות שאלה אחת בחידון.' });
    }

    const activeGame = getActiveGameRecord();
    const cleaned = [];

    for (let i = 0; i < incoming.length; i++) {
      const q = normalizeQuestion(incoming[i], activeGame.timerSeconds);
      if (!q.question) {
        return res.status(400).json({ ok: false, error: `חסר נוסח לשאלה מספר ${i + 1}.` });
      }
      if (q.answers.some((a) => !a)) {
        return res
          .status(400)
          .json({ ok: false, error: `יש למלא את כל 4 התשובות בשאלה מספר ${i + 1}.` });
      }
      cleaned.push(q);
    }

    activeGame.questions = cleaned;
    persistStore(store);

    // Automatically save any user-written or user-edited questions into the Private Question Bank
    const privateSync = autoSyncUserWrittenQuestionsToPrivateBank(incoming, 'שאלות פרטיות');

    if (game.currentQuestionIndex >= activeGame.questions.length) {
      game.currentQuestionIndex = activeGame.questions.length - 1;
    }
    broadcastAllStates();
    return res.json({
      ok: true,
      questions: activeGame.questions,
      games: getGamesSummaryList(),
      privateSync,
      privateQuestionBankCount: getPrivateQuestionBankCount()
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'שגיאה בשמירת השאלות.' });
  }
});

app.patch('/api/admin/questions/:index', (req, res) => {
  const activeGame = getActiveGameRecord();
  const questions = activeGame.questions;
  const idx = Number(req.params.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= questions.length) {
    return res.status(404).json({ ok: false, error: 'שאלה לא נמצאה.' });
  }

  const updated = normalizeQuestion(
    {
      ...questions[idx],
      ...req.body
    },
    activeGame.timerSeconds
  );

  if (!updated.question || updated.answers.some((a) => !a)) {
    return res
      .status(400)
      .json({ ok: false, error: 'נוסח השאלה וכל 4 התשובות חייבים להיות מלאים.' });
  }

  questions[idx] = updated;
  persistStore(store);
  const privateSync = autoSyncUserWrittenQuestionsToPrivateBank(
    [{ ...updated, isUserWritten: Boolean(req.body?.isUserWritten) }],
    'שאלות פרטיות'
  );
  broadcastAllStates();
  return res.json({
    ok: true,
    question: questions[idx],
    questions,
    privateSync,
    privateQuestionBankCount: getPrivateQuestionBankCount()
  });
});

app.post('/api/admin/questions/reload', (_req, res) => {
  const activeGame = getActiveGameRecord();
  activeGame.questions = loadQuestionsFromFile(activeGame.timerSeconds);
  persistStore(store);
  if (game.currentQuestionIndex >= activeGame.questions.length) {
    game.currentQuestionIndex = activeGame.questions.length - 1;
  }
  broadcastAllStates();
  return res.json({ ok: true, questions: activeGame.questions });
});

// -------------------- Socket.io Real-Time Events --------------------

io.on('connection', (socket) => {
  socket.emit('settings:updated', getActiveSettings());

  // --- Admin Events ---
  socket.on('admin:join', (ack) => {
    socket.join('admins');
    const state = buildAdminState();
    socket.emit('admin:state', state);
    if (typeof ack === 'function') ack({ ok: true, state });
  });

  socket.on('admin:selectGame', (payload, ack) => {
    const requestedId = String(payload?.gameId || '').trim();
    const requestedCode = String(payload?.code || payload?.gameCode || '').trim();
    const target =
      store.games.find((g) => g.id === requestedId) ||
      (requestedCode ? getGameByCode(requestedCode) : null);

    if (!target) {
      if (typeof ack === 'function') ack({ ok: false, error: 'המשחק המבוקש לא נמצא.' });
      return;
    }

    const openSession =
      payload?.openSession === undefined ? true : Boolean(payload.openSession);
    switchActiveGame(target, { openSession });

    if (typeof ack === 'function') {
      ack({
        ok: true,
        activeGameId: store.activeGameId,
        isSessionOpen: Boolean(game.isSessionOpen),
        gameCode: target.code,
        settings: getActiveSettings(),
        state: buildAdminState()
      });
    }
  });

  socket.on('admin:setTeamsEnabled', (payload, ack) => {
    const activeGame = getActiveGameRecord();
    activeGame.teamsEnabled = Boolean(payload?.enabled);
    if (!Array.isArray(activeGame.teams)) activeGame.teams = [];
    persistStore(store);
    io.emit('settings:updated', getActiveSettings());
    broadcastAllStates();
    if (typeof ack === 'function') ack({ ok: true, teamsEnabled: activeGame.teamsEnabled });
  });

  socket.on('admin:addTeam', (payload, ack) => {
    const rawName = String(payload?.name || '').trim().replace(/\s+/g, ' ').slice(0, 36);
    if (!rawName || rawName.length < 2) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'שם הקבוצה חייב להכיל לפחות 2 תווים.' });
      }
      return;
    }

    const activeGame = getActiveGameRecord();
    if (!Array.isArray(activeGame.teams)) activeGame.teams = [];
    const exists = activeGame.teams.some((t) => t.name.toLowerCase() === rawName.toLowerCase());
    if (exists) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'קבוצה בשם זה כבר קיימת ברשימה.' });
      }
      return;
    }

    const newTeam = {
      id: `team-${crypto.randomBytes(4).toString('hex')}`,
      name: rawName
    };
    activeGame.teams.push(newTeam);
    activeGame.teamsEnabled = true;
    persistStore(store);
    io.emit('settings:updated', getActiveSettings());
    broadcastAllStates();
    if (typeof ack === 'function') ack({ ok: true, team: newTeam });
  });

  socket.on('admin:removeTeam', (payload, ack) => {
    const teamId = String(payload?.teamId || '');
    const activeGame = getActiveGameRecord();
    if (!Array.isArray(activeGame.teams)) activeGame.teams = [];
    const idx = activeGame.teams.findIndex((t) => t.id === teamId);
    if (idx === -1) {
      if (typeof ack === 'function') ack({ ok: false, error: 'הקבוצה לא נמצאה.' });
      return;
    }

    activeGame.teams.splice(idx, 1);
    for (const p of players.values()) {
      if (p.gameId === activeGame.id && p.teamId === teamId) {
        p.teamId = null;
      }
    }

    syncGamePlayersToStore(activeGame.id);
    io.emit('settings:updated', getActiveSettings());
    broadcastAllStates();
    if (typeof ack === 'function') ack({ ok: true });
  });

  function handleAdminStartQuiz(payloadOrAck, maybeAck) {
    const ack = typeof payloadOrAck === 'function' ? payloadOrAck : maybeAck;
    const payload = typeof payloadOrAck === 'object' && payloadOrAck ? payloadOrAck : {};

    if (payload.gameId) {
      const target = store.games.find((g) => g.id === String(payload.gameId));
      if (target && target.id !== store.activeGameId) {
        switchActiveGame(target);
      }
    }

    const activeGame = getActiveGameRecord();
    const questions = activeGame.questions;
    if (questions.length === 0) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'במשחק זה עדיין אין שאלות! לחצו על עריכת שאלות כדי להוסיף.' });
      }
      return;
    }

    // Archive any previous unarchived run with scores into playHistory,
    // and reset all players' live scores to 0 for the new run!
    archiveCurrentGameRunIfNeeded(activeGame.id);
    game.currentRunArchived = false;
    resetPlayersForNewRun(activeGame.id, { removeOfflinePlayers: false });

    startQuestion(0);
    if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
  }

  socket.on('admin:startQuiz', handleAdminStartQuiz);
  socket.on('admin:startGame', handleAdminStartQuiz);

  socket.on('admin:resumeQuiz', (ack) => {
    const questions = getActiveQuestions();
    const idx = game.resumableQuestionIndex;
    if (idx < 0 || idx >= questions.length) {
      if (typeof ack === 'function') ack({ ok: false, error: 'אין משחק פעיל להמשיך.' });
      return;
    }
    if (game.resumableWasRevealed && game.lastReveal && game.lastReveal.questionIndex === idx) {
      game.currentQuestionIndex = idx;
      game.phase = 'revealed';
      game.questionScored = true;
      broadcastAllStates();
    } else {
      startQuestion(idx);
    }
    if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
  });

  socket.on('admin:returnToMain', (ack) => {
    returnToMainScreen();
    if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
  });

  socket.on('admin:nextQuestion', (ack) => {
    const questions = getActiveQuestions();
    if (questions.length === 0) {
      if (typeof ack === 'function') ack({ ok: false, error: 'אין שאלות זמינות.' });
      return;
    }
    const nextIdx = game.currentQuestionIndex + 1;
    if (nextIdx < questions.length) {
      startQuestion(nextIdx);
    } else {
      finishQuiz();
    }
    if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
  });

  socket.on('admin:prevQuestion', (ack) => {
    if (game.currentQuestionIndex > 0) {
      startQuestion(game.currentQuestionIndex - 1);
      if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
    } else {
      if (typeof ack === 'function') ack({ ok: false, error: 'זוהי השאלה הראשונה.' });
    }
  });

  socket.on('admin:goToQuestion', (payload, ack) => {
    const idx = Number(payload?.index);
    if (startQuestion(idx)) {
      if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
    } else {
      if (typeof ack === 'function') ack({ ok: false, error: 'מספר שאלה לא חוקי.' });
    }
  });

  socket.on('admin:revealAnswer', (ack) => {
    const ok = revealCurrentQuestion();
    if (typeof ack === 'function') ack({ ok, state: buildAdminState() });
  });

  socket.on('admin:resetTimer', (ack) => {
    const questions = getActiveQuestions();
    const settings = getActiveSettings();
    if (game.currentQuestionIndex < 0 || game.currentQuestionIndex >= questions.length) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    const q = questions[game.currentQuestionIndex];
    const qTimer = Math.round(Number(q.timerSeconds));
    const duration =
      Number.isFinite(qTimer) && qTimer >= 5
        ? qTimer
        : settings.timerSeconds || DEFAULT_TIMER_SECONDS;

    game.timerDuration = duration;
    game.timerPaused = false;
    game.pausedRemainingMs = 0;
    game.timeExpiredAwaitingReveal = false;
    game.questionEndsAt = Date.now() + game.timerDuration * 1000;
    if (game.phase === 'revealed') {
      game.phase = 'question';
    }
    broadcastAllStates();
    if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
  });

  socket.on('admin:togglePause', (ack) => {
    if (game.phase !== 'question') {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    if (!game.timerPaused) {
      game.pausedRemainingMs = getRemainingMs();
      game.timerPaused = true;
    } else {
      game.questionEndsAt = Date.now() + game.pausedRemainingMs;
      game.timerPaused = false;
    }
    broadcastAllStates();
    if (typeof ack === 'function') ack({ ok: true, paused: game.timerPaused });
  });

  socket.on('admin:toggleLeaderboard', (payload, ack) => {
    game.leaderboardModalOpen =
      typeof payload?.visible === 'boolean' ? payload.visible : !game.leaderboardModalOpen;
    io.to('admins').emit('admin:state', buildAdminState());
    if (typeof ack === 'function') ack({ ok: true, visible: game.leaderboardModalOpen });
  });

  socket.on('admin:finishQuiz', (ack) => {
    finishQuiz();
    if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
  });

  socket.on('admin:resetQuiz', (payload, ack) => {
    resetQuiz({ keepPlayers: payload?.keepPlayers !== false });
    if (typeof ack === 'function') ack({ ok: true, state: buildAdminState() });
  });

  socket.on('admin:kickPlayer', (payload, ack) => {
    const pid = payload?.playerId;
    const player = players.get(pid);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    const targetGameId = player.gameId;
    if (player.socketId) {
      io.to(player.socketId).emit('player:kicked', { reason: 'הוסרת מהמשחק על ידי המנחה.' });
      socketToPlayerId.delete(player.socketId);
    }
    players.delete(pid);
    currentAnswers.delete(pid);
    syncGamePlayersToStore(targetGameId);
    broadcastAllStates();
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('admin:setPlayerWeight', (payload, ack) => {
    const pid = String(payload?.playerId || '').trim();
    const player = players.get(pid);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'השחקן לא נמצא.' });
      return;
    }
    const newWeight = normalizePlayerWeight(payload?.weight);
    player.weight = newWeight;
    syncGamePlayersToStore(player.gameId);
    broadcastAllStates();
    if (typeof ack === 'function') {
      ack({
        ok: true,
        playerId: player.id,
        name: player.name,
        weight: newWeight
      });
    }
  });

  // --- Player Events ---
  socket.on('player:join', (payload, ack) => {
    const rawName = String(payload?.name || '').trim().replace(/\s+/g, ' ');
    const rawCode = String(payload?.code ?? payload?.gameCode ?? '').trim();
    const requestedId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';

    if (requestedId && players.has(requestedId)) {
      const existing = players.get(requestedId);
      const existingGame = store.games.find((g) => g.id === existing.gameId);
      if (
        existingGame &&
        game.isSessionOpen &&
        existingGame.id === store.activeGameId &&
        (!rawCode || rawCode === existingGame.code)
      ) {
        if (existing.socketId && existing.socketId !== socket.id) {
          socketToPlayerId.delete(existing.socketId);
        }
        existing.socketId = socket.id;
        existing.connected = true;
        existing.gameCode = existingGame.code;

        const validTeamIds = new Set((existingGame.teams || []).map((t) => t.id));
        if (existing.teamId && !validTeamIds.has(existing.teamId)) {
          existing.teamId = null;
        }

        socketToPlayerId.set(socket.id, existing.id);

        const pState = buildPlayerState(existing.id);
        socket.emit('player:state', pState);
        broadcastAllStates();

        if (typeof ack === 'function') {
          ack({
            ok: true,
            resumed: true,
            playerId: existing.id,
            name: existing.name,
            gameId: existingGame.id,
            gameCode: existingGame.code,
            state: pState
          });
        }
        return;
      }
    }

    if (!/^\d{4}$/.test(rawCode)) {
      if (typeof ack === 'function') {
        ack({
          ok: false,
          error: 'אנא הזינו קוד משחק תקין בן 4 ספרות המופיע בדף הכניסה למשחק (לדוגמה: 1000).'
        });
      }
      return;
    }

    const targetGame = getGameByCode(rawCode);
    if (!targetGame) {
      if (typeof ack === 'function') {
        ack({
          ok: false,
          error: `משחק עם קוד ${rawCode} לא נמצא.`
        });
      }
      return;
    }

    if (!game.isSessionOpen || targetGame.id !== store.activeGameId) {
      if (typeof ack === 'function') {
        ack({
          ok: false,
          error: `המשחק "${targetGame.title}" (קוד ${rawCode}) אינו מופעל כעת. המתינו שהמנחה ייכנס למשחק ויפתח אותו להצטרפות.`
        });
      }
      return;
    }

    if (!rawName || rawName.length < 2) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'אנא הזינו שם בעל 2 תווים לפחות.' });
      }
      return;
    }

    if (rawName.length > 24) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'השם ארוך מדי (עד 24 תווים).' });
      }
      return;
    }

    const gamePlayers = getPlayersForGame(targetGame.id);
    const normalizedName = rawName.toLowerCase();

    // If a player with the same name already exists in this game (disconnected or re-joining),
    // reconnect them seamlessly so they keep all accumulated points & team assignment!
    for (const existing of gamePlayers) {
      if (existing.name.toLowerCase() === normalizedName) {
        if (existing.socketId && existing.socketId !== socket.id) {
          socketToPlayerId.delete(existing.socketId);
        }
        existing.socketId = socket.id;
        existing.connected = true;
        existing.gameCode = targetGame.code;
        socketToPlayerId.set(socket.id, existing.id);

        const pState = buildPlayerState(existing.id);
        socket.emit('player:state', pState);
        broadcastAllStates();
        if (typeof ack === 'function') {
          ack({
            ok: true,
            resumed: true,
            playerId: existing.id,
            name: existing.name,
            gameId: targetGame.id,
            gameCode: targetGame.code,
            state: pState
          });
        }
        return;
      }
    }

    if (gamePlayers.length >= MAX_PLAYERS) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: `המשחק מלא! ניתן לחבר עד ${MAX_PLAYERS} שחקנים.` });
      }
      return;
    }

    const newId = crypto.randomUUID();
    const newPlayer = {
      id: newId,
      name: rawName,
      gameId: targetGame.id,
      gameCode: targetGame.code,
      teamId: null,
      weight: 1,
      score: 0,
      correctCount: 0,
      connected: true,
      socketId: socket.id,
      joinedAt: Date.now()
    };

    players.set(newId, newPlayer);
    socketToPlayerId.set(socket.id, newId);
    syncGamePlayersToStore(targetGame.id);

    const pState = buildPlayerState(newId);
    socket.emit('player:state', pState);
    broadcastAllStates();

    if (typeof ack === 'function') {
      ack({
        ok: true,
        playerId: newId,
        name: newPlayer.name,
        gameId: targetGame.id,
        gameCode: targetGame.code,
        state: pState
      });
    }
  });

  socket.on('player:chooseTeam', (payload, ack) => {
    const pid = socketToPlayerId.get(socket.id);
    const player = pid ? players.get(pid) : null;
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'אינך מחובר כשחקן.' });
      return;
    }

    const playerGame = getGameById(player.gameId);
    if (!playerGame.teamsEnabled) {
      if (typeof ack === 'function') ack({ ok: false, error: 'מצב קבוצות אינו מופעל במשחק זה.' });
      return;
    }

    const teamId = String(payload?.teamId || '').trim();
    const targetTeam = (playerGame.teams || []).find((t) => t.id === teamId);
    if (!targetTeam) {
      if (typeof ack === 'function') ack({ ok: false, error: 'הקבוצה שנבחרה אינה קיימת.' });
      return;
    }

    player.teamId = targetTeam.id;
    syncGamePlayersToStore(playerGame.id);
    const pState = buildPlayerState(pid);
    socket.emit('player:state', pState);
    broadcastAllStates();

    if (typeof ack === 'function') {
      ack({ ok: true, team: targetTeam, state: pState });
    }
  });

  socket.on('player:createTeam', (payload, ack) => {
    const pid = socketToPlayerId.get(socket.id);
    const player = pid ? players.get(pid) : null;
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'אינך מחובר כשחקן.' });
      return;
    }

    const playerGame = getGameById(player.gameId);
    if (!playerGame.teamsEnabled) {
      if (typeof ack === 'function') ack({ ok: false, error: 'מצב קבוצות אינו מופעל במשחק זה.' });
      return;
    }

    const rawTeamName = String(payload?.name || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 36);

    if (!rawTeamName || rawTeamName.length < 2) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'אנא הזינו שם קבוצה בעל 2 תווים לפחות.' });
      }
      return;
    }

    if (!Array.isArray(playerGame.teams)) playerGame.teams = [];

    let targetTeam = playerGame.teams.find(
      (t) => t.name.toLowerCase() === rawTeamName.toLowerCase()
    );

    if (!targetTeam) {
      targetTeam = {
        id: `team-${crypto.randomBytes(4).toString('hex')}`,
        name: rawTeamName
      };
      playerGame.teams.push(targetTeam);
      persistStore(store);
      if (playerGame.id === store.activeGameId) {
        io.emit('settings:updated', getActiveSettings());
      }
    }

    player.teamId = targetTeam.id;
    syncGamePlayersToStore(playerGame.id);
    const pState = buildPlayerState(pid);
    socket.emit('player:state', pState);
    broadcastAllStates();

    if (typeof ack === 'function') {
      ack({ ok: true, team: targetTeam, state: pState });
    }
  });

  socket.on('player:changeTeam', (ack) => {
    const pid = socketToPlayerId.get(socket.id);
    const player = pid ? players.get(pid) : null;
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }
    if (player.gameId === store.activeGameId && game.phase !== 'lobby') {
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'ניתן להחליף קבוצה רק לפני תחילת השאלות.' });
      }
      return;
    }
    player.teamId = null;
    syncGamePlayersToStore(player.gameId);
    const pState = buildPlayerState(pid);
    socket.emit('player:state', pState);
    broadcastAllStates();
    if (typeof ack === 'function') ack({ ok: true, state: pState });
  });

  socket.on('player:answer', (payload, ack) => {
    const pid = socketToPlayerId.get(socket.id);
    const player = pid ? players.get(pid) : null;
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'אינך מחובר כשחקן פעיל.' });
      return;
    }

    if (player.gameId !== store.activeGameId || game.phase !== 'question') {
      if (typeof ack === 'function') ack({ ok: false, error: 'לא ניתן לענות כרגע.' });
      return;
    }

    if (getRemainingMs() <= 0 || game.timeExpiredAwaitingReveal) {
      if (typeof ack === 'function') ack({ ok: false, error: 'הזמן לשאלה זו הסתיים!' });
      return;
    }

    const answerIndex = Number(payload?.answerIndex);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      if (typeof ack === 'function') ack({ ok: false, error: 'בחירה לא חוקית.' });
      return;
    }

    let changeCount = 0;
    if (currentAnswers.has(pid)) {
      const prev = currentAnswers.get(pid);
      const prevChanges = Number(prev.changeCount || 0);
      if (prev.answerIndex === answerIndex) {
        if (typeof ack === 'function') {
          ack({
            ok: true,
            lockedAnswerIndex: prev.answerIndex,
            answerChangeCount: prevChanges,
            canChangeAnswer: prevChanges < 1
          });
        }
        return;
      }
      if (prevChanges >= 1) {
        if (typeof ack === 'function') {
          ack({
            ok: false,
            error: 'כבר שינית את תשובתך פעם אחת לשאלה זו — התשובה נעולה סופית.',
            lockedAnswerIndex: prev.answerIndex,
            answerChangeCount: prevChanges,
            canChangeAnswer: false
          });
        }
        return;
      }
      changeCount = prevChanges + 1;
    }

    currentAnswers.set(pid, {
      answerIndex,
      answeredAt: Date.now(),
      changeCount
    });

    // Only auto-reveal early if all connected players have answered AND finalized their 1 allowed change
    const connectedInGame = getPlayersForGame(store.activeGameId).filter((p) => p.connected);
    if (
      connectedInGame.length > 0 &&
      connectedInGame.every(
        (p) => currentAnswers.has(p.id) && Number(currentAnswers.get(p.id)?.changeCount || 0) >= 1
      )
    ) {
      revealCurrentQuestion();
      if (typeof ack === 'function') {
        ack({
          ok: true,
          lockedAnswerIndex: answerIndex,
          answerChangeCount: changeCount,
          canChangeAnswer: false,
          autoRevealed: true
        });
      }
      return;
    }

    broadcastAllStates();

    if (typeof ack === 'function') {
      ack({
        ok: true,
        lockedAnswerIndex: answerIndex,
        answerChangeCount: changeCount,
        canChangeAnswer: changeCount < 1
      });
    }
  });

  socket.on('player:leave', (ack) => {
    const pid = socketToPlayerId.get(socket.id);
    if (pid) {
      const p = players.get(pid);
      socketToPlayerId.delete(socket.id);
      if (p) {
        p.connected = false;
        p.socketId = null;
        syncGamePlayersToStore(p.gameId);
      }
      if (game.phase === 'question') {
        const connectedInGame = getPlayersForGame(store.activeGameId).filter((pl) => pl.connected);
        if (
          connectedInGame.length > 0 &&
          connectedInGame.every(
            (pl) =>
              currentAnswers.has(pl.id) && Number(currentAnswers.get(pl.id)?.changeCount || 0) >= 1
          )
        ) {
          revealCurrentQuestion();
          if (typeof ack === 'function') ack({ ok: true });
          return;
        }
      }
      broadcastAllStates();
    }
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('disconnect', () => {
    const pid = socketToPlayerId.get(socket.id);
    if (pid) {
      socketToPlayerId.delete(socket.id);
      const p = players.get(pid);
      if (p) {
        p.connected = false;
        p.socketId = null;
        syncGamePlayersToStore(p.gameId);
      }
      if (game.phase === 'question') {
        const connectedInGame = getPlayersForGame(store.activeGameId).filter((pl) => pl.connected);
        if (
          connectedInGame.length > 0 &&
          connectedInGame.every(
            (pl) =>
              currentAnswers.has(pl.id) && Number(currentAnswers.get(pl.id)?.changeCount || 0) >= 1
          )
        ) {
          revealCurrentQuestion();
          return;
        }
      }
      broadcastAllStates();
    }
  });
});

server.listen(PORT, () => {
  const urls = getLanUrls(PORT);
  console.log('====================================================');
  console.log(`🎯 שרת הטריוויה פועל על פורט ${PORT}`);
  console.log(`📺 מסך מנחה / תצוגה מרכזית: http://localhost:${PORT}/admin.html`);
  console.log(`📱 מסך שחקן:                 http://localhost:${PORT}/index.html`);
  urls.forEach((u) => {
    console.log(`🌐 כתובת ברשת המקומית:       ${u}`);
  });
  console.log('====================================================');
});
