/**
 * UI components and landing page for SRN.
 */
import { RELAY_VERSION } from "./types";

export const renderLandingPage = (stats: { totalEvents: number }) => `
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

        /* Results: Season Cards */
        .results-grid { display: grid; gap: 1.5rem; }
        .season-card {
            background: white;
            border-radius: 1rem;
            border: 1px solid var(--border);
            overflow: hidden;
        }
        .season-header {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border);
            background: #f8fafc;
            font-size: 1rem;
            font-weight: 600;
            color: #0f172a;
        }

        /* Language Group */
        .lang-group { border-bottom: 1px solid var(--border); }
        .lang-group:last-child { border-bottom: none; }
        .lang-group-header {
            padding: 0.75rem 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.625rem;
            background: white;
        }
        .ep-count {
            font-size: 0.78rem;
            color: #64748b;
            font-family: 'JetBrains Mono', monospace;
        }
        .pack-btn {
            margin-left: auto;
            background: #f1f5f9;
            color: var(--text);
            font-size: 0.75rem;
            padding: 0.35rem 0.875rem;
            border-radius: 0.375rem;
        }

        /* Source type (字幕组) sub-group */
        .source-group { border-top: 1px dashed var(--border); }
        .source-group:first-child { border-top: none; }
        .source-group-header {
            padding: 0.4rem 1.5rem 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .source-type-badge {
            font-size: 0.72rem;
            font-weight: 600;
            color: #0f172a;
            background: #f1f5f9;
            padding: 0.15rem 0.5rem;
            border-radius: 0.25rem;
            border: 1px solid var(--border);
        }

        /* Episode List */
        .episode-list { padding: 0.4rem 1.5rem 0.875rem; display: grid; gap: 0.4rem; }
        .episode-item {
            padding: 0.5rem 0.75rem;
            background: #f8fafc;
            border-radius: 0.5rem;
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 0.625rem;
            font-size: 0.8rem;
        }
        .episode-item:hover { border-color: var(--primary); }

        .ep-num {
            font-family: 'JetBrains Mono', monospace;
            font-weight: 500;
            font-size: 0.82rem;
            min-width: 2.4rem;
            color: #0f172a;
        }
        .ep-meta {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            flex: 1;
            flex-wrap: wrap;
            min-width: 0;
        }

        /* Source link — highlighted, clickable */
        .source-link {
            display: inline-flex;
            align-items: center;
            gap: 0.2rem;
            color: #2563eb;
            text-decoration: none;
            font-size: 0.72rem;
            font-weight: 500;
            background: #eff6ff;
            padding: 0.15rem 0.45rem;
            border-radius: 0.25rem;
            border: 1px solid #bfdbfe;
            white-space: nowrap;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            flex-shrink: 0;
        }
        .source-link:hover { background: #dbeafe; border-color: #93c5fd; }

        /* Pubkey badge — highlighted in purple */
        .pubkey-badge {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.68rem;
            color: #7c3aed;
            background: #f5f3ff;
            padding: 0.15rem 0.45rem;
            border-radius: 0.25rem;
            border: 1px solid #ddd6fe;
            cursor: default;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 160px;
        }

        /* Archive MD5 badge */
        .archive-badge {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.68rem;
            color: #0369a1;
            background: #f0f9ff;
            padding: 0.15rem 0.45rem;
            border-radius: 0.25rem;
            border: 1px solid #bae6fd;
            cursor: default;
            white-space: nowrap;
        }

        .dl-icon { margin-left: auto; color: #94a3b8; cursor: pointer; flex-shrink: 0; }
        .dl-icon:hover { color: var(--primary); }

        .tag { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 500; }
        .tag-lang { background: #dbeafe; color: #1e40af; }

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
                <div v-for="i in 3" class="season-card loading-shimmer" style="height: 200px;"></div>
            </div>

            <div v-else class="results-grid">
                <div v-for="season in groupedResults" :key="season.season" class="season-card">
                    <div class="season-header">
                        {{ season.season != null ? '第 ' + season.season + ' 季' : '电影' }}
                    </div>

                    <div v-for="(langGroup, lang) in season.languages" :key="lang" class="lang-group">
                        <div class="lang-group-header">
                            <span class="tag tag-lang">{{ lang }}</span>
                            <span class="ep-count">
                                {{ langGroup.items.length }}<template v-if="seasonCounts[season.season] != null"> / {{ seasonCounts[season.season] }}</template> ep
                            </span>
                            <button class="pack-btn" @click="downloadLangPack(season.season, lang, langGroup.items)">打包下载</button>
                        </div>
                        <div v-for="(srcGroup, srcType) in langGroup.groups" :key="srcType" class="source-group">
                            <div class="source-group-header">
                                <span class="source-type-badge">{{ srcType }}</span>
                            </div>
                            <div class="episode-list">
                                <div v-for="item in srcGroup.items" :key="item.id" class="episode-item">
                                    <span class="ep-num">E{{ String(item.episode_num ?? '?').padStart(2, '0') }}</span>
                                    <div class="ep-meta">
                                        <a v-if="item.source_uri" :href="item.source_uri" target="_blank" rel="noopener" class="source-link" :title="item.source_uri">
                                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                            {{ item.source_uri.replace(/^https?:\\/\\/([^\\/]+).*/, '$1') }}
                                        </a>
                                        <span class="pubkey-badge" :title="item.pubkey">{{ item.pubkey.substring(0, 16) }}…</span>
                                        <span v-if="item.archive_md5" class="archive-badge" :title="'archive: ' + item.archive_md5">{{ item.archive_md5.substring(0, 10) }}…</span>
                                    </div>
                                    <svg class="dl-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" @click="downloadSingle(item)">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                                    </svg>
                                </div>
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

        async function verifyPoW(salt, pubHex, nonce, k) {
            const data = new TextEncoder().encode(salt + pubHex + nonce);
            const hashBuf = await crypto.subtle.digest('SHA-256', data);
            const hashHex = await srnBytesToHex(hashBuf);
            return hashHex.startsWith('0'.repeat(k));
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
                tmdbEnabled: true,
                loading: false,
                results: [],
                suggestions: [],
                seasonCounts: {},
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

                    // Simple self-signature for search (message = pubkey)
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

                    // Download signature uses minute timestamp for higher security
                    const minute = String(Math.floor(Date.now() / 60000));
                    const sig = await crypto.subtle.sign('Ed25519', this.privKey, new TextEncoder().encode(minute));
                    headers['X-SRN-Signature'] = await srnBytesToHex(sig);

                    const res = await fetch(url, { ...opts, headers });
                    return this._handleAuthFailure(res, () => this.srnFetchDownload(url, opts));
                },

                onInput() {
                    if (this.powWorking) return;
                    clearTimeout(this.debounceTimer);
                    if (!this.searchInput) {
                        this.suggestions = [];
                        return;
                    }
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
                    this.searchInput = s.name || s.title;
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
                        // suggestions not loaded yet — fetch first, then use top result
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

                async downloadSingle(item) {
                    const res = await this.srnFetchDownload(\`/v1/events/\${item.id}/content\`);
                    if (!res.ok) { alert('下载失败'); return; }
                    const blob = await res.blob();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = item.filename || \`SRN_\${item.id}.ass\`;
                    a.click();
                },

                async downloadLangPack(season, lang, items) {
                    for (const item of items) {
                        await this.downloadSingle(item);
                    }
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

                // Group results: season → language → source_type (字幕组) → sorted episodes
                const groupedResults = Vue.computed(() => {
                    const seasons = {};
                    app.results.forEach(item => {
                        const sKey = item.season_num != null ? item.season_num : 'movie';
                        if (!seasons[sKey]) {
                            seasons[sKey] = { season: item.season_num, tmdb_id: item.tmdb_id, languages: {} };
                        }
                        const lang = item.language || 'unknown';
                        if (!seasons[sKey].languages[lang]) {
                            seasons[sKey].languages[lang] = { items: [], groups: {} };
                        }
                        seasons[sKey].languages[lang].items.push(item);
                        const src = item.source_type || 'unknown';
                        if (!seasons[sKey].languages[lang].groups[src]) {
                            seasons[sKey].languages[lang].groups[src] = { items: [] };
                        }
                        seasons[sKey].languages[lang].groups[src].items.push(item);
                    });
                    // Sort episodes within each source group by episode_num ascending
                    Object.values(seasons).forEach(s => {
                        Object.values(s.languages).forEach(lg => {
                            Object.values(lg.groups).forEach(g => {
                                g.items.sort((a, b) => (a.episode_num ?? 0) - (b.episode_num ?? 0));
                            });
                        });
                    });
                    return Object.values(seasons).sort((a, b) => (b.season ?? -1) - (a.season ?? -1));
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
