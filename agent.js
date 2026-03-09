/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              MOLTY ROYALE — AI AGENT SCRIPT                 ║
 * ║         Autonomous Battle Royale AI Agent (JavaScript)       ║
 * ║                                                             ║
 * ║  Based on: https://www.moltyroyale.com/SKILL.md             ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * How to use:
 *   1. npm install
 *   2. Copy .env.example → .env, fill API_KEY (or leave empty to create new account)
 *   3. node agent.js
 */

import dotenv from 'dotenv';
import readline from 'readline';
import { fileURLToPath } from 'url';

dotenv.config();

// ══════════════════════════════════════════════════════════════
//  CONFIGURATION
// ══════════════════════════════════════════════════════════════

const BASE_URL = "https://cdn.moltyroyale.com/api";
const API_KEY = process.env.API_KEY || "";
const AGENT_NAME = process.env.AGENT_NAME || "JavaScriptBot";
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || "";
let GAME_ID = process.env.GAME_ID || "";
let AGENT_ID = process.env.AGENT_ID || "";

// Team mode allies (friendly-fire off)
const DEFAULT_TEAM_ALLIES = new Set(["KiwKiw", "KowKow", "KewKew", "PremanPasar", "BudakSajak", "PremanGang", "PremanKampung", "PremanKomplek", "PremanKota", "PremanStasiun"]);
const ALLY_NAMES_ENV = (process.env.ALLY_NAMES || "").trim();
const TEAM_ALLIES = ALLY_NAMES_ENV
    ? new Set(ALLY_NAMES_ENV.split(",").map(n => n.trim()).filter(n => n))
    : DEFAULT_TEAM_ALLIES;

// Utility items to avoid (become "parasite" inventory slots)
const SOCIAL_UTILITY_NAMES = new Set(["radio", "broadcast", "megaphone"]);
// Buff utility that only helps once per game
const PERMANENT_BUFF_UTILITY_NAMES = new Set(["map", "binoculars", "armor kit"]);

// Fallback create room disabled by default
const ALLOW_CREATE_GAME_FALLBACK = envFlag("ALLOW_CREATE_GAME_FALLBACK", false);

// Polling intervals (seconds)
const POLL_INTERVAL = 3;          // Polling while waiting for game to start
const ACTION_INTERVAL = 60;       // Interval between group 1 actions (1 min real time)
const STATE_RATE_LIMIT = 0.5;     // Min delay between GET state calls

// Timeouts
const API_CONNECT_TIMEOUT = parseFloat(process.env.API_CONNECT_TIMEOUT || "3");
const API_READ_TIMEOUT = parseFloat(process.env.API_READ_TIMEOUT || "6");
const STATE_CONNECT_TIMEOUT = parseFloat(process.env.STATE_CONNECT_TIMEOUT || "2");
const STATE_READ_TIMEOUT = parseFloat(process.env.STATE_READ_TIMEOUT || "4");
const ACTION_POST_CONNECT_TIMEOUT = parseFloat(process.env.ACTION_POST_CONNECT_TIMEOUT || "3");
const ACTION_POST_READ_TIMEOUT = parseFloat(process.env.ACTION_POST_READ_TIMEOUT || "8");
const ACTION_CONFIRM_CONNECT_TIMEOUT = parseFloat(process.env.ACTION_CONFIRM_CONNECT_TIMEOUT || "2.5");
const ACTION_CONFIRM_READ_TIMEOUT = parseFloat(process.env.ACTION_CONFIRM_READ_TIMEOUT || "3.5");
const CDN_CONNECT_TIMEOUT = parseFloat(process.env.CDN_CONNECT_TIMEOUT || "3");
const CDN_READ_TIMEOUT = parseFloat(process.env.CDN_READ_TIMEOUT || "4");

// Retries
const API_DEFAULT_RETRIES = Math.max(1, parseInt(process.env.API_DEFAULT_RETRIES || "1"));
const API_STATE_RETRIES = Math.max(1, parseInt(process.env.API_STATE_RETRIES || "1"));
const ACTION_POST_RETRIES = Math.max(1, parseInt(process.env.ACTION_POST_RETRIES || "2"));
const API_RETRY_BACKOFFS = [0.25, 0.5, 1.0];
const QUICK_RETRY_BACKOFF = parseFloat(process.env.QUICK_RETRY_BACKOFF || "0.25");
const QUICK_RETRY_HTTP_STATUSES = new Set([502, 503, 504, 520, 522, 524]);

// Pickup delays
const PICKUP_SUCCESS_DELAY = parseFloat(process.env.PICKUP_SUCCESS_DELAY || "0.35");
const PICKUP_FAIL_DELAY = parseFloat(process.env.PICKUP_FAIL_DELAY || "0.50");
const PICKUP_MULTI_SUCCESS_DELAY = parseFloat(process.env.PICKUP_MULTI_SUCCESS_DELAY || "0.18");
const PICKUP_MULTI_FAIL_DELAY = parseFloat(process.env.PICKUP_MULTI_FAIL_DELAY || "0.30");

// Cooldown poll delay
const GROUP1_COOLDOWN_POLL_DELAY = parseFloat(process.env.GROUP1_COOLDOWN_POLL_DELAY || "0.45");
const IDLE_NO_ACTION_DELAY = parseFloat(process.env.IDLE_NO_ACTION_DELAY || "1.25");

// Strategy thresholds (overridden by preset mode)
let HP_HEAL_THRESHOLD = 61;     // Heal if HP below this (%)
let HP_FLEE_THRESHOLD = 25;     // Flee if HP below this (%)
const EP_REST_THRESHOLD = 2;    // Rest if EP below this

// Aggressiveness mode: safe, balanced, brutal
const AGGRO_MODE = (process.env.AGGRO_MODE || "balanced").trim().toLowerCase();
const VALID_AGGRO_MODES = new Set(["safe", "balanced", "brutal"]);
const effectiveAggroMode = VALID_AGGRO_MODES.has(AGGRO_MODE) ? AGGRO_MODE : "balanced";

const AGGRO_PRESETS = {
    "safe": {
        hp_heal: 61,
        hp_flee: 25,
        combat_with_weapon: 36,
        combat_no_weapon: 52,
        endgame_combat_floor: 28,
        endgame_combat_buffer: 8,
        agent_max_hits: 3,
        agent_max_hits_end: 4,
        min_score_mid: 18,
        min_score_end: 12,
        allow_chase_1v1: false,
        chase_min_hp: 999,
        chase_max_target_hp: 0,
        relax_endgame_trade: false,
        roam_endgame: false,
    },
    "balanced": {
        hp_heal: 50,
        hp_flee: 22,
        combat_with_weapon: 30,
        combat_no_weapon: 45,
        endgame_combat_floor: 24,
        endgame_combat_buffer: 6,
        agent_max_hits: 4,
        agent_max_hits_end: 4,
        min_score_mid: 14,
        min_score_end: 10,
        allow_chase_1v1: true,
        chase_min_hp: 60,
        chase_max_target_hp: 32,
        relax_endgame_trade: false,
        roam_endgame: false,
    },
    "brutal": {
        hp_heal: 44,
        hp_flee: 17,
        combat_with_weapon: 24,
        combat_no_weapon: 38,
        endgame_combat_floor: 20,
        endgame_combat_buffer: 4,
        agent_max_hits: 4,
        agent_max_hits_end: 5,
        min_score_mid: 9,
        min_score_end: 8,
        allow_chase_1v1: true,
        chase_min_hp: 52,
        chase_max_target_hp: 42,
        relax_endgame_trade: true,
        roam_endgame: true,
    },
};

const AGGRO = AGGRO_PRESETS[effectiveAggroMode];
HP_HEAL_THRESHOLD = AGGRO.hp_heal;
HP_FLEE_THRESHOLD = AGGRO.hp_flee;
const MODE_COMBAT_HP_WITH_WEAPON = AGGRO.combat_with_weapon;
const MODE_COMBAT_HP_NO_WEAPON = AGGRO.combat_no_weapon;
const MODE_ENDGAME_COMBAT_FLOOR = AGGRO.endgame_combat_floor;
const MODE_ENDGAME_COMBAT_BUFFER = AGGRO.endgame_combat_buffer;
const MODE_AGENT_MAX_KILL_HITS = AGGRO.agent_max_hits;
const MODE_AGENT_MAX_KILL_HITS_END = AGGRO.agent_max_hits_end;
const MODE_MIN_SCORE_MID = AGGRO.min_score_mid;
const MODE_MIN_SCORE_END = AGGRO.min_score_end;
const ALLOW_CHASE_1V1 = AGGRO.allow_chase_1v1;
const MODE_CHASE_MIN_HP = AGGRO.chase_min_hp;
const MODE_CHASE_MAX_TARGET_HP = AGGRO.chase_max_target_hp;
const MODE_COVER_FIRE_HP_BUFFER = effectiveAggroMode === "safe" ? 8 : effectiveAggroMode === "balanced" ? 12 : 16;
const MODE_COVER_FIRE_HP_FLOOR = effectiveAggroMode === "safe" ? 18 : effectiveAggroMode === "balanced" ? 14 : 12;
const RELAX_ENDGAME_TRADE = AGGRO.relax_endgame_trade;
const ROAM_IN_ENDGAME = AGGRO.roam_endgame;

// Ranged target mode
const RANGED_TARGET_MODE = (process.env.RANGED_TARGET_MODE || "adjacent").trim().toLowerCase();
const effectiveRangedTargetMode = ["adjacent", "same_region"].includes(RANGED_TARGET_MODE) ? RANGED_TARGET_MODE : "adjacent";

// Game phase thresholds
const PHASE_EARLY_THRESHOLD = 30;   // >30 alive = early game
const PHASE_MID_THRESHOLD = 10;     // 10-30 alive = mid game
const TURNS_PER_IN_GAME_DAY = 4;    // 1 turn = 6 hours in-game
const TURN_SECONDS_ESTIMATE = 60;   // Estimate 1 turn group-1 in seconds

// ══════════════════════════════════════════════════════════════
//  LOGGER
// ══════════════════════════════════════════════════════════════

const COLORS = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
};

function supportsUnicode() {
    const enc = (process.stdout.encoding || '').toLowerCase();
    return enc.includes('utf');
}

const UNICODE_OUTPUT = supportsUnicode();

function u(unicodeText, asciiFallback) {
    return UNICODE_OUTPUT ? unicodeText : asciiFallback;
}

function log(msg, color = COLORS.white, prefix = null) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    if (prefix === null) {
        prefix = u("🤖", "[BOT]");
    }
    console.log(`${COLORS.cyan}[${ts}]${COLORS.reset} ${prefix} ${color}${msg}${COLORS.reset}`);
}

function logInfo(msg) { log(msg, COLORS.white, u("ℹ️", "[i]")); }
function logSuccess(msg) { log(msg, COLORS.green, u("✅", "[+]")); }
function logWarning(msg) { log(msg, COLORS.yellow, u("⚠️", "[!]")); }
function logError(msg) { log(msg, COLORS.red, u("❌", "[x]")); }
function logAction(msg) { log(msg, COLORS.magenta, u("⚡", "[>]")); }
function logCombat(msg) { log(msg, COLORS.red, u("⚔️", "[ATK]")); }
function logMove(msg) { log(msg, COLORS.blue, u("🚶", "[MV]")); }
function logItem(msg) { log(msg, COLORS.yellow, u("📦", "[ITM]")); }
function logHeal(msg) { log(msg, COLORS.green, u("🩹", "[HEAL]")); }

// ══════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════

