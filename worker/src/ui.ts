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

        .group-name { font-weight: 600; color: #fff; font-size: 1rem; flex: 1; }
        .md5-tag { font-family: 'JetBrains Mono'; font-size: 0.7rem; color: #64748b; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px; }
        .count-badge { background: rgba(244, 63, 94, 0.1); color: var(--accent); padding: 3px 10px; border-radius: 6px; font-size: 0.8rem; white-space: nowrap; }
        .chevron { color: #64748b; font-size: 0.75rem; transition: transform 0.3s; }
        .chevron.open { transform: rotate(180deg); }

        .pack-detail {
            padding: 1rem 1.5rem 1.5rem;
            border-top: 1px solid var(--border);
        }

        .episodes-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-bottom: 1.25rem;
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
                            <div class="group-name">{{ pack.group || '未知字幕组' }}</div>
                            <div class="md5-tag">{{ pack.archive_md5.substring(0, 12) }}…</div>
                            <div class="count-badge">{{ pack.items.length }} 卷</div>
                            <span class="chevron" :class="{ open: expandedGroups[pack.archive_md5] }">▼</span>
                        </div>

                        <div v-if="expandedGroups[pack.archive_md5]" class="pack-detail">
                            <div class="episodes-list">
                                <div v-for="item in pack.items" class="ep-badge">
                                    S{{ item.season_num || 0 }}E{{ item.episode_num || 0 }} ({{ item.language }})
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
                currentMedia: null,
                expandedGroups: {},
                stats: { totalEvents: ${stats.totalEvents} },
                debounceTimer: null,
                
                onInput() {
                    clearTimeout(this.debounceTimer);
                    if (!this.searchInput || /^[0-9]+$/.test(this.searchInput)) {
                        this.suggestions = [];
                        return;
                    }
                    this.debounceTimer = setTimeout(() => this.fetchSuggestions(), 300);
                },

                async fetchSuggestions() {
                    try {
                        const res = await fetch(\`/v1/tmdb/search?q=\${encodeURIComponent(this.searchInput)}\`);
                        const data = await res.json();
                        this.suggestions = data.results || [];
                    } catch (e) {
                        console.error('TMDB fetch error', e);
                    }
                },

                selectSuggestion(s) {
                    this.currentMedia = s;
                    this.searchInput = s.id.toString();
                    this.suggestions = [];
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
                    } catch (e) {
                        alert('连接中继失败');
                    } finally {
                        this.loading = false;
                    }
                },

                reset() {
                    this.results = [];
                    this.searchInput = '';
                    this.currentMedia = null;
                    this.suggestions = [];
                    this.expandedGroups = {};
                },

                toggleExpand(archive_md5) {
                    this.expandedGroups[archive_md5] = !this.expandedGroups[archive_md5];
                },

                get groupedResults() {
                    const groups = {};
                    this.results.forEach(ev => {
                        const key = ev.archive_md5 || \`unpacked-\${ev.pubkey}\`;
                        if (!groups[key]) {
                            const tags = JSON.parse(ev.tags || '[]');
                            const groupTag = tags.find(t => t[0] === 'group')?.[1];
                            groups[key] = { 
                                archive_md5: ev.archive_md5 || 'N/A', 
                                group: groupTag, 
                                items: [] 
                            };
                        }
                        groups[key].items.push(ev);
                    });
                    return Object.values(groups).sort((a, b) => b.items.length - a.items.length);
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
