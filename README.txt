Instagram Follow Checker 5.2.0
安装与使用说明 / Installation and Usage

一、适用范围
用于 Windows、macOS、Linux 的当前稳定版桌面 Google Chrome。
无需安装 Python、Node.js 或其他运行环境。
不适用于手机 Chrome、Safari。受公司/学校策略管理的 Chrome 可能禁止开发者扩展。
此包使用标准 Chrome 扩展接口，无设备型号或操作系统专用路径。
尚未在所有操作系统上实测；Instagram 改版、语言和账号界面差异可能影响识别。
目前页面文字识别支持简体中文和英文；其他语言请先在 Instagram 中切换语言。

二、安装（所有桌面系统通用）
1. 将 ZIP 解压到一个准备长期保留的文件夹。
   Windows：右键 ZIP → 全部解压。
   macOS：双击 ZIP 解压。
   Linux：使用系统归档管理器解压。
2. 在 Chrome 地址栏输入 chrome://extensions 并打开。
3. 开启“开发者模式”（Developer mode）。
4. 点击“加载已解压的扩展程序”（Load unpacked）。
5. 选择直接包含 manifest.json 的文件夹。不要选 ZIP，不要双击 popup.html。
6. 在 Chrome 工具栏的扩展菜单中固定 Instagram Follow Checker，方便使用。
7. 安装后保持这个文件夹的位置不变；移动、删除文件夹会导致扩展失效。

三、开始扫描前必须进入自己的个人主页
1. 在 Chrome 中自行登录 Instagram，无需向扩展提供密码。
2. 点击自己的头像，进入自己的个人主页：地址应是 https://www.instagram.com/你的用户名/。
3. 确认页面上能看到自己的“粉丝”和“关注”数量。
   不要停在首页信息流、消息页、帖子页或他人的个人主页。
4. 首次安装或更新扩展后，刷新 Instagram 主页。
5. 点击扩展图标 → “一键检查未互关”。
6. 等待自动扫描与候选核验。保留此标签页，扫描时不要切换账号、导航离开、刷新、
   手动关闭列表或同时滚动操作列表。扩展面板关闭不影响页面中的扫描。
7. 再次点击扩展图标查看进度和结果。

四、结果含义
“当前未互关”＝你当前关注的账号中，本次核验未在粉丝中找到的账号。
第一次使用也能检查；新关注但没有回关的人会纳入当次检查。
“待确认”＝搜索超时或页面没有提供明确证据，不计入未互关。
“从粉丝中消失”＝两次可比较的历史快照差异；也可能由改名、停用等造成。
它不等于“当前未互关”，且首次运行没有历史变化可显示。

每张列表最多扫描两轮（首次扫描＋一次补扫），补扫前等待 5 秒。
读取数量比页面总数少 1–3 个时，接受缺口并进入核验；说明中保留真实数量。
缺口不能证明账号隐藏了，也可能来自加载不足或计数延迟。未读取账号仍可能漏报。
若显示“部分完成”，结果未覆盖全部账号；已有进度会保留，可稍后再点击续扫。
网页扫描无法保证每次都取得全部数据，扩展不会自动取消关注任何账号。

五、本地另存为 TXT
有保存的扫描结果后点击“本地另存为 TXT”，选择文件夹和文件名。
导出最近一次已保存的结果；正在扫描的新结果完成前，导出的可能是上一轮结果。
文件名带扫描完成时间（UTC，精确到毫秒），正文同时列出：
- 扫描完成时间、导出时间、本地时区和 UTC 时间；
- 读取数量、页面计数、容差和扫描状态；
- 已核验未互关、待确认、历史变化、当次读取的关注与粉丝名单。
如无已保存结果，按钮会说明原因。保存失败时查看按钮下方的状态提示。
TXT 包含使用者自己的账号信息，分享该文件前请自行检查内容。

六、更新与排查
- 更新：备份自己需要的 TXT；用新版文件替换原扩展文件夹里的程序文件，
  到 chrome://extensions 点击扩展卡片的重新加载，再刷新 Instagram 主页。
  不建议先卸载，卸载可能清除本地结果。
- 找不到入口：确认进入自己的主页，且页面语言是简体中文或英文。
- 长时间没有新增账号：稍后再试，避免连续点击；扩展不绕过 Instagram 的加载限制。
- 没有保存窗口：重新加载扩展，检查它的下载权限，查看按钮下方的错误提示。
- 下载已创建：打开 Chrome 下载列表检查文件位置或下载状态。
- “清除结果”：删除扩展中保存的结果和断点；已导出的 TXT 不会被删除。
- 不要把正在使用的浏览器用户数据文件夹打包给其他人。

七、隐私与权限
发布 ZIP 仅包含程序源码及说明，不包含作者的账号、设备名、绝对路径、密码、
浏览器登录信息、历史扫描名单或导出文件。
程序运行时读取当前使用者登录的 Instagram 页面，账号与断点保存在该 Chrome
用户配置的本地扩展存储中，不通过 chrome.storage.sync 同步。
扩展没有自己的服务器、分析追踪或第三方上传代码；列表和搜索操作仍与 Instagram 通信。
权限用途：storage 保存结果；activeTab/tabs 定位当前页面；scripting 加载页面脚本；
downloads 打开本地保存对话框；站点权限仅限 https://www.instagram.com/。

八、分发说明
这是可查看源码的 ZIP 测试/分享包，不是 Chrome 网上应用店已审核的产品。
ZIP 不能直接双击安装，普通 Windows/macOS 用户不应依赖外部 CRX 直接安装。
希望公众通过“添加至 Chrome”安装，需要另行提交 Chrome 网上应用店审核。
请分享原始发布 ZIP，不要把自己的扫描 TXT 或 Chrome 用户数据附进去。

Chrome 官方安装说明：
https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world
Chrome 官方分发说明：
https://developer.chrome.com/docs/extensions/how-to/distribute

English quick start
1. Extract the ZIP into a permanent folder on Windows, macOS or Linux.
2. Open chrome://extensions, enable Developer mode, click Load unpacked, and select
   the folder directly containing manifest.json. Do not open popup.html directly.
3. Sign into Instagram yourself. Open YOUR OWN profile page, where follower and
   following counts are visible. Use English or Simplified Chinese for Instagram.
4. Refresh that page after installation/update. Click the extension and the primary
   scan button. Keep the Instagram tab open and avoid interacting with its lists.
5. Reopen the extension to see results. The interface currently uses Chinese:
   一键检查未互关 = Check non-mutual follows; 待确认 = Unverified;
   本地另存为 TXT = Save results as TXT; 清除结果 = Clear stored results.
6. Exported TXT files contain your account data. The distributed ZIP does not.
No cross-platform end-to-end certification is claimed. Instagram UI changes or
account restrictions may prevent a complete scan. This is not an official Meta product.
