/**
 * UI components and landing page for SRN.
 */
import { RELAY_VERSION } from "./types";

export const renderLandingPage = (stats: {
  totalEvents: number;
  totalFiles: number;
}) => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SRN CLOUDLESS — 极简字幕中继</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script src="https://unpkg.com/jszip@3/dist/jszip.min.js"></script>
    <style>
        :root {
            --primary: #2563eb;
            --bg: #f8fafc;
            --text: #1e293b;
            --border: #e2e8f0;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            background-color: var(--bg);
            color: var(--text);
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
        }
        .container { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }

        /* Navbar */
        .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4rem;
        }
        .logo { font-weight: 600; letter-spacing: -0.025em; font-size: 1.25rem; }

        /* Hero */
        .hero { text-align: center; margin-bottom: 4rem; }
        .hero h1 { font-size: 3rem; font-weight: 600; margin-bottom: 1rem; color: #0f172a; }
        .hero p { color: #64748b; font-size: 1.125rem; }

        /* Search Box */
        .search-container {
            background: white;
            padding: 0.75rem;
            border-radius: 1rem;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            display: flex;
            gap: 0.5rem;
            margin-bottom: 2rem;
            border: 1px solid var(--border);
        }
        .search-input-wrapper { flex: 1; position: relative; }
        input {
            width: 100%;
            padding: 0.75rem 1rem;
            border: none;
            outline: none;
            font-size: 1rem;
            font-family: inherit;
        }
        button {
            background: var(--primary);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        button:hover { opacity: 0.9; }

        /* TMDB Toggle */
        .tmdb-toggle {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0 1rem;
            border-right: 1px solid var(--border);
            cursor: pointer;
            user-select: none;
        }
        .toggle-track {
            width: 32px;
            height: 18px;
            background: #cbd5e1;
            border-radius: 9px;
            position: relative;
            transition: background 0.2s;
        }
        .toggle-thumb {
            width: 14px;
            height: 14px;
            background: white;
            border-radius: 50%;
            position: absolute;
            top: 2px;
            left: 2px;
            transition: transform 0.2s;
        }
        .tmdb-active .toggle-track { background: #10b981; }
        .tmdb-active .toggle-thumb { transform: translateX(14px); }
        .tmdb-label { font-size: 0.75rem; font-weight: 600; color: #64748b; }

        /* Suggestions */
        .suggestions {
            background: white;
            border-radius: 0.75rem;
            border: 1px solid var(--border);
            margin-top: 0.5rem;
            overflow: hidden;
            position: absolute;
            width: 100%;
            z-index: 10;
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
        }
        .suggestion-item {
            padding: 0.75rem 1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .suggestion-item:hover { background: #f1f5f9; }
        .suggestion-poster { width: 40px; height: 60px; background: #e2e8f0; border-radius: 4px; object-fit: cover; }
        .suggestion-info h4 { font-size: 0.9rem; margin-bottom: 0.1rem; }
        .suggestion-info p { font-size: 0.75rem; color: #64748b; }

        /* Results — archive cards */
        .results-grid { display: grid; gap: 1.25rem; }

        .archive-card {
            background: white;
            border-radius: 1rem;
            border: 1px solid var(--border);
            overflow: hidden;
        }

        /* Archive header: title · source link ... tags */
        .archive-header {
            padding: 0.75rem 1.25rem;
            background: #f8fafc;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        .archive-title {
            font-weight: 600;
            font-size: 0.9rem;
            color: #0f172a;
            white-space: nowrap;
        }
        .header-sep { color: #cbd5e1; }

        /* Source link — prominent solid highlight */
        .source-link {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            color: white;
            text-decoration: none;
            font-size: 0.78rem;
            font-weight: 600;
            background: #2563eb;
            padding: 0.25rem 0.65rem;
            border-radius: 0.375rem;
            white-space: nowrap;
            letter-spacing: 0.01em;
        }
        .source-link:hover { background: #1d4ed8; }

        /* Header right-side tags */
        .header-tags {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 0.375rem;
            flex-wrap: wrap;
        }
        /* Pubkey badge — purple */
        .pubkey-badge {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.67rem;
            color: #7c3aed;
            background: #f5f3ff;
            padding: 0.18rem 0.45rem;
            border-radius: 0.25rem;
            border: 1px solid #ddd6fe;
            cursor: default;
            white-space: nowrap;
        }
        /* Archive MD5 tag */
        .archive-md5-tag {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.67rem;
            color: #0369a1;
            background: #f0f9ff;
            padding: 0.18rem 0.45rem;
            border-radius: 0.25rem;
            border: 1px solid #bae6fd;
            cursor: default;
            white-space: nowrap;
        }

        /* Season-language rows inside a card */
        .sl-row {
            padding: 0.75rem 1.25rem;
            border-top: 1px solid var(--border);
        }
        .sl-row:first-child { border-top: none; }

        .sl-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
            flex-wrap: wrap;
        }
        .tag { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 600; }
        .tag-season { background: #fef9c3; color: #854d0e; }
        .tag-lang { background: #dbeafe; color: #1e40af; }
        .ep-count {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem;
            color: #64748b;
        }
        .pack-btn {
            margin-left: auto;
            background: #f1f5f9;
            color: var(--text);
            font-size: 0.72rem;
            padding: 0.3rem 0.75rem;
            border-radius: 0.375rem;
        }

        /* Episode pills */
        .ep-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 0.375rem;
        }
        .ep-pill {
            background: #f8fafc;
            color: #334155;
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            padding: 0.25rem 0.6rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .ep-pill:hover {
            background: #eff6ff;
            border-color: var(--primary);
            color: var(--primary);
        }

        /* Loading */
        .loading-shimmer {
            background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        footer { text-align: center; margin-top: 6rem; padding-bottom: 4rem; color: #94a3b8; font-size: 0.875rem; }
    </style>
</head>
<body>
    <div id="app" class="container" v-cloak>
        <nav class="navbar">
            <div class="logo">SRN CLOUDLESS</div>
            <div class="nav-links" style="display: flex; gap: 1.5rem; align-items: center;">
                <span v-if="powWorking" style="font-size: 0.72rem; color: #64748b; font-family: 'JetBrains Mono';">
                    证明工作量{{ powAttempts > 0 ? ' · ' + powAttempts : ' ...' }}
                </span>
                <span v-else-if="identity" style="font-size: 0.72rem; color: #4ade80; font-family: 'JetBrains Mono'; cursor: default;" :title="identity.pubHex">
                    ● {{ identity.pubHex.substring(0, 8) }}…
                </span>
                <a href="/ui" style="color: #64748b; text-decoration: none; font-size: 0.9rem;">API DOCS</a>
                <a href="https://github.com/DeliYuxiang/SubtitleRelayNetwork" target="_blank" rel="noopener" style="color: #64748b; text-decoration: none; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                </a>
            </div>
        </nav>

        <header class="hero">
            <h1>探索索引</h1>
            <p>基于 {{ stats.totalEvents }} 条全球字幕元数据记录</p>
        </header>

        <main>
            <div class="search-input-wrapper">
                <div class="search-container">
                    <div class="tmdb-toggle" :class="{'tmdb-active': tmdbEnabled}" @click="tmdbEnabled = !tmdbEnabled">
                        <div class="toggle-track"><div class="toggle-thumb"></div></div>
                        <span class="tmdb-label">TMDB</span>
                    </div>
                    <div class="search-input-wrapper">
                        <input type="text" v-model="searchInput" @input="onInput" @keyup.enter="onEnter" placeholder="输入电影/剧集名称，或直达 TMDB ID...">
                        <div class="suggestions" v-if="suggestions.length">
                            <div v-for="s in suggestions" class="suggestion-item" @click="selectSuggestion(s)">
                                <img :src="s.poster_path ? 'https://image.tmdb.org/t/p/w92' + s.poster_path : ''" class="suggestion-poster">
                                <div class="suggestion-info">
                                    <h4>{{ s.name || s.title }}</h4>
                                    <p>{{ (s.first_air_date || s.release_date || '').substring(0, 4) }} · {{ s.media_type === 'tv' ? '剧集' : '电影' }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button @click="onEnter" :disabled="powWorking" :style="powWorking ? 'opacity:0.5;cursor:not-allowed' : ''">{{ powWorking ? '验证中...' : '搜索' }}</button>
                </div>
            </div>

            <div v-if="loading" class="results-grid">
                <div v-for="i in 3" class="archive-card loading-shimmer" style="height: 140px;"></div>
            </div>

            <div v-else class="results-grid">
                <div v-for="archive in groupedResults" :key="archive.key" class="archive-card">

                    <!-- Archive header: title · source link (highlighted) … right tags -->
                    <div class="archive-header">
                        <span class="archive-title">{{ currentTitle || ('TMDB\u00a0' + archive.tmdb_id) }}</span>
                        <template v-if="archive.source_uri">
                            <span class="header-sep">·</span>
                            <a :href="archive.source_uri" target="_blank" rel="noopener" class="source-link" :title="archive.source_uri">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                {{ archive.source_uri.replace(/^https?:\\/\\/([^\\/]+).*/, '$1') }}
                            </a>
                        </template>
                        <div class="header-tags">
                            <span v-if="archive.source_type" class="tag">{{ archive.source_type }}</span>
                            <span v-if="archive.archive_md5" class="archive-md5-tag" :title="'archive: ' + archive.archive_md5">{{ archive.archive_md5.substring(0, 10) }}…</span>
                            <span class="pubkey-badge" :title="archive.pubkey">{{ archive.pubkey.substring(0, 16) }}…</span>
                        </div>
                    </div>

                    <!-- Season-language rows -->
                    <div v-for="(season, sKey) in archive.seasons" :key="sKey" class="sl-row">
                        <div v-for="(langGroup, lang) in season.languages" :key="lang">
                            <div class="sl-header">
                                <span class="tag tag-season">S{{ season.season != null ? String(season.season).padStart(2, '0') : '—' }}</span>
                                <span class="tag tag-lang">{{ lang }}</span>
                                <span class="ep-count">{{ langGroup.items.length }}<template v-if="seasonCounts[season.season] != null"> / {{ seasonCounts[season.season] }}</template> ep</span>
                                <button class="pack-btn" @click="downloadLangPack(season.season, lang, langGroup.items)">季包下载</button>
                            </div>
                            <div class="ep-pills">
                                <button v-for="item in langGroup.items" :key="item.id" class="ep-pill" @click="downloadSingle(item)" :title="'下载 E' + String(item.episode_num ?? '?').padStart(2,'0')">
                                    EP{{ String(item.episode_num ?? '?').padStart(2, '0') }}
                                </button>
                            </div>
                        </div>
                    </div>

                </div>

                <div v-if="!results.length && !loading && searchInput" style="text-align: center; color: #94a3b8; padding: 4rem 0;">
                    暂无索引结果
                </div>
            </div>
        </main>


        <footer>
            SRN CLOUDLESS ${RELAY_VERSION} · 去中心化字幕索引网络
        </footer>
    </div>

    <script>
        // ─── SRN Nonce-based PoW ──────────────────────────────────────────────
        // The server provides { salt, k }.
        // Client computes nonce where SHA256(salt + pubKey + nonce) starts with k zeros.
        const SRN_ID_STORE = 'srn_identity_v3';

        async function srnBytesToHex(buf) {
            return Array.from(new Uint8Array(buf))
                .map(b => b.toString(16).padStart(2, '0')).join('');
        }

        async function mineNonce(salt, pubHex, k, onAttempt) {
            let nonce = 0;
            while (true) {
                const nonceStr = String(nonce);
                const data = new TextEncoder().encode(salt + pubHex + nonceStr);
                const hashBuf = await crypto.subtle.digest('SHA-256', data);
                const hashHex = await srnBytesToHex(hashBuf);
                if (hashHex.startsWith('0'.repeat(k))) return nonceStr;
                nonce++;
                if (nonce % 500 === 0) onAttempt(nonce);
            }
        }

        async function loadOrCreateIdentity() {
            const raw = localStorage.getItem(SRN_ID_STORE);
            if (raw) {
                try {
                    const id = JSON.parse(raw);
                    if (id.pubHex && id.privHex) return id;
                } catch(_) {}
            }
            const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign']);
            const pubBuf = await crypto.subtle.exportKey('raw', kp.publicKey);
            const privBuf = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
            const id = {
                pubHex: await srnBytesToHex(pubBuf),
                privHex: await srnBytesToHex(privBuf)
            };
            localStorage.setItem(SRN_ID_STORE, JSON.stringify(id));
            return id;
        }
        // ───────────────────────────────────────────────────────────────────────

        function initApp() {
            return {
                searchInput: '',
                tmdbEnabled: false,
                loading: false,
                results: [],
                suggestions: [],
                seasonCounts: {},
                currentTitle: '',
                stats: { totalEvents: ${stats.totalEvents} },
                debounceTimer: null,

                identity: null,
                privKey: null,
                powWorking: false,
                powAttempts: 0,
                currentChallenge: { salt: '', k: 0, nonce: '' },

                async init() {
                    this.identity = await loadOrCreateIdentity();
                    this.privKey = await this._importPrivKey(this.identity.privHex);
                    await this.refreshChallenge();
                },

                async _importPrivKey(privHex) {
                    const bytes = new Uint8Array(privHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
                    return crypto.subtle.importKey('pkcs8', bytes.buffer, { name: 'Ed25519' }, false, ['sign']);
                },

                async refreshChallenge() {
                    this.powWorking = true;
                    this.powAttempts = 0;
                    try {
                        const res = await fetch('/v1/challenge', {
                            headers: { 'X-SRN-PubKey': this.identity.pubHex }
                        });
                        const ch = await res.json();
                        const nonce = await mineNonce(ch.salt, this.identity.pubHex, ch.k, cnt => { this.powAttempts = cnt; });
                        this.currentChallenge = { ...ch, nonce };
                    } catch (e) {
                        console.error('Challenge failed', e);
                    } finally {
                        this.powWorking = false;
                    }
                },

                async _handleAuthFailure(res, retryFn) {
                    if (res.status === 403 || res.status === 401) {
                        await this.refreshChallenge();
                        return retryFn();
                    }
                    return res;
                },

                async srnFetch(url, opts = {}) {
                    const headers = {
                        ...(opts.headers || {}),
                        'X-SRN-PubKey': this.identity.pubHex,
                        'X-SRN-Nonce': this.currentChallenge.nonce
                    };
                    const sig = await crypto.subtle.sign('Ed25519', this.privKey, new TextEncoder().encode(this.identity.pubHex));
                    headers['X-SRN-Signature'] = await srnBytesToHex(sig);
                    const res = await fetch(url, { ...opts, headers });
                    return this._handleAuthFailure(res, () => this.srnFetch(url, opts));
                },

                async srnFetchDownload(url, opts = {}) {
                    const headers = {
                        ...(opts.headers || {}),
                        'X-SRN-PubKey': this.identity.pubHex,
                        'X-SRN-Nonce': this.currentChallenge.nonce
                    };
                    const minute = String(Math.floor(Date.now() / 60000));
                    const sig = await crypto.subtle.sign('Ed25519', this.privKey, new TextEncoder().encode(minute));
                    headers['X-SRN-Signature'] = await srnBytesToHex(sig);
                    const res = await fetch(url, { ...opts, headers });
                    return this._handleAuthFailure(res, () => this.srnFetchDownload(url, opts));
                },

                onInput() {
                    if (this.powWorking) return;
                    clearTimeout(this.debounceTimer);
                    if (!this.searchInput) { this.suggestions = []; return; }
                    this.debounceTimer = setTimeout(() => this.fetchSuggestions(), 300);
                },

                async fetchSuggestions() {
                    try {
                        const url = \`/v1/tmdb/search?q=\${encodeURIComponent(this.searchInput)}\${this.tmdbEnabled ? '&fresh=1' : ''}\`;
                        const res = await this.srnFetch(url);
                        const data = await res.json();
                        this.suggestions = data.results || [];
                    } catch (e) { console.error('fetchSuggestions:', e); }
                },

                async selectSuggestion(s) {
                    this.currentTitle = s.name || s.title || '';
                    this.searchInput = this.currentTitle;
                    this.suggestions = [];
                    await this.fetchEvents(s.id);
                },

                async onEnter() {
                    if (this.powWorking) return;
                    const q = this.searchInput.trim();
                    if (!q) return;
                    if (/^[0-9]+$/.test(q)) {
                        await this.fetchEvents(q);
                    } else if (this.suggestions.length > 0) {
                        await this.selectSuggestion(this.suggestions[0]);
                    } else {
                        await this.fetchSuggestions();
                        if (this.suggestions.length > 0) {
                            await this.selectSuggestion(this.suggestions[0]);
                        }
                    }
                },

                async fetchEvents(id) {
                    this.loading = true;
                    this.suggestions = [];
                    this.seasonCounts = {};
                    try {
                        const res = await this.srnFetch(\`/v1/events?tmdb=\${id}\`);
                        const data = await res.json();
                        this.results = data.events || [];
                        // Async-fetch episode counts per season (non-blocking)
                        const seasons = [...new Set(this.results.map(e => e.season_num).filter(s => s != null))];
                        if (seasons.length > 0) this.fetchSeasonCounts(id, seasons);
                    } catch (e) {
                        console.error('fetchEvents:', e);
                    } finally {
                        this.loading = false;
                    }
                },

                async fetchSeasonCounts(tmdbId, seasons) {
                    const counts = {};
                    await Promise.all(seasons.map(async s => {
                        try {
                            const res = await this.srnFetch(\`/v1/tmdb/season?tmdb_id=\${tmdbId}&season=\${s}\`);
                            const data = await res.json();
                            counts[s] = data.episode_count;
                        } catch(e) { counts[s] = null; }
                    }));
                    this.seasonCounts = counts;
                },

                async fetchBlob(item) {
                    const res = await this.srnFetchDownload(\`/v1/events/\${item.id}/content\`);
                    if (!res.ok) return null;
                    return res.blob();
                },

                async downloadSingle(item) {
                    const blob = await this.fetchBlob(item);
                    if (!blob) { alert('下载失败'); return; }
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = item.filename || \`SRN_E\${String(item.episode_num ?? '?').padStart(2,'0')}_\${item.id}.ass\`;
                    a.click();
                },

                async downloadLangPack(season, lang, items) {
                    const zip = new JSZip();
                    await Promise.all(items.map(async item => {
                        const blob = await this.fetchBlob(item);
                        if (blob) {
                            const name = item.filename || \`E\${String(item.episode_num ?? '?').padStart(2,'0')}_\${item.id}.ass\`;
                            zip.file(name, blob);
                        }
                    }));
                    const zipBlob = await zip.generateAsync({ type: 'blob' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(zipBlob);
                    a.download = \`SRN_S\${String(season ?? '00').padStart(2,'0')}_\${lang}.zip\`;
                    a.click();
                }
            };
        }

        Vue.createApp({
            setup() {
                // shallowReactive: top-level properties are reactive; nested objects
                // (CryptoKey, etc.) are left as raw values so WebCrypto works.
                const app = Vue.shallowReactive(initApp());

                // Bind every method to app so "this" is always the shallowReactive
                // object — Vue 3 Composition API does not guarantee this == component
                // proxy inside setup-returned functions.
                const bound = {};
                Object.keys(app).forEach(k => {
                    if (typeof app[k] === 'function') bound[k] = app[k].bind(app);
                });

                // Group by archive_md5 (top) → season_num → language → sorted episodes.
                // Items with no archive_md5 (single-file uploads) each get their own block
                // keyed by event id.
                const groupedResults = Vue.computed(() => {
                    const archives = {};
                    app.results.forEach(item => {
                        const aKey = item.archive_md5 || item.id;
                        if (!archives[aKey]) {
                            archives[aKey] = {
                                key: aKey,
                                archive_md5: item.archive_md5,
                                source_uri: item.source_uri || null,
                                source_type: item.source_type || null,
                                pubkey: item.pubkey,
                                tmdb_id: item.tmdb_id,
                                seasons: {}
                            };
                        }
                        // JS integer keys are iterated in ascending order — gives free season sort
                        const sKey = item.season_num != null ? item.season_num : 'movie';
                        if (!archives[aKey].seasons[sKey]) {
                            archives[aKey].seasons[sKey] = {
                                season: item.season_num,
                                languages: {}
                            };
                        }
                        const lang = item.language || 'unknown';
                        if (!archives[aKey].seasons[sKey].languages[lang]) {
                            archives[aKey].seasons[sKey].languages[lang] = { items: [] };
                        }
                        archives[aKey].seasons[sKey].languages[lang].items.push(item);
                    });
                    // Sort episodes within each language group by episode_num ascending
                    Object.values(archives).forEach(a => {
                        Object.values(a.seasons).forEach(s => {
                            Object.values(s.languages).forEach(lg => {
                                lg.items.sort((x, y) => (x.episode_num ?? 0) - (y.episode_num ?? 0));
                            });
                        });
                    });
                    return Object.values(archives);
                });

                Vue.onMounted(() => app.init());

                // toRefs exposes reactive data; bound overrides the unbound method refs from toRefs.
                return { ...Vue.toRefs(app), ...bound, groupedResults };
            }
        }).mount('#app');
    </script>
</body>
</html>
`;
