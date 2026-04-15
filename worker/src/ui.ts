export const renderLandingPage = (stats: { totalEvents: number }) => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SRN Portal - 边缘字幕索引</title>
    <script src="https://unpkg.com/petite-vue"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #6366f1;
            --primary-glow: rgba(99, 102, 241, 0.4);
            --accent: #f43f5e;
            --bg: #050505;
            --card-bg: rgba(20, 20, 25, 0.8);
            --border: rgba(255, 255, 255, 0.1);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background: var(--bg);
            color: #e2e8f0;
            min-height: 100vh;
            background-image: radial-gradient(circle at top right, rgba(99, 102, 241, 0.1), transparent 40%);
        }

        .navbar {
            padding: 1.5rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
            backdrop-filter: blur(10px);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .logo { font-size: 1.5rem; font-weight: 600; letter-spacing: -1px; background: linear-gradient(90deg, #fff, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }

        .hero { text-align: center; padding: 4rem 0; }
        .hero h1 { font-size: 3rem; margin-bottom: 1.5rem; }
        
        .search-container {
            max-width: 700px;
            margin: 0 auto 3rem;
            position: relative;
        }

        .search-box {
            display: flex;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 8px;
            transition: all 0.3s;
        }
        .search-box:focus-within { border-color: var(--primary); box-shadow: 0 0 30px var(--primary-glow); }
        .search-box input {
            flex: 1;
            background: transparent;
            border: none;
            padding: 1rem 1.5rem;
            color: #fff;
            font-size: 1.1rem;
            outline: none;
        }
        .search-box button {
            background: var(--primary);
            color: #fff;
            border: none;
            padding: 0 2.5rem;
            border-radius: 14px;
            font-weight: 600;
            cursor: pointer;
        }
        .tmdb-toggle {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0 0.75rem;
            border-left: 1px solid var(--border);
            cursor: pointer;
            user-select: none;
        }
        .toggle-track {
            width: 30px;
            height: 17px;
            border-radius: 9px;
            background: rgba(255,255,255,0.07);
            border: 1px solid var(--border);
            position: relative;
            transition: all 0.2s;
            flex-shrink: 0;
        }
        .toggle-thumb {
            width: 11px;
            height: 11px;
            border-radius: 50%;
            background: #475569;
            position: absolute;
            top: 2px;
            left: 2px;
            transition: all 0.2s;
        }
        .tmdb-toggle.active .toggle-track { background: rgba(1,180,228,0.2); border-color: #01b4e4; }
        .tmdb-toggle.active .toggle-thumb { background: #01b4e4; left: 15px; }
        .tmdb-label { font-size: 0.72rem; font-weight: 600; color: #475569; transition: color 0.2s; white-space: nowrap; }
        .tmdb-toggle.active .tmdb-label { color: #01b4e4; }

        .suggestions {
            position: absolute;
            top: calc(100% + 10px);
            left: 0;
            right: 0;
            background: #1a1a20;
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            z-index: 50;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }
        .suggestion-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem 1rem;
            cursor: pointer;
            transition: 0.2s;
        }
        .suggestion-item:hover { background: rgba(255,255,255,0.05); }
        .suggestion-item img { width: 40px; height: 60px; object-fit: cover; border-radius: 4px; }
        .suggestion-info { flex: 1; }
        .suggestion-name { font-weight: 600; font-size: 0.95rem; }
        .suggestion-meta { font-size: 0.8rem; color: #64748b; }
        .suggestions-footer {
            padding: 0.5rem 1rem;
            font-size: 0.75rem;
            color: #475569;
            border-top: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .source-badge {
            padding: 1px 7px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 600;
            background: rgba(99,102,241,0.15);
            color: var(--primary);
        }
        .source-badge.tmdb { background: rgba(1,180,228,0.15); color: #01b4e4; }

        .stats-strip { display: flex; gap: 2rem; justify-content: center; color: #64748b; font-size: 0.9rem; margin-bottom: 4rem; }
        .stat-item b { color: var(--primary); }

        .results-list { display: flex; flex-direction: column; gap: 0.75rem; }

        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        .pack-row {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            transition: border-color 0.3s;
            animation: fadeInUp 0.4s ease-out backwards;
        }
        .pack-row.expanded { border-color: rgba(99, 102, 241, 0.5); }

        .pack-summary {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1.1rem 1.5rem;
            cursor: pointer;
            user-select: none;
        }
        .pack-summary:hover { background: rgba(255,255,255,0.03); }

        .pack-main { flex: 1; min-width: 0; }
        .group-name { font-weight: 600; color: #fff; font-size: 1rem; margin-bottom: 0.35rem; }
        .meta-strip { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .meta-chip {
            font-size: 0.68rem;
            font-weight: 600;
            padding: 1px 7px;
            border-radius: 4px;
            white-space: nowrap;
        }
        .meta-chip.lang  { background: rgba(1,180,228,0.12);  color: #38bdf8; }
        .meta-chip.season{ background: rgba(99,102,241,0.15); color: var(--primary); }
        .meta-chip.ep    { background: rgba(249,115,22,0.12); color: #fb923c; }
        .meta-chip.extra { background: rgba(255,255,255,0.06); color: #94a3b8; }
        .md5-tag { font-family: 'JetBrains Mono'; font-size: 0.7rem; color: #64748b; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px; }
        .count-badge { background: rgba(244, 63, 94, 0.1); color: var(--accent); padding: 3px 10px; border-radius: 6px; font-size: 0.8rem; white-space: nowrap; }
        .chevron { color: #64748b; font-size: 0.75rem; transition: transform 0.3s; }
        .chevron.open { transform: rotate(180deg); }

        .pack-detail {
            padding: 1rem 1.5rem 1.5rem;
            border-top: 1px solid var(--border);
        }
        .pack-meta-footer {
            display: flex;
            gap: 1.5rem;
            margin-bottom: 1rem;
            font-size: 0.78rem;
            color: #475569;
        }
        .pack-meta-footer span b { color: #64748b; font-weight: 500; }
        .source-section {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            margin-bottom: 1.25rem;
            padding: 0.75rem 1rem;
            background: rgba(251,191,36,0.05);
            border: 1px solid rgba(251,191,36,0.15);
            border-radius: 10px;
        }
        .source-row {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-wrap: wrap;
        }
        .source-type-badge {
            font-size: 0.7rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            background: rgba(251,191,36,0.15);
            color: #fbbf24;
            text-transform: uppercase;
            white-space: nowrap;
        }
        .source-uri {
            flex: 1;
            font-family: 'JetBrains Mono';
            font-size: 0.72rem;
            color: #94a3b8;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-decoration: none;
        }
        .source-uri:hover { color: #fbbf24; }
        .source-btn {
            white-space: nowrap;
            flex: none !important;
            background: rgba(251,191,36,0.1) !important;
            border-color: rgba(251,191,36,0.3) !important;
            color: #fbbf24 !important;
            font-size: 0.8rem !important;
            padding: 0.4rem 1rem !important;
            text-decoration: none;
        }
        .source-btn:hover { background: rgba(251,191,36,0.2) !important; }

        .season-group { margin-bottom: 1rem; }
        .season-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
            font-size: 0.8rem;
            font-weight: 600;
            color: #64748b;
        }
        .season-coverage {
            font-family: 'JetBrains Mono';
            font-size: 0.72rem;
            padding: 1px 7px;
            border-radius: 4px;
            background: rgba(99,102,241,0.12);
            color: var(--primary);
        }
        .season-coverage.complete { background: rgba(34,197,94,0.12); color: #4ade80; }

        .episodes-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 0;
        }
        .ep-badge {
            background: rgba(99, 102, 241, 0.1);
            color: var(--primary);
            padding: 4px 12px;
            border-radius: 8px;
            font-size: 0.85rem;
            border: 1px solid rgba(99, 102, 241, 0.2);
        }

        .pack-footer { display: flex; gap: 0.5rem; }
        .action-btn {
            flex: 1;
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--border);
            color: #fff;
            padding: 0.75rem;
            border-radius: 12px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: 0.3s;
            text-decoration: none;
            text-align: center;
        }
        .action-btn:hover { background: var(--primary); border-color: var(--primary); }
        .action-btn.primary { background: var(--primary); }

        .loading-spinner {
            text-align: center;
            padding: 2rem;
            color: var(--primary);
            font-weight: 600;
        }

        .empty-state {
            text-align: center;
            padding: 5rem;
            color: #64748b;
        }
    </style>
</head>
<body>
    <div id="app" v-scope @mounted="init()">
        <nav class="navbar">
            <div class="logo">SRN CLOUDLESS</div>
            <div class="nav-links">
                <a href="/ui" style="color: #64748b; text-decoration: none; font-size: 0.9rem;">API DOCS</a>
            </div>
        </nav>

        <div class="container">
            <section class="hero" v-if="!results.length && !loading">
                <div class="search-container">
                    <div class="search-box">
                        <input type="text" v-model="searchInput" @input="onInput" @keyup.enter="onEnter" placeholder="输入影视名称或 TMDB ID...">
                        <div class="tmdb-toggle" :class="{ active: tmdbEnabled }" @click="toggleTmdb">
                            <div class="toggle-track"><div class="toggle-thumb"></div></div>
                            <span class="tmdb-label">TMDB</span>
                        </div>
                        <button @click="onEnter">探索索引</button>
                    </div>
                    <div class="suggestions" v-if="suggestions.length">
                        <div v-for="s in suggestions" class="suggestion-item" @click="selectSuggestion(s)">
                            <img :src="s.poster || 'https://via.placeholder.com/92x138?text=No+Poster'" alt="poster">
                            <div class="suggestion-info">
                                <div class="suggestion-name">{{ s.name }}</div>
                                <div class="suggestion-meta">{{ s.type.toUpperCase() }} • {{ s.year }} • ID: {{ s.id }}</div>
                            </div>
                        </div>
                        <div class="suggestions-footer">
                            <span class="source-badge" :class="{ tmdb: suggestionsSource === 'tmdb' }">
                                {{ suggestionsSource === 'tmdb' ? 'TMDB' : '本地缓存' }}
                            </span>
                            <span v-if="suggestionsSource === 'cache'">开启 TMDB 获取最新结果</span>
                            <span v-else>已同步最新数据</span>
                        </div>
                    </div>
                </div>
                <div class="stats-strip">
                    <div class="stat-item">已索引 <b>${stats.totalEvents}</b> 份内容</div>
                    <div class="stat-item">节点状态 <b>全球活跃</b></div>
                </div>
            </section>

            <section class="results-section" v-if="results.length || loading">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <h2 v-if="currentMedia">正在查看: <span style="color: var(--primary);">{{ currentMedia.name }} ({{ currentMedia.year }})</span></h2>
                    <h2 v-else>搜索结果: TMDB <span style="color: var(--primary);">{{ searchInput }}</span></h2>
                    <button class="action-btn" style="flex: none; padding: 0.5rem 1.5rem;" @click="reset()">重新搜索</button>
                </div>

                <div v-if="loading" class="loading-spinner">正在从分布式数据库读取元数据...</div>

                <div v-else-if="groupedResults.length" class="results-list">
                    <div v-for="pack in groupedResults" class="pack-row" :class="{ expanded: expandedGroups[pack.archive_md5] }">
                        <div class="pack-summary" @click="toggleExpand(pack.archive_md5)">
                            <div class="pack-main">
                                <div class="group-name">{{ pack.group || '未知字幕组' }}</div>
                                <div class="meta-strip">
                                    <span v-for="lang in pack.languages" class="meta-chip lang">{{ lang }}</span>
                                    <span v-for="s in pack.seasons" class="meta-chip season">S{{ s }}</span>
                                    <span v-if="pack.epMax > 0" class="meta-chip ep">
                                        E{{ String(pack.epMin).padStart(2,'0') }}{{ pack.epMin !== pack.epMax ? '–' + String(pack.epMax).padStart(2,'0') : '' }}
                                    </span>
                                    <span v-for="(v, k) in pack.extraTags" class="meta-chip extra">{{ k }}: {{ v }}</span>
                                </div>
                            </div>
                            <div class="md5-tag">{{ pack.archive_md5.substring(0, 10) }}…</div>
                            <div class="count-badge">{{ pack.items.length }} 卷</div>
                            <span class="chevron" :class="{ open: expandedGroups[pack.archive_md5] }">▼</span>
                        </div>

                        <div v-if="expandedGroups[pack.archive_md5]" class="pack-detail">
                            <div class="pack-meta-footer">
                                <span><b>上传者</b> {{ pack.pubkey.substring(0, 12) }}…</span>
                                <span><b>更新于</b> {{ formatDate(pack.latestAt) }}</span>
                                <span><b>归档 MD5</b> {{ pack.archive_md5 }}</span>
                            </div>
                            <div v-if="pack.sources.length" class="source-section">
                                <div v-for="src in pack.sources" class="source-row">
                                    <span class="source-type-badge">{{ src.type }}</span>
                                    <a :href="src.uri" target="_blank" rel="noopener" class="source-uri">{{ src.uri }}</a>
                                    <a :href="src.uri" target="_blank" rel="noopener" class="action-btn source-btn">喝水不忘挖井人</a>
                                </div>
                            </div>

                            <div v-for="sg in pack.seasonGroups" class="season-group">
                                <div class="season-header">
                                    S{{ String(sg.season).padStart(2,'0') }}
                                    <span class="season-coverage" :class="{ complete: sg.count === sg.totalEp }">
                                        {{ sg.count }}/{{ sg.totalEp }}
                                    </span>
                                </div>
                                <div class="episodes-list">
                                    <div v-for="item in sg.items" class="ep-badge">
                                        E{{ String(item.episode_num || 0).padStart(2,'0') }} · {{ item.language }}
                                    </div>
                                </div>
                            </div>
                            <div class="pack-footer">
                                <button class="action-btn" @click="downloadSingle(pack.items[0])">单卷下载</button>
                                <button class="action-btn primary" @click="downloadPack(pack)">
                                    {{ downloading === pack.archive_md5 ? '打包中...' : '整季打包 (ZIP)' }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-else class="empty-state">
                    没有找到匹配的字幕。试着更换关键词再次检索。
                </div>
            </section>
        </div>

        <footer>
            <p style="text-align: center; padding: 4rem; color: #334155; font-size: 0.85rem;">
                &copy; 2026 Subtitle Relay Network. Distributed by Cloudflare Workers.
            </p>
        </footer>
    </div>

    <script>
        function initApp() {
            return {
                searchInput: '',
                results: [],
                loading: false,
                downloading: null,
                suggestions: [],
                suggestionsSource: '',
                tmdbEnabled: false,
                currentMedia: null,
                expandedGroups: {},
                seasonCounts: {},
                stats: { totalEvents: ${stats.totalEvents} },
                debounceTimer: null,

                onInput() {
                    clearTimeout(this.debounceTimer);
                    if (!this.searchInput || /^[0-9]+$/.test(this.searchInput)) {
                        this.suggestions = [];
                        this.suggestionsSource = '';
                        return;
                    }
                    this.debounceTimer = setTimeout(() => this.fetchSuggestions(), 300);
                },

                async fetchSuggestions() {
                    try {
                        const url = \`/v1/tmdb/search?q=\${encodeURIComponent(this.searchInput)}\${this.tmdbEnabled ? '&fresh=1' : ''}\`;
                        const res = await fetch(url);
                        if (res.status === 429) return;
                        const data = await res.json();
                        this.suggestions = data.results || [];
                        this.suggestionsSource = data.source || '';
                    } catch (e) {
                        console.error('TMDB fetch error', e);
                    }
                },

                toggleTmdb() {
                    this.tmdbEnabled = !this.tmdbEnabled;
                    if (this.searchInput && !/^[0-9]+$/.test(this.searchInput)) {
                        this.fetchSuggestions();
                    }
                },

                selectSuggestion(s) {
                    this.currentMedia = s;
                    this.searchInput = s.id.toString();
                    this.suggestions = [];
                    this.suggestionsSource = '';
                    this.search(s.id);
                },

                onEnter() {
                    if (this.suggestions.length > 0) {
                        this.selectSuggestion(this.suggestions[0]);
                    } else if (this.searchInput) {
                        this.search(this.searchInput);
                    }
                },

                async search(id) {
                    this.loading = true;
                    this.suggestions = [];
                    try {
                        const res = await fetch(\`/v1/events?tmdb=\${id}\`);
                        const data = await res.json();
                        this.results = data.events || [];
                        this.fetchSeasonCounts();
                    } catch (e) {
                        alert('连接中继失败');
                    } finally {
                        this.loading = false;
                    }
                },

                async fetchSeasonCounts() {
                    const pairs = new Map();
                    this.results.forEach(ev => {
                        if (ev.tmdb_id && ev.season_num) {
                            const key = \`\${ev.tmdb_id}_\${ev.season_num}\`;
                            if (!pairs.has(key)) pairs.set(key, { tmdb_id: ev.tmdb_id, season: ev.season_num });
                        }
                    });
                    await Promise.all([...pairs.values()].map(async ({ tmdb_id, season }) => {
                        try {
                            const res = await fetch(\`/v1/tmdb/season?tmdb_id=\${tmdb_id}&season=\${season}\`);
                            if (!res.ok) return;
                            const data = await res.json();
                            this.seasonCounts[\`\${tmdb_id}_\${season}\`] = data.episode_count;
                        } catch (e) {}
                    }));
                },

                reset() {
                    this.results = [];
                    this.searchInput = '';
                    this.currentMedia = null;
                    this.suggestions = [];
                    this.expandedGroups = {};
                    this.seasonCounts = {};
                },

                toggleExpand(archive_md5) {
                    this.expandedGroups[archive_md5] = !this.expandedGroups[archive_md5];
                },

                formatDate(ts) {
                    if (!ts) return '—';
                    return new Date(ts * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
                },

                get groupedResults() {
                    const STD_KEYS = new Set(['tmdb', 's', 'ep', 'group', 'lang']);
                    const groups = {};
                    this.results.forEach(ev => {
                        const key = ev.archive_md5 || \`unpacked-\${ev.pubkey}\`;
                        if (!groups[key]) {
                            const tags = JSON.parse(ev.tags || '[]');
                            groups[key] = {
                                archive_md5: ev.archive_md5 || 'N/A',
                                group: tags.find(t => t[0] === 'group')?.[1] || null,
                                pubkey: ev.pubkey || '',
                                items: [],
                                languages: [],
                                seasons: [],
                                extraTags: {},
                                latestAt: 0,
                                sources: [],
                            };
                        }
                        const pack = groups[key];
                        pack.items.push(ev);
                        if (ev.language && !pack.languages.includes(ev.language))
                            pack.languages.push(ev.language);
                        if (ev.season_num && !pack.seasons.includes(ev.season_num))
                            pack.seasons.push(ev.season_num);
                        if ((ev.created_at || 0) > pack.latestAt)
                            pack.latestAt = ev.created_at;
                        if (ev.source_uri && !pack.sources.find(s => s.uri === ev.source_uri))
                            pack.sources.push({ type: ev.source_type || 'source', uri: ev.source_uri });
                        JSON.parse(ev.tags || '[]').forEach(([k, v]) => {
                            if (!STD_KEYS.has(k) && v && !(k in pack.extraTags))
                                pack.extraTags[k] = v;
                        });
                    });
                    return Object.values(groups).map(pack => {
                        const eps = pack.items.map(i => i.episode_num || 0).filter(n => n > 0);
                        pack.languages.sort();
                        pack.seasons.sort((a, b) => a - b);
                        pack.epMin = eps.length ? Math.min(...eps) : 0;
                        pack.epMax = eps.length ? Math.max(...eps) : 0;

                        // Season-level grouping
                        const tmdbId = pack.items[0]?.tmdb_id;
                        const seasonMap = {};
                        pack.items.forEach(item => {
                            const s = item.season_num || 0;
                            if (!seasonMap[s]) seasonMap[s] = [];
                            seasonMap[s].push(item);
                        });
                        pack.seasonGroups = Object.entries(seasonMap)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([s, items]) => {
                                items.sort((a, b) => (a.episode_num || 0) - (b.episode_num || 0));
                                const epNums = items.map(i => i.episode_num || 0).filter(n => n > 0);
                                const maxEp = epNums.length ? Math.max(...epNums) : items.length;
                                const totalEp = this.seasonCounts[\`\${tmdbId}_\${s}\`] ?? maxEp;
                                return { season: Number(s), items, count: items.length, totalEp };
                            });

                        return pack;
                    }).sort((a, b) => b.items.length - a.items.length);
                },

                async downloadSingle(item) {
                    window.location.href = \`/v1/events/\${item.id}/content\`;
                },

                async downloadPack(pack) {
                    if (this.downloading) return;
                    this.downloading = pack.archive_md5;
                    const zip = new JSZip();
                    
                    try {
                        const promises = pack.items.map(async (item) => {
                            const res = await fetch(\`/v1/events/\${item.id}/content\`);
                            const blob = await res.blob();
                            const filename = item.filename || \`S\${item.season_num}E\${item.episode_num}.\${item.language}.ass\`;
                            zip.file(filename, blob);
                        });

                        await Promise.all(promises);
                        const content = await zip.generateAsync({ type: "blob" });
                        
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(content);
                        link.download = \`SRN_Pack_\${pack.group || 'Pack'}.zip\`;
                        link.click();
                    } catch (e) {
                        alert('打包失败: ' + e.message);
                    } finally {
                        this.downloading = null;
                    }
                }
            }
        }
        PetiteVue.createApp(initApp()).mount('#app');
    </script>
</body>
</html>
`;