function envFlag(name, defaultValue = false) {
    const raw = process.env[name];
    if (raw === undefined || raw === null) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function normalizeItemName(name) {
    return (name || '').trim().toLowerCase().split(/\s+/).join(' ');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ══════════════════════════════════════════════════════════════
//  GAME DATA HELPERS
// ══════════════════════════════════════════════════════════════

// Weapon priority (attack bonus)
const WEAPON_PRIORITY = {
    "Katana": 21, "Sniper": 17, "Sword": 8,
    "Pistol": 6, "Knife": 5, "Bow": 3, "Fist": 0
};

// Terrain priority for movement
const TERRAIN_SCORE = {
    "ruins": 5,    // High loot
    "hills": 4,    // Vision +2
    "plains": 3,   // Vision +1
    "forest": 2,   // Stealth
    "water": 1     // Slow
};

// Monster difficulty
const MONSTER_DIFFICULTY = { "Wolf": 1, "Bear": 2, "Bandit": 3 };

function getWeaponBonus(weapon) {
    if (!weapon) return 0;
    return weapon.atkBonus || 0;
}

function isHunterWeapon(weapon) {
    if (!weapon) return false;
    const name = normalizeItemName(weapon.name || '');
    return name === 'katana' || name === 'sniper';
}

function isRangedWeapon(weapon) {
    if (!weapon) return false;
    if ((weapon.range || 0) > 0) return true;
    const name = normalizeItemName(weapon.name || '');
    return name === 'sniper' || name === 'pistol' || name === 'bow';
}

function getEffectiveWeaponRange(weapon) {
    if (!weapon) return 0;
    const explicitRange = parseInt(weapon.range || 0, 10) || 0;
    if (explicitRange > 0) return explicitRange;
    if (isRangedWeapon(weapon)) return 1;
    return 0;
}

function calcDamage(atk, weaponBonus, targetDef) {
    const base = atk + weaponBonus;
    return Math.max(1, base - (targetDef * 0.5));
}

function canKillInHits(myAtk, myWeaponBonus, targetHp, targetDef, maxHits = 3) {
    const dmg = calcDamage(myAtk, myWeaponBonus, targetDef);
    return (targetHp / dmg) <= maxHits;
}

function estimateDamageReceived(targetAtk, targetWeaponBonus, myDef) {
    return calcDamage(targetAtk, targetWeaponBonus, myDef);
}

function getGameEntryType(gameInfo) {
    return String(gameInfo?.entryType || gameInfo?.roomType || gameInfo?.type || '').trim().toLowerCase();
}

// ══════════════════════════════════════════════════════════════
//  API CLIENT
// ══════════════════════════════════════════════════════════════

class MoltyAPI {
    constructor(baseUrl, apiKey = "") {
        this.base_url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.api_key = apiKey;
        this.lastRequestTransient = false;
        this.lastRequestError = "";
        this.lastRequestPath = "";
        this._blockedGameIds = new Set();
        this._fallbackGames = [];
    }

    _resetRequestState() {
        this.lastRequestTransient = false;
        this.lastRequestError = "";
        this.lastRequestPath = "";
    }

    _isCdnRequest(url) {
        return (url || '').includes('cdn.moltyroyale.com');
    }

    _getBackoff(attemptIndex, url = "", statusCode = null) {
        if (statusCode && QUICK_RETRY_HTTP_STATUSES.has(statusCode)) {
            return QUICK_RETRY_BACKOFF;
        }
        if (this._isCdnRequest(url)) {
            return Math.min(QUICK_RETRY_BACKOFF + (attemptIndex * 0.25), 0.75);
        }
        if (!API_RETRY_BACKOFFS || API_RETRY_BACKOFFS.length === 0) {
            return 1;
        }
        return API_RETRY_BACKOFFS[Math.min(attemptIndex, API_RETRY_BACKOFFS.length - 1)];
    }

    _resolveTimeout(url, timeoutCfg = null) {
        let [connectTimeout, readTimeout] = timeoutCfg || [API_CONNECT_TIMEOUT, API_READ_TIMEOUT];
        if (this._isCdnRequest(url)) {
            connectTimeout = Math.min(connectTimeout, CDN_CONNECT_TIMEOUT);
            readTimeout = Math.min(readTimeout, CDN_READ_TIMEOUT);
        }
        return [connectTimeout, readTimeout];
    }

    _warnOrError(url, message) {
        if (this._isCdnRequest(url)) {
            logWarning(message);
        } else {
            logError(message);
        }
    }

    setApiKey(key) {
        this.api_key = key;
    }

    async _request(method, path, jsonData = null, retries = null, timeoutOverride = null) {
        const url = `${this.base_url}${path}`;
        this._resetRequestState();
        retries = retries === null ? API_DEFAULT_RETRIES : Math.max(1, parseInt(retries));
        const [connectTimeout, readTimeout] = this._resolveTimeout(url, timeoutOverride);

        const controller = new AbortController();
        const timeoutMs = (connectTimeout + readTimeout) * 1000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const headers = {
                    'Content-Type': 'application/json',
                };
                if (this.api_key) {
                    headers['X-API-Key'] = this.api_key;
                }

                const response = await fetch(url, {
                    method,
                    headers,
                    body: jsonData ? JSON.stringify(jsonData) : null,
                    signal: controller.signal,
                });

                let data;
                try {
                    data = await response.json();
                    clearTimeout(timeoutId);
                } catch (e) {
                    clearTimeout(timeoutId);
                    this.lastRequestTransient = true;
                    this.lastRequestError = "EMPTY_RESPONSE";
                    this.lastRequestPath = path;
                    logWarning(
                        `Response bukan JSON (HTTP ${response.status}), retry cepat (smart timeout)... ` +
                        `(attempt ${attempt + 1}/${retries})`
                    );
                    if (attempt < retries - 1) {
                        await sleep(this._getBackoff(attempt, url, response.status) * 1000);
                    }
                    continue;
                }

                if (data.success) {
                    this._resetRequestState();
                    return data.data;
                }

                const err = data.error || {};
                const code = err.code || "UNKNOWN";
                const msg = err.message || "Unknown error";
                this.lastRequestError = code;
                this.lastRequestPath = path;
                logError(`API Error [${code}]: ${msg} (attempt ${attempt + 1}/${retries})`);

                if (code === "ALREADY_ACTED" || code === "GAME_NOT_RUNNING") {
                    return null;
                }

                if (attempt < retries - 1) {
                    await sleep(this._getBackoff(attempt, url) * 1000);
                }

            } catch (error) {
                clearTimeout(timeoutId);

                if (error.name === 'AbortError' || error.message?.includes('timeout')) {
                    this.lastRequestTransient = true;
                    this.lastRequestError = "REQUEST_TIMEOUT";
                    this.lastRequestPath = path;
                    this._warnOrError(url, `Request timeout: ${error.message} (attempt ${attempt + 1}/${retries}) | smart timeout aktif`);
                } else {
                    this.lastRequestTransient = true;
                    this.lastRequestError = "REQUEST_FAILED";
                    this.lastRequestPath = path;
                    this._warnOrError(url, `Request failed: ${error.message} (attempt ${attempt + 1}/${retries})`);
                }

                if (attempt < retries - 1) {
                    await sleep(this._getBackoff(attempt, url) * 1000);
                }
            }
        }

        return null;
    }

    async _requestOnce(method, path, jsonData = null, retries = null, timeoutOverride = null) {
        const url = `${this.base_url}${path}`;
        this._resetRequestState();
        retries = retries === null ? API_DEFAULT_RETRIES : Math.max(1, parseInt(retries));
        const [connectTimeout, readTimeout] = this._resolveTimeout(url, timeoutOverride);

        const controller = new AbortController();
        const timeoutMs = (connectTimeout + readTimeout) * 1000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const headers = {
                    'Content-Type': 'application/json',
                };
                if (this.api_key) {
                    headers['X-API-Key'] = this.api_key;
                }

                const response = await fetch(url, {
                    method,
                    headers,
                    body: jsonData ? JSON.stringify(jsonData) : null,
                    signal: controller.signal,
                });

                let data;
                try {
                    data = await response.json();
                    clearTimeout(timeoutId);
                } catch (e) {
                    clearTimeout(timeoutId);
                    this.lastRequestTransient = true;
                    this.lastRequestError = "EMPTY_RESPONSE";
                    this.lastRequestPath = path;
                    logWarning(
                        `Response bukan JSON (HTTP ${response.status}), kemungkinan server lambat / gateway timeout ` +
                        `(attempt ${attempt + 1}/${retries})`
                    );
                    if (attempt < retries - 1) {
                        await sleep(this._getBackoff(attempt, url, response.status) * 1000);
                        continue;
                    }
                    return [null, "EMPTY_RESPONSE"];
                }

                if (data.success) {
                    this._resetRequestState();
                    return [data.data, null];
                }

                const err = data.error || {};
                const code = err.code || "UNKNOWN";
                const msg = err.message || "Unknown error";
                this.lastRequestError = code;
                this.lastRequestPath = path;
                logError(`API Error [${code}]: ${msg} (attempt ${attempt + 1}/${retries})`);
                return [null, code];

            } catch (error) {
                clearTimeout(timeoutId);

                if (error.name === 'AbortError' || error.message?.includes('timeout')) {
                    this.lastRequestTransient = true;
                    this.lastRequestError = "REQUEST_TIMEOUT";
                    this.lastRequestPath = path;
                    this._warnOrError(url, `Request timeout: ${error.message} (attempt ${attempt + 1}/${retries}) | smart timeout aktif`);
                } else {
                    this.lastRequestTransient = true;
                    this.lastRequestError = "REQUEST_FAILED";
                    this.lastRequestPath = path;
                    this._warnOrError(url, `Request failed: ${error.message} (attempt ${attempt + 1}/${retries})`);
                }

                if (attempt < retries - 1) {
                    await sleep(this._getBackoff(attempt, url) * 1000);
                    continue;
                }
                return [null, "REQUEST_FAILED"];
            }
        }

        return [null, "REQUEST_FAILED"];
    }

    // Account endpoints
    async createAccount(name) {
        return this._request("POST", "/accounts", { name });
    }

    async getAccount() {
        return this._request("GET", "/accounts/me");
    }

    // Game endpoints
    async listGames(status = "waiting") {
        return this._request("GET", `/games?status=${status}`);
    }

    async createGame(hostName = "JavaScriptBotRoom") {
        return this._request("POST", "/games", { hostName });
    }

    async getGameInfo(gameId) {
        return this._request("GET", `/games/${gameId}`, null, API_STATE_RETRIES, [STATE_CONNECT_TIMEOUT, STATE_READ_TIMEOUT]);
    }

    async getGameState(gameId) {
        return this._request("GET", `/games/${gameId}/state`, null, API_STATE_RETRIES, [STATE_CONNECT_TIMEOUT, STATE_READ_TIMEOUT]);
    }

    // Agent endpoints
    async registerAgent(gameId, name) {
        return this._request("POST", `/games/${gameId}/agents/register`, { name });
    }

    async getState(gameId, agentId) {
        return this._request("GET", `/games/${gameId}/agents/${agentId}/state`, null, API_STATE_RETRIES, [STATE_CONNECT_TIMEOUT, STATE_READ_TIMEOUT]);
    }

    async executeAction(gameId, agentId, action, thought = null) {
        const body = { action };
        if (thought) {
            body.thought = thought;
        }
        return this._request("POST", `/games/${gameId}/agents/${agentId}/action`, body, ACTION_POST_RETRIES, [ACTION_POST_CONNECT_TIMEOUT, ACTION_POST_READ_TIMEOUT]);
    }
}

function getBlockedGameIds(api) {
    return api._blockedGameIds;
}

// ══════════════════════════════════════════════════════════════
//  AI DECISION ENGINE
// ══════════════════════════════════════════════════════════════

class AgentBrain {
    constructor() {
        this.lastActionTime = 0;
        this.lastRegion = null;
        this.exploredRegions = new Set();
        this.visitedRegions = new Set();
        this.knownDeathZones = new Set();
        this.recentRegions = [];
        this.maxRecentRegions = 5;
        this.usedUtilityIds = new Set();
        this.usedPermanentUtilityNames = new Set();
        this.turnCount = 0;
        this.gameStartedLocalTs = null;
        this.gamePhase = "EARLY";
        this.teamAllies = new Set(TEAM_ALLIES);
        this.teamMode = TEAM_ALLIES.has(AGENT_NAME);
        if (this.teamMode) {
            logInfo(`🤝 Team mode aktif: ${Array.from(this.teamAllies).join(', ')}`);
        }
    }

    _decision(action, thought, desc, meta = null) {
        return [action, thought, desc, meta || {}];
    }

    commitSuccess(action, meta = null) {
        meta = meta || {};
        const actionType = action.type || "";
        const GROUP1_ACTIONS = new Set(["move", "explore", "attack", "use_item", "interact", "rest"]);

        if (GROUP1_ACTIONS.has(actionType)) {
            this.lastActionTime = Date.now() / 1000;
        }

        if (actionType === "use_item") {
            if (meta.mark_utility_used) {
                const itemId = action.itemId;
                if (itemId) {
                    this.usedUtilityIds.add(itemId);
                }
            }

            const utilityName = normalizeItemName(meta.utility_name || '');
            if (PERMANENT_BUFF_UTILITY_NAMES.has(utilityName)) {
                this.usedPermanentUtilityNames.add(utilityName);
            }
        }

        if (actionType === "explore") {
            const regionId = meta.region_id;
            if (regionId) {
                this.exploredRegions.add(regionId);
            }
        }
    }

    syncCooldown() {
        this.lastActionTime = Date.now() / 1000;
    }

    _estimateLocalTurn() {
        if (this.gameStartedLocalTs === null) return 0;
        const elapsed = Math.max(0, (Date.now() / 1000) - this.gameStartedLocalTs);
        return Math.floor(elapsed / TURN_SECONDS_ESTIMATE);
    }

    _estimateLocalDay() {
        return 1 + Math.floor(this._estimateLocalTurn() / TURNS_PER_IN_GAME_DAY);
    }

    _getPhase(aliveCount = null, context = null) {
        if (aliveCount !== null) {
            if (aliveCount > PHASE_EARLY_THRESHOLD) return "EARLY";
            if (aliveCount > PHASE_MID_THRESHOLD) return "MID";
            return "ENDGAME";
        }

        const ctx = context || {};
        const localDay = Math.max(1, ctx.local_day || this._estimateLocalDay());
        const isDeathZone = !!ctx.is_death_zone;
        const regionIsDangerSoon = !!ctx.region_is_danger_soon;
        const pendingCount = parseInt(ctx.pending_count || 0, 10);
        const dangerRatio = parseFloat(ctx.danger_ratio || 0.0);
        const safeExits = Math.max(0, parseInt(ctx.safe_exits || 0, 10));
        const nearbyHostiles = Math.max(0, parseInt(ctx.nearby_hostiles || 0, 10));

        if (isDeathZone) return "ENDGAME";

        if (localDay <= 1 && pendingCount === 0 && dangerRatio < 0.34) {
            return "EARLY";
        }

        if (dangerRatio < 0.85) {
            if (localDay >= 2 || pendingCount > 0 || dangerRatio >= 0.20 || regionIsDangerSoon) {
                return "MID";
            }
            return "EARLY";
        }

        let endgameScore = 0;
        if (localDay >= 12) endgameScore += 1;
        if (pendingCount >= 4) endgameScore += 1;
        else if (pendingCount >= 2) endgameScore += 1;
        if (regionIsDangerSoon) endgameScore += 1;
        if (safeExits <= 1) endgameScore += 2;
        else if (safeExits <= 2) endgameScore += 1;
        if (nearbyHostiles >= 3 && safeExits <= 1) endgameScore += 1;

        if (dangerRatio >= 0.92 && safeExits <= 2) return "ENDGAME";
        if (dangerRatio >= 0.85 && safeExits <= 1) return "ENDGAME";
        if (endgameScore >= 4) return "ENDGAME";

        return "MID";
    }

