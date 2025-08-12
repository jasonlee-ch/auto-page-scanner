## 运行环境

### 依赖安装
```shell
## 切换node 18
nvm use 18 
## 安装依赖
pnpm i
## 安装playwright
pnpm install-browsers
```

### 运行
1. 页面自动截图工具 - 目录：`apps/page-snapshot`
- 创建配置文件 
> 创建一个`config.local.json`用于本地调试
```json
{
    // 访问的域名
    "domain": "",
    // 访问的cookie
    "cookie": "",
    // 自定义请求头
    "headers": {
        "trace-context": {
            "laneId": "STAGING.opt_666_menu"
        }
    },
    // 所有需要访问的路径
    "paths": ["/live-anchor/exception-monitor","/live-anchor/transfer/in","/live-portal"],
    // 页面路径的query
    "query": {
        "cancelDtask": 1
    }
}

```

- 运行命令
```shell
## 运行自动截图
cd apps/page-snapshot && pnpm screenshot:local
```


2. 页面自动化对比工具 - 目录：`apps/page-compare`
- 创建配置文件 
> 创建一个`config.local.json`用于本地调试
```json
{
    "name": "DOM页面一致性对比配置",
    "description": "用于对比测试环境和生产环境页面的一致性",
    // 需要对比的环境信息
    "environment1": {
        "name": "测试环境泳道",
        "domain": "",
        "headers": {
            "trace-context": {
                "laneId": "STAGING.opt_666_menu"
            }
        },
        "query": {
        }
    },
    "environment2": {
        "name": "测试环境主干",
        "domain": "",
        "headers": {
            "trace-context": {
                "laneId": "main"
            }
        }
    },
    "paths": [
        "/v4/#/zh-CN/component/button",
        "/v4/#/zh-CN/component/datetime-picker"
    ],
    "domCompare": {
        // 从哪个根节点开始对比，从前往后先匹配到哪个就用哪个
        "rootSelectors": [
            ".page-component__content"
        ],
        // ignore的节点
        "ignoreSelectors": [
            ".timestamp",
            ".ad-banner",
            ".user-avatar",
            ".live-count",
            ".real-time-data",
            "[data-testid=\"dynamic\"]",
            ".loading-spinner",
            ".toast-message",
            ".user-info",
            ".notification"
        ],
        // 三个维度的阈值，低于对应配置阈值的情况就意味着相似度匹配未达标
        "thresholds": {
            "structure": 1,
            "text": 1,
            "overall": 1
        },
        // 是否生成dom结构信息
        "outputDOMStructure": false,
        // 是否支持截屏
        "enableScreenshot": true,
        // 是否只在相似度匹配未达标时，自动截图
        "screenshotOnlyOnFailure": true,
        "screenshotOptions": {
            // 截屏的配置参数
            "viewport": {
                "width": 1440,
                "height": 900
            }
        }
    },
    "options": {
        "browserTypes": [
            "chromium"
        ],
        "timeout": 60000,
        "concurrent": true,
        "saveResults": true,
        "outputPath": "./dom-compare-results.json",
        "generateReport": true
    }
}

```

- 运行命令
```shell
cd apps/page-compare && pnpm compare-local
```