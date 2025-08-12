import fs from 'fs';
import path from 'path';
import { chromium, firefox, webkit } from 'playwright';
import ScreenshotUtils from './screenshot-utils.js';
import enhancedTemplate from './enhanced-report-template.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * 支持根节点选择器的 DOM 对比工具
 * 可以配置特定的根节点选择器，只对比页面的特定部分
 */
class DOMComparer {
    constructor(options = {}) {
        this.options = {
            timeout: 60000,
            // 根节点选择器配置 - 只对比这些选择器内的内容
            rootSelectors: options.rootSelectors || ['main', '#app', '.container', 'body'],
            // 忽略的选择器
            ignoreSelectors: [
                '.timestamp', '.ad', '.banner',
                '[data-testid="random"]', '.live-count'
            ],
            // 相似度阈值
            thresholds: {
                structure: 0.9,
                text: 0.85,
                overall: 0.85
            },
            // 是否输出详细的DOM结构信息
            outputDOMStructure: options.outputDOMStructure !== false,
            // 截图配置
            enableScreenshot: options.enableScreenshot !== false, // 默认启用截图
            screenshotOnlyOnFailure: options.screenshotOnlyOnFailure !== false, // 只在相似度不是100%时截图
            screenshotOptions: {
                viewport: { width: 1440, height: 900 },
                ...options.screenshotOptions
            },
            ...options
        };

        // 初始化截图工具
        if (this.options.enableScreenshot) {
            this.screenshotUtils = new ScreenshotUtils({
                screenshotRoot: path.join(__dirname, 'screenshots', 'dom-compare'),
                ...this.options.screenshotOptions
            });
        }
    }

