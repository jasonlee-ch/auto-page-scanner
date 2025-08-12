import fs from 'fs';
import path from 'path';
import { chromium, firefox, webkit } from 'playwright';

const __dirname = path.resolve();

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

// 获取命令行参数 --config
function getConfigPath() {
  const idx = process.argv.indexOf('--config');
  if (idx !== -1 && process.argv[idx + 1]) {
    return path.join(__dirname, process.argv[idx + 1]);
  }
  // 默认 config.json
  return path.join(__dirname, 'config.json');
}

// 获取浏览器类型参数 --browser
function getBrowserType() {
  const idx = process.argv.indexOf('--browser');
  if (idx !== -1 && process.argv[idx + 1]) {
    const browser = process.argv[idx + 1].toLowerCase();
    if (['chromium', 'firefox', 'webkit'].includes(browser)) {
      return browser;
    }
  }
  return 'chromium'; // 默认使用 chromium
}

// 获取并发数参数 --concurrency
function getConcurrency() {
  const idx = process.argv.indexOf('--concurrency');
  if (idx !== -1 && process.argv[idx + 1]) {
    const num = parseInt(process.argv[idx + 1]);
    return isNaN(num) ? 5 : Math.max(1, Math.min(10, num)); // 限制在 1-10 之间
  }
  return 5; // 默认并发数
}


const configPath = getConfigPath();
const browserType = getBrowserType();
const concurrency = getConcurrency();
const screenshotRoot = path.join(__dirname, 'screenshots');

function pathToFilePath(domain, pathname, browser = 'chromium') {
  // 以域名为目录，便于区分，并加上浏览器类型
  const hostname = new URL(domain).hostname;
  let filePath = path.join(screenshotRoot, hostname, browser, pathname);
  if (filePath.endsWith(path.sep)) filePath += 'index';
  return filePath + '.png';
}

// 解析 cookie 字符串
function parseCookies(cookieStr, domain) {
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

// 截图单个页面
async function screenshotPage(browser, url, pathname, config, domain) {
  const context = await browser.newContext({
    extraHTTPHeaders: {
        ...(config.headers ?? {}),
        'trace-context': JSON.stringify(config.headers?.['trace-context']),
    },
    // 设置视口大小
    viewport: { width: 1440, height: 900 }
  });

  try {
    const page = await context.newPage();

    // 设置 cookies
    if (config.cookie) {
      const cookies = parseCookies(config.cookie, domain);
      await context.addCookies(cookies);
    }

    // 导航到页面，使用更智能的等待策略

    if (config.query) {
        url = appendParam(url, config.query);
    }
    await page.goto(url, {
      waitUntil: 'load',
      timeout: 60000
    });

    // 等待页面完全加载
    await page.waitForTimeout(1500);

    // 生成截图路径
    const filePath = pathToFilePath(domain, pathname, browserType);
    const dir = path.dirname(filePath);

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 截图
    await page.screenshot({
      path: filePath,
      fullPage: true,
      type: 'png'
    });

    console.log(`✅ [${browserType}] 已保存截图: ${filePath}`);
    return { success: true, url, filePath };

  } catch (error) {
    console.error(`❌ [${browserType}] 访问或截图失败: ${url}`, error.message);
    return { success: false, url, error: error.message };
  } finally {
    await context.close();
  }
}

// 批量处理页面截图
async function processBatch(browser, urls, config, domain) {
  const results = [];

  // 使用 Promise.allSettled 来处理并发
  const promises = urls.map(({ url, pathname }) =>
    screenshotPage(browser, url, pathname, config, domain)
  );

  const batchResults = await Promise.allSettled(promises);

  batchResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        success: false,
        url: urls[index].url,
        error: result.reason?.message || 'Unknown error'
      });
    }
  });

  return results;
}

// 将数组分批处理
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  console.log(`🚀 启动 Playwright 页面扫描工具 [浏览器: ${browserType}, 并发数: ${concurrency}]`);

  // 检查配置文件
  if (!fs.existsSync(configPath)) {
    console.error('❌ 配置文件不存在:', configPath);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // 创建截图根目录
  if (!fs.existsSync(screenshotRoot)) {
    fs.mkdirSync(screenshotRoot, { recursive: true });
  }

  // 选择浏览器引擎
  const browserEngine = {
    chromium,
    firefox,
    webkit
  }[browserType];

  const browser = await browserEngine.launch({
    headless: true, // 可以设置为 false 来调试
    // 可以添加更多启动参数
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const domain = config.domain.replace(/\/$/, '');

    // 准备所有URL
    const allUrls = config.paths.map(pathname => ({
      url: domain + pathname,
      pathname
    }));

    console.log(`📋 总共需要截图 ${allUrls.length} 个页面`);

    // 分批处理
    const batches = chunkArray(allUrls, concurrency);
    const allResults = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 处理第 ${i + 1}/${batches.length} 批 (${batch.length} 个页面)`);

      const batchResults = await processBatch(browser, batch, config, domain);
      allResults.push(...batchResults);

      // 批次间的小延迟，避免过度请求
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 输出统计结果
    const successCount = allResults.filter(r => r.success).length;
    const failCount = allResults.length - successCount;

    console.log('\n📊 扫描完成统计:');
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${failCount} 个`);

    if (failCount > 0) {
      console.log('\n❌ 失败的页面:');
      allResults
        .filter(r => !r.success)
        .forEach(r => console.log(`  - ${r.url}: ${r.error}`));
    }

  } catch (error) {
    console.error('❌ 扫描过程中发生错误:', error);
    process.exit(1);
  } finally {
    await browser.close();
    console.log('🔚 浏览器已关闭');
  }
}

main().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});
