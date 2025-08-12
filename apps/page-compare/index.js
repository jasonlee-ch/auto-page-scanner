import DOMComparer from './dom-compare.js';
import fs from 'fs';
import path from 'path';

// URL参数拼接函数 (参考page-snapshot实现)
function appendParam(url, params) {
    const sp = url.indexOf('?') === -1 ? '?' : '&';
    const arr = [];
    for (const key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
            let value = params[key] || '';
            if (params[key] === 0) {
                // 对0做额外处理
                value = 0;
            }
            arr.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
    }
    if (arr.length) {
        // eslint-disable-next-line no-param-reassign
        url += sp + arr.join('&');
    }
    return url;
}

/**
 * DOM 对比命令行工具 - 支持专门的对比配置文件
 * 使用方法：
 * node cli-dom-compare.js --compare-config <config-file>
 * node cli-dom-compare.js --url1 <url1> --url2 <url2>
 */

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];
        options[key] = value;
    }

    return options;
}


// 显示帮助信息
function showHelp() {
    console.log(`
🔍 DOM 页面一致性对比工具

使用方法:
  node cli-dom-compare.js [选项]
选项:
  --compare-config <file>   使用专门的对比配置文件
  --url1 <url>             第一个页面URL
  --url2 <url>             第二个页面URL
  --browser <type>         浏览器类型 (chromium|firefox|webkit) [默认: chromium]
  --threshold <num>        相似度阈值 (0-1) [默认: 0.82]
  --root <selectors>       根节点选择器，用逗号分隔
  --ignore <selectors>     忽略的CSS选择器，用逗号分隔
  --show-dom-structure     显示详细的DOM结构信息 [默认: true]
  --no-dom-structure       不显示DOM结构信息
  --enable-screenshot      强制启用截图功能
  --disable-screenshot     强制禁用截图功能
  --help                  显示此帮助信息

对比配置文件格式:
{
  "environment1": {
    "name": "测试环境",
    "domain": "https://stg.example.com",
    "cookie": "...",
    "headers": {...}
  },
  "environment2": {
    "name": "生产环境",
    "domain": "https://prod.example.com",
    "cookie": "...",
    "headers": {...}
  },
  "paths": ["/page1", "/page2"],
  "domCompare": {
    "rootSelectors": ["#app", "main"],
    "ignoreSelectors": [".timestamp", ".ad"],
    "thresholds": {...}
  }
}

示例:
  # 使用对比配置文件
  node cli-dom-compare.js --compare-config config.dom-compare.json

  # 对比两个页面
  node cli-dom-compare.js --url1 https://stg.example.com --url2 https://prod.example.com

  # 指定根节点选择器
  node cli-dom-compare.js --url1 https://stg.example.com --url2 https://prod.example.com --root "#app,.main-content"
`);
}

// 从对比配置文件读取配置
function loadCompareConfig(configFile) {
    // 如果不是绝对路径，则相对于 page-compare 目录
    let fullConfigPath = configFile;
    if (!path.isAbsolute(configFile)) {
        const pageCompareDir = path.dirname(new URL(import.meta.url).pathname);
        fullConfigPath = path.resolve(pageCompareDir, configFile);
    }

    if (!fs.existsSync(fullConfigPath)) {
        console.error(`❌ 配置文件不存在: ${fullConfigPath}`);
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(fullConfigPath, 'utf-8'));

    // 验证配置文件格式
    if (!config.environment1 || !config.environment2) {
        console.error('❌ 配置文件格式错误：缺少 environment1 或 environment2');
        process.exit(1);
    }

    if (!config.paths || config.paths.length === 0) {
        console.error('❌ 配置文件格式错误：缺少 paths 数组');
        process.exit(1);
    }

    return config;
}

