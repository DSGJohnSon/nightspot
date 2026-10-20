import { randomUUID } from 'node:crypto';
import {
  type Ack,
  applySpeed,
  type BlockSettings,
  type Phase,
  type PlayerPublic,
  type Role,
  type RoundPublic,
  type RoundResult,
  type SessionSettings,
  type SessionView,
  type TrackChoice,
  difficultyInfo,
  yearBonus,
} from '@nightspot/shared';
import { getModule } from '../modules/registry';
import { lastPlayedAt, markPlayed } from './history';
import type { IO } from './types';

const PLAYER_COLORS = [
  '#1ed760', '#f6c544', '#ff8b3d', '#ff4d5e', '#b46bff',
  '#4cc9f0', '#ff6ec7', '#9ef01a', '#ffd6a5', '#7b8cff',
];
const MAX_PLAYERS = 20;
/** Si la TV ne confirme pas le préchargement, on démarre quand même. */
const PREPARE_TIMEOUT_MS = 6000;
/** Tolérance réseau pour une réponse envoyée juste avant la fin du timer. */
const ANSWER_GRACE_MS = 300;
/** Petit temps mort quand tout le monde a répondu, pour laisser l'animation se jouer. */
const ALL_ANSWERED_DELAY_MS = 800;

interface Player {
  id: string;
  token: string;
  name: string;
  color: string;
  score: number;
  socketId: string | null;
}

interface Round {
  blockIndex: number;
  settings: BlockSettings;
  item: { id: string };
  /** Figée au tirage : une mise à jour des vues en cours de partie ne change pas le barème. */
  difficulty: number;
}

function emptyResult(playerId: string): RoundResult {
  return { playerId, answer: null, parts: {}, points: 0, elapsedMs: null, yearGuess: null, yearPoints: 0 };
}

export class Session {
  readonly hostToken = randomUUID();
  hostSocketId: string | null = null;
  lastActivity = Date.now();

  private phase: Phase = 'lobby';
  private players = new Map<string, Player>();
  private roundIndex = -1;
  private startedAt: number | null = null;
  private endsAt: number | null = null;
  private revealEndsAt: number | null = null;
  private answers = new Map<string, { answer: TrackChoice; elapsedMs: number }>();
  private yearGuesses = new Map<string, { year: number; points: number; at: number }>();
  private results: RoundResult[] = [];
  private timer: NodeJS.Timeout | null = null;

  private constructor(
    readonly code: string,
    private readonly rounds: Round[],
    private readonly io: IO,
  ) {}

  /** Tire les questions de chaque bloc au lancement : la partie est figée dès sa création. */
  static create(code: string, settings: SessionSettings, io: IO): Session {
    // Deux blocs du même module ne doivent pas tirer les mêmes questions.
    const drawn = new Set<string>();
    const rounds = settings.blocks.flatMap((block, blockIndex) => {
      const module = getModule(block.moduleId);
      const freshness = (id: string) =>
        drawn.has(`${block.moduleId}:${id}`) ? Number.MAX_SAFE_INTEGER : lastPlayedAt(block.moduleId, id);
      return module.draw(block.rounds, freshness, block).map((item) => {
        drawn.add(`${block.moduleId}:${item.id}`);
        return { blockIndex, settings: block, item, difficulty: module.difficulty(item) };
      });
    });
    if (!rounds.length) throw new Error('Aucun clip ne correspond à ces filtres.');
    return new Session(code, rounds, io);
  }

  /* ---------- Connexions ---------- */

  attachHost(socketId: string): void {
    this.hostSocketId = socketId;
    this.broadcast();
  }

  join(rawName: string, token: string | undefined, socketId: string): Ack<{ playerId: string; token: string }> {
    const all = [...this.players.values()];
    const name = rawName.trim().replace(/\s+/g, ' ').slice(0, 16);

    // Reconnexion (téléphone sorti de veille, page rechargée) ou pseudo repris après un changement de téléphone.
    const existing =
      (token && all.find((p) => p.token === token)) ||
      all.find((p) => p.socketId === null && p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.socketId = socketId;
      this.broadcast();
      return { ok: true, playerId: existing.id, token: existing.token };
    }

    if (!name) return { ok: false, error: 'Choisis un pseudo.' };
    if (all.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: 'Ce pseudo est déjà pris.' };
    }
    if (all.length >= MAX_PLAYERS) return { ok: false, error: 'La partie est complète.' };

