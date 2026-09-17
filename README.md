# Instagram Follow Checker

**一键看清：你关注的人里，谁没有关注你。**

基于 Chrome Manifest V3 的轻量扩展。读取当前登录页面，在本地计算关注与粉丝差集，复核候选账号，并将结果导出为带毫秒级时间戳的 TXT。

[下载 v5.2.0 安装包](../../releases/download/v5.2.0/instagram-follow-checker-5.2.0.zip) · [使用说明](使用说明.md) · [隐私说明](PRIVACY.md) · [版本记录](CHANGELOG.md)

## 为什么做它

新关注的人是否回关？名单是否漏读？一次扫描中断后，能否保留进度？这个项目把这些步骤收进一个按钮里，同时保留“待确认”和读取缺口，避免把加载失败误当作没有回关。

## 功能

- **一键检查未互关**：当前关注 − 当前粉丝，新关注账号也会纳入检查。
- **候选复核**：确认粉丝搜索结果，再确认你当前仍在关注对方。
- **断点续扫**：周期性保存进度；最多两轮扫描，补扫前等待 5 秒。
- **小幅容差**：少 1–3 个账号时进入核验，真实缺口仍会显示。
- **明确的不确定性**：超时或没有明确结果的账号列入“待确认”。
- **本地 TXT 导出**：包含结果、原始名单、扫描及导出时间、毫秒与时区。
- **零运行依赖**：安装扩展不需要 Node.js、Python 或服务器。

## 快速开始

1. [下载发布 ZIP](../../releases/download/v5.2.0/instagram-follow-checker-5.2.0.zip)，解压到长期保留的文件夹。
2. 桌面 Chrome 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择直接包含 `manifest.json` 的文件夹。
4. 自行登录 Instagram，**进入自己的个人主页，确认能看到粉丝和关注数量**。
5. 刷新该页，打开扩展，点击“一键检查未互关”。扫描中保留标签页，避免操作列表。
6. 重新打开扩展查看结果，或点击“本地另存为 TXT”。

支持标准桌面 Chrome 扩展环境（Windows / macOS / Linux）。Instagram 页面语言目前支持简体中文、英文；扩展界面为中文。手机 Chrome 不适用。完整步骤与排错见 [使用说明](使用说明.md)。

## 结果怎么读

| 结果 | 含义 |
| --- | --- |
| 当前未互关 | 本次读取和搜索核验支持的差集账号 |
| 待确认 | 页面没有提供明确结果，不计入未互关 |
| 从粉丝中消失 | 可比较的历史快照差异，也可能由改名、停用等造成 |
| 部分完成 | 数据尚未读全或仍有候选待确认，已保留断点 |

页面计数一致不代表成员一定完整；容差也不能证明账号被隐藏。Instagram 改版、加载限制和搜索延迟仍可能导致漏报或无法完成扫描。项目不保证识别所有取关行为，不自动取关，不是 Meta 或 Instagram 官方产品。

## 隐私优先

没有独立服务器，没有分析追踪，也不要求输入密码。扫描结果和断点保存在当前 Chrome 用户配置的本地扩展存储中；页面操作仍会与 Instagram 通信。发布包仅包含程序和说明，不包含开发者账号、设备名、本机绝对路径或历史名单。

导出的 TXT 会包含使用者自己的账号与名单，请勿将真实导出文件提交到仓库或问题反馈中。详见 [PRIVACY.md](PRIVACY.md)。

## 开发与验证

维护者使用 Node.js 22+ 和 Python 3.10+；运行扩展不需要安装它们。

```sh
node --test scanner.test.cjs
python3 build_release.py
```

Windows 可使用 `py build_release.py`。安装包输出到 `dist/`，附 SHA-256 校验文件。打包脚本使用白名单、固定元数据，不读取 Chrome 用户数据。

测试覆盖：搜索超时与延迟、旧断点与新增关注、补扫次数和等待、容差、结果持久化、TXT 内容、无数据导出、下载权限及取消保存。模拟测试不能代替真实 Instagram 页面验证。CI 配置会在 Linux、Windows 和 macOS 上执行测试及打包检查；这不是三平台真实账号扫描认证。

## 项目结构

```text
manifest.json       Chrome 权限与扩展入口
content-v2.js       页面扫描、差集、核验、断点与本地保存
popup.html/js       扩展面板
style.css           面板样式
background.js      后台 TXT 下载
report.js           可测试的报告生成逻辑
guide.html          扩展内使用说明
scanner.test.cjs    无外部依赖的回归测试
build_release.py   可重复的白名单打包
使用说明.md         给使用者的完整指南
```

欢迎通过 Issues 提交脱敏的问题描述，或参阅 [贡献指南](CONTRIBUTING.md)。本仓库暂未授予额外开源许可；公开展示源码不等于自动授予无限制的使用或再分发权利。

## English

A local-first Chrome extension that checks **who you follow but who does not follow you back**. It offers bounded automatic retries, checkpointing, explicit unverified results, and timestamped TXT exports. Extract the release ZIP, load it unpacked at `chrome://extensions`, and start from **your own Instagram profile**. Supports English and Simplified Chinese Instagram page labels; the extension UI is currently Chinese. No backend, no password collection, no automatic unfollowing.