// 使用对比配置文件进行批量对比
async function compareFromConfig(configFile, options = {}) {
    const config = loadCompareConfig(configFile);
    const domCompareConfig = config.domCompare || {};

    console.log(`📋 使用对比配置文件: ${configFile}`);
    console.log(`📄 配置名称: ${config.name || '未命名'}`);
    console.log(`📝 配置描述: ${config.description || '无描述'}`);
    console.log(`🌐 环境1: ${config.environment1.name} - ${config.environment1.domain}`);
    console.log(`🌐 环境2: ${config.environment2.name} - ${config.environment2.domain}`);
    console.log(`📄 页面数量: ${config.paths.length}`);
    console.log(`📍 根节点选择器: ${(domCompareConfig.rootSelectors || ['#app', 'main']).join(', ')}`);
    console.log(`🚫 忽略选择器: ${(domCompareConfig.ignoreSelectors || []).join(', ')}`);

    // 覆盖配置文件中的阈值（如果命令行指定了）
    const thresholds = domCompareConfig.thresholds || {
        structure: 0.85,
        text: 0.80,
        overall: 0.82
    };

    if (options.threshold) {
        thresholds.structure = options.threshold;
        thresholds.text = options.threshold;
        thresholds.overall = options.threshold;
    }

    const comparer = new DOMComparer({
        rootSelectors: domCompareConfig.rootSelectors || ['#app', 'main', '.container', 'body'],
        ignoreSelectors: domCompareConfig.ignoreSelectors || ['.timestamp', '.ad'],
        thresholds,
        outputDOMStructure: options['no-dom-structure'] ? false : (domCompareConfig.outputDOMStructure !== false),
        // 截图配置
        enableScreenshot: options['enable-screenshot'] ? true :
                         options['disable-screenshot'] ? false :
                         domCompareConfig.enableScreenshot,
        screenshotOnlyOnFailure: domCompareConfig.screenshotOnlyOnFailure,
        screenshotOptions: domCompareConfig.screenshotOptions
    });

    console.log(`\n🎯 对比配置:`);
    console.log(`📊 相似度阈值: 结构 ${(thresholds.structure * 100).toFixed(0)}% | 文本 ${(thresholds.text * 100).toFixed(0)}% | 综合 ${(thresholds.overall * 100).toFixed(0)}%`);

    // 构建对比任务
    const comparisons = config.paths.map(pathname => {
        // 构建基础URL
        let url1 = config.environment1.domain.replace(/\/$/, '') + pathname;
        let url2 = config.environment2.domain.replace(/\/$/, '') + pathname;

        // 添加query参数支持
        if (config.environment1.query) {
            url1 = appendParam(url1, config.environment1.query);
        }
        if (config.environment2.query) {
            url2 = appendParam(url2, config.environment2.query);
        }

        return {
            url1,
            url2,
            config1: {
                headers: {
                    ...(config.environment1.headers || {}),
                    'trace-context': JSON.stringify(config.environment1?.headers?.['trace-context'])
                },
                cookie: config.environment1.cookie,
                query: config.environment1.query,
                name: config.environment1.name || '环境1'
            },
            config2: {
                headers: {
                    ...(config.environment2.headers || {}),
                    'trace-context': JSON.stringify(config.environment2?.headers?.['trace-context'])
                },
                cookie: config.environment2.cookie,
                query: config.environment2.query,
                name: config.environment2.name || '环境2'
            }
        };
    });

    const browserTypes = options.browser ? [options.browser] : (config.options?.browserTypes || ['chromium']);
    const results = await comparer.batchCompare(comparisons, browserTypes);

    // 生成详细报告
    const passedCount = results.filter(r => r.allPassed).length;
    const failedCount = results.length - passedCount;

    console.log('\n📈 总结报告');
    console.log('='.repeat(60));
    console.log(`📊 总页面数: ${results.length}`);
    console.log(`✅ 通过: ${passedCount} (${(passedCount/results.length*100).toFixed(1)}%)`);
    console.log(`❌ 失败: ${failedCount} (${(failedCount/results.length*100).toFixed(1)}%)`);

    if (failedCount > 0) {
        console.log('\n🔍 失败页面详情:');
        results.filter(r => !r.allPassed).forEach((r, index) => {
            const path = new URL(r.url1).pathname;
            console.log(`  ${index + 1}. ${path} (根节点: ${r.rootSelector || 'unknown'})`);
            if (r.similarities) {
                console.log(`     综合: ${(r.similarities.overall * 100).toFixed(1)}% | 结构: ${(r.similarities.structure * 100).toFixed(1)}% | 文本: ${(r.similarities.text * 100).toFixed(1)}% | 关键元素: ${(r.similarities.keyElements * 100).toFixed(1)}%`);

                // 显示DOM结构差异摘要
                if (r.domStructure?.differences) {
                    const diff = r.domStructure.differences.summary;
                    console.log(`     DOM差异: 缺失 ${diff.totalMissing} | 多余 ${diff.totalExtra} | 变更 ${diff.totalChanged} | 总计 ${diff.totalDifferences}`);

                    // 显示关键差异信息
                    if (diff.totalDifferences > 0) {
                        const criticalChanges = [];
                        if (r.domStructure.differences.missingElements.length > 0) {
                            criticalChanges.push(`缺失关键元素: ${r.domStructure.differences.missingElements.slice(0, 2).map(item => `<${item.element.tag}>`).join(', ')}`);
                        }
                        if (r.domStructure.differences.extraElements.length > 0) {
                            criticalChanges.push(`多余元素: ${r.domStructure.differences.extraElements.slice(0, 2).map(item => `<${item.element.tag}>`).join(', ')}`);
                        }
                        if (r.domStructure.differences.changedElements.length > 0) {
                            criticalChanges.push(`变更元素: ${r.domStructure.differences.changedElements.slice(0, 2).map(item => item.path.split('/').pop()).join(', ')}`);
                        }

                        if (criticalChanges.length > 0) {
                            console.log(`     关键差异: ${criticalChanges.join(' | ')}`);
                        }
                    }
                }

                // 显示页面元数据差异
                if (r.metadata) {
                    const meta1 = r.metadata.page1;
                    const meta2 = r.metadata.page2;
                    if (meta1 && meta2) {
                        const elementCountDiff = Math.abs((meta1.elementCount || 0) - (meta2.elementCount || 0));
                        const textLengthDiff = Math.abs((meta1.textLength || 0) - (meta2.textLength || 0));
                        if (elementCountDiff > 10 || textLengthDiff > 100) {
                            console.log(`     元数据差异: 元素数差 ${elementCountDiff} | 文本长度差 ${textLengthDiff}`);
                        }
                    }
                }
            } else {
                console.log(`     错误: ${r.error}`);
            }
        });
    }

    // 保存结果
    if (config.options?.saveResults !== false) {
        const outputPath = config.options?.outputPath || './page-compare/dom-compare-results.json';
        const reportData = {
            timestamp: new Date().toISOString(),
            config: {
                name: config.name,
                description: config.description,
                environment1: config.environment1.name,
                environment2: config.environment2.name,
                domCompare: domCompareConfig
            },
            summary: {
                total: results.length,
                passed: passedCount,
                failed: failedCount,
                passRate: (passedCount/results.length*100).toFixed(1) + '%'
            },
            results: results.map(r => ({
                ...r,
                // 简化输出，只保留关键信息
                page1Data: undefined,
                page2Data: undefined
            }))
        };

        fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
        console.log(`\n📄 详细结果已保存: ${outputPath}`);
    }

    // 显示建议
    if (failedCount > 0) {
        console.log('\n💡 优化建议:');
        console.log('  1. 检查失败页面的根节点选择器是否合适');
        console.log('  2. 考虑调整相似度阈值或增加忽略选择器');
        console.log('  3. 确认两个环境的页面内容是否确实应该一致');
    }

    return results;
}

// 主函数
async function main() {
    const options = parseArgs();

    if (options.help || Object.keys(options).length === 0) {
        showHelp();
        process.exit(0);
    }

    try {
        if (options['compare-config']) {
            // 使用专门的对比配置文件
            await compareFromConfig(options['compare-config'], options);
        } else {
            console.error('❌ 请提供 --compare-config 参数使用配置文件');
            console.log('使用 --help 查看详细帮助');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ 执行失败:', error.message);
        if (error.stack) {
            console.error('详细错误信息:', error.stack);
        }
        process.exit(1);
    }
}

// 运行主函数
main();