    _isAllyAgent(agent) {
        if (!this.teamMode || !agent || typeof agent !== 'object') return false;
        const name = (agent.name || '').trim();
        return !!name && this.teamAllies.has(name);
    }

    _filterHostileAgents(agents) {
        if (!agents || agents.length === 0) return [];
        if (!this.teamMode) {
            return agents.filter(a => a.isAlive !== false);
        }
        return agents.filter(a => a.isAlive !== false && !this._isAllyAgent(a));
    }

    _countEnemiesInRegion(agents, regionId) {
        return agents.filter(a =>
            a.isAlive !== false &&
            a.regionId === regionId &&
            !this._isAllyAgent(a)
        ).length;
    }

    _countVisibleHostilesByRegion(agents) {
        const hostileCountByRegion = {};
        const rangedCountByRegion = {};

        for (const a of (agents || [])) {
            if (a.isAlive === false) continue;
            if (this._isAllyAgent(a)) continue;
            const rid = a.regionId || "";
            if (!rid) continue;

            hostileCountByRegion[rid] = (hostileCountByRegion[rid] || 0) + 1;
            if (isRangedWeapon(a.equippedWeapon)) {
                rangedCountByRegion[rid] = (rangedCountByRegion[rid] || 0) + 1;
            }
        }

        return [hostileCountByRegion, rangedCountByRegion];
    }

    _analyzeAdjacentRangedThreat(agents, connected, myDef, myHp) {
        const connectedIds = new Set();
        for (const c of (connected || [])) {
            const rid = typeof c === 'string' ? c : (c?.id || '');
            if (rid) connectedIds.add(rid);
        }

        const rangedHostiles = [];
        let totalPressure = 0;
        let maxSingle = 0;

        for (const a of agents || []) {
            if (a.isAlive === false) continue;
            if (this._isAllyAgent(a)) continue;
            if (!connectedIds.has(a.regionId || '')) continue;

            const aWeapon = a.equippedWeapon;
            if (!isRangedWeapon(aWeapon)) continue;

            const aAtk = a.atk || 10;
            const aWeaponBonus = getWeaponBonus(aWeapon) || 0;
            const dmg = estimateDamageReceived(aAtk, aWeaponBonus, myDef);
            totalPressure += dmg;
            maxSingle = Math.max(maxSingle, dmg);
            rangedHostiles.push([a, dmg]);
        }

        const count = rangedHostiles.length;
        const critical = (maxSingle >= myHp) || (totalPressure >= myHp) || (count >= 2 && totalPressure >= myHp * 0.7);

        return {
            count,
            pressure: totalPressure,
            max_single: maxSingle,
            critical,
            targets: rangedHostiles,
        };
    }

    _countMonstersInRegion(monsters, regionId) {
        return monsters.filter(m => m.regionId === regionId).length;
    }

    _shouldForceEmergencyHeal(isDeathZone, regionIsDangerSoon, lethalEnemyHere, hpPct, enemiesHere) {
        if (isDeathZone) {
            return hpPct < 100;
        }
        if (lethalEnemyHere) {
            return hpPct < 90 || enemiesHere.length > 0;
        }
        if (regionIsDangerSoon) {
            return hpPct < 70 || enemiesHere.length >= 2;
        }
        return false;
    }

    _shouldSkipUtilityPickup(item, inventory) {
        if (!item || item.category !== "utility") return false;

        const key = normalizeItemName(item.name || '');
        if (SOCIAL_UTILITY_NAMES.has(key)) return true;

        if (PERMANENT_BUFF_UTILITY_NAMES.has(key)) {
            if (this.usedPermanentUtilityNames.has(key)) return true;
            for (const invItem of (inventory || [])) {
                if (invItem.category !== "utility") continue;
                if (normalizeItemName(invItem.name || '') === key) return true;
            }
        }

        return false;
    }

    _shouldSkipUtilityUse(item) {
        if (!item || item.category !== "utility") return false;

        const key = normalizeItemName(item.name || '');
        if (SOCIAL_UTILITY_NAMES.has(key)) return true;
        if (PERMANENT_BUFF_UTILITY_NAMES.has(key) && this.usedPermanentUtilityNames.has(key)) return true;

        return false;
    }

    _itemValue(item, currentWeaponBonus = 0, hpPct = 100, inventory = []) {
        if (!item) return -999;

        const cat = item.category || '';
        const name = item.name || '';
        const itemId = item.id || '';
        const nameKey = normalizeItemName(name);

        if (cat === "currency") return 1000;

        if (cat === "weapon") {
            const bonus = item.atkBonus ?? WEAPON_PRIORITY[name] ?? 0;
            const upgrade = bonus - currentWeaponBonus;
            
            // Cek apakah ada senjata dengan nama sama atau yang sama kuatnya/lebih kuat
            for (const invItem of (inventory || [])) {
                if (invItem.category === "weapon") {
                    const invBonus = invItem.atkBonus ?? WEAPON_PRIORITY[invItem.name || ''] ?? 0;
                    if (invItem.name === name || invBonus >= bonus) {
                        return -500; // Sudah punya yang sama atau lebih baik
                    }
                }
            }

            if (upgrade > 0) return 70 + (upgrade * 4);
            return -500; // Jangan pungut senjata jika bukan upgrade
        }

        if (cat === "utility") {
            if (SOCIAL_UTILITY_NAMES.has(nameKey)) return -1000;

            if (PERMANENT_BUFF_UTILITY_NAMES.has(nameKey)) {
                if (this.usedPermanentUtilityNames.has(nameKey)) return -300;
                return { "map": 56, "binoculars": 52, "armor kit": 36 }[nameKey] || 34;
            }

            if (this.usedUtilityIds.has(itemId)) return 4;

            return { "rope": 38 }[nameKey] || 34;
        }

        if (cat === "recovery") {
            let base = { "medkit": 45, "Bandage": 28, "Emergency rations": 18 }[name] || 15;
            if (hpPct < 35) base += 15;
            else if (hpPct > 85 && name === "medkit") base -= 8;
            return base;
        }

        return 12;
    }

    _chooseGroundItemAction(groundItemsHere, inventory, weaponBonus, hpPct) {
        if ((inventory || []).length >= 10) return null;

        const groundCount = groundItemsHere.length;
        let bestVi = null;
        let bestItem = null;
        let bestScore = -999;

        for (const vi of groundItemsHere) {
            const item = vi.item || {};
            const itemId = item.id;
            if (!itemId) continue;

            if (this._shouldSkipUtilityPickup(item, inventory)) continue;

            let score = this._itemValue(item, weaponBonus, hpPct, inventory);
            if (groundCount > 1) {
                score += 4;
                if (item.category === "weapon") score += 3;
            }

            if (score > bestScore) {
                bestScore = score;
                bestVi = vi;
                bestItem = item;
            }
        }

        if (!bestItem) return null;

        const itemName = bestItem.name || '???';
        const category = bestItem.category || '';
        const minPickScore = groundCount > 1 ? 14 : 18;

        if (bestScore < minPickScore) return null;

        if (groundCount > 1) {
            logItem(`Pickup cepat (${groundCount} item): ${itemName} (${category})`);
        } else {
            logItem(`Pickup prioritas: ${itemName} (${category})`);
        }

        return this._decision(
            { type: "pickup", itemId: bestItem.id },
            {
                reasoning: `${itemName} adalah item paling bernilai di region ini dan masih layak mengisi slot tas`,
                plannedAction: `Pickup ${itemName}`
            },
            `Pickup ${itemName}`,
            {
                pickup_item_count: groundCount,
                pickup_fast_chain: groundCount > 1,
            }
        );
    }

    _findSafeRegion(connected, visibleRegions = null, visibleAgents = null) {
        const deathZoneIds = this.knownDeathZones;
        const [enemyCountByRegion, rangedCountByRegion] = this._countVisibleHostilesByRegion(visibleAgents);

        const candidateEnemyCounts = [];
        for (const r of connected || []) {
            const rid = typeof r === 'string' ? r : (r?.id || '');
            if (!rid || deathZoneIds.has(rid)) continue;
            const vrInfo = typeof r === 'object' ? r : this._getVisibleRegionInfo(rid, visibleRegions);
            if (vrInfo?.isDeathZone) continue;
            candidateEnemyCounts.push(enemyCountByRegion[rid] || 0);
        }

        const safestVisibleEnemyCount = candidateEnemyCounts.length > 0 ? Math.min(...candidateEnemyCounts) : 0;
        const crowdSkipThreshold = safestVisibleEnemyCount + 1;

        const scored = [];
        for (const r of connected || []) {
            const rid = typeof r === 'string' ? r : (r?.id || '');
            if (!rid || deathZoneIds.has(rid)) continue;

            const vrInfo = typeof r === 'object' ? r : this._getVisibleRegionInfo(rid, visibleRegions);
            if (vrInfo?.isDeathZone) continue;

            const hostileCount = enemyCountByRegion[rid] || 0;
            const rangedCount = rangedCountByRegion[rid] || 0;
            if (hostileCount >= 3) continue;
            if (candidateEnemyCounts.length > 0 && hostileCount > crowdSkipThreshold) continue;

            const terrain = vrInfo?.terrain || 'plains';
            const terrainScore = TERRAIN_SCORE[terrain] || 2;
            let enemyPenalty = hostileCount * 22;
            const rangedPenalty = rangedCount * 14;
            if (safestVisibleEnemyCount === 0 && hostileCount > 0) enemyPenalty += 10;
            const recentPenalty = this.recentRegions.includes(rid) ? 12 : 0;
            const visitPenalty = this.visitedRegions.has(rid) ? 4 : -4;

            let facilityBonus = 0;
            if (vrInfo && typeof vrInfo === 'object') {
                for (const f of (vrInfo.interactables || [])) {
                    if (!f.isUsed) facilityBonus += 2;
                }
            }

            const centerBias = this._regionCenterBias(r, rid, visibleRegions);
            let centerWeight = 0.8;
            if (this.gamePhase === "MID") centerWeight = 1.45;
            else if (this.gamePhase === "ENDGAME") centerWeight = 1.8;

            const score = (
                terrainScore +
                facilityBonus +
                (centerBias * centerWeight) -
                enemyPenalty -
                rangedPenalty -
                recentPenalty -
                visitPenalty
            );
            scored.push([score, hostileCount, rangedCount, centerBias, r]);
        }

        if (scored.length > 0) {
            scored.sort((a, b) => {
                if (b[0] !== a[0]) return b[0] - a[0];
                if (b[3] !== a[3]) return b[3] - a[3];
                return a[1] - b[1] || a[2] - b[2];
            });
            return scored[0][4];
        }
        return null;
    }

    _getVisibleRegionInfo(regionId, visibleRegions) {
        if (!visibleRegions) return null;
        for (const vr of visibleRegions) {
            if (typeof vr === 'object' && vr.id === regionId) {
                return vr;
            }
        }
        return null;
    }

    _regionConnectionDegree(region, rid, visibleRegions = null) {
        if (!region || !rid) return 0;

        const vrInfo = typeof region === 'object' ? region : this._getVisibleRegionInfo(rid, visibleRegions);
        if (vrInfo && typeof vrInfo === 'object') {
            const connections = vrInfo.connections || [];
            if (Array.isArray(connections)) return connections.length;
        }
        return 0;
    }

    _regionCenterBias(region, rid, visibleRegions = null) {
        if (!region || !rid) return 0.0;

        const vrInfo = typeof region === 'object' ? region : this._getVisibleRegionInfo(rid, visibleRegions);
        const degree = this._regionConnectionDegree(region, rid, visibleRegions);
        if (degree <= 0) return 0.0;

        let safeExits = degree;
        if (vrInfo && typeof vrInfo === 'object') {
            const connections = vrInfo.connections || [];
            if (Array.isArray(connections) && connections.length > 0) {
                safeExits = 0;
                for (const conn of connections) {
                    const connId = typeof conn === 'string' ? conn : (conn?.id || '');
                    if (connId && !this.knownDeathZones.has(connId)) {
                        safeExits++;
                    }
                }
            }
        }

        let centerBonus = (degree * 2.0) + (safeExits * 1.5);

        if (safeExits <= 2) centerBonus -= 6.0;
        else if (safeExits >= 5) centerBonus += 4.0;

        if (degree >= 5) centerBonus += 3.0;

        if (typeof vrInfo === 'object') {
            const name = String(vrInfo.name || '').toLowerCase();
            if (name.includes('center') || name.includes('central') || name.includes('middle')) {
                centerBonus += 5.0;
            }
        }

        return centerBonus;
    }

    _resolveRegionName(region, rid, visibleRegions = null) {
        if (typeof region === 'object' && region.name) return region.name;
        if (visibleRegions) {
            const vrInfo = this._getVisibleRegionInfo(rid, visibleRegions);
            if (vrInfo?.name) return vrInfo.name;
        }
        return rid.length > 12 ? rid.slice(0, 12) + '...' : rid;
    }

    _findHealItem(inventory, hpPct = 100) {
        const healItems = [];
        for (const item of (inventory || [])) {
            if (item.category === "recovery") {
                const name = item.name || '';
                const priority = { "medkit": 3, "Bandage": 2, "Emergency rations": 1 }[name] || 0;
                if (priority > 0) {
                    healItems.push([priority, item]);
                }
            }
        }
        if (healItems.length > 0) {
            if (hpPct < 30) {
                healItems.sort((a, b) => b[0] - a[0]);
            } else {
                healItems.sort((a, b) => a[0] - b[0]);
            }
            return healItems[0][1];
        }
        return null;
    }

    _findFacility(interactables, ftype) {
        for (const f of (interactables || [])) {
            if (f.type === ftype && !f.isUsed) return f;
        }
        return null;
    }

