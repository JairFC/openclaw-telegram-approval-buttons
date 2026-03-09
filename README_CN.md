[English](./README.md) | [中文](./README_CN.md)

# 🔐 OpenClaw 审批按钮插件

> 在 **Telegram** 和 **Slack** 中一键处理 `exec` 审批，不再手动输入冗长的 `/approve <uuid> allow-once`。

## 这是什么？

OpenClaw 在某些渠道里原生支持审批按钮，但 **Telegram 和 Slack 默认并没有这套体验**。没有这个插件时，你通常只能复制并手动输入 `/approve` 命令来放行或拒绝执行请求。

这个插件的目标，就是把这些审批请求变成可以直接点击的按钮消息。

## 功能特性

- ✅ **一键审批** —— 允许一次 / 永久允许 / 拒绝
- 💬 **多渠道支持** —— 同时支持 Telegram（内联按钮）与 Slack（Block Kit 按钮）
- 🌐 **Telegram 代理支持** —— 可显式配置代理，也可继承 `channels.telegram.proxy`
- 🌍 **语言包支持** —— 支持 `en` / `zh-CN`，避免在代码里硬编码文案
- 🔄 **自动回写结果** —— 用户处理后自动更新原消息状态
- ⏰ **超时处理** —— 待审批请求过期后自动标记为已过期
- 🩺 **自检命令** —— `/approvalstatus` 可查看插件健康状态与统计信息
- 🛡️ **优雅回退** —— 若按钮发送失败，原始文本审批消息仍会正常发送，不会阻断审批流程

## 快速开始

### 第一步：安装插件

```bash
openclaw plugins install telegram-approval-buttons
```

安装后，OpenClaw 会自动下载并启用该插件。

<details>
<summary>开发模式：从源码安装</summary>

```bash
git clone https://github.com/JairFC/openclaw-telegram-approval-buttons.git
```

然后在 `openclaw.json` 中手动加载：

```jsonc
{
  "plugins": {
    "load": {
      "paths": ["/path/to/openclaw-telegram-approval-buttons"]
    }
  }
}
```

</details>

### 第二步：配置审批与插件

打开 `~/.openclaw/openclaw.json`，至少配置两部分：

1. **Exec 审批目标指向 Telegram** —— 否则审批仍然只会以纯文本形式出现
2. **插件配置 botToken / chatId** —— 插件需要这些信息来发送按钮消息

```jsonc
{
  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "targets",
      "targets": [
        {
          "channel": "telegram",
          "to": "<你的 Telegram chat id>"
        }
      ]
    }
  },
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "botToken": "<你的 bot token>",
          "chatId": "<你的 Telegram chat id>"
        }
      }
    }
  }
}
```

### 第三步：重启并验证

```bash
openclaw gateway restart
```

然后在 Telegram 会话里发送：

```text
/approvalstatus
```

正常情况下，你会看到类似：

```text
🟢 审批按钮状态

Telegram：chatId=✓ · token=✓
  ✓ 已连接 (@your_bot)
Slack：未配置

待处理：0 · 已处理：0
运行时间：1 分钟
```

## 如何获取这些配置值？

