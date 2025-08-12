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
1. 页面自动截图工具 - `apps/page-snapshot`
- 配置文件 
> 创建一个`config.local.json`用于本地调试
```json
{
    // 访问的域名
    "domain": "https://stg-666.staging.kuaishou.com",
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


2. 页面自动化对比工具 - `apps/page-compare`