    _pickBestFacility(interactables, hpPct) {
        const priorityOrder = [];
        if (hpPct < 80) priorityOrder.push("medical_facility");
        priorityOrder.push("supply_cache", "watchtower");
        if (hpPct >= 80) priorityOrder.push("medical_facility");

        for (const ftype of priorityOrder) {
            const facility = this._findFacility(interactables, ftype);
            if (facility) return facility;
        }
        return null;
    }

    _getAttackableRegionIds(myRegion, connected, weaponRange) {
        const attackable = new Set([myRegion]);
        if (weaponRange > 0 && effectiveRangedTargetMode === "adjacent") {
            for (const r of (connected || [])) {
                const rid = typeof r === 'string' ? r : (r?.id || '');
                if (rid) attackable.add(rid);
            }
        }
        return attackable;
    }

    _pickMonsterTarget(monsters, myRegion, connected, myAtk, weaponBonus, weaponRange) {
        const candidates = [];
        const attackableRegions = this._getAttackableRegionIds(myRegion, connected, weaponRange);

        for (const m of (monsters || [])) {
            const mRegion = m.regionId || '';
            if (!attackableRegions.has(mRegion)) continue;

            const mHp = m.hp || 999;
            const mDef = m.def || 0;
            const name = m.name || '';
            const difficulty = MONSTER_DIFFICULTY[name] || 5;

            if (canKillInHits(myAtk, weaponBonus, mHp, mDef, 3)) {
                const sameRegionBonus = mRegion === myRegion ? 0 : 1;
                candidates.push([difficulty, sameRegionBonus, mHp, m]);
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
            return candidates[0][3];
        }
        return null;
    }

    _pickAgentTarget(agents, myRegion, connected, myAtk, weaponBonus, weaponRange, myHp, myDef, gamePhase = "EARLY") {
        const candidates = [];
        const attackableRegions = this._getAttackableRegionIds(myRegion, connected, weaponRange);

        for (const a of (agents || [])) {
            if (a.isAlive === false) continue;
            if (this._isAllyAgent(a)) continue;

            const aRegion = a.regionId || '';
            if (!attackableRegions.has(aRegion)) continue;

            const aHp = a.hp || 999;
            const aDef = a.def || 5;
            const aAtk = a.atk || 10;
            const aWeapon = a.equippedWeapon;
            const aWeaponBonus = getWeaponBonus(aWeapon) || 0;

            const dmgDealt = calcDamage(myAtk, weaponBonus, aDef);
            const dmgRecv = estimateDamageReceived(aAtk, aWeaponBonus, myDef);
            if (dmgDealt <= 0) continue;

            const killHits = Math.max(1, Math.ceil(aHp / dmgDealt));
            const deathHits = Math.max(1, Math.ceil(myHp / Math.max(1, dmgRecv)));
            const localEnemyCount = this._countEnemiesInRegion(agents, aRegion);

            if (dmgRecv >= myHp && killHits > 1) continue;

            const maxKillHits = gamePhase === "ENDGAME" ? MODE_AGENT_MAX_KILL_HITS_END : MODE_AGENT_MAX_KILL_HITS;
            if (killHits > maxKillHits) continue;
            if (deathHits < killHits) {
                if (gamePhase !== "ENDGAME" || !RELAX_ENDGAME_TRADE) continue;
                if (deathHits + 1 < killHits) continue;
            }

            const targetIsRanged = isRangedWeapon(aWeapon);
            let score = 0;
            score += killHits === 1 ? 34 : killHits === 2 ? 20 : 8;
            score += Math.min(24, deathHits * 4);
            score -= Math.min(28, dmgRecv * 0.8);
            score -= Math.max(0, localEnemyCount - 1) * 12;
            score += aRegion === myRegion ? 6 : 0;
            score += dmgRecv <= Math.max(1, myHp * 0.25) ? 6 : 0;
            score += aHp <= myHp ? 6 : 0;
            if (targetIsRanged) {
                score += aRegion === myRegion ? 8 : 12;
                if (killHits <= 2) score += 4;
            }
            if (gamePhase === "ENDGAME") score += 6;
            if (deathHits === killHits) score -= 8;

            const minScore = gamePhase === "ENDGAME" ? MODE_MIN_SCORE_END : MODE_MIN_SCORE_MID;
            if (score >= minScore) {
                candidates.push([score, killHits, aRegion !== myRegion, aHp, a]);
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                if (b[0] !== a[0]) return b[0] - a[0];
                if (a[1] !== b[1]) return a[1] - b[1];
                if (a[2] !== b[2]) return a[2] - b[2];
                return a[3] - b[3];
            });
            return candidates[0][4];
        }
        return null;
    }