- **Bot Token**：通过 [@BotFather](https://t.me/BotFather) 创建机器人后获得
- **Chat ID**：可向 [@userinfobot](https://t.me/userinfobot) 发送消息查看，也可在机器人收到你消息后查看日志

## 前置条件

- **OpenClaw ≥ 2026.2.9**
- **Node.js ≥ 20**
- 已在 `openclaw.json` 中配置 Telegram 渠道
- 已启用并正确配置 `approvals.exec`

## 工作原理

```text
┌─────────────┐    message_sending     ┌──────────────────┐
│  OpenClaw    │ ── 审批文本消息 ──→   │      插件         │
│  Gateway     │                       │                  │
│              │   取消原始消息        │ 1. 解析审批文本   │
│              │ ←──────────────────── │ 2. 发送按钮消息   │
└─────────────┘                        │ 3. 跟踪待处理状态 │
                                       └────────┬─────────┘
                                                │
                                       Telegram Bot API / Slack API
                                                │
                                       ┌────────▼─────────┐
                                       │     聊天界面      │
                                       │   🔐 执行审批      │
                                       │ [允许] [永久] [拒绝] │
                                       └──────────────────┘
```

当你点击按钮时，OpenClaw 会把按钮回调转换成对应的审批命令继续处理，因此**不需要额外 webhook**。

## 配置说明

插件支持自动从 Telegram 主通道配置中推断部分参数，但推荐你在插件配置中显式写清楚。

### 配置解析优先级

| 配置项 | 优先级 1（显式配置） | 优先级 2（共享配置） | 优先级 3（环境变量） |
|---|---|---|---|
| `botToken` | `pluginConfig.botToken` | `channels.telegram.token` | `TELEGRAM_BOT_TOKEN` |
| `chatId` | `pluginConfig.chatId` | `channels.telegram.allowFrom[0]` | `TELEGRAM_CHAT_ID` |
| `proxy` | `pluginConfig.proxy` | `channels.telegram.proxy` | — |
| `language` | `pluginConfig.language` | — | — |

## 高级配置示例

```jsonc
{
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "chatId": "123456789",
          "botToken": "123:ABC...",
          "language": "zh-CN",
          "proxy": {
            "enabled": true,
            "url": "http://127.0.0.1:7890",
            "strict": true,
            "insecureTls": false
          },
          "slackBotToken": "xoxb-...",
          "slackChannelId": "C0123456",
          "staleMins": 10,
          "verbose": false
        }
      }
    }
  }
}
```

## Telegram 代理示例

### 方案一：在插件中显式配置代理

```jsonc
{
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "chatId": "123456789",
          "botToken": "123:ABC...",
          "proxy": {
            "enabled": true,
            "url": "http://192.168.0.10:20900",
            "strict": true
          }
        }
      }
    }
  }
}
```

### 方案二：继承主 Telegram 通道代理

```jsonc
{
  "channels": {
    "telegram": {
      "proxy": "http://192.168.0.10:20900"
    }
  },
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "chatId": "123456789",
          "botToken": "123:ABC..."
        }
      }
    }
  }
}
```

### 方案三：代理会注入自签 TLS 证书链

如果你的网络环境里，代理会对 HTTPS 做中间人解密并返回**自签证书链**，你需要显式打开 `insecureTls`：

```jsonc
{
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "proxy": {
            "enabled": true,
            "url": "http://192.168.0.10:20900",
            "strict": true,
            "insecureTls": true
          }
        }
      }
    }
  }
}
```

> ⚠️ `insecureTls` 只应在你明确知道代理会注入自签 TLS 证书时开启。

## 语言包

插件支持以下语言值：

- `en`
- `zh-CN`

示例：

```jsonc
{
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "language": "zh-CN"
        }
      }
    }
  }
}
```

当 `language` 缺失或填写非法值时，插件会回退到 `en`。

## 常见问题

### 我安装了插件，但仍然收到旧式纯文本审批
大概率是 `approvals.exec` 没有正确指向 Telegram。请确认你使用的是：

```jsonc
{
  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "targets",
      "targets": [
        { "channel": "telegram", "to": "<chatId>" }
      ]
    }
  }
}
```

### `/approvalstatus` 显示 unknown command
说明插件没有成功加载。请重新安装插件并重启网关。

### Telegram 连接报 `connect ETIMEDOUT ...:443`
说明当前环境下 Telegram 直连不可用，通常必须配置代理。请设置插件代理，或让插件继承 `channels.telegram.proxy`。

### 代理环境里出现 TLS/self-signed 错误
若你的代理会注入自签证书链，请显式设置：

```jsonc
{
  "proxy": {
    "insecureTls": true
  }
}
```

### 按钮能发出来，但点击后没反应
请检查：
- 机器人是否有编辑自己消息的权限
- 是否在私聊中测试
- Slack/Telegram 是否正确处理了按钮回调

### 按钮显示为已过期
说明审批超时。你可以增加 `staleMins` 的值。

## 故障排查

| 问题 | 处理方法 |
|---|---|
| 日志里显示 `DISABLED — missing config` | 检查 `botToken` 与 `chatId` 是否存在 |
| 还是收到旧式审批文本 | 检查 `approvals.exec` 是否真的指向 Telegram |
| `/approvalstatus` 没反应 | 检查插件是否已加载，并确认命令路由是否可用 |
| `connect ETIMEDOUT ...:443` | 说明 Telegram 直连失败，应配置代理 |
| 代理场景下出现 TLS/self-signed 错误 | 打开 `proxy.insecureTls` |
| 按钮发出但状态不更新 | 检查机器人编辑消息权限 |
| 按钮总是过期 | 调大 `staleMins` |

## 项目结构

```text
telegram-approval-buttons/
├── index.ts                  # 插件入口
├── types.ts                  # 共享类型定义
├── locales/                  # 语言包（en / zh-CN）
├── lib/
│   ├── telegram-api.ts       # Telegram Bot API 封装
│   ├── telegram-transport.ts # Telegram HTTP 传输层（含代理支持）
│   ├── slack-api.ts          # Slack API 封装
│   ├── approval-parser.ts    # 审批文本解析
│   ├── message-formatter.ts  # Telegram 消息格式化
│   ├── slack-formatter.ts    # Slack 消息格式化
│   ├── approval-store.ts     # 待处理审批的内存存储
│   └── diagnostics.ts        # 配置解析与健康检查
├── openclaw.plugin.json      # 插件清单
├── README.md                 # 英文文档
├── README_CN.md              # 中文文档
└── package.json
```

## 贡献

欢迎提 Issue 和 PR。建议保持每个文件职责单一，方便 review 与维护。

## 贡献者

- [@JairFC](https://github.com/JairFC) —— 项目创建者与维护者
- [@sjkey](https://github.com/sjkey) —— Slack 支持与消息简化（v5.0.0）

## 许可证

[MIT](LICENSE)
