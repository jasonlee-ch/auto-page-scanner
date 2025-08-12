/**
 * 增强型HTML报告模板 - 支持高级图片对比分析
 */

function buildEnhancedHtmlReport(allResults, failedResults) {
    const totalCount = allResults.length;
    const passedCount = allResults.filter(r => r.allPassed).length;
    const failedCount = totalCount - passedCount;
    const screenshotCount = allResults.filter(r => r.screenshots).length;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DOM对比增强分析报告 - 高级图片对比</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        .main-container {
            max-width: 1600px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 30px;
            text-align: center;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }

        .header h1 {
            color: #4e54c8;
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 700;
        }

        .header .subtitle {
            color: #666;
            font-size: 1.1em;
            opacity: 0.8;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .stat-card {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 25px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
        }

        .stat-number {
            font-size: 2.8em;
            font-weight: bold;
            margin-bottom: 8px;
        }

        .stat-number.success { color: #28a745; }
        .stat-number.danger { color: #dc3545; }
        .stat-number.primary { color: #4e54c8; }
        .stat-number.warning { color: #ffc107; }

        .comparison-section {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            margin-bottom: 30px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }

        .comparison-header {
            background: linear-gradient(135deg, #4e54c8 0%, #8f94fb 100%);
            color: white;
            padding: 25px;
        }

        .comparison-title {
            font-size: 1.4em;
            margin-bottom: 15px;
            font-weight: 600;
        }

        .comparison-meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
            font-size: 0.95em;
        }

        .similarity-metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }

        .metric-item {
            background: rgba(255,255,255,0.2);
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }

        .metric-value {
            font-size: 1.8em;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .metric-label {
            font-size: 0.85em;
            opacity: 0.9;
        }

        .image-comparison-container {
            padding: 30px;
        }

        .comparison-tabs {
            display: flex;
            margin-bottom: 25px;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 5px;
        }

        .tab-button {
            flex: 1;
            padding: 12px 20px;
            border: none;
            background: transparent;
            cursor: pointer;
            border-radius: 6px;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .tab-button.active {
            background: #4e54c8;
            color: white;
            box-shadow: 0 2px 8px rgba(78,84,200,0.3);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        /* 滑动对比视图 */
        .slider-comparison {
            position: relative;
            background: #f8f9fa;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 25px;
        }

        .slider-container {
            position: relative;
            width: 100%;
            height: 600px;
            overflow: hidden;
        }

        .slider-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: white;
        }

        .slider-handle {
            position: absolute;
            top: 0;
            left: 50%;
            width: 4px;
            height: 100%;
            background: #4e54c8;
            cursor: ew-resize;
            z-index: 10;
            box-shadow: 0 0 10px rgba(78,84,200,0.5);
        }

        .slider-handle::before {
            content: '';
            position: absolute;
            top: 50%;
            left: -8px;
            width: 20px;
            height: 20px;
            background: #4e54c8;
            border-radius: 50%;
            transform: translateY(-50%);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        /* 并排对比视图 */
        .side-by-side-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 25px;
        }

        .image-panel {
            background: #f8f9fa;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
        }

        .image-panel-header {
            background: #4e54c8;
            color: white;
            padding: 15px;
            font-weight: 600;
            text-align: center;
        }

        .image-panel-content {
            position: relative;
            height: 500px;
            overflow: hidden;
        }

        .comparison-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: white;
            cursor: zoom-in;
            transition: transform 0.3s ease;
        }

        .comparison-image:hover {
            transform: scale(1.05);
        }

        /* 放大镜效果 */
        .magnifier {
            position: absolute;
            border: 3px solid #4e54c8;
            border-radius: 50%;
            cursor: none;
            pointer-events: none;
            z-index: 20;
            background: rgba(255,255,255,0.9);
            backdrop-filter: blur(2px);
        }

        .magnifier-glass {
            position: absolute;
            background: url('') no-repeat;
            background-size: 200% 200%;
            border-radius: 50%;
            width: 100%;
            height: 100%;
        }

        /* 工具栏 */
        .comparison-toolbar {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .toolbar-button {
            padding: 10px 20px;
            border: 2px solid #4e54c8;
            background: white;
            color: #4e54c8;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .toolbar-button:hover,
        .toolbar-button.active {
            background: #4e54c8;
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(78,84,200,0.3);
        }

        /* 差异热力图 */
        .heatmap-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 5;
        }

        .diff-point {
            position: absolute;
            width: 20px;
            height: 20px;
            background: radial-gradient(circle, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.2) 70%, transparent 100%);
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            .side-by-side-comparison {
                grid-template-columns: 1fr;
            }

            .comparison-meta {
                grid-template-columns: 1fr;
            }

            .slider-container {
                height: 400px;
            }

            .image-panel-content {
                height: 300px;
            }
        }

        /* 滚动条样式 */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: #4e54c8;
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: #3d44a5;
        }
    </style>
</head>
<body>
    <div class="main-container">
        <div class="header">
            <h1>🔍 DOM对比增强分析报告</h1>
            <div class="subtitle">高级图片对比预览分析 • 生成时间: ${new Date().toLocaleString('zh-CN')}</div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number primary">${totalCount}</div>
                <div>总页面数</div>
            </div>
            <div class="stat-card">
                <div class="stat-number success">${passedCount}</div>
                <div>通过页面</div>
                <small>${(passedCount/totalCount*100).toFixed(1)}%</small>
            </div>
            <div class="stat-card">
                <div class="stat-number danger">${failedCount}</div>
                <div>失败页面</div>
                <small>${(failedCount/totalCount*100).toFixed(1)}%</small>
            </div>
            <div class="stat-card">
                <div class="stat-number warning">${screenshotCount}</div>
                <div>截图组数</div>
                <small>可对比分析</small>
            </div>
        </div>

        ${failedResults.map(result => generateComparisonSection(result)).join('')}
    </div>

    <script>
        // 图片对比交互功能
        document.addEventListener('DOMContentLoaded', function() {
            initializeImageComparison();
            initializeSliderComparison();
            initializeMagnifier();
            initializeToolbarActions();
        });

        function initializeImageComparison() {
            // 初始化标签页切换
            document.querySelectorAll('.tab-button').forEach(button => {
                button.addEventListener('click', function() {
                    const container = this.closest('.comparison-section');
                    const targetTab = this.dataset.tab;

                    // 切换活跃标签
                    container.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                    this.classList.add('active');

                    // 切换内容
                    container.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.remove('active');
                        if (content.dataset.tab === targetTab) {
                            content.classList.add('active');
                        }
                    });
                });
            });
        }

        function initializeSliderComparison() {
            document.querySelectorAll('.slider-comparison').forEach(container => {
                const slider = container.querySelector('.slider-handle');
                const leftImage = container.querySelector('.slider-image.left');

                if (!slider || !leftImage) return;

                let isDragging = false;

                slider.addEventListener('mousedown', () => isDragging = true);
                document.addEventListener('mouseup', () => isDragging = false);

                container.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;

                    const rect = container.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percentage = (x / rect.width) * 100;

                    if (percentage >= 0 && percentage <= 100) {
                        slider.style.left = percentage + '%';
                        leftImage.style.clipPath = 'inset(0 ' + (100 - percentage) + '% 0 0)';
                    }
                });

                // 双击重置
                container.addEventListener('dblclick', () => {
                    slider.style.left = '50%';
                    leftImage.style.clipPath = 'inset(0 50% 0 0)';
                });
            });
        }

        function initializeMagnifier() {
            document.querySelectorAll('.comparison-image').forEach(img => {
                img.addEventListener('mouseenter', function() {
                    createMagnifier(this);
                });

                img.addEventListener('mouseleave', function() {
                    removeMagnifier(this);
                });
            });
        }

        function createMagnifier(img) {
            const magnifier = document.createElement('div');
            magnifier.className = 'magnifier';
            magnifier.style.width = '150px';
            magnifier.style.height = '150px';

            const glass = document.createElement('div');
            glass.className = 'magnifier-glass';
            glass.style.backgroundImage = 'url(' + img.src + ')';

            magnifier.appendChild(glass);
            img.parentElement.appendChild(magnifier);

            img.addEventListener('mousemove', function(e) {
                moveMagnifier(e, magnifier, glass, img);
            });
        }

        function moveMagnifier(e, magnifier, glass, img) {
            const rect = img.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            magnifier.style.left = (x - 75) + 'px';
            magnifier.style.top = (y - 75) + 'px';

            const cx = img.offsetWidth / magnifier.offsetWidth;
            const cy = img.offsetHeight / magnifier.offsetHeight;

            glass.style.backgroundPosition = '-' + (x * cx - 75) + 'px -' + (y * cy - 75) + 'px';
        }

        function removeMagnifier(img) {
            const magnifier = img.parentElement.querySelector('.magnifier');
            if (magnifier) {
                magnifier.remove();
            }
        }

        function initializeToolbarActions() {
            document.querySelectorAll('[data-action="sync-scroll"]').forEach(button => {
                button.addEventListener('click', function() {
                    this.classList.toggle('active');
                    toggleSyncScroll(this.classList.contains('active'));
                });
            });

            document.querySelectorAll('[data-action="show-differences"]').forEach(button => {
                button.addEventListener('click', function() {
                    this.classList.toggle('active');
                    toggleDifferenceHighlight(this.closest('.comparison-section'), this.classList.contains('active'));
                });
            });
        }

        function toggleSyncScroll(enabled) {
            // 实现同步滚动逻辑
            console.log('同步滚动', enabled ? '启用' : '禁用');
        }

        function toggleDifferenceHighlight(section, enabled) {
            const overlays = section.querySelectorAll('.heatmap-overlay');
            overlays.forEach(overlay => {
                overlay.style.display = enabled ? 'block' : 'none';
            });
        }

        // 模拟差异点生成（实际应用中应该通过图像对比算法生成）
        function generateDifferencePoints() {
            document.querySelectorAll('.heatmap-overlay').forEach(overlay => {
                // 随机生成一些差异点作为演示
                for (let i = 0; i < 5; i++) {
                    const point = document.createElement('div');
                    point.className = 'diff-point';
                    point.style.left = Math.random() * 80 + 10 + '%';
                    point.style.top = Math.random() * 80 + 10 + '%';
                    overlay.appendChild(point);
                }
            });
        }

        // 页面加载完成后生成差异点
        setTimeout(generateDifferencePoints, 1000);
    </script>
</body>
</html>`;
}

function generateComparisonSection(result) {
    const path1 = result.url1 ? new URL(result.url1).pathname : '';
    const similarities = result.similarities;
    const page1Screenshot = result.screenshots?.page1;
    const page2Screenshot = result.screenshots?.page2;

    if (!page1Screenshot?.success || !page2Screenshot?.success) {
        return `<div class="comparison-section">
            <div class="comparison-header">
                <div class="comparison-title">🔍 ${path1}</div>
                <div class="comparison-meta">
                    <div><strong>页面1:</strong> ${result.url1}</div>
                    <div><strong>页面2:</strong> ${result.url2}</div>
                </div>
            </div>
            <div class="image-comparison-container">
                <div style="text-align: center; padding: 40px; color: #666;">
                    ❌ 截图数据不完整，无法进行图片对比分析
                </div>
            </div>
        </div>`;
    }

    return `
    <div class="comparison-section">
        <div class="comparison-header">
            <div class="comparison-title">🔍 ${path1}</div>
            <div class="comparison-meta">
                <div><strong>页面1:</strong> ${result.url1}</div>
                <div><strong>页面2:</strong> ${result.url2}</div>
                <div><strong>根节点:</strong> ${result.rootSelector}</div>
            </div>

            <div class="similarity-metrics">
                <div class="metric-item">
                    <div class="metric-value">${(similarities.structure * 100).toFixed(1)}%</div>
                    <div class="metric-label">DOM结构</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${(similarities.text * 100).toFixed(1)}%</div>
                    <div class="metric-label">文本内容</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${(similarities.keyElements * 100).toFixed(1)}%</div>
                    <div class="metric-label">关键元素</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value">${(similarities.overall * 100).toFixed(1)}%</div>
                    <div class="metric-label">综合相似度</div>
                </div>
            </div>
        </div>

        <div class="image-comparison-container">
            <div class="comparison-toolbar">
                <button class="toolbar-button" data-action="sync-scroll">🔄 同步滚动</button>
                <button class="toolbar-button" data-action="show-differences">🎯 显示差异</button>
                <button class="toolbar-button" data-action="reset-view">↻ 重置视图</button>
            </div>

            <div class="comparison-tabs">
                <button class="tab-button active" data-tab="slider">滑动对比</button>
                <button class="tab-button" data-tab="side-by-side">并排对比</button>
            </div>

            <!-- 滑动对比视图 -->
            <div class="tab-content active" data-tab="slider">
                <div class="slider-comparison">
                    <div class="slider-container">
                        <img class="slider-image right" src="${page2Screenshot.relativePath}" alt="页面2截图">
                        <img class="slider-image left" src="${page1Screenshot.relativePath}" alt="页面1截图" style="clip-path: inset(0 50% 0 0);">
                        <div class="slider-handle"></div>
                        <div class="heatmap-overlay" style="display: none;"></div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 15px; color: #666; font-size: 0.9em;">
                    💡 拖动中间的滑块或双击重置来对比两张截图
                </div>
            </div>

            <!-- 并排对比视图 -->
            <div class="tab-content" data-tab="side-by-side">
                <div class="side-by-side-comparison">
                    <div class="image-panel">
                        <div class="image-panel-header">📄 页面1截图</div>
                        <div class="image-panel-content">
                            <img class="comparison-image" src="${page1Screenshot.relativePath}" alt="页面1截图">
                            <div class="heatmap-overlay" style="display: none;"></div>
                        </div>
                    </div>
                    <div class="image-panel">
                        <div class="image-panel-header">📄 页面2截图</div>
                        <div class="image-panel-content">
                            <img class="comparison-image" src="${page2Screenshot.relativePath}" alt="页面2截图">
                            <div class="heatmap-overlay" style="display: none;"></div>
                        </div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 15px; color: #666; font-size: 0.9em;">
                    💡 将鼠标悬停在图片上查看放大效果
                </div>
            </div>
        </div>
    </div>`;
}

export default { buildEnhancedHtmlReport };