    _pickCoverFireTarget(agents, myRegion, connected, myAtk, weaponBonus, weaponRange, myHp, myDef, gamePhase = "EARLY") {
        if (weaponRange <= 0) return null;

        const connectedIds = new Set();
        for (const r of (connected || [])) {
            const rid = typeof r === 'object' ? (r.id || '') : r;
            if (rid) connectedIds.add(rid);
        }
        if (connectedIds.size === 0) return null;

        const candidates = [];
        for (const a of (agents || [])) {
            if (a.isAlive === false) continue;
            if (this._isAllyAgent(a)) continue;

            const aRegion = a.regionId || '';
            if (!connectedIds.has(aRegion)) continue;

            const aHp = a.hp || 999;
            const aDef = a.def || 5;
            const aAtk = a.atk || 10;
            const aWeapon = a.equippedWeapon;
            const aWeaponBonus = getWeaponBonus(aWeapon) || 0;

            const dmgDealt = calcDamage(myAtk, weaponBonus, aDef);
            const dmgRecv = estimateDamageReceived(aAtk, aWeaponBonus, myDef);
            if (dmgDealt <= 0) continue;

            const killHits = Math.max(1, Math.ceil(aHp / dmgDealt));
            const deathHits = Math.max(1, Math.ceil(myHp / Math.max(1, dmgRecv)));
            const localEnemyCount = this._countEnemiesInRegion(agents, aRegion);

            if (localEnemyCount > 2) continue;
            if (dmgRecv >= myHp && killHits > 1) continue;

            const maxKillHits = (gamePhase === "ENDGAME" ? MODE_AGENT_MAX_KILL_HITS_END : MODE_AGENT_MAX_KILL_HITS) + 1;
            if (killHits > maxKillHits) continue;
            if (deathHits + 1 < killHits) continue;

            const targetIsRanged = isRangedWeapon(aWeapon);
            let score = 18;
            score += killHits === 1 ? 30 : killHits === 2 ? 18 : 8;
            score += Math.min(18, deathHits * 3);
            score -= Math.min(24, dmgRecv * 0.7);
            score -= Math.max(0, localEnemyCount - 1) * 16;
            score += 12;
            score += localEnemyCount === 1 ? 6 : 0;
            score += targetIsRanged ? 8 : 0;
            score += aHp <= myHp ? 4 : 0;
            if (deathHits === killHits) score -= 4;
            if (gamePhase === "ENDGAME") score += 4;

            const minScore = Math.max(6, (gamePhase === "ENDGAME" ? MODE_MIN_SCORE_END : MODE_MIN_SCORE_MID) - 6);
            if (score >= minScore) {
                candidates.push([score, localEnemyCount, killHits, aHp, a]);
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                if (b[0] !== a[0]) return b[0] - a[0];
                if (a[1] !== b[1]) return a[1] - b[1];
                if (a[2] !== b[2]) return a[2] - b[2];
                return a[3] - b[3];
            });
            return candidates[0][4];
        }
        return null;
    }

    _pickMidHunterRegion(connected, visibleRegions, visibleAgents) {
        const candidates = [];
        for (const r of (connected || [])) {
            const rid = typeof r === 'string' ? r : (r?.id || '');
            if (!rid) continue;

            const vrInfo = typeof r === 'object' ? r : this._getVisibleRegionInfo(rid, visibleRegions);
            if (vrInfo?.isDeathZone || this.knownDeathZones.has(rid)) continue;

            const hostiles = (visibleAgents || []).filter(a =>
                a.isAlive !== false &&
                a.regionId === rid &&
                !this._isAllyAgent(a)
            );
            const hostileCount = hostiles.length;
            if (hostileCount <= 0 || hostileCount > 2) continue;

            const weakestHp = Math.min(...hostiles.map(a => a.hp ?? 999));
            const avgHp = hostiles.reduce((sum, a) => sum + (a.hp ?? 999), 0) / hostileCount;
            const rangedCount = hostiles.filter(a => isRangedWeapon(a.equippedWeapon)).length;
            const terrain = vrInfo?.terrain || 'plains';
            const terrainScore = TERRAIN_SCORE[terrain] || 2;
            const recentPenalty = this.recentRegions.includes(rid) ? 8 : 0;
            const visitedPenalty = this.visitedRegions.has(rid) ? 4 : 0;
            const multiPenalty = hostileCount === 2 ? 32 : 0;

            let score = 42;
            score += hostileCount === 1 ? 16 : 0;
            score += rangedCount * 12;
            if (hostileCount === 1 && rangedCount === 1) score += 8;
            score -= weakestHp * 0.8;
            score -= avgHp * 0.35;
            score += terrainScore * 3;
            score -= recentPenalty + visitedPenalty + multiPenalty;

            const targetNames = hostiles
                .sort((a, b) => (a.hp ?? 999) - (b.hp ?? 999))
                .slice(0, 2)
                .map(a => a.name || 'Agent')
                .join(', ');
            const note = `${hostileCount} hostile | ranged:${rangedCount} | target: ${targetNames}`;
            candidates.push([score, hostileCount, weakestHp, rid, this._resolveRegionName(vrInfo, rid, visibleRegions), note]);
        }

        if (candidates.length > 0) {
            if (candidates.some(c => c[1] === 1)) {
                candidates.filter(c => c[1] === 1);
            }
            candidates.sort((a, b) => -b[0] || a[1] - b[1] || a[2] - b[2]);
            const [_, __, ___, rid, rname, note] = candidates[0];
            return [rid, rname, note];
        }
        return null;
    }

    _pickChaseRegion(connected, visibleRegions, visibleAgents) {
        const candidates = [];
        for (const r of (connected || [])) {
            const rid = typeof r === 'string' ? r : (r?.id || '');
            if (!rid) continue;

            const vrInfo = typeof r === 'object' ? r : this._getVisibleRegionInfo(rid, visibleRegions);
            if (vrInfo?.isDeathZone || this.knownDeathZones.has(rid)) continue;

            const hostiles = (visibleAgents || []).filter(a =>
                a.isAlive !== false && a.regionId === rid && !this._isAllyAgent(a)
            );
            if (hostiles.length !== 1) continue;

            const target = hostiles[0];
            const targetHp = target.hp ?? 999;
            if (targetHp > MODE_CHASE_MAX_TARGET_HP) continue;

            const targetIsRanged = isRangedWeapon(target.equippedWeapon);
            const terrain = vrInfo?.terrain || 'plains';
            let score = 20 - targetHp;
            score += (TERRAIN_SCORE[terrain] || 2) * 2;
            if (['forest', 'plains', 'ruins'].includes(terrain)) score += 4;
            if (targetIsRanged) score += 10;

            candidates.push([score, targetHp, rid, this._resolveRegionName(vrInfo, rid, visibleRegions), target.name || 'Agent']);
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => -b[0] || a[1] - b[1]);
            const [_, __, rid, rname, tname] = candidates[0];
            return [rid, rname, tname];
        }
        return null;
    }

    _findBetterWeaponRegion(visibleItems, connected, visibleRegions, currentBonus, myRegionId) {
        const deathZoneIds = this.knownDeathZones;
        let best = null;
        let bestBonus = currentBonus;

        for (const vi of (visibleItems || [])) {
            const item = vi.item || {};
            if (item.category !== "weapon") continue;
            const itemBonus = item.atkBonus ?? WEAPON_PRIORITY[item.name || ''] ?? 0;
            if (itemBonus <= bestBonus) continue;

            const itemRegion = vi.regionId || '';
            if (itemRegion === myRegionId) continue;
            if (deathZoneIds.has(itemRegion)) continue;

            let isConnected = false;
            for (const cr of (connected || [])) {
                const crId = typeof cr === 'string' ? cr : (cr?.id || '');
                if (crId === itemRegion) {
                    if (typeof cr === 'object' && cr.isDeathZone) break;
                    isConnected = true;
                    break;
                }
            }
            if (!isConnected) continue;

            bestBonus = itemBonus;
            const rname = this._resolveRegionName(itemRegion, itemRegion, visibleRegions);
            best = [itemRegion, rname, item.name || '???', itemBonus];
        }

        return best;
    }

    _pickMoveTarget(connected, visibleRegions = null, visibleAgents = null) {
        const deathZoneIds = this.knownDeathZones;
        const [enemyCountByRegion, rangedCountByRegion] = this._countVisibleHostilesByRegion(visibleAgents);

        const validEnemyCounts = [];
        const validRegions = [];
        for (const r of (connected || [])) {
            const rid = typeof r === 'string' ? r : (r?.id || '');
            if (!rid) continue;
            const vrInfo = typeof r === 'object' ? r : (visibleRegions ? this._getVisibleRegionInfo(rid, visibleRegions) : null);
            if (deathZoneIds.has(rid)) continue;
            if (vrInfo?.isDeathZone) continue;
            validRegions.push([r, rid, vrInfo]);
            validEnemyCounts.push(enemyCountByRegion[rid] || 0);
        }

        const safestVisibleEnemyCount = validEnemyCounts.length > 0 ? Math.min(...validEnemyCounts) : 0;
        const crowdSkipThreshold = safestVisibleEnemyCount + 1;

        const scored = [];
        for (const [r, rid, vrInfo] of validRegions) {
            const terrain = vrInfo?.terrain || 'plains';
            const tScore = TERRAIN_SCORE[terrain] || 2;

            let facilityBonus = 0;
            const interactables = vrInfo?.interactables || (typeof r === 'object' ? r.interactables : []) || [];
            for (const f of interactables) {
                if (!f.isUsed) facilityBonus += 2;
            }

            const hostileCount = enemyCountByRegion[rid] || 0;
            const rangedCount = rangedCountByRegion[rid] || 0;

            if (hostileCount >= 3) continue;
            if (validEnemyCounts.length > 0 && hostileCount > crowdSkipThreshold) continue;

            const recentPenalty = this.recentRegions.includes(rid) ? -16 : 0;
            const visitedBias = this.visitedRegions.has(rid) ? -4 : 5;
            let enemyPenalty = (-24 * hostileCount) + (-14 * rangedCount);
            if (hostileCount >= 2) enemyPenalty -= 10;
            if (safestVisibleEnemyCount === 0 && hostileCount > 0) enemyPenalty -= 8;

            const centerBias = this._regionCenterBias(r, rid, visibleRegions);
            let centerWeight = 0.9;
            if (this.gamePhase === "MID") centerWeight = 1.6;
            else if (this.gamePhase === "ENDGAME") centerWeight = 2.0;

            const total = (
                tScore +
                facilityBonus +
                visitedBias +
                recentPenalty +
                enemyPenalty +
                (centerBias * centerWeight) +
                Math.random() * 0.5
            );
            scored.push([total, centerBias, -hostileCount, -rangedCount, r]);
        }

        if (scored.length > 0) {
            scored.sort((a, b) => {
                if (b[0] !== a[0]) return b[0] - a[0];
                if (b[1] !== a[1]) return b[1] - a[1];
                if (b[2] !== a[2]) return b[2] - a[2];
                if (b[3] !== a[3]) return b[3] - a[3];
                return 0;
            });
            return scored[0][4];
        }
        return null;
    }

    decide(state, aliveCount = null) {
        this.turnCount++;
        const me = state.self || {};
        const region = state.currentRegion || {};
        const connected = state.connectedRegions || [];
        const allVisibleAgents = state.visibleAgents || [];
        const visibleAgents = this._filterHostileAgents(allVisibleAgents);
        const visibleMonsters = state.visibleMonsters || [];
        const visibleItems = state.visibleItems || [];
        const visibleRegions = state.visibleRegions || [];
        const pendingDz = state.pendingDeathzones || [];
        const gameStatus = state.gameStatus || '';

        if (gameStatus !== "running") return null;

        if (this.gameStartedLocalTs === null) {
            this.gameStartedLocalTs = Date.now() / 1000;
        }

        if (!me.isAlive) {
            logError("Agent sudah mati! Game over.");
            return null;
        }

        const hp = me.hp ?? 0;
        const maxHp = me.maxHp ?? 100;
        const ep = me.ep ?? 0;
        const atk = me.atk ?? 10;
        const defense = me.def ?? 5;
        const myWeapon = me.equippedWeapon;
        const weaponBonus = getWeaponBonus(myWeapon);
        const weaponRange = getEffectiveWeaponRange(myWeapon);
        const inventory = me.inventory || [];
        const regionId = me.regionId || '';
        const isDeathZone = region.isDeathZone || false;
        const interactables = region.interactables || [];

        this.visitedRegions.add(regionId);
        if (this.recentRegions.length === 0 || this.recentRegions[this.recentRegions.length - 1] !== regionId) {
            this.recentRegions.push(regionId);
            if (this.recentRegions.length > this.maxRecentRegions) {
                this.recentRegions.shift();
            }
        }

        const hpPct = maxHp > 0 ? (hp / maxHp * 100) : 0;

        // Accumulate death zones
        for (const dz of pendingDz) {
            if (dz.id) this.knownDeathZones.add(dz.id);
        }
        for (const vr of visibleRegions) {
            if (typeof vr === 'object' && vr.isDeathZone && vr.id) {
                this.knownDeathZones.add(vr.id);
            }
        }
        if (isDeathZone && regionId) this.knownDeathZones.add(regionId);
        for (const cr of connected) {
            if (typeof cr === 'object' && cr.isDeathZone && cr.id) {
                this.knownDeathZones.add(cr.id);
            }
        }

        const groundItemsHere = visibleItems.filter(vi => vi.regionId === regionId);
        const enemiesHere = visibleAgents.filter(a => a.isAlive !== false && a.regionId === regionId);
        const pendingIds = new Set(pendingDz.map(dz => dz.id).filter(Boolean));
        const regionIsDangerSoon = pendingIds.has(regionId) || this.knownDeathZones.has(regionId);

        // Enemy pressure
        let lethalEnemyHere = false;
        let enemyPressure = 0;
        for (const e of enemiesHere) {
            const eAtk = e.atk ?? 10;
            const eWeapon = e.equippedWeapon;
            const eWeaponBonus = getWeaponBonus(eWeapon) || 0;
            const dmg = estimateDamageReceived(eAtk, eWeaponBonus, defense);
            enemyPressure += dmg;
            if (dmg >= hp) lethalEnemyHere = true;
        }

        const adjacentRanged = this._analyzeAdjacentRangedThreat(allVisibleAgents, connected, defense, hp);
        const adjacentRangedCount = adjacentRanged.count;
        const adjacentRangedPressure = adjacentRanged.pressure;
        const adjacentRangedCritical = adjacentRanged.critical;

        const ringTotal = 1 + connected.length;
        let dangerousRing = isDeathZone || regionIsDangerSoon ? 1 : 0;
        let safeExitCount = 0;
        for (const cr of connected) {
            const crId = typeof cr === 'object' ? (cr.id || '') : cr;
            const crIsDanger = typeof cr === 'object' && (
                cr.isDeathZone || pendingIds.has(crId) || this.knownDeathZones.has(crId)
            );
            if (crIsDanger) dangerousRing++;
            else safeExitCount++;
        }

        const nearbyRegions = new Set([regionId, ...connected.map(c => typeof c === 'object' ? (c.id || '') : c).filter(Boolean)]);
        const nearbyHostiles = (allVisibleAgents || []).filter(a =>
            a.isAlive !== false && nearbyRegions.has(a.regionId || '')
        ).length;

        const localDay = this._estimateLocalDay();
        const phaseContext = {
            local_day: localDay,
            is_death_zone: isDeathZone,
            region_is_danger_soon: regionIsDangerSoon,
            pending_count: pendingDz.length,
            danger_ratio: dangerousRing / Math.max(1, ringTotal),
            safe_exits: safeExitCount,
            nearby_hostiles: nearbyHostiles,
        };

        this.gamePhase = this._getPhase(aliveCount, phaseContext);
        if (this.turnCount <= 2 || this.turnCount % 10 === 0) {
            logInfo(`🎯 Fase: ${this.gamePhase} | Day≈${localDay} | RingDanger=${phaseContext.danger_ratio.toFixed(0)}% | SafeExit=${safeExitCount}`);
        }
        if (adjacentRangedCount && (this.turnCount <= 2 || this.turnCount % 8 === 0)) {
            logWarning(`🎯 Ancaman ranged tetangga: ${adjacentRangedCount} musuh | pressure≈${adjacentRangedPressure.toFixed(0)}`);
        }

        const hunterWeaponEquipped = isHunterWeapon(myWeapon);
        const midHunterMode = (
            effectiveAggroMode !== "safe" &&
            this.gamePhase === "MID" &&
            hunterWeaponEquipped
        );

        // Urgent escape conditions
        const criticalHpEscape = enemiesHere.length > 0 && hpPct <= HP_FLEE_THRESHOLD;
        const rangedCoverEscape = adjacentRangedCritical || (
            adjacentRangedCount >= 2 && hpPct <= Math.max(HP_FLEE_THRESHOLD + 10, 40)
        );
        const urgentEscape = (
            isDeathZone ||
            regionIsDangerSoon ||
            lethalEnemyHere ||
            criticalHpEscape ||
            rangedCoverEscape
        );

        // Free actions (Group 2)
        if (groundItemsHere.length > 0 && !urgentEscape) {
            const lootDecision = this._chooseGroundItemAction(groundItemsHere, inventory, weaponBonus, hpPct);
            if (lootDecision) return lootDecision;
        }

        // Equip best weapon
        let bestWeaponInInv = null;
        let bestBonusInInv = weaponBonus;
        for (const item of inventory) {
            if (item.category !== "weapon") continue;
            const bonus = item.atkBonus ?? WEAPON_PRIORITY[item.name || ''] ?? 0;
            if (bonus > bestBonusInInv) {
                bestBonusInInv = bonus;
                bestWeaponInInv = item;
            }
        }
        if (bestWeaponInInv) {
            logItem(`Equip senjata lebih baik: ${bestWeaponInInv.name}`);
            return this._decision(
                { type: "equip", itemId: bestWeaponInInv.id },
                {
                    reasoning: `Equip ${bestWeaponInInv.name} (bonus +${bestBonusInInv}) lebih baik dari senjata sekarang`,
                    plannedAction: `Equip ${bestWeaponInInv.name}`
                },
                `Equip ${bestWeaponInInv.name}`
            );
        }

        // Group 1 actions (with cooldown)
        const now = Date.now() / 1000;
        const cooldownReady = (now - this.lastActionTime) >= 58;

        if (!cooldownReady) {
            const remaining = Math.max(0, 60 - (now - this.lastActionTime));
            logInfo(`Cooldown group 1: ${remaining.toFixed(0)}s tersisa`);
            return null;
        }

        // Cache targets
        let cachedAgentTarget = null;
        let cachedMonsterTarget = null;
        let agentTargetComputed = false;
        let monsterTargetComputed = false;

        const getCachedAgentTarget = () => {
            if (!agentTargetComputed) {
                cachedAgentTarget = this._pickAgentTarget(
                    visibleAgents, regionId, connected, atk, weaponBonus, weaponRange, hp, defense, this.gamePhase
                );
                agentTargetComputed = true;
            }
            return cachedAgentTarget;
        };

        const getCachedMonsterTarget = () => {
            if (!monsterTargetComputed) {
                cachedMonsterTarget = this._pickMonsterTarget(
                    visibleMonsters, regionId, connected, atk, weaponBonus, weaponRange
                );
                monsterTargetComputed = true;
            }
            return cachedMonsterTarget;
        };

        // Emergency escape
        if (ep >= 1 && urgentEscape) {
            const safeRegion = this._findSafeRegion(connected, visibleRegions, allVisibleAgents);
            if (safeRegion) {
                const rid = typeof safeRegion === 'string' ? safeRegion : (safeRegion.id || safeRegion);
                const rname = this._resolveRegionName(safeRegion, rid, visibleRegions);
                let reason = "Region tidak aman";
                if (isDeathZone) reason = "Berada di death zone";
                else if (criticalHpEscape) reason = `HP kritis (${hpPct.toFixed(0)}%)`;
                else if (rangedCoverEscape) reason = "Tertutup ancaman ranged dari region tetangga";

                logWarning(`🚨 ${reason}! Kabur ke ${rname}`);
                return this._decision(
                    { type: "move", regionId: rid },
                    {
                        reasoning: `${reason}, prioritas utama adalah bertahan hidup`,
                        plannedAction: `Kabur ke ${rname}`
                    },
                    `Flee → ${rname}`
                );
            }

            // No escape route: survival mode
            if (urgentEscape) {
                const shouldForceHeal = this._shouldForceEmergencyHeal(
                    isDeathZone, regionIsDangerSoon, lethalEnemyHere, hpPct, enemiesHere
                );

                if (shouldForceHeal) {
                    const emergencyHeal = this._findHealItem(inventory, 0);
                    if (emergencyHeal) {
                        logWarning(`🔥 Tidak ada jalur aman! Pakai ${emergencyHeal.name} untuk memperpanjang hidup`);
                        return this._decision(
                            { type: "use_item", itemId: emergencyHeal.id },
                            {
                                reasoning: "Tidak ada region aman untuk kabur, prioritas ganti ke bertahan hidup selama mungkin",
                                plannedAction: `Gunakan ${emergencyHeal.name}`
                            },
                            `Emergency heal with ${emergencyHeal.name}`
                        );
                    }
                }

                const medFacility = this._findFacility(interactables, "medical_facility");
                if (medFacility && (isDeathZone || hpPct < 85 || lethalEnemyHere)) {
                    logWarning("🔥 Tidak ada jalur aman! Pakai Medical Facility sebagai survival fallback");
                    return this._decision(
                        { type: "interact", interactableId: medFacility.id },
                        {
                            reasoning: "Terjebak tanpa jalur aman, pakai fasilitas medis untuk menambah waktu hidup",
                            plannedAction: "Gunakan medical facility"
                        },
                        "Emergency Medical Facility"
                    );
                }

                if (ep >= 2) {
                    const desperation = this._pickDesperationAction(
                        allVisibleAgents, visibleMonsters, regionId, connected, atk, weaponBonus, weaponRange, hp, defense
                    );
                    if (desperation) {
                        logWarning("🔥 Tidak ada jalur aman! Masuk mode desperation attack");
                        return desperation;
                    }
                }
            }
        }

        // Heal if HP low
        if (hpPct < HP_HEAL_THRESHOLD && ep >= 1) {
            const aggressiveAgentTarget = getCachedAgentTarget();
            const aggressiveMonsterTarget = getCachedMonsterTarget();
            const offensiveTarget = aggressiveAgentTarget || aggressiveMonsterTarget;

            if (enemiesHere.length > 0 && !aggressiveAgentTarget) {
                const safeRegion = this._findSafeRegion(connected, visibleRegions, allVisibleAgents);
                if (safeRegion) {
                    const rid = typeof safeRegion === 'string' ? safeRegion : (safeRegion.id || safeRegion);
                    const rname = this._resolveRegionName(safeRegion, rid, visibleRegions);
                    logHeal(`HP rendah (${hpPct.toFixed(0)}%) + posisi buruk → kabur ke ${rname}`);
                    return this._decision(
                        { type: "move", regionId: rid },
                        {
                            reasoning: "HP rendah dan duel tidak menguntungkan, cari posisi aman dulu",
                            plannedAction: `Kabur ke ${rname}`
                        },
                        `Flee to heal → ${rname}`
                    );
                }
            }

            if (!offensiveTarget) {
                const healItem = this._findHealItem(inventory, hpPct);
                if (healItem) {
                    logHeal(`HP rendah (${hpPct.toFixed(0)}%), pakai ${healItem.name}`);
                    return this._decision(
                        { type: "use_item", itemId: healItem.id },
                        {
                            reasoning: `HP rendah (${hp}/${maxHp}), perlu heal`,
                            plannedAction: `Menggunakan ${healItem.name}`
                        },
                        `Heal with ${healItem.name}`
                    );
                }

                const medFacility = this._findFacility(interactables, "medical_facility");
                if (medFacility && enemiesHere.length === 0) {
                    logHeal("HP rendah, pakai Medical Facility");
                    return this._decision(
                        { type: "interact", interactableId: medFacility.id },
                        {
                            reasoning: `HP rendah (${hp}/${maxHp}), gunakan fasilitas medis`,
                            plannedAction: "Gunakan medical facility"
                        },
                        "Use Medical Facility"
                    );
                }
            }
        }

        // Use utility when safe
        if (ep >= 1 && enemiesHere.length === 0 && this.gamePhase !== "ENDGAME") {
            const usableUtilities = inventory.filter(i => {
                if (i.category !== "utility") return false;
                if (this.usedUtilityIds.has(i.id)) return false;
                if (this._shouldSkipUtilityUse(i)) return false;
                return true;
            });

            if (usableUtilities.length > 0) {
                usableUtilities.sort((a, b) => this._itemValue(b, weaponBonus, hpPct) - this._itemValue(a, weaponBonus, hpPct));
                const util = usableUtilities[0];
                const itemName = util.name || '???';
                logItem(`🔭 Pakai utility: ${itemName}`);
                return this._decision(
                    { type: "use_item", itemId: util.id },
                    {
                        reasoning: `${itemName} memberi utilitas bernilai, dipakai saat kondisi aman`,
                        plannedAction: `Gunakan ${itemName}`
                    },
                    `Use ${itemName}`,
                    { mark_utility_used: true, utility_name: itemName }
                );
            }
        }

        // Attack agent if duel is favorable
        const hasWeapon = weaponBonus > 0;
        let combatHpThreshold = hasWeapon ? MODE_COMBAT_HP_WITH_WEAPON : MODE_COMBAT_HP_NO_WEAPON;
        if (this.gamePhase === "ENDGAME") {
            combatHpThreshold = Math.max(MODE_ENDGAME_COMBAT_FLOOR, combatHpThreshold - MODE_ENDGAME_COMBAT_BUFFER);
        } else if (midHunterMode) {
            combatHpThreshold = Math.max(18, combatHpThreshold - 8);
        }

        const coverFireSafe = (
            weaponRange > 0 &&
            !urgentEscape &&
            enemiesHere.length === 0 &&
            !isDeathZone &&
            !regionIsDangerSoon
        );
        const coverFireThreshold = Math.max(MODE_COVER_FIRE_HP_FLOOR, combatHpThreshold - MODE_COVER_FIRE_HP_BUFFER);

        // Cover fire with ranged weapon
        if (ep >= 2 && coverFireSafe && hpPct > coverFireThreshold) {
            const coverTarget = this._pickCoverFireTarget(
                allVisibleAgents, regionId, connected, atk, weaponBonus, weaponRange, hp, defense, this.gamePhase
            );
            if (coverTarget) {
                const agentName = coverTarget.name || 'Agent';
                const targetRegionName = this._resolveRegionName(
                    this._getVisibleRegionInfo(coverTarget.regionId || '', visibleRegions),
                    coverTarget.regionId || '',
                    visibleRegions
                );
                logCombat(`🎯 Cover fire ke ${agentName} di ${targetRegionName}`);
                return this._decision(
                    { type: "attack", targetId: coverTarget.id, targetType: "agent" },
                    {
                        reasoning: `Posisi sekarang masih aman, lebih efisien menembak ${agentName} dari jarak jauh daripada pindah masuk ke region musuh`,
                        plannedAction: `Tembak ${agentName} dari cover`
                    },
                    `Cover fire ${agentName}`
                );
            }
        }

        // Attack agent
        if (ep >= 2 && hpPct > combatHpThreshold) {
            const targetAgent = getCachedAgentTarget();
            if (targetAgent) {
                const agentName = targetAgent.name || 'Agent';
                logCombat(`Serang agent ${agentName} (HP: ${targetAgent.hp})`);
                return this._decision(
                    { type: "attack", targetId: targetAgent.id, targetType: "agent" },
                    {
                        reasoning: `Duel melawan ${agentName} menguntungkan menurut combat score`,
                        plannedAction: `Serang agent ${agentName}`
                    },
                    `Attack agent ${agentName}`
                );
            }
        }

        // Hunter mode: push to enemy region
        if (ep >= 1 && midHunterMode && enemiesHere.length === 0) {
            const hunterRegion = this._pickMidHunterRegion(connected, visibleRegions, allVisibleAgents);
            if (hunterRegion) {
                const [hRid, hRname, hTargetNote] = hunterRegion;
                logMove(`🎯 Hunter push ke ${hRname} (${hTargetNote})`);
                return this._decision(
                    { type: "move", regionId: hRid },
                    {
                        reasoning: `Mode hunter aktif: ${myWeapon?.name || 'weapon'} di fase MID lebih bernilai untuk pressure agent daripada explore biasa`,
                        plannedAction: `Push ke ${hRname}`
                    },
                    `Hunter push → ${hRname}`
                );
            }
        }

        // Attack monster
        if (ep >= 2 && enemiesHere.length === 0) {
            const targetMonster = getCachedMonsterTarget();
            if (targetMonster) {
                const monsterName = targetMonster.name || 'Monster';
                logCombat(`Serang ${monsterName} (HP: ${targetMonster.hp})`);
                return this._decision(
                    { type: "attack", targetId: targetMonster.id, targetType: "monster" },
                    {
                        reasoning: `Monster ${monsterName} bisa dikalahkan dengan risiko rendah`,
                        plannedAction: `Serang ${monsterName}`
                    },
                    `Attack ${monsterName}`
                );
            }
        }

        // Use facility
        if (ep >= 1 && !lethalEnemyHere) {
            const facility = this._pickBestFacility(interactables, hpPct);
            if (facility) {
                const ftype = facility.type || 'facility';
                logAction(`Gunakan fasilitas: ${ftype}`);
                return this._decision(
                    { type: "interact", interactableId: facility.id },
                    {
                        reasoning: `Fasilitas ${ftype} tersedia dan layak digunakan sekarang`,
                        plannedAction: `Interact dengan ${ftype}`
                    },
                    `Use facility ${ftype}`
                );
            }
        }

        // Chase 1v1
        if (ep >= 1 && ALLOW_CHASE_1V1 && this.gamePhase === "MID" && enemiesHere.length === 0 && weaponBonus > 0 && hpPct >= MODE_CHASE_MIN_HP) {
            const chaseRegion = this._pickChaseRegion(connected, visibleRegions, allVisibleAgents);
            if (chaseRegion) {
                const [cRid, cRname, cTargetName] = chaseRegion;
                logMove(`🎯 Chase ${cTargetName} ke ${cRname}`);
                return this._decision(
                    { type: "move", regionId: cRid },
                    {
                        reasoning: `Mode ${effectiveAggroMode} mengizinkan rotasi agresif untuk menekan duel 1v1 yang aman`,
                        plannedAction: `Chase ke ${cRname}`
                    },
                    `Chase → ${cRname}`
                );
            }
        }

        // Explore
        if (ep >= 1 && !midHunterMode && !this.exploredRegions.has(regionId) && this.gamePhase !== "ENDGAME" && enemiesHere.length === 0) {
            logAction(`Explore region ${region.name || regionId}`);
            return this._decision(
                { type: "explore" },
                {
                    reasoning: `Region ${region.name || '???'} belum dijelajahi, cari item/musuh`,
                    plannedAction: "Explore region"
                },
                `Explore ${region.name || regionId}`,
                { region_id: regionId }
            );
        }

        // Move to better weapon
        if (ep >= 1 && !midHunterMode && this.gamePhase !== "ENDGAME" && enemiesHere.length === 0) {
            const weaponRegion = this._findBetterWeaponRegion(
                visibleItems, connected, visibleRegions, weaponBonus, regionId
            );
            if (weaponRegion) {
                const [wRid, wRname, wItemName, wBonus] = weaponRegion;
                logItem(`🗡️ Ada ${wItemName} (+${wBonus}) di ${wRname}!`);
                return this._decision(
                    { type: "move", regionId: wRid },
                    {
                        reasoning: `Weapon ${wItemName} (+${wBonus}) adalah upgrade nyata`,
                        plannedAction: `Move ke ${wRname}`
                    },
                    `Move → ${wRname} (ambil ${wItemName})`
                );
            }
        }

        // Move to strategic region
        if (ep >= 1 && (this.gamePhase !== "ENDGAME" || ROAM_IN_ENDGAME)) {
            const targetRegion = this._pickMoveTarget(connected, visibleRegions, allVisibleAgents);
            if (targetRegion) {
                const rid = typeof targetRegion === 'string' ? targetRegion : (targetRegion.id || targetRegion);
                const rname = this._resolveRegionName(targetRegion, rid, visibleRegions);
                logMove(`Pindah ke ${rname}`);
                return this._decision(
                    { type: "move", regionId: rid },
                    {
                        reasoning: `${rname} lebih aman / lebih bernilai daripada posisi sekarang`,
                        plannedAction: `Move ke ${rname}`
                    },
                    `Move → ${rname}`
                );
            }
        }

        // ENDGAME: camp
        if (this.gamePhase === "ENDGAME" && !ROAM_IN_ENDGAME) {
            logInfo("🏕️ ENDGAME — tahan posisi, simpan tempo.");
            return this._decision(
                { type: "rest" },
                {
                    reasoning: "Fase akhir tanpa duel bagus, camp dan simpan posisi",
                    plannedAction: "Camp & ambush"
                },
                "🏕️ Camping (endgame)"
            );
        }

        // EP low → rest
        if (ep < EP_REST_THRESHOLD) {
            logAction("Rest untuk recovery EP");
            return this._decision(
                { type: "rest" },
                {
                    reasoning: `EP rendah (${ep}), istirahat untuk bonus +1 EP`,
                    plannedAction: "Rest"
                },
                "Rest"
            );
        }

        logInfo("Tidak ada aksi prioritas, rest.");
        return this._decision(
            { type: "rest" },
            {
                reasoning: "Tidak ada target menarik, istirahat sambil menunggu",
                plannedAction: "Rest"
            },
            "Rest (idle)"
        );
    }

    _pickDesperationAction(visibleAgents, visibleMonsters, regionId, connected, atk, weaponBonus, weaponRange, hp, defense) {
        if (hp <= 0) return null;

        const agentTarget = this._pickDesperationAgentTarget(
            visibleAgents, regionId, connected, atk, weaponBonus, weaponRange, hp, defense
        );
        if (agentTarget) {
            const agentName = agentTarget.name || 'Agent';
            return this._decision(
                { type: "attack", targetId: agentTarget.id, targetType: "agent" },
                {
                    reasoning: `Terjebak tanpa jalur aman; trade terbaik sekarang adalah menekan ${agentName}`,
                    plannedAction: `Serang agent ${agentName}`
                },
                `Desperation attack agent ${agentName}`
            );
        }

        const monsterTarget = this._pickDesperationMonsterTarget(
            visibleMonsters, regionId, connected, atk, weaponBonus, weaponRange
        );
        if (monsterTarget) {
            const monsterName = monsterTarget.name || 'Monster';
            return this._decision(
                { type: "attack", targetId: monsterTarget.id, targetType: "monster" },
                {
                    reasoning: `Tidak ada target agent yang bagus; paksa value dari ${monsterName}`,
                    plannedAction: `Serang ${monsterName}`
                },
                `Desperation attack ${monsterName}`
            );
        }

        return null;
    }

    _pickDesperationAgentTarget(agents, myRegion, connected, myAtk, weaponBonus, weaponRange, myHp, myDef) {
        const candidates = [];
        const attackableRegions = this._getAttackableRegionIds(myRegion, connected, weaponRange);

        for (const a of (agents || [])) {
            if (a.isAlive === false) continue;
            if (this._isAllyAgent(a)) continue;
            const aRegion = a.regionId || '';
            if (!attackableRegions.has(aRegion)) continue;

            const aHp = a.hp || 999;
            const aDef = a.def || 5;
            const aAtk = a.atk || 10;
            const aWeapon = a.equippedWeapon;
            const aWeaponBonus = getWeaponBonus(aWeapon) || 0;

            const dmgDealt = calcDamage(myAtk, weaponBonus, aDef);
            if (dmgDealt <= 0) continue;

            const killHits = Math.max(1, Math.ceil(aHp / dmgDealt));
            if (killHits > 6) continue;

            const pressurePenalty = Math.max(0, this._countEnemiesInRegion(agents, aRegion) - 1);
            const sameRegionBias = aRegion === myRegion ? 0 : 1;
            const overkillRisk = dmgRecv < myHp ? 0 : 1;
            candidates.push([killHits, sameRegionBias, pressurePenalty, overkillRisk, aHp, a]);
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
            return candidates[0][5];
        }
        return null;
    }

    _pickDesperationMonsterTarget(monsters, myRegion, connected, myAtk, weaponBonus, weaponRange) {
        const candidates = [];
        const attackableRegions = this._getAttackableRegionIds(myRegion, connected, weaponRange);

        for (const m of (monsters || [])) {
            const mRegion = m.regionId || '';
            if (!attackableRegions.has(mRegion)) continue;

            const mHp = m.hp || 999;
            const mDef = m.def || 0;
            const dmgDealt = calcDamage(myAtk, weaponBonus, mDef);
            if (dmgDealt <= 0) continue;

            const killHits = Math.max(1, Math.ceil(mHp / dmgDealt));
            if (killHits > 5) continue;

            const sameRegionBias = mRegion === myRegion ? 0 : 1;
            const localMonsters = Math.max(0, this._countMonstersInRegion(monsters, mRegion) - 1);
            candidates.push([killHits, sameRegionBias, localMonsters, mHp, m]);
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
            return candidates[0][4];
        }
        return null;
    }
}

