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
        .container { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }
        
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

        /* Results */
        .results-grid { display: grid; gap: 1.5rem; }
        .pack-card {
            background: white;
            border-radius: 1rem;
            border: 1px solid var(--border);
            padding: 1.5rem;
        }
        .pack-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .pack-title h3 { font-size: 1.125rem; margin-bottom: 0.25rem; }
        .pack-meta { display: flex; gap: 1rem; font-size: 0.875rem; color: #64748b; }
        
        .episode-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; }
        .episode-item {
            padding: 0.75rem;
            background: #f8fafc;
            border-radius: 0.5rem;
            border: 1px solid var(--border);
            font-size: 0.875rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .episode-item:hover { border-color: var(--primary); }
        .dl-icon { color: #94a3b8; cursor: pointer; }
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
                <div v-for="i in 3" class="pack-card loading-shimmer" style="height: 200px;"></div>
            </div>

            <div v-else class="results-grid">
                <div v-for="pack in groupedResults" :key="pack.id" class="pack-card">
                    <div class="pack-header">
                        <div class="pack-title">
                            <h3>{{ pack.title }}</h3>
                            <div class="pack-meta">
                                <span>第 {{ pack.season }} 季</span>
                                <span>{{ pack.items.length }} 个文件</span>
                                <span class="tag">{{ pack.items[0].source_type }}</span>
                            </div>
                        </div>
                        <button style="background: #f1f5f9; color: var(--text); font-size: 0.8rem;" @click="downloadPack(pack)">打包下载</button>
                    </div>
                    
                    <div class="episode-list">
                        <div v-for="item in pack.items" :key="item.id" class="episode-item">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span style="font-weight: 500; font-family: 'JetBrains Mono';">E{{ item.episode_num }}</span>
                                <span class="tag tag-lang">{{ item.language }}</span>
                            </div>
                            <svg class="dl-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" @click="downloadSingle(item)">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4M7 10l5 5 5-5M12 15V3"/>
                            </svg>
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
                    } catch (e) {}
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
                    try {
                        const res = await this.srnFetch(\`/v1/events?tmdb=\${id}\`);
                        const data = await res.json();
                        this.results = data.events || [];
                    } catch (e) {
                    } finally {
                        this.loading = false;
                    }
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

                async downloadPack(pack) {
                    // Pack download logic omitted for brevity in this refactor, 
                    // typically involves generating a zip client-side.
                    alert('正在打包中... (演示)');
                    for (const item of pack.items) {
                        await this.downloadSingle(item);
                    }
                }
            };
        }

        Vue.createApp({
            setup() {
                // MUST call Vue.reactive() before any method calls so that
                // "this" inside init/onInput/etc. refers to the reactive proxy.
                const app = Vue.reactive(initApp());

                const groupedResults = Vue.computed(() => {
                    const groups = {};
                    app.results.forEach(item => {
                        const key = \`\${item.tmdb_id}_\${item.season_num}_\${item.source_type}\`;
                        if (!groups[key]) {
                            groups[key] = {
                                id: key,
                                title: \`TMDB \${item.tmdb_id}\`,
                                season: item.season_num,
                                items: []
                            };
                        }
                        groups[key].items.push(item);
                    });
                    return Object.values(groups).sort((a, b) => b.season - a.season);
                });

                Vue.onMounted(() => app.init());

                return { ...Vue.toRefs(app), groupedResults };
            }
        }).mount('#app');
    </script>
</body>
</html>
`;
