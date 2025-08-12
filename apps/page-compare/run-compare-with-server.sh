#!/bin/bash

# DOM对比分析自动化脚本
# 执行对比分析后自动启动本地服务并打开报告

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    # 检查node是否安装
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装，请先安装 Node.js"
        exit 1
    fi

    # 检查python3是否安装（用于启动HTTP服务）
    if ! command -v python3 &> /dev/null; then
        log_warning "Python3 未安装，将尝试使用 Node.js 启动服务"
        USE_NODE_SERVER=true
    else
        USE_NODE_SERVER=false
    fi

    log_success "依赖检查完成"
}

# 获取配置文件参数
get_config_file() {
    CONFIG_FILE="config.json"

    # 检查命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            -c)
                CONFIG_FILE="$2"
                shift 2
                ;;
            --help|-h)
                echo "使用方法: $0 [选项]"
                echo "选项:"
                echo "  --config, -c <文件>  指定配置文件 (默认: config.json)"
                echo "  --port, -p <端口>    指定服务端口 (默认: 8080)"
                echo "  --no-open           不自动打开浏览器"
                echo "  --help, -h          显示此帮助信息"
                exit 0
                ;;
            --port|-p)
                PORT="$2"
                shift 2
                ;;
            --no-open)
                NO_OPEN=true
                shift
                ;;
            *)
                log_warning "未知参数: $1"
                shift
                ;;
        esac
    done

    # 设置默认值
    PORT=${PORT:-8080}
    NO_OPEN=${NO_OPEN:-false}

    log_info "使用配置文件: $CONFIG_FILE"
    log_info "本地服务端口: $PORT"
}

# 执行DOM对比分析
run_comparison() {
    log_info "开始执行DOM对比分析..."

    # 检查配置文件是否存在
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_error "配置文件 $CONFIG_FILE 不存在"
        exit 1
    fi

    # 执行对比分析
    if node index.js --compare-config "$CONFIG_FILE"; then
        log_success "DOM对比分析完成"
    else
        log_error "DOM对比分析失败"
        exit 1
    fi
}

# 检查报告文件
check_reports() {
    log_info "检查生成的报告文件..."

    ENHANCED_REPORT="dom-compare-enhanced-report.html"
    BASIC_REPORT="dom-compare-report.html"

    if [[ -f "$ENHANCED_REPORT" ]]; then
        log_success "增强型报告已生成: $ENHANCED_REPORT"
        HAS_ENHANCED=true
    else
        log_warning "增强型报告未生成"
        HAS_ENHANCED=false
    fi

    if [[ -f "$BASIC_REPORT" ]]; then
        log_success "基础报告已生成: $BASIC_REPORT"
        HAS_BASIC=true
    else
        log_warning "基础报告未生成"
        HAS_BASIC=false
    fi

    if [[ "$HAS_ENHANCED" = false && "$HAS_BASIC" = false ]]; then
        log_error "没有找到任何报告文件，可能对比分析未成功生成报告"
        exit 1
    fi
}

# 启动本地HTTP服务
start_server() {
    log_info "启动本地HTTP服务 (端口: $PORT)..."

    # 检查端口是否被占用
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_warning "端口 $PORT 已被占用，尝试使用其他端口..."
        PORT=$((PORT + 1))

        # 再次检查新端口
        while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
            PORT=$((PORT + 1))
            if [[ $PORT -gt 9000 ]]; then
                log_error "无法找到可用端口"
                exit 1
            fi
        done

        log_info "使用端口: $PORT"
    fi

    # 启动HTTP服务
    if [[ "$USE_NODE_SERVER" = true ]]; then
        # 使用Node.js启动服务
        log_info "使用 Node.js 启动HTTP服务..."

        # 创建临时的Node.js服务器脚本
        cat > temp_server.js << EOF
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    if (pathname === '/') {
        pathname = '/dom-compare-enhanced-report.html';
    }

    const filePath = path.join(__dirname, pathname);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }

        const ext = path.extname(filePath);
        const contentType = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif'
        }[ext] || 'text/plain';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen($PORT, () => {
    console.log('服务器运行在 http://localhost:$PORT');
});
EOF

        # 在后台启动服务器
        node temp_server.js &
        SERVER_PID=$!

        # 清理临时文件
        sleep 2
        rm -f temp_server.js

    else
        # 使用Python启动服务
        log_info "使用 Python3 启动HTTP服务..."
        python3 -m http.server $PORT &
        SERVER_PID=$!
    fi

    # 等待服务启动
    sleep 3

    # 验证服务是否启动成功
    if curl -s "http://localhost:$PORT" > /dev/null 2>&1; then
        log_success "本地HTTP服务启动成功: http://localhost:$PORT"
    else
        log_error "本地HTTP服务启动失败"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
}