// ══════════════════════════════════════════════════════════════
//  MAIN GAME LOOP HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

async function saveEnv(key, value, agentName = null) {
    const fs = await import('fs');
    const path = await import('path');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Save to agents folder if agentName provided, otherwise root .env
    let envPath;
    if (agentName) {
        const agentsDir = path.resolve(__dirname, "agents");
        // Ensure agents directory exists
        try {
            fs.accessSync(agentsDir);
        } catch {
            fs.mkdirSync(agentsDir, { recursive: true });
        }
        envPath = path.join(agentsDir, `${agentName}.env`);
    } else {
        envPath = path.resolve(__dirname, ".env");
    }

    let lines = [];
    let found = false;

    try {
        const content = fs.readFileSync(envPath, 'utf-8');
        lines = content.split('\n');
    } catch (e) {
        // File doesn't exist yet
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith(`${key}=`)) {
            lines[i] = `${key}=${value}`;
            found = true;
            break;
        }
    }

    if (!found) {
        lines.push(`${key}=${value}`);
    }

    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
}

async function checkAndUpdateWallet(api) {
    logInfo("🔐 Checking wallet address...");

    const acc = await api.getAccount();
    if (!acc) {
        logError("Failed to get account for wallet check");
        return false;
    }

    const walletAddress = acc.walletAddress || acc.wallet_address || null;

    // Check if wallet is set
    if (!walletAddress) {
        logWarning("⚠️  Wallet address not set!");

        // Try to get from env or prompt
        const walletToSet = WALLET_ADDRESS || await promptForWallet();

        if (!walletToSet || !isValidEthereumAddress(walletToSet)) {
            logError("Invalid or no wallet address provided. Rewards will not be received!");
            logWarning("Set WALLET_ADDRESS in .env or update via:");
            logWarning(`curl -X PUT ${BASE_URL}/accounts/wallet -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY}" -d '{"wallet_address": "0xYourAddress"}'`);
            return false;
        }

        // Update wallet
        logInfo(`Updating wallet address: ${walletToSet}`);
        const result = await api._request("PUT", "/accounts/wallet", { wallet_address: walletToSet });

        if (result) {
            logSuccess(`✅ Wallet address updated: ${walletToSet}`);
            await saveEnv("WALLET_ADDRESS", walletToSet, AGENT_NAME);
            return true;
        } else {
            logError("Failed to update wallet address");
            return false;
        }
    } else {
        logSuccess(`✅ Wallet address: ${walletAddress}`);
        return true;
    }
}