    /**
     * 根据选择器获取页面特定部分的 DOM 结构
     */
    async getPageStructure(page) {
        return await page.evaluate(({ rootSelectors, ignoreSelectors }) => {
            // 移除忽略的元素
            ignoreSelectors.forEach(selector => {
                try {
                    document.querySelectorAll(selector).forEach(el => el.remove());
                } catch (e) {}
            });

            // 找到有效的根节点
            let rootElement = null;
            for (const selector of rootSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    rootElement = element;
                    console.log(`使用根节点选择器: ${selector}`);
                    break;
                }
            }

            // 如果没有找到指定的根节点，使用 body
            if (!rootElement) {
                rootElement = document.body;
                console.log('未找到指定根节点，使用 body 作为根节点');
            }

            // 获取关键属性
            function getKeyAttributes(element) {
                const attrs = {};
                const keyAttrs = ['data-testid', 'role', 'aria-label', 'type'];

                keyAttrs.forEach(attr => {
                    if (element.hasAttribute(attr)) {
                        attrs[attr] = element.getAttribute(attr);
                    }
                });

                return attrs;
            }

            // 获取根节点的DOM结构
            function getStructure(element, depth = 0, maxDepth = 8) {
                if (!element || !element.tagName || depth > maxDepth) return null;

                const structure = {
                    tag: element.tagName.toLowerCase(),
                    id: element.id || null,
                    classes: element.className ? element.className.split(' ').filter(c => c.trim()).sort() : [],
                    attributes: getKeyAttributes(element),
                    depth: depth,
                    children: []
                };
                // 只遍历前10个子元素，避免结构过于庞大
                const children = Array.from(element.children).slice(0, 10);
                structure.children = children
                    .map(child => getStructure(child, depth + 1, maxDepth))
                    .filter(child => child !== null);

                return structure;
            }

            // 获取文本内容（只从根节点开始）
            const textContent = rootElement.innerText
                .replace(/\s+/g, ' ')
                .trim();

            // 获取关键元素信息（只在根节点范围内查找）
            const keyElements = {};
            ['h1', 'h2', 'h3', 'nav', 'main', 'section', 'article', 'aside', 'footer', '[data-testid]'].forEach(tag => {
                try {
                    const elements = rootElement.querySelectorAll(tag);
                    if (elements.length > 0) {
                        keyElements[tag] = Array.from(elements).slice(0, 5).map(el => ({
                            text: el.innerText?.trim().substring(0, 100) || '',
                            classes: el.className ? el.className.split(' ').filter(c => c.trim()) : [],
                            id: el.id || null,
                            tag: el.tagName.toLowerCase()
                        }));
                    }
                } catch (e) {
                    console.warn(`获取关键元素失败: ${tag}`, e);
                }
            });

            // 获取页面元数据
            const metadata = {
                title: document.title,
                rootSelector: rootSelectors.find(s => document.querySelector(s)) || 'body',
                elementCount: rootElement.querySelectorAll('*').length,
                textLength: textContent.length
            };

            return {
                structure: getStructure(rootElement),
                text: textContent,
                keyElements,
                metadata
            };
        }, { rootSelectors: this.options.rootSelectors, ignoreSelectors: this.options.ignoreSelectors });
    }

    /**
     * 计算结构相似度 - 增强版
     */
    calculateStructureSimilarity(struct1, struct2) {
        if (!struct1 || !struct2) return 0;

        function compare(s1, s2, depth = 0) {
            if (!s1 || !s2) return 0;

            let score = 0;
            let total = 0;

            // 标签匹配 (权重最高)
            total += 1;
            if (s1.tag === s2.tag) score += 1;

            // ID 匹配
            if (s1.id || s2.id) {
                total += 0.8;
                if (s1.id === s2.id) score += 0.8;
            }

            // 类名匹配
            const classes1 = s1.classes || [];
            const classes2 = s2.classes || [];
            if (classes1.length > 0 || classes2.length > 0) {
                total += 0.6;
                if (classes1.length === 0 && classes2.length === 0) {
                    score += 0.6;
                } else {
                    const intersection = classes1.filter(c => classes2.includes(c));
                    const union = [...new Set([...classes1, ...classes2])];
                    score += (intersection.length / Math.max(union.length, 1)) * 0.6;
                }
            }

            // 关键属性匹配
            const attrs1 = s1.attributes || {};
            const attrs2 = s2.attributes || {};
            const allAttrKeys = new Set([...Object.keys(attrs1), ...Object.keys(attrs2)]);
            if (allAttrKeys.size > 0) {
                total += 0.4;
                let attrScore = 0;
                allAttrKeys.forEach(key => {
                    if (attrs1[key] === attrs2[key]) {
                        attrScore += 1;
                    }
                });
                score += (attrScore / allAttrKeys.size) * 0.4;
            }

            // 子元素匹配 (递归比较，但限制深度避免过深)
            const children1 = s1.children || [];
            const children2 = s2.children || [];
            const maxChildren = Math.max(children1.length, children2.length);

            if (maxChildren > 0 && depth < 10) { // 限制递归深度
                const childWeight = Math.max(0.5, 1 - depth * 0.1); // 深度越深权重越小
                total += maxChildren * childWeight;

                const minChildren = Math.min(children1.length, children2.length);
                for (let i = 0; i < minChildren; i++) {
                    score += compare(children1[i], children2[i], depth + 1) * childWeight;
                }
            }

            return total > 0 ? score / total : 0;
        }

        return compare(struct1, struct2);
    }

    /**
     * 计算文本相似度 - 增强版
     */
    calculateTextSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;
        if (text1 === text2) return 1;

        // 预处理文本
        const normalize = (text) => text
            .toLowerCase()
            .replace(/[^\w\s\u4e00-\u9fff]/g, '') // 保留中英文和数字
            .replace(/\s+/g, ' ')
            .trim();

        const norm1 = normalize(text1);
        const norm2 = normalize(text2);

        if (norm1 === norm2) return 1;

        // 分词处理 (支持中英文)
        const getWords = (text) => {
            const words = new Set();
            // 英文单词
            text.match(/[a-zA-Z]+/g)?.forEach(word => {
                if (word.length > 2) words.add(word);
            });
            // 中文词汇 (简单按字符处理)
            text.match(/[\u4e00-\u9fff]+/g)?.forEach(phrase => {
                if (phrase.length >= 1) words.add(phrase);
                // 也添加单个字符
                for (let i = 0; i < phrase.length; i++) {
                    words.add(phrase[i]);
                }
            });
            return words;
        };

        const words1 = getWords(norm1);
        const words2 = getWords(norm2);

        if (words1.size === 0 && words2.size === 0) return 1;
        if (words1.size === 0 || words2.size === 0) return 0;

        // Jaccard 相似度
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    /**
     * 计算关键元素相似度
     */
    calculateKeyElementsSimilarity(keyElements1, keyElements2) {
        if (!keyElements1 || !keyElements2) return 0;

        const selectors1 = Object.keys(keyElements1);
        const selectors2 = Object.keys(keyElements2);
        const allSelectors = new Set([...selectors1, ...selectors2]);

        if (allSelectors.size === 0) return 1;

        let totalScore = 0;
        let totalSelectors = 0;

        allSelectors.forEach(selector => {
            const elements1 = keyElements1[selector] || [];
            const elements2 = keyElements2[selector] || [];

            totalSelectors += 1;
            if (elements1.length === 0 && elements2.length === 0) {
                totalScore += 1;
            } else if (elements1.length === 0 || elements2.length === 0) {
                totalScore += 0;
            } else {
                // 比较元素的文本和属性
                const maxElements = Math.max(elements1.length, elements2.length);
                const minElements = Math.min(elements1.length, elements2.length);

                let elementScore = 0;
                for (let i = 0; i < minElements; i++) {
                    const e1 = elements1[i];
                    const e2 = elements2[i];

                    let itemScore = 0;
                    let itemTotal = 0;

                    // 文本相似度
                    if (e1.text || e2.text) {
                        itemTotal += 1;
                        itemScore += this.calculateTextSimilarity(e1.text, e2.text);
                    }

                    // 标签匹配
                    itemTotal += 1;
                    if (e1.tag === e2.tag) itemScore += 1;

                    // ID匹配
                    if (e1.id || e2.id) {
                        itemTotal += 1;
                        if (e1.id === e2.id) itemScore += 1;
                    }

                    elementScore += itemTotal > 0 ? itemScore / itemTotal : 0;
                }

                totalScore += (elementScore / maxElements);
            }
        });

        return totalScore / totalSelectors;
    }

    /**
     * 分析DOM结构差异
     */
    analyzeDOMDifferences(struct1, struct2) {
        const differences = {
            missingElements: [],
            extraElements: [],
            changedElements: [],
            summary: {}
        };

        function compareStructures(s1, s2, path = '') {
            if (!s1 && !s2) return;

            if (!s1) {
                differences.missingElements.push({
                    path,
                    element: s2,
                    type: 'missing_in_page1'
                });
                return;
            }

            if (!s2) {
                differences.extraElements.push({
                    path,
                    element: s1,
                    type: 'extra_in_page1'
                });
                return;
            }

            // 检查元素变化
            const changes = [];
            if (s1.tag !== s2.tag) {
                changes.push(`标签: ${s1.tag} → ${s2.tag}`);
            }
            if (s1.id !== s2.id) {
                changes.push(`ID: ${s1.id || '无'} → ${s2.id || '无'}`);
            }

            const classes1 = s1.classes || [];
            const classes2 = s2.classes || [];
            if (classes1.join(' ') !== classes2.join(' ')) {
                changes.push(`类名: [${classes1.join(', ')}] → [${classes2.join(', ')}]`);
            }

            if (changes.length > 0) {
                differences.changedElements.push({
                    path,
                    changes,
                    element1: s1,
                    element2: s2
                });
            }

            // 递归比较子元素
            const children1 = s1.children || [];
            const children2 = s2.children || [];
            const maxChildren = Math.max(children1.length, children2.length);

            for (let i = 0; i < maxChildren; i++) {
                const child1 = children1[i];
                const child2 = children2[i];
                const childPath = `${path}/${s1.tag || s2.tag}[${i}]`;
                compareStructures(child1, child2, childPath);
            }
        }

        compareStructures(struct1, struct2, 'root');

        // 生成摘要
        differences.summary = {
            totalMissing: differences.missingElements.length,
            totalExtra: differences.extraElements.length,
            totalChanged: differences.changedElements.length,
            totalDifferences: differences.missingElements.length + differences.extraElements.length + differences.changedElements.length
        };

        return differences;
    }

    /**
     * 对比两个页面
     */
    async comparePages(url1, url2, config1, config2, browserType = 'chromium') {
        console.log(`🔍 开始对比页面: 【${config1.name}】 vs 【${config2.name}】`);
        console.log(`🔍 对比链接: ${url1}`);
        console.log(`📍 根节点选择器: ${this.options.rootSelectors.join(', ')}`);

        const browserEngine = { chromium, firefox, webkit }[browserType];
        const browser = await browserEngine.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage']
        });

        try {
            // 获取两个页面的数据
            const [page1Data, page2Data] = await Promise.all([
                this.getPageData(browser, url1, config1),
                this.getPageData(browser, url2, config2)
            ]);

            // 计算各种相似度
            const structureSim = this.calculateStructureSimilarity(
                page1Data.structure,
                page2Data.structure
            );
            const textSim = this.calculateTextSimilarity(
                page1Data.text,
                page2Data.text
            );
            const keyElementsSim = this.calculateKeyElementsSimilarity(
                page1Data.keyElements,
                page2Data.keyElements
            );

            // 分析DOM结构差异
            const domDifferences = this.analyzeDOMDifferences(
                page1Data.structure,
                page2Data.structure
            );

            // 综合相似度 (调整权重)
            const overallSim = structureSim * 0.5 + textSim * 0.3 + keyElementsSim * 0.2;

            const result = {
                url1,
                url2,
                browserType,
                rootSelector: page1Data.metadata?.rootSelector || 'unknown',
                similarities: {
                    structure: structureSim,
                    text: textSim,
                    keyElements: keyElementsSim,
                    overall: overallSim
                },
                passed: {
                    structure: structureSim >= this.options.thresholds.structure,
                    text: textSim >= this.options.thresholds.text,
                    overall: overallSim >= this.options.thresholds.overall
                },
                metadata: {
                    page1: page1Data.metadata,
                    page2: page2Data.metadata
                },
                // 输出DOM结构信息
                domStructure: this.options.outputDOMStructure ? {
                    page1: page1Data.structure,
                    page2: page2Data.structure,
                    differences: domDifferences
                } : undefined,
                keyElements: {
                    page1: page1Data.keyElements,
                    page2: page2Data.keyElements
                },
                textContent: {
                    page1: page1Data.text?.substring(0, 500) + (page1Data.text?.length > 500 ? '...' : ''),
                    page2: page2Data.text?.substring(0, 500) + (page2Data.text?.length > 500 ? '...' : '')
                },
                timestamp: new Date().toISOString()
            };

            result.allPassed = Object.values(result.passed).every(p => p);

            // 检查是否需要截图 - 当相似度不是100%时进行截图
            if (this.options.enableScreenshot &&
                (overallSim < 1.0 || !result.allPassed || !this.options.screenshotOnlyOnFailure)) {
                try {
                    console.log(`${result.allPassed ? '✅' : '❌'} 根节点: ${result.rootSelector} | 综合相似度: ${(overallSim * 100).toFixed(1)}% | 开始截图...`);
                    // 对比失败，进行截图
                    const screenshotResult = await this.screenshotUtils.captureComparisonScreenshots(
                        url1, url2, config1, config2, browserType, result.similarities
                    );
                    // 将截图信息添加到结果中
                    result.screenshots = screenshotResult.screenshots;
                } catch (screenshotError) {
                    console.error(`截图过程发生错误: ${screenshotError.message}`);
                    result.screenshotError = screenshotError.message;
                }
            } else {
                console.log(`${result.allPassed ? '✅' : '❌'} 根节点: ${result.rootSelector} | 综合相似度: ${(overallSim * 100).toFixed(1)}%`);
            }

            return result;

        } finally {
            await browser.close();
        }
    }

    /**
     * 获取单个页面数据
     */
    async getPageData(browser, url, config) {
        const context = await browser.newContext({
            extraHTTPHeaders: config.headers || {},
            viewport: { width: 1440, height: 900 }
        });

        try {
            const page = await context.newPage();

            // 设置 cookies
            if (config.cookie) {
                const cookies = this.parseCookies(config.cookie, url);
                await context.addCookies(cookies);
            }

            await page.goto(url, {
                waitUntil: 'load',
                timeout: this.options.timeout
            });

            await page.waitForTimeout(1500);

            return await this.getPageStructure(page);

        } finally {
            await context.close();
        }
    }

    /**
     * 解析 Cookie
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
     * 批量对比
     */
    async batchCompare(comparisons, browserTypes = ['chromium'], options = {}) {
        console.log(`🚀 开始批量对比 ${comparisons.length} 组页面`);
        console.log(`📍 根节点选择器: ${this.options.rootSelectors.join(', ')}`);

        const concurrent = options.concurrent !== false; // 默认启用并行
        const maxConcurrency = options.maxConcurrency || Math.min(5, Math.max(1, Math.floor(comparisons.length / 2))); // 默认最大并发数

        console.log(`🔧 执行模式: ${concurrent ? `并行执行 (最大并发数: ${maxConcurrency})` : '串行执行'}`);

        const allResults = [];

        for (const browserType of browserTypes) {
            console.log(`\n📱 使用 ${browserType} 浏览器`);

            if (concurrent) {
                // 并行执行模式
                const results = await this.runConcurrentComparisons(comparisons, browserType, maxConcurrency);
                allResults.push(...results);
            } else {
                // 串行执行模式（原有逻辑）
                const results = await this.runSerialComparisons(comparisons, browserType);
                allResults.push(...results);
            }
        }

        this.generateReport(allResults);
        return allResults;
    }

    /**
     * 并行执行对比任务
     */
    async runConcurrentComparisons(comparisons, browserType, maxConcurrency) {
        const results = [];
        const chunks = this.chunkArray(comparisons, maxConcurrency);

        let completed = 0;
        const total = comparisons.length;

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            console.log(`  📦 处理第 ${chunkIndex + 1}/${chunks.length} 批 (${chunk.length} 个并行任务)`);

            // 并行执行当前批次的所有任务
            const chunkPromises = chunk.map(async (comparison, index) => {
                const { url1, url2, config1, config2 } = comparison;

                try {
                    const result = await this.comparePages(url1, url2, config1, config2, browserType);
                    completed++;
                    console.log(`    ✅ [${completed}/${total}] ${result.allPassed ? '通过' : '失败'} - ${new URL(url1).pathname} (根节点: ${result.rootSelector})`);
                    return result;
                } catch (error) {
                    completed++;
                    console.error(`    ❌ [${completed}/${total}] 对比失败: ${new URL(url1).pathname}`, error.message);
                    return {
                        url1, url2, browserType,
                        error: error.message,
                        allPassed: false
                    };
                }
            });

            // 等待当前批次完成
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);

            // 批次间延迟，避免过度请求
            if (chunkIndex < chunks.length - 1) {
                console.log(`    ⏳ 批次间延迟 1 秒...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    /**
     * 串行执行对比任务（原有逻辑）
     */
    async runSerialComparisons(comparisons, browserType) {
        const results = [];

        for (let i = 0; i < comparisons.length; i++) {
            const { url1, url2, config1, config2 } = comparisons[i];

            try {
                const result = await this.comparePages(url1, url2, config1, config2, browserType);
                results.push(result);
                console.log(`  ${i + 1}/${comparisons.length} - ${result.allPassed ? '通过' : '失败'} (根节点: ${result.rootSelector})`);
            } catch (error) {
                console.error(`❌ 对比失败: ${url1}`, error.message);
                results.push({
                    url1, url2, browserType,
                    error: error.message,
                    allPassed: false
                });
            }

            // 延迟避免过度请求
            if (i < comparisons.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    /**
     * 将数组分块处理，用于并行执行
     */
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * 生成报告
     */
    generateReport(results) {
        const total = results.length;
        const passed = results.filter(r => r.allPassed).length;
        const failed = total - passed;

        console.log('\n📊 对比报告');
        console.log('='.repeat(50));
        console.log(`📍 根节点选择器: ${this.options.rootSelectors.join(', ')}`);
        console.log(`📋 总计: ${total} 组`);
        console.log(`✅ 通过: ${passed} 组 (${(passed/total*100).toFixed(1)}%)`);
        console.log(`❌ 失败: ${failed} 组`);

        // 统计使用的根节点
        const rootSelectorStats = {};
        results.forEach(r => {
            if (r.rootSelector) {
                rootSelectorStats[r.rootSelector] = (rootSelectorStats[r.rootSelector] || 0) + 1;
            }
        });

        console.log('\n📍 根节点使用统计:');
        Object.entries(rootSelectorStats).forEach(([selector, count]) => {
            console.log(`  ${selector}: ${count} 次`);
        });

        // 统计截图数量
        const screenshotCount = results.filter(r => r.screenshots).length;
        if (screenshotCount > 0) {
            console.log(`\n📸 截图数量: ${screenshotCount} 组`);
        }

        if (failed > 0) {
            console.log('\n❌ 失败详情:');
            results.filter(r => !r.allPassed).forEach(r => {
                console.log(`  ${r.url1} vs ${r.url2} (根节点: ${r.rootSelector || 'unknown'})`);
                if (r.similarities) {
                    console.log(`    结构: ${(r.similarities.structure * 100).toFixed(1)}% | 文本: ${(r.similarities.text * 100).toFixed(1)}% | 关键元素: ${(r.similarities.keyElements * 100).toFixed(1)}% | 综合: ${(r.similarities.overall * 100).toFixed(1)}%`);

                    // 显示截图信息
                    if (r.screenshots) {
                        console.log(`    📸 已截图: ${
                            [
                                r.screenshots.page1?.success ? `页面1(${path.relative(__dirname, r.screenshots.page1.path)})` : null,
                                r.screenshots.page2?.success ? `页面2(${path.relative(__dirname, r.screenshots.page2.path)})` : null
                            ].filter(Boolean).join(', ')
                        }`);
                    }

                    // 显示DOM结构差异摘要
                    if (r.domStructure?.differences) {
                        const diff = r.domStructure.differences.summary;
                        console.log(`    DOM差异: 缺失 ${diff.totalMissing} | 多余 ${diff.totalExtra} | 变更 ${diff.totalChanged} | 总计 ${diff.totalDifferences}`);

                        // 显示关键差异信息
                        if (diff.totalDifferences > 0) {
                            console.log('    关键差异详情:');

                            // 显示缺失的重要元素
                            if (r.domStructure.differences.missingElements.length > 0) {
                                const importantMissing = r.domStructure.differences.missingElements
                                    .filter(item => ['nav', 'main', 'header', 'footer', 'section'].includes(item.element.tag))
                                    .slice(0, 3);
                                if (importantMissing.length > 0) {
                                    console.log(`      缺失重要元素: ${importantMissing.map(item => `<${item.element.tag}>`).join(', ')}`);
                                }
                            }

                            // 显示多余的重要元素
                            if (r.domStructure.differences.extraElements.length > 0) {
                                const importantExtra = r.domStructure.differences.extraElements
                                    .filter(item => ['nav', 'main', 'header', 'footer', 'section'].includes(item.element.tag))
                                    .slice(0, 3);
                                if (importantExtra.length > 0) {
                                    console.log(`      多余重要元素: ${importantExtra.map(item => `<${item.element.tag}>`).join(', ')}`);
                                }
                            }

                            // 显示重要的变更
                            if (r.domStructure.differences.changedElements.length > 0) {
                                const importantChanges = r.domStructure.differences.changedElements
                                    .filter(item => item.changes.some(change => change.includes('标签') || change.includes('ID')))
                                    .slice(0, 3);
                                if (importantChanges.length > 0) {
                                    console.log(`      重要变更: ${importantChanges.map(item => item.path.split('/').pop()).join(', ')}`);
                                }
                            }
                        }
                    }

                    // 显示页面元数据差异
                    if (r.metadata?.page1 && r.metadata?.page2) {
                        const meta1 = r.metadata.page1;
                        const meta2 = r.metadata.page2;
                        const elementCountDiff = Math.abs((meta1.elementCount || 0) - (meta2.elementCount || 0));
                        const textLengthDiff = Math.abs((meta1.textLength || 0) - (meta2.textLength || 0));

                        if (elementCountDiff > 5 || textLengthDiff > 50) {
                            console.log(`    页面差异: 元素数差异 ${elementCountDiff}, 文本长度差异 ${textLengthDiff}`);
                        }

                        if (meta1.title !== meta2.title) {
                            console.log(`    标题差异: "${meta1.title}" vs "${meta2.title}"`);
                        }
                    }
                } else if (r.error) {
                    console.log(`    错误: ${r.error}`);
                }
            });
        }

        // 保存结果（包含完整的DOM结构信息和截图链接）
        const reportPath = path.join(__dirname, 'dom-compare-results.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            config: {
                rootSelectors: this.options.rootSelectors,
                ignoreSelectors: this.options.ignoreSelectors,
                thresholds: this.options.thresholds,
                outputDOMStructure: this.options.outputDOMStructure,
                enableScreenshot: this.options.enableScreenshot
            },
            summary: {
                total,
                passed,
                failed,
                passRate: (passed/total*100).toFixed(1) + '%',
                rootSelectorStats,
                screenshotCount
            },
            results
        }, null, 2));

        console.log(`\n📄 详细结果已保存: ${reportPath}`);

        if (this.options.outputDOMStructure) {
            console.log(`💡 提示: 详细的DOM结构信息已包含在结果文件中，可查看 domStructure 字段了解对比维度`);
        }

        if (screenshotCount > 0) {
            console.log(`📸 提示: 截图已保存到 screenshots/dom-compare 目录，可在报告文件中查看链接`);

            // 生成HTML报告 - 包含截图预览
            this.generateHtmlReport(results);
        }
    }

    /**
     * 生成包含截图的HTML报告
     */
    generateHtmlReport(results) {
        try {
            // 添加时间后缀到文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const htmlReportPath = path.join(__dirname, `dom-compare-report-${timestamp}.html`);
            const failedResults = results.filter(r => !r.allPassed && r.screenshots);

            if (failedResults.length === 0) {
                return;
            }

            const html = this.buildHtmlReport(results, failedResults);

            // 保存基本报告
            fs.writeFileSync(htmlReportPath, html, 'utf-8');
            console.log(`📄 HTML报告已生成: ${htmlReportPath}`);

            // 保存增强型报告（带高级对比功能）

            // 添加时间后缀到增强型报告文件名
            const enhancedHtmlReportPath = path.join(__dirname, `dom-compare-enhanced-report-${timestamp}.html`);
            const enhancedHtml = enhancedTemplate.buildEnhancedHtmlReport(results, failedResults);
            fs.writeFileSync(enhancedHtmlReportPath, enhancedHtml, 'utf-8');
            console.log(`📄 增强型图片对比分析报告已生成: ${enhancedHtmlReportPath}`);
        } catch (error) {
            console.error('生成HTML报告失败:', error.message);
        }
    }

    /**
     * 构建HTML报告内容
     */
    buildHtmlReport(allResults, failedResults) {
        const totalCount = allResults.length;
        const passedCount = allResults.filter(r => r.allPassed).length;
        const failedCount = totalCount - passedCount;
        const screenshotCount = allResults.filter(r => r.screenshots).length;

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DOM对比结果报告</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }
        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            color: #333;
        }
        .summary-card .number {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .content {
            padding: 30px;
        }
        .comparison {
            margin: 30px 0;
            border: 1px solid #e1e5e9;
            border-radius: 8px;
            overflow: hidden;
        }
        .comparison-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e1e5e9;
        }
        .comparison-title {
            margin: 0;
            color: #333;
            font-size: 1.2em;
        }
        .comparison-urls {
            margin: 10px 0;
            font-size: 0.9em;
            color: #666;
        }
        .similarity-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }
        .similarity-item {
            text-align: center;
            padding: 10px;
            background: white;
            border-radius: 4px;
            border: 1px solid #e1e5e9;
        }
        .similarity-value {
            font-size: 1.5em;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .similarity-value.good { color: #28a745; }
        .similarity-value.warning { color: #ffc107; }
        .similarity-value.danger { color: #dc3545; }
        .screenshot-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            padding: 20px;
        }
        .screenshot-item {
            text-align: center;
        }
        .screenshot-item h4 {
            margin: 0 0 15px 0;
            color: #333;
        }
        .screenshot-item img {
            max-width: 100%;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .file-path {
            font-size: 0.8em;
            color: #666;
            margin-top: 10px;
            word-break: break-all;
        }
        .no-screenshots {
            text-align: center;
            color: #666;
            padding: 40px;
            font-style: italic;
        }
        @media (max-width: 768px) {
            .screenshot-grid {
                grid-template-columns: 1fr;
            }
            .summary {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 DOM对比结果报告</h1>
            <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>
        </div>

        <div class="summary">
            <div class="summary-card">
                <h3>总页面数</h3>
                <div class="number">${totalCount}</div>
            </div>
            <div class="summary-card">
                <h3>通过页面</h3>
                <div class="number" style="color: #28a745">${passedCount}</div>
                <small>${(passedCount/totalCount*100).toFixed(1)}%</small>
            </div>
            <div class="summary-card">
                <h3>失败页面</h3>
                <div class="number" style="color: #dc3545">${failedCount}</div>
                <small>${(failedCount/totalCount*100).toFixed(1)}%</small>
            </div>
            <div class="summary-card">
                <h3>截图数量</h3>
                <div class="number" style="color: #667eea">${screenshotCount}</div>
                <small>组对比</small>
            </div>
        </div>

        <div class="content">
            ${failedResults.length > 0 ?
                `<h2>📸 失败页面截图对比</h2>
                ${failedResults.map(result => this.generateComparisonHtml(result)).join('')}` :
                '<div class="no-screenshots">📝 所有页面对比都已通过，无需截图</div>'
            }
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * 为单个对比结果生成HTML
     */
    generateComparisonHtml(result) {
        const path1 = result.url1 ? new URL(result.url1).pathname : '';
        const path2 = result.url2 ? new URL(result.url2).pathname : '';
        const similarities = result.similarities;

        const getSimilarityClass = (value) => {
            if (value >= 0.8) return 'good';
            if (value >= 0.6) return 'warning';
            return 'danger';
        };

        return `
        <div class="comparison">
            <div class="comparison-header">
                <h3 class="comparison-title">🔍 ${path1}</h3>
                <div class="comparison-urls">
                    <div><strong>页面1:</strong> ${result.url1}</div>
                    <div><strong>页面2:</strong> ${result.url2}</div>
                    <div><strong>根节点:</strong> ${result.rootSelector}</div>
                </div>

                <div class="similarity-info">
                    <div class="similarity-item">
                        <div class="similarity-value ${getSimilarityClass(similarities.structure)}">
                            ${(similarities.structure * 100).toFixed(1)}%
                        </div>
                        <div>DOM结构</div>
                    </div>
                    <div class="similarity-item">
                        <div class="similarity-value ${getSimilarityClass(similarities.text)}">
                            ${(similarities.text * 100).toFixed(1)}%
                        </div>
                        <div>文本内容</div>
                    </div>
                    <div class="similarity-item">
                        <div class="similarity-value ${getSimilarityClass(similarities.keyElements)}">
                            ${(similarities.keyElements * 100).toFixed(1)}%
                        </div>
                        <div>关键元素</div>
                    </div>
                    <div class="similarity-item">
                        <div class="similarity-value ${getSimilarityClass(similarities.overall)}">
                            ${(similarities.overall * 100).toFixed(1)}%
                        </div>
                        <div>综合相似度</div>
                    </div>
                </div>
            </div>

            ${result.screenshots ? `
            <div class="screenshot-grid">
                ${result.screenshots.page1?.success ? `
                <div class="screenshot-item">
                    <h4>📄 页面1截图</h4>
                    <img src="${path.relative(__dirname, result.screenshots.page1.path)}" alt="页面1截图" loading="lazy">
                    <div class="file-path">${result.screenshots.page1.path}</div>
                </div>` : '<div class="screenshot-item"><p>页面1截图失败</p></div>'}

                ${result.screenshots.page2?.success ? `
                <div class="screenshot-item">
                    <h4>📄 页面2截图</h4>
                    <img src="${path.relative(__dirname, result.screenshots.page2.path)}" alt="页面2截图" loading="lazy">
                    <div class="file-path">${result.screenshots.page2.path}</div>
                </div>` : '<div class="screenshot-item"><p>页面2截图失败</p></div>'}
            </div>` : '<div class="no-screenshots">无截图数据</div>'}
        </div>`;
    }
}

export default DOMComparer;