# 打开浏览器
open_browser() {
    if [[ "$NO_OPEN" = true ]]; then
        log_info "跳过自动打开浏览器"
        return
    fi

    log_info "打开浏览器查看报告..."

    BASE_URL="http://localhost:$PORT"

    # 检测操作系统并使用相应的命令打开浏览器
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if [[ "$HAS_ENHANCED" = true ]]; then
            open "$BASE_URL/dom-compare-enhanced-report.html"
            log_success "已打开增强型报告"
        fi

        if [[ "$HAS_BASIC" = true ]]; then
            sleep 2
            open "$BASE_URL/dom-compare-report.html"
            log_success "已打开基础报告"
        fi

    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if [[ "$HAS_ENHANCED" = true ]]; then
            xdg-open "$BASE_URL/dom-compare-enhanced-report.html" &
            log_success "已打开增强型报告"
        fi

        if [[ "$HAS_BASIC" = true ]]; then
            sleep 2
            xdg-open "$BASE_URL/dom-compare-report.html" &
            log_success "已打开基础报告"
        fi

    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Windows
        if [[ "$HAS_ENHANCED" = true ]]; then
            start "$BASE_URL/dom-compare-enhanced-report.html"
            log_success "已打开增强型报告"
        fi

        if [[ "$HAS_BASIC" = true ]]; then
            sleep 2
            start "$BASE_URL/dom-compare-report.html"
            log_success "已打开基础报告"
        fi

    else
        log_warning "无法自动打开浏览器，请手动访问:"
        if [[ "$HAS_ENHANCED" = true ]]; then
            echo "  增强型报告: $BASE_URL/dom-compare-enhanced-report.html"
        fi
        if [[ "$HAS_BASIC" = true ]]; then
            echo "  基础报告: $BASE_URL/dom-compare-report.html"
        fi
    fi
}

# 清理函数
cleanup() {
    log_info "正在清理..."

    if [[ -n "$SERVER_PID" ]]; then
        log_info "停止HTTP服务 (PID: $SERVER_PID)"
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi

    # 清理临时文件
    rm -f temp_server.js

    log_success "清理完成"
}

# 设置信号处理
trap cleanup EXIT INT TERM

# 显示帮助信息
show_usage() {
    echo "DOM对比分析自动化脚本"
    echo ""
    echo "功能:"
    echo "  1. 执行DOM对比分析"
    echo "  2. 启动本地HTTP服务"
    echo "  3. 自动打开分析报告"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --config, -c <文件>  指定配置文件 (默认: config.json)"
    echo "  --port, -p <端口>    指定服务端口 (默认: 8080)"
    echo "  --no-open           不自动打开浏览器"
    echo "  --help, -h          显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                                    # 使用默认配置"
    echo "  $0 --config config.enhanced-demo.json  # 使用指定配置"
    echo "  $0 --port 3000 --no-open             # 指定端口且不自动打开浏览器"
}

# 主函数
main() {
    echo "🚀 DOM对比分析自动化脚本启动"
    echo "================================"

    # 解析命令行参数
    get_config_file "$@"

    # 检查依赖
    check_dependencies

    # 执行对比分析
    run_comparison

    # 检查报告文件
    check_reports

    # 启动HTTP服务
    start_server

    # 打开浏览器
    open_browser

    echo ""
    echo "================================"
    log_success "所有任务完成!"
    echo ""
    log_info "服务信息:"
    echo "  本地服务地址: http://localhost:$PORT"
    if [[ "$HAS_ENHANCED" = true ]]; then
        echo "  增强型报告: http://localhost:$PORT/dom-compare-enhanced-report.html"
    fi
    if [[ "$HAS_BASIC" = true ]]; then
        echo "  基础报告: http://localhost:$PORT/dom-compare-report.html"
    fi
    echo ""
    log_info "按 Ctrl+C 停止服务"
    echo ""

    # 保持服务运行
    wait $SERVER_PID
}

# 执行主函数
main "$@"