function isValidEthereumAddress(address) {
    if (!address) return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function promptForWallet() {
    // Non-interactive: return null, user must set via .env
    return null;
}

async function setupAccount(api) {
    let apiKey = API_KEY;

    if (apiKey) {
        logInfo(`Menggunakan API key yang sudah ada: ${apiKey.slice(0, 15)}...`);
        api.setApiKey(apiKey);
        const acc = await api.getAccount();
        if (acc) {
            logSuccess(`Akun: ${acc.name} | Wins: ${acc.totalWins || 0} | Games: ${acc.totalGames || 0}`);

            // Check wallet address (Heartbeat requirement)
            await checkAndUpdateWallet(api);

            return true;
        }
        if (api.lastRequestTransient) {
            logWarning("Validasi API key tertunda karena jaringan/server lambat. Akan retry...");
            return false;
        }
        logWarning("API key tidak valid, membuat akun baru...");
    }

    // Create new account
    logInfo(`Membuat akun baru: ${AGENT_NAME}`);
    const acc = await api.createAccount(AGENT_NAME);
    if (acc) {
        apiKey = acc.apiKey || "";
        api.setApiKey(apiKey);
        logSuccess(`Akun dibuat! ID: ${acc.accountId}`);
        logSuccess(`API Key: ${apiKey}`);
        logWarning("⚠️  SIMPAN API KEY INI! Hanya ditampilkan sekali!");
        logInfo(`Verification Code: ${acc.verificationCode}`);
        await saveEnv("API_KEY", apiKey, AGENT_NAME);
        logSuccess("API Key disimpan ke .env");

        // Check wallet for new account
        await checkAndUpdateWallet(api);

        return true;
    } else {
        if (api.lastRequestTransient) {
            logWarning("Belum bisa membuat akun karena jaringan/server lambat.");
        } else {
            logError("Gagal membuat akun!");
        }
        return false;
    }
}

async function findOrCreateGame(api) {
    const blockedIds = getBlockedGameIds(api);

    if (GAME_ID) {
        const info = await api.getGameInfo(GAME_ID);
        if (info && ['waiting', 'running'].includes(info.status)) {
            const entryType = getGameEntryType(info);
            if (blockedIds.has(GAME_ID)) {
                logWarning(`Game ${GAME_ID} sebelumnya sudah diblokir sementara, skip...`);
                GAME_ID = "";
            } else if (entryType === "paid") {
                logWarning(`Game ${GAME_ID} adalah Premium (paid), skip...`);
                blockedIds.add(GAME_ID);
                GAME_ID = "";
            } else if (entryType === "free") {
                logSuccess(`✅ Game ditemukan: ${info.name} [${info.status}]`);
                return true;
            } else {
                logWarning(`Game ${GAME_ID} tipe entry tidak dikenal, skip...`);
                blockedIds.add(GAME_ID);
                GAME_ID = "";
            }
        } else {
            GAME_ID = "";
        }
    }

    // Find waiting games
    const games = await api.listGames("waiting");
    if (games && games.length > 0) {
        const freeGames = [];
        for (const g of games) {
            const entryType = getGameEntryType(g);
            const gameId = g.id || "";

            if (blockedIds.has(gameId)) continue;
            if (entryType === "paid") {
                blockedIds.add(gameId);
            } else if (entryType === "free") {
                freeGames.push(g);
            } else {
                blockedIds.add(gameId);
            }
        }

        if (freeGames.length > 0) {
            const game = freeGames[0];
            GAME_ID = game.id || "";
            logSuccess(`✅ Game dipilih: ${game.name || '???'} (ID: ${GAME_ID})`);
            await saveEnv("GAME_ID", GAME_ID, AGENT_NAME);
            api._fallbackGames = freeGames.slice(1).filter(g => !blockedIds.has(g.id));
            return true;
        }
    }

    if (!ALLOW_CREATE_GAME_FALLBACK) {
        return false;
    }

    // Create new game
    const game = await api.createGame(`${AGENT_NAME}'s Arena`);
    if (game) {
        GAME_ID = game.id || "";
        logSuccess(`✅ Game dibuat: ${game.name || '???'} (ID: ${GAME_ID})`);
        await saveEnv("GAME_ID", GAME_ID, AGENT_NAME);
        api._fallbackGames = [];
        return true;
    }

    return false;
}

const SKIPPABLE_ERRORS = new Set([
    "INSUFFICIENT_BALANCE",
    "REGION_RESTRICTED",
    "MAX_AGENTS_REACHED",
    "GAME_ALREADY_STARTED",
    "PAID_GAME_ACCOUNT_REQUIRED",
    "PAID_REGISTER_BLOCKED",
]);

async function registerAgent(api) {
    const blockedIds = getBlockedGameIds(api);

    if (AGENT_ID) {
        const state = await api.getState(GAME_ID, AGENT_ID);
        if (state) {
            logSuccess("✅ Agent sudah terdaftar dan aktif!");
            return true;
        }
        AGENT_ID = "";
    }

    // Try current game
    if (GAME_ID && !blockedIds.has(GAME_ID)) {
        const success = await tryRegister(api, GAME_ID);
        if (success) return true;
    }

    // Try fallback games
    const fallbacks = api._fallbackGames || [];
    if (fallbacks.length > 0) {
        for (const game of fallbacks) {
            const gid = game.id || "";
            if (blockedIds.has(gid)) continue;

            GAME_ID = gid;
            await saveEnv("GAME_ID", GAME_ID, AGENT_NAME);
            const success = await tryRegister(api, GAME_ID);
            if (success) return true;
        }
    }

    // Search for new games
    const games = await api.listGames("waiting");
    if (games) {
        for (const g of games) {
            const entryType = getGameEntryType(g);
            const gid = g.id || "";

            if (gid === GAME_ID || blockedIds.has(gid)) continue;
            if (entryType !== "free") {
                if (entryType === "paid") blockedIds.add(gid);
                continue;
            }

            GAME_ID = gid;
            await saveEnv("GAME_ID", GAME_ID, AGENT_NAME);
            const success = await tryRegister(api, GAME_ID);
            if (success) return true;
        }
    }

    if (!ALLOW_CREATE_GAME_FALLBACK) {
        return false;
    }

    // Create new game
    const game = await api.createGame(`${AGENT_NAME}'s Arena`);
    if (game) {
        GAME_ID = game.id || "";
        await saveEnv("GAME_ID", GAME_ID, AGENT_NAME);
        return await tryRegister(api, GAME_ID);
    }

    return false;
}

async function tryRegister(api, gameId) {
    const blockedIds = getBlockedGameIds(api);

    logInfo(`Mendaftarkan agent '${AGENT_NAME}' ke game ${gameId}...`);
    const [agent, errorCode] = await api._requestOnce(
        "POST",
        `/games/${gameId}/agents/register`,
        { name: AGENT_NAME },
        ACTION_POST_RETRIES,
        [ACTION_POST_CONNECT_TIMEOUT, ACTION_POST_READ_TIMEOUT]
    );

    if (agent) {
        AGENT_ID = agent.id || "";
        logSuccess(`Agent terdaftar! ID: ${AGENT_ID}`);
        logInfo(`  HP: ${agent.hp}/${agent.maxHp} | EP: ${agent.ep}/${agent.maxEp} | ATK: ${agent.atk} | DEF: ${agent.def} | Vision: ${agent.vision}`);
        await saveEnv("AGENT_ID", AGENT_ID, AGENT_NAME);
        return true;
    }

    if (SKIPPABLE_ERRORS.has(errorCode)) {
        blockedIds.add(gameId);
        logWarning(`Game ${gameId} tidak bisa dimasuki (${errorCode}), coba game lain...`);
        return false;
    }

    logError(`Gagal register di game ${gameId}: ${errorCode}`);
    return false;
}

async function waitForGameStart(api) {
    logInfo("Menunggu game dimulai...");
    logInfo("(Game dimulai otomatis setelah 50+ agent, atau penuh 100 agent)");

    while (true) {
        const state = await api.getState(GAME_ID, AGENT_ID);
        if (state) {
            const status = state.gameStatus || "waiting";
            if (status === "running") {
                logSuccess("🎮 GAME DIMULAI! Let's go!");
                return true;
            } else if (status === "finished") {
                logWarning("Game sudah selesai.");
                return false;
            }
        }

        const info = await api.getGameInfo(GAME_ID);
        if (info) {
            const status = info.status || "waiting";
            const agentCount = info.agentCount || 0;
            logInfo(`Status: ${status} | Agents: ${agentCount}/100`);
            if (status === "running") {
                logSuccess("🎮 GAME DIMULAI!");
                return true;
            }
        }

        await sleep(POLL_INTERVAL * 1000);
    }
}

function printStatus(me, region, aliveCount = null, totalCount = null) {
    const hp = me.hp ?? 0;
    const maxHp = me.maxHp ?? 100;
    const ep = me.ep ?? 0;
    const maxEp = me.maxEp ?? 10;
    const kills = me.kills ?? 0;
    const weapon = me.equippedWeapon;
    const wName = weapon?.name || "Fist";
    const rName = region.name || "???";
    const terrain = region.terrain || "???";
    const weather = region.weather || "???";
    const isDz = region.isDeathZone ? "☠️DZ" : "";

    const barFilled = maxHp > 0 ? Math.floor(hp / maxHp * 20) : 0;
    const hpBar = '█'.repeat(barFilled) + '░'.repeat(20 - barFilled);

    const aliveStr = aliveCount !== null ? `| Alive: ${aliveCount}/${totalCount}` :
        totalCount !== null ? `| Agents: ${totalCount}` : "";

    console.log(`\n${COLORS.cyan}${'═'.repeat(60)}`);
    console.log(`  ${COLORS.white}HP [${hpBar}] ${hp}/${maxHp}  |  EP: ${ep}/${maxEp}  |  Kills: ${kills} ${aliveStr}`);
    console.log(`  ${COLORS.white}Weapon: ${wName}  |  Region: ${rName} (${terrain}) ${weather} ${isDz}`);
    console.log(`${COLORS.cyan}${'═'.repeat(60)}${COLORS.reset}\n`);
}

async function confirmActionSuccessQuick(api, gameId, agentId, action, preState) {
    try {
        const [state, err] = await api._requestOnce(
            "GET",
            `/games/${gameId}/agents/${agentId}/state`,
            null,
            1,
            [ACTION_CONFIRM_CONNECT_TIMEOUT, ACTION_CONFIRM_READ_TIMEOUT]
        );

        if (err || !state) return false;

        const me = state.self || {};
        const preMe = (preState || {}).self || {};
        const actionType = action.type || "";

        const findById = (items, itemId) => {
            for (const item of (items || [])) {
                if (item.id === itemId) return item;
            }
            return null;
        };

        if (actionType === "move" || actionType === "flee") {
            const targetRegionId = action.targetRegionId || action.regionId;
            return !!targetRegionId && me.regionId === targetRegionId;
        }

        if (actionType === "pickup") {
            const itemId = action.itemId;
            if (!itemId) return false;
            const inventory = me.inventory || [];
            return inventory.some(it => it.id === itemId);
        }

        if (actionType === "use_item") {
            const itemId = action.itemId;
            if (!itemId) return false;
            const inventory = me.inventory || [];
            return !inventory.some(it => it.id === itemId);
        }

        if (actionType === "attack") {
            const targetId = action.targetId;
            const targetType = String(action.targetType || '').trim().toLowerCase();
            if (!targetId || !['agent', 'monster'].includes(targetType)) return false;

            const preKills = preMe.kills || 0;
            const postKills = me.kills || 0;
            if (postKills > preKills) return true;

            const preTargets = targetType === 'agent' ?
                ((preState || {}).visibleAgents || []) :
                ((preState || {}).visibleMonsters || []);
            const postTargets = targetType === 'agent' ?
                (state.visibleAgents || []) :
                (state.visibleMonsters || []);

            const preTarget = findById(preTargets, targetId);
            if (!preTarget) return false;

            const postTarget = findById(postTargets, targetId);
            const preHp = preTarget.hp || 0;

            const myAtk = preMe.atk || 0;
            const myWeaponBonus = getWeaponBonus(preMe.equippedWeapon);
            const targetDef = preTarget.def || 0;
            const estDamage = Math.max(1.0, calcDamage(myAtk, myWeaponBonus, targetDef));

            if (postTarget) {
                const postHp = postTarget.hp ?? preHp;
                return postHp < preHp;
            }

            if (preHp <= estDamage + 1e-9) return true;
            return false;
        }

        return false;
    } catch (e) {
        return false;
    }
}

function remainingGroup1Cooldown(actionStartedAt) {
    const elapsed = Math.max(0, (Date.now() / 1000) - actionStartedAt);
    return Math.max(0, ACTION_INTERVAL - elapsed);
}

async function gameLoop(api, brain) {
    logSuccess("🎮 Memulai game loop...");
    let consecutiveFails = 0;
    const gameResult = { result: "error", kills: 0 };
    let lastGameInfoCheck = 0;
    let cachedTotalCount = null;
    let lastStatusPrint = 0;

    while (true) {
        try {
            // Get state
            const state = await api.getState(GAME_ID, AGENT_ID);
            if (!state) {
                consecutiveFails++;
                if (api.lastRequestTransient) {
                    const waitS = Math.min(30, 5 + Math.min(consecutiveFails, 5) * 2);
                    if (consecutiveFails <= 2) {
                        logWarning(`State belum tersedia. Retry dalam ${waitS}s...`);
                    }
                    await sleep(waitS * 1000);
                    continue;
                }
                if (consecutiveFails > 10) {
                    logError("Terlalu banyak kegagalan. Berhenti.");
                    break;
                }
                await sleep(5000);
                continue;
            }
            consecutiveFails = 0

            const gameStatus = state.gameStatus || "";
            const me = state.self || {};
            const region = state.currentRegion || {};

            // Game finished?
            if (gameStatus === "finished") {
                const kills = me.kills || 0;
                const isAlive = me.isAlive || false;
                const result = isAlive ? "win" : "lose";
                logSuccess("🏁 GAME SELESAI!");
                logInfo(`  Kills: ${kills} | Result: ${isAlive ? '🏆 MENANG!' : '💀 Kalah'}`);
                return { result, kills };
            }

            // Agent dead?
            if (!me.isAlive) {
                const kills = me.kills || 0;
                logError(`💀 Agent mati! Kills: ${kills}`);
                return { result: "lose", kills };
            }

            // Print status (every 30 seconds max)
            const nowTs = Date.now() / 1000;
            if (nowTs - lastStatusPrint >= 30) {
                printStatus(me, region, null, cachedTotalCount);
                lastStatusPrint = nowTs;
            }

            // Update total count periodically
            if (cachedTotalCount === null || (nowTs - lastGameInfoCheck) >= 120) {
                try {
                    const gameInfo = await api.getGameInfo(GAME_ID);
                    if (gameInfo) {
                        cachedTotalCount = gameInfo.agentCount ?? cachedTotalCount;
                        totalCount = cachedTotalCount;
                    }
                    lastGameInfoCheck = nowTs;
                } catch (e) {
                    // Ignore
                }
            }

            // Log visible info (only important events)
            const visibleAgents = state.visibleAgents || [];
            const visibleMonsters = state.visibleMonsters || [];
            const visibleItems = state.visibleItems || [];
            const pendingDz = state.pendingDeathzones || [];

            // Log only when enemies appear (combat situation)
            if (visibleAgents.length > 0 && Math.random() < 0.1) {
                const agentStrs = visibleAgents.map(a => `${a.name || '?'}(HP:${a.hp ?? '?'})`);
                logInfo(`👥 Agents terlihat: ${agentStrs.join(', ')}`);
            }

            // Log death zone warning
            if (pendingDz.length > 0 && Math.random() < 0.2) {
                logWarning(`⚠️ Death zone: ${pendingDz.map(dz => dz.name || '?').join(', ')}`);
            }

            // Make decision
            const decision = brain.decide(state);

            if (decision === null) {
                const remaining = remainingGroup1Cooldown(brain.lastActionTime);
                if (remaining > 0 && remaining < 5) {
                    const pollDelay = Math.max(0.15, Math.min(GROUP1_COOLDOWN_POLL_DELAY, remaining));
                    await sleep(pollDelay * 1000);
                } else {
                    await sleep(2000);
                }
                continue;
            }

            const [action, thought, desc, commitMeta] = decision;

            // Log only important actions
            const importantActions = ['attack', 'move', 'use_item', 'interact'];
            if (importantActions.includes(action.type)) {
                logAction(`${action.type === 'attack' ? '⚔️' : action.type === 'move' ? '🚶' : action.type === 'use_item' ? '🧪' : '🏪'} ${desc}`);
            }

            // Execute action
            const actionStartedAt = Date.now() / 1000;
            const [result, errorCode] = await api._requestOnce(
                "POST",
                `/games/${GAME_ID}/agents/${AGENT_ID}/action`,
                { ...action, ...(thought ? { thought } : {}) },
                ACTION_POST_RETRIES,
                [ACTION_POST_CONNECT_TIMEOUT, ACTION_POST_READ_TIMEOUT]
            );

            const actionType = action.type || "";
            const GROUP1_ACTIONS = new Set(["move", "explore", "attack", "use_item", "interact", "rest"]);
            const isGroup1 = GROUP1_ACTIONS.has(actionType);
            const transientActionError = ["EMPTY_RESPONSE", "REQUEST_TIMEOUT", "REQUEST_FAILED"].includes(errorCode);

            if (errorCode === null) {
                // Log only important successful actions
                if (['attack', 'use_item'].includes(actionType)) {
                    logSuccess(`${actionType === 'attack' ? '⚔️' : '✅'} ${desc}`);
                }
                brain.commitSuccess(action, commitMeta);
                if (isGroup1 && remainingGroup1Cooldown(actionStartedAt) > 0) {
                    await sleep(500);
                } else if (actionType === "pickup") {
                    const pickupCount = commitMeta?.pickup_item_count || 1;
                    await sleep((pickupCount > 1 ? PICKUP_MULTI_SUCCESS_DELAY : PICKUP_SUCCESS_DELAY) * 1000);
                } else {
                    await sleep(1000);
                }
            } else if (isGroup1 && transientActionError && await confirmActionSuccessQuick(api, GAME_ID, AGENT_ID, action, state)) {
                brain.commitSuccess(action, commitMeta);
                if (remainingGroup1Cooldown(actionStartedAt) > 0) {
                    await sleep(500);
                }
            } else {
                // Log only important failures
                if (['attack', 'use_item', 'move'].includes(actionType)) {
                    logWarning(`❌ ${actionType}: ${desc} [${errorCode}]`);
                }

                if (errorCode === "ALREADY_ACTED") {
                    brain.syncCooldown();
                    await sleep(500);
                } else if (isGroup1) {
                    await sleep(4000);
                } else if (actionType === "pickup") {
                    const pickupCount = commitMeta?.pickup_item_count || 1;
                    await sleep((pickupCount > 1 ? PICKUP_MULTI_FAIL_DELAY : PICKUP_FAIL_DELAY) * 1000);
                } else {
                    await sleep(1000);
                }
            }

        } catch (error) {
            if (error.message?.includes('abort') || error.name === 'AbortError') {
                logWarning("\n⛔ Dihentikan oleh user (Ctrl+C)");
                return gameResult;
            }
            logError(`Error tidak terduga: ${error.message}`);
            await sleep(5000);
        }
    }

    return gameResult;
}

// ══════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ══════════════════════════════════════════════════════════════

async function main() {
    if (UNICODE_OUTPUT) {
        console.log(`
${COLORS.cyan}╔══════════════════════════════════════════════════════════════╗
║${COLORS.white}              MOLTY ROYALE — AI AGENT                        ${COLORS.cyan}║
║${COLORS.yellow}         🎮 Autonomous Battle Royale Bot 🎮                  ${COLORS.cyan}║
╚══════════════════════════════════════════════════════════════╝${COLORS.reset}
        `);
    } else {
        console.log(`
${COLORS.cyan}+------------------------------------------------------------+
|${COLORS.white}              MOLTY ROYALE - AI AGENT                        ${COLORS.cyan}|
|${COLORS.yellow}          Autonomous Battle Royale Bot                     ${COLORS.cyan}|
+------------------------------------------------------------+${COLORS.reset}
        `);
    }

    const api = new MoltyAPI(BASE_URL, API_KEY);
    logInfo(`Mode aggro: ${effectiveAggroMode}`);
    logInfo(`Mode ranged targeting: ${effectiveRangedTargetMode}`);

    // Setup account
    while (!await setupAccount(api)) {
        const waitS = api.lastRequestTransient ? 15 : 10;
        logWarning(`Setup akun gagal. Retry dalam ${waitS} detik...`);
        await sleep(waitS * 1000);
    }

    // Session stats
    let sessionWins = 0;
    let sessionLosses = 0;
    let sessionKills = 0;
    let gameCount = 0;

    // Get initial balance and wallet status
    let initialBalance = 0;
    let walletStatus = "❌ Not set";
    try {
        const acc = await api.getAccount();
        if (acc) {
            initialBalance = acc.molpiBalance ?? acc.moltzBalance ?? acc.balance ?? 0;
            logInfo(`💰 Moltz Balance awal: ${initialBalance}`);
            walletStatus = acc.walletAddress ? `✅ ${acc.walletAddress.slice(0, 10)}...${acc.walletAddress.slice(-8)}` : "❌ Not set";
        }
    } catch (e) {
        // Ignore
    }

    // Auto-restart loop
    while (true) {
        gameCount++;
        const brain = new AgentBrain();

        console.log(`\n${COLORS.cyan}${'═'.repeat(60)}`);
        console.log(`  ${COLORS.white}🎮 GAME #${gameCount}  |  W:${sessionWins} L:${sessionLosses}  |  Total Kills: ${sessionKills}`);
        console.log(`  ${COLORS.white}💰 Balance: ${initialBalance}  |  Wallet: ${walletStatus}`);
        console.log(`${COLORS.cyan}${'═'.repeat(60)}${COLORS.reset}\n`);

        // Check if we're still in an active game
        let stillInGame = false;
        if (GAME_ID && AGENT_ID) {
            try {
                const state = await api.getState(GAME_ID, AGENT_ID);
                if (state && state.gameStatus === "running" && state.self?.isAlive) {
                    stillInGame = true;
                    logInfo(`✅ Masih dalam game: ${GAME_ID}`);
                }
            } catch (e) {
                // Game might be finished or agent dead
                GAME_ID = "";
                AGENT_ID = "";
            }
        }

        // Only find new game if not already in one
        if (!stillInGame) {
            // Reset IDs for new game
            GAME_ID = "";
            AGENT_ID = "";

            // Find/create game
            if (!await findOrCreateGame(api)) {
                logError("Tidak bisa menemukan atau membuat game. Retry dalam 15 detik...");
                await sleep(15000);
                continue;
            }

            // Register agent
            if (!await registerAgent(api)) {
                await sleep(15000);
                continue;
            }

            // Wait for game start
            if (!await waitForGameStart(api)) {
                await sleep(5000);
                continue;
            }
        } else {
            logInfo("🎮 Melanjutkan game yang sedang berjalan...");
        }

        // Game loop
        const result = await gameLoop(api, brain);

        // Update session stats
        if (result.result === "win") sessionWins++;
        else if (result.result === "lose") sessionLosses++;
        sessionKills += result.kills || 0;

        // Print recap
        console.log(`\n${COLORS.yellow}${'─'.repeat(60)}`);
        console.log(`  SESSION RECAP #${gameCount}: W:${sessionWins} L:${sessionLosses} K:${sessionKills}`);
        console.log(`${COLORS.yellow}${'─'.repeat(60)}${COLORS.reset}\n`);

        // Wait before new game (silent)
        await sleep(15000);
    }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    logWarning("\n⛔ Dihentikan oleh user (Ctrl+C)");
    process.exit(0);
});

// Run main
main().catch(err => {
    logError(`Fatal error: ${err.message}`);
    process.exit(1);
});
