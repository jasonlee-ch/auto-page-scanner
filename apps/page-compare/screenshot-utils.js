import fs from 'fs';
import path from 'path';
import { chromium, firefox, webkit } from 'playwright';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * 截图工具类 - 专门用于DOM对比失败时的截图
 */
class ScreenshotUtils {
    constructor(options = {}) {
        this.options = {
            screenshotRoot: options.screenshotRoot || path.join(__dirname, 'screenshots', 'dom-compare'),
            viewport: options.viewport || { width: 1440, height: 900 },
            timeout: options.timeout || 60000,
            ...options
        };

        // 确保截图目录存在
        this.ensureDirectoryExists(this.options.screenshotRoot);
    }

    /**
     * 确保目录存在
     */
    ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * 生成截图文件路径
     */
    generateScreenshotPath(url, browserType = 'chromium', suffix = '') {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            let pathname = urlObj.pathname;

            // 确保browserType是字符串
            const browserTypeStr = typeof browserType === 'string' ? browserType : browserType.toString();

            // 处理路径，确保文件名合法
            pathname = pathname.replace(/\/$/, '/index');
            pathname = pathname.replace(/[<>:"|?*]/g, '_');

            const timestamp = new Date().now();
            const filename = `${pathname.replace(/\//g, '_')}${suffix}_${timestamp}.png`;

            const screenshotDir = path.join(this.options.screenshotRoot, hostname, browserTypeStr);
            this.ensureDirectoryExists(screenshotDir);

            return path.join(screenshotDir, filename);
        } catch (error) {
            console.error('生成截图路径失败:', error);
            const fallbackFilename = `fallback_${Date.now()}${suffix}.png`;
            return path.join(this.options.screenshotRoot, fallbackFilename);
        }
    }

    /**
     * 为单个页面截图
     */
    async screenshotPage(browser, url, config, suffix = '') {
        const context = await browser.newContext({
            extraHTTPHeaders: config.headers || {},
            viewport: this.options.viewport
        });

        try {
            const page = await context.newPage();

            // 设置 cookies
            if (config.cookie) {
                const cookies = this.parseCookies(config.cookie, url);
                await context.addCookies(cookies);
            }

            // 导航到页面
            await page.goto(url, {
                waitUntil: 'load',
                timeout: this.options.timeout
            });

            // 等待页面稳定
            await page.waitForTimeout(1500);

            // 生成截图路径
            const screenshotPath = this.generateScreenshotPath(url, browser.browserType().name(), suffix);

            // 截图
            await page.screenshot({
                path: screenshotPath,
                fullPage: true,
                type: 'png'
            });

            console.log(`📸 截图已保存: ${screenshotPath}`);
            return {
                success: true,
                path: screenshotPath,
                relativePath: path.relative(__dirname, screenshotPath),
                url
            };

        } catch (error) {
            console.error(`❌ 截图失败: ${url}`, error.message);
            return {
                success: false,
                error: error.message,
                url
            };
        } finally {
            await context.close();
        }
    }

    /**
     * 为DOM对比结果截图
     * 当相似度不是100%时，对两个页面都进行截图
     */
    async captureComparisonScreenshots(url1, url2, config1, config2, browserType = 'chromium', similarities) {
        console.log(`📸 开始为对比失败页面截图: ${url1} vs ${url2}`);

        const browserEngine = { chromium, firefox, webkit }[browserType];
        const browser = await browserEngine.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage']
        });

        try {
            // 并行截图两个页面
            const [screenshot1, screenshot2] = await Promise.all([
                this.screenshotPage(browser, url1, config1, '_page1'),
                this.screenshotPage(browser, url2, config2, '_page2')
            ]);

            const result = {
                url1,
                url2,
                similarities,
                screenshots: {
                    page1: screenshot1,
                    page2: screenshot2
                },
                timestamp: new Date().toISOString()
            };

            console.log(`✅ 对比截图完成`);
            return result;

        } finally {
            await browser.close();
        }
    }

    /**
     * 解析 Cookie 字符串
     */
    parseCookies(cookieStr, domain) {
        if (!cookieStr) return [];

        return cookieStr.split(';').map(pair => {
            const [name, ...rest] = pair.trim().split('=');
            return {
                name: name.trim(),
                value: rest.join('=').trim(),
                domain: new URL(domain).hostname,
                path: '/'
            };
        });
    }

    /**
     * 生成截图HTML预览
     */
    generateScreenshotPreview(screenshotResult) {
        if (!screenshotResult || !screenshotResult.screenshots) {
            return '';
        }

        const { page1, page2 } = screenshotResult.screenshots;
        const similarities = screenshotResult.similarities;

        let html = `
        <div class="screenshot-comparison">
            <h4>📸 页面对比截图</h4>
            <div class="similarity-info">
                <p><strong>综合相似度:</strong> ${(similarities.overall * 100).toFixed(1)}%</p>
                <p><strong>结构相似度:</strong> ${(similarities.structure * 100).toFixed(1)}%</p>
                <p><strong>文本相似度:</strong> ${(similarities.text * 100).toFixed(1)}%</p>
                <p><strong>关键元素相似度:</strong> ${(similarities.keyElements * 100).toFixed(1)}%</p>
            </div>
            <div class="screenshot-grid">
        `;

        if (page1.success) {
            html += `
                <div class="screenshot-item">
                    <h5>页面1: ${screenshotResult.url1}</h5>
                    <img src="${page1.relativePath}" alt="页面1截图" style="max-width: 500px; border: 1px solid #ddd;">
                    <p><small>文件: ${page1.relativePath}</small></p>
                </div>
            `;
        }

        if (page2.success) {
            html += `
                <div class="screenshot-item">
                    <h5>页面2: ${screenshotResult.url2}</h5>
                    <img src="${page2.relativePath}" alt="页面2截图" style="max-width: 500px; border: 1px solid #ddd;">
                    <p><small>文件: ${page2.relativePath}</small></p>
                </div>
            `;
        }

        html += `
            </div>
        </div>
        `;

        return html;
    }
}

export default ScreenshotUtils;
