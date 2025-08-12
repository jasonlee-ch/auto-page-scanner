# DOM对比页面截图功能

当DOM相似度不是100%时，自动截图并生成包含截图链接的分析报告。

## 功能介绍

- 📸 **自动截图功能**：当两个页面DOM相似度不是100%时，自动对两个页面进行截图
- 📊 **截图报告集成**：在JSON报告和Markdown报告中都包含截图链接
- 🖼️ **HTML可视化报告**：生成包含截图预览的HTML报告，便于直观比对
- 🔧 **高度可配置**：可通过配置文件调整截图参数

## 配置参数

在`config.json`配置文件的`domCompare`部分添加以下配置：

```json
"domCompare": {
    // ... 其他配置
    "enableScreenshot": true,         // 启用截图功能 (默认: true)
    "screenshotOnlyOnFailure": true,  // 只在相似度不是100%时截图 (默认: true)
    "screenshotOptions": {
        "viewport": {
            "width": 1440,            // 截图宽度 (默认: 1440)
            "height": 900             // 截图高度 (默认: 900)
        },
        "screenshotRoot": "./screenshots/dom-compare"  // 截图保存路径
    }
}
```

## 使用方法

### 1. 使用示例配置

项目中已包含一个专门的截图演示配置文件：

```bash
node index.js --compare-config config.screenshot-demo.json
```

### 2. 修改现有配置

也可以在现有配置文件中添加截图相关配置：

```bash
# 编辑配置文件
vim config.json

# 运行对比
node index.js --compare-config config.json
```

### 3. 命令行参数

可以通过命令行参数临时开启或关闭截图功能：

```bash
# 开启截图功能
node index.js --compare-config config.json --enable-screenshot

# 关闭截图功能
node index.js --compare-config config.json --disable-screenshot
```

## 输出结果

### 1. 截图文件

截图默认保存在`screenshots/dom-compare`目录下，按域名和浏览器类型组织：

```
screenshots/
└── dom-compare/
    ├── stg-666.staging.kuaishou.com/
    │   └── chromium/
    │       ├── _live-anchor_apply_page1_2025-07-22.png
    │       └── _live-anchor_apply_page2_2025-07-22.png
    └── live.kuaishou.com/
        └── chromium/
            ├── _live-anchor_apply_page1_2025-07-22.png
            └── _live-anchor_apply_page2_2025-07-22.png
```

### 2. JSON报告

在`dom-compare-results.json`文件中，每个对比结果会包含截图信息：

```json
{
  "results": [
    {
      "url1": "https://stg-666.staging.kuaishou.com/live-anchor/apply",
      "url2": "https://live.kuaishou.com/live-anchor/apply",
      "similarities": {
        "structure": 0.875,
        "text": 0.762,
        "overall": 0.831
      },
      "screenshots": {
        "page1": {
          "success": true,
          "path": "/Users/username/projects/screenshots/dom-compare/stg-666.staging.kuaishou.com/chromium/_live-anchor_apply_page1_2025-07-22.png",
          "relativePath": "screenshots/dom-compare/stg-666.staging.kuaishou.com/chromium/_live-anchor_apply_page1_2025-07-22.png"
        },
        "page2": {
          "success": true,
          "path": "/Users/username/projects/screenshots/dom-compare/live.kuaishou.com/chromium/_live-anchor_apply_page2_2025-07-22.png",
          "relativePath": "screenshots/dom-compare/live.kuaishou.com/chromium/_live-anchor_apply_page2_2025-07-22.png"
        }
      }
    }
  ]
}
```

### 3. Markdown报告

在`analysis-report.md`文件中，相似度分布和问题分析部分会包含截图链接：

```markdown
### 🟠 中等 (70%-80%)
共 3 个页面

- **/live-anchor/apply** - 75.2% | 📸 [页面1截图](screenshots/dom-compare/stg-666.staging.kuaishou.com/chromium/_live-anchor_apply_page1_2025-07-22.png) | [页面2截图](screenshots/dom-compare/live.kuaishou.com/chromium/_live-anchor_apply_page2_2025-07-22.png)
```

### 4. HTML报告

自动生成的`dom-compare-report.html`文件提供了可视化的对比界面：

- 统计概览：总页面数、通过/失败页面数、截图数量
- 相似度可视化：DOM结构、文本内容、关键元素、综合相似度
- 截图对比：两个环境的页面截图并排展示

## 最佳实践

1. **设置适当的阈值**：建议将`thresholds.overall`设置为0.8-0.85之间，避免过多截图
2. **关注关键页面**：在`paths`中优先包含核心业务流程的页面
3. **HTML报告审查**：通过HTML报告可以直观对比页面差异
4. **定期清理截图**：截图文件可能占用较大空间，建议定期清理
5. **CI/CD集成**：可以将截图功能集成到CI/CD流程中，自动检查页面一致性

## 常见问题

### 截图未生成

- 检查是否启用了截图功能（`enableScreenshot: true`）
- 确认相似度未达到100%（或设置`screenshotOnlyOnFailure: false`）
- 检查目标目录是否有写入权限

### 截图尺寸不合适

修改`screenshotOptions.viewport`配置:

```json
"screenshotOptions": {
    "viewport": {
        "width": 1920,  // 更宽的视口
        "height": 1080  // 更高的视口
    }
}