    const player: Player = {
      id: randomUUID().slice(0, 8),
      token: randomUUID(),
      name,
      color: PLAYER_COLORS[all.length % PLAYER_COLORS.length],
      score: 0,
      socketId,
    };
    this.players.set(player.id, player);
    this.broadcast();
    return { ok: true, playerId: player.id, token: player.token };
  }

  disconnect(socketId: string): void {
    if (this.hostSocketId === socketId) this.hostSocketId = null;
    for (const p of this.players.values()) if (p.socketId === socketId) p.socketId = null;
    this.endEarlyIfEveryoneAnswered();
    this.broadcast();
  }

  /* ---------- Déroulé ---------- */

  start(): void {
    if (this.phase !== 'lobby' || this.players.size === 0) return;
    this.prepare(0);
  }

  hostReady(): void {
    if (this.phase === 'prepare') this.startQuestion();
  }

  next(): void {
    if (this.phase === 'question') this.reveal(); // l'hôte coupe le timer
    else if (this.phase === 'reveal') this.showScores();
    else if (this.phase === 'scores') {
      if (this.roundIndex + 1 < this.rounds.length) this.prepare(this.roundIndex + 1);
      else this.finish();
    }
  }

  answer(socketId: string, raw: unknown): Ack<{ elapsedMs: number }> {
    const player = [...this.players.values()].find((p) => p.socketId === socketId);
    if (!player) return { ok: false, error: 'Joueur inconnu.' };

    const now = Date.now();
    if (this.phase !== 'question' || !this.startedAt || !this.endsAt || now > this.endsAt + ANSWER_GRACE_MS) {
      return { ok: false, error: 'Trop tard !' };
    }
    if (this.answers.has(player.id)) return { ok: false, error: 'Réponse déjà validée.' };

    const round = this.currentRound();
    const answer = getModule(round.settings.moduleId).parseAnswer(raw);
    if (!answer) return { ok: false, error: 'Réponse invalide.' };

    // L'horodatage est celui du serveur : les horloges des téléphones ne sont pas fiables.
    const elapsedMs = Math.min(now - this.startedAt, round.settings.timerSec * 1000);
    this.answers.set(player.id, { answer, elapsedMs });
    this.endEarlyIfEveryoneAnswered();
    this.broadcast();
    return { ok: true, elapsedMs };
  }

  /**
   * Bonus année : ouvert à tous pendant le reveal, une seule tentative, points crédités tout de suite
   * (la TV annonce le gain en direct). L'année tentée, elle, reste cachée jusqu'au classement.
   */
  guessYear(socketId: string, raw: unknown): Ack<{ points: number }> {
    const player = [...this.players.values()].find((p) => p.socketId === socketId);
    if (!player) return { ok: false, error: 'Joueur inconnu.' };
    const actual = this.solutionYear();
    if (this.phase !== 'reveal' || actual == null) return { ok: false, error: 'Trop tard pour l’année !' };
    if (this.yearGuesses.has(player.id)) return { ok: false, error: 'Année déjà validée.' };

    const year = Number(raw);
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) {
      return { ok: false, error: 'Année invalide.' };
    }
    const points = yearBonus(year, actual);
    this.yearGuesses.set(player.id, { year, points, at: Date.now() });
    player.score += points;
    let result = this.results.find((r) => r.playerId === player.id);
    if (!result) this.results.push((result = emptyResult(player.id))); // arrivé pendant le reveal
    result.yearGuess = year;
    result.yearPoints = points;
    this.broadcast();
    return { ok: true, points };
  }

  /** Inutile d'attendre la fin du chrono quand tous les joueurs connectés ont répondu. */
  private endEarlyIfEveryoneAnswered(): void {
    if (this.phase !== 'question' || this.answers.size === 0) return;
    const connected = [...this.players.values()].filter((p) => p.socketId !== null);
    if (connected.every((p) => this.answers.has(p.id))) {
      this.schedule(ALL_ANSWERED_DELAY_MS, () => this.reveal());
    }
  }

  private prepare(index: number): void {
    this.roundIndex = index;
    this.phase = 'prepare';
    this.answers.clear();
    this.yearGuesses.clear();
    this.results = [];
    this.startedAt = this.endsAt = this.revealEndsAt = null;
    this.schedule(PREPARE_TIMEOUT_MS, () => this.startQuestion());
    this.broadcast();
  }

  private startQuestion(): void {
    const timerMs = this.currentRound().settings.timerSec * 1000;
    this.phase = 'question';
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + timerMs;
    this.schedule(timerMs, () => this.reveal());
    this.broadcast();
  }

  private reveal(): void {
    if (this.phase !== 'question') return;
    const round = this.currentRound();
    const module = getModule(round.settings.moduleId);
    const timerMs = round.settings.timerSec * 1000;
    const { multiplier } = difficultyInfo(round.difficulty);

    this.results = [...this.players.values()]
      .map((player): RoundResult => {
        const stored = this.answers.get(player.id);
        if (!stored) return emptyResult(player.id);
        const { parts, basePoints } = module.evaluate(round.item, stored.answer);
        const points = applySpeed(basePoints * multiplier, stored.elapsedMs, timerMs);
        player.score += points;
        return { ...emptyResult(player.id), answer: stored.answer, parts, points, elapsedMs: stored.elapsedMs };
      })
      .sort((a, b) => b.points - a.points || (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity));
    markPlayed(round.settings.moduleId, round.item.id);

    const revealMs = round.settings.revealSec * 1000;
    this.phase = 'reveal';
    this.revealEndsAt = Date.now() + revealMs;
    this.schedule(revealMs, () => this.showScores());
    this.broadcast();
  }

  private showScores(): void {
    if (this.phase !== 'reveal') return;
    this.clearTimer();
    this.phase = 'scores';
    this.revealEndsAt = null;
    this.broadcast();
  }

  private finish(): void {
    this.clearTimer();
    this.phase = 'podium';
    this.broadcast();
  }

  /* ---------- Médias ---------- */

  /** Fichier image d'une manche déjà commencée (jamais celles à venir). */
  imageFor(index: number): string | null {
    if (this.phase === 'lobby' || !Number.isInteger(index) || index < 0 || index > this.roundIndex) return null;
    const round = this.rounds[index];
    return getModule(round.settings.moduleId).imageFile(round.item);
  }

  /* ---------- Vues ---------- */

  broadcast(): void {
    this.lastActivity = Date.now();
    if (this.hostSocketId) this.io.to(this.hostSocketId).emit('state', this.view('host'));
    for (const p of this.players.values()) {
      if (p.socketId) this.io.to(p.socketId).emit('state', this.view('player', p));
    }
  }

  private view(role: Role, me?: Player): SessionView {
    const players: PlayerPublic[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score,
      connected: p.socketId !== null,
      answered: this.answers.has(p.id),
      yearGuessed: this.yearGuesses.has(p.id),
    }));
    const mine = me && this.answers.get(me.id);
    return {
      code: this.code,
      role,
      phase: this.phase,
      players,
      round: this.roundView(role),
      totalRounds: this.rounds.length,
      serverNow: Date.now(),
      me: me && {
        id: me.id,
        answer: mine?.answer ?? null,
        elapsedMs: mine?.elapsedMs ?? null,
        yearGuess: this.yearGuesses.get(me.id)?.year ?? null,
      },
    };
  }

  private roundView(role: Role): RoundPublic | null {
    if (this.phase === 'lobby') return null;
    const round = this.currentRound();
    const module = getModule(round.settings.moduleId);
    const revealed = this.phase === 'reveal' || this.phase === 'scores' || this.phase === 'podium';
    const solution = module.solution(round.item);
    // Pendant le reveal, le bonus année est ouvert : l'année et les tentatives restent secrètes,
    // seuls les points gagnés sont visibles (annoncés en direct sur la TV).
    const bonusOpen = this.phase === 'reveal';
    if (bonusOpen) delete solution.year;
    const results = bonusOpen ? this.results.map((r) => ({ ...r, yearGuess: null })) : this.results;
    const yearWins = [...this.yearGuesses]
      .filter(([, g]) => g.points > 0)
      .map(([playerId, g]) => ({ playerId, points: g.points, at: g.at }));
    return {
      index: this.roundIndex,
      total: this.rounds.length,
      blockIndex: round.blockIndex,
      moduleId: round.settings.moduleId,
      timerSec: round.settings.timerSec,
      revealSec: round.settings.revealSec,
      searchMode: round.settings.searchMode,
      maxPoints: Math.round(module.maxPoints * difficultyInfo(round.difficulty).multiplier),
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      revealEndsAt: this.revealEndsAt,
      yearBonus: this.solutionYear() != null,
      yearWins,
      difficulty: round.difficulty,
      // La TV seule reçoit l'image et la vidéo ; les téléphones ne voient jamais la réponse avant le reveal.
      ...(role === 'host'
        ? { imageUrl: `/media/${this.code}/${this.roundIndex}`, media: module.media(round.item) }
        : {}),
      ...(revealed ? { solution, results } : {}),
    };
  }

  /* ---------- Utilitaires ---------- */

  private currentRound(): Round {
    return this.rounds[this.roundIndex];
  }

  private solutionYear(): number | null {
    const round = this.currentRound();
    return getModule(round.settings.moduleId).solution(round.item).year ?? null;
  }

  private schedule(ms: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(fn, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.clearTimer();
  }
}
