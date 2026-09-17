const $ = (selector) => document.querySelector(selector);
const REQUIRED_CONTENT_VERSION = "5.2.0";

const extensionContextAvailable = Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.tabs?.query);

if (!extensionContextAvailable) {
  $("#status").textContent = "请不要直接打开 popup.html，请从 Chrome 工具栏的扩展图标打开此面板。";
  $("#scan").disabled = true;
}

function render(snapshot) {
  const notFollowingBack = snapshot?.notFollowingBack || [];
  const unfollowed = snapshot?.unfollowed || [];
  $("#notFollowingBackCount").textContent = snapshot ? notFollowingBack.length : "—";
  $("#unfollowedCount").textContent = unfollowed.length;
  $("#notFollowingBack").textContent = notFollowingBack.length
    ? notFollowingBack.map((u) => `@${u}`).join("\n")
    : !snapshot ? "尚未扫描" : snapshot.partial ? "本次暂未核验出未互关账号，扫描尚未完整。" : "本次未发现未互关账号";
  $("#unresolvedCount").textContent = snapshot?.unresolved?.length || 0;
  $("#unresolved").textContent = snapshot?.unresolved?.length
    ? snapshot.unresolved.map((u) => `@${u}`).join("\n")
    : "暂无";
  $("#unfollowed").textContent = snapshot?.hasPrevious
    ? (unfollowed.length ? unfollowed.map((u) => `@${u}`).join("\n") : "暂无")
    : "暂无历史快照";
}

async function activeInstagramTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("https://www.instagram.com/")) {
    throw new Error("请先切换到 Instagram 页面。");
  }
  return tab;
}

function isMissingReceiver(error) {
  const message = error?.message || String(error || "");
  return /Receiving end does not exist|Could not establish connection/i.test(message);
}

async function sendToInstagram(tab, message) {
  try {
    const versionResponse = await chrome.tabs.sendMessage(tab.id, { type: "GET_CONTENT_VERSION" });
    if (versionResponse?.version !== REQUIRED_CONTENT_VERSION) {
      await chrome.tabs.reload(tab.id);
      throw new Error("Instagram 页面仍在运行旧版脚本，已自动刷新。请等待页面加载后再点击一次。");
    }
  } catch (error) {
    if (!isMissingReceiver(error)) throw error;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-v2.js"] });
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

async function loadSnapshot() {
  const { latest, scanState, scanCheckpoint, exportState } = await chrome.storage.local.get(["latest", "scanState", "scanCheckpoint", "exportState"]);
  render(latest);
  $("#exportStatus").textContent = exportState?.message || (latest
    ? `可导出最近保存的扫描结果（${latest.at || "时间未记录"}）。`
    : "尚无已保存的扫描结果；扫描完成后可以导出。断点不等于扫描结果。");
  const checkpointParts = [];
  if (scanCheckpoint?.following?.users?.length) {
    checkpointParts.push(`关注 ${scanCheckpoint.following.users.length}/${scanCheckpoint.following.expected ?? "?"}`);
  }
  if (scanCheckpoint?.followers?.users?.length) {
    checkpointParts.push(`粉丝 ${scanCheckpoint.followers.users.length}/${scanCheckpoint.followers.expected ?? "?"}`);
  }
  const checkpointNote = checkpointParts.length ? ` 已保存断点：${checkpointParts.join("，")}。` : "";
  const startedAt = scanState?.startedAt ? new Date(scanState.updatedAt || scanState.startedAt).getTime() : 0;
  const staleRunning = scanState?.status === "running" && startedAt && Date.now() - startedAt > 15 * 60 * 1000;
  $("#scan").textContent = checkpointParts.length ? "继续检查未互关" : "一键检查未互关";

  if (scanState?.status === "running" && !staleRunning) {
    $("#status").textContent = scanState.message || "扫描正在后台进行……";
    $("#scan").disabled = true;
  } else if (staleRunning) {
    $("#status").textContent = `上次扫描已经中断。${checkpointNote}点击“继续扫描”即可接着合并。`;
    $("#scan").disabled = false;
  } else if (scanState?.status === "complete") {
    $("#status").textContent = latest?.warning
      ? `${scanState.message} ${latest.warning}`
      : scanState.message;
    $("#scan").disabled = false;
  } else if (scanState?.status === "error") {
    $("#status").textContent = `上次扫描失败：${scanState.message}${checkpointNote}`;
    $("#scan").disabled = false;
  } else {
    $("#scan").disabled = !extensionContextAvailable;
  }
}

$("#scan").addEventListener("click", async () => {
  if (!extensionContextAvailable) return;
  $("#scan").disabled = true;
  $("#status").textContent = "正在读取粉丝和关注列表，请保持 Instagram 标签页打开……";
  try {
    const tab = await activeInstagramTab();
    const response = await sendToInstagram(tab, { type: "SCAN" });
    if (!response?.ok) throw new Error(response?.error || "扫描失败。");
    $("#status").textContent = "扫描已在后台开始。已有断点会自动合并，完成后重新打开即可查看。";
  } catch (error) {
    $("#status").textContent = error.message || String(error);
    $("#notFollowingBackCount").textContent = "—";
    $("#notFollowingBack").textContent = "本次扫描失败，未更新结果。";
  } finally {
    const { scanState } = await chrome.storage.local.get("scanState");
    $("#scan").disabled = scanState?.status === "running";
  }
});

$("#clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(["latest", "scanState", "scanCheckpoint"]);
  render(null);
  $("#status").textContent = "历史快照已清除。";
});

$("#export").addEventListener("click", async () => {
  $("#export").disabled = true;
  $("#exportStatus").textContent = "正在准备 TXT 并打开保存窗口……";
  try {
    if (!extensionContextAvailable) throw new Error("请从 Chrome 工具栏的扩展图标打开面板。");
    const response = await chrome.runtime.sendMessage({ type: "EXPORT_TXT" });
    if (!response?.ok) throw new Error(response?.error || "导出未启动，请重新加载扩展后重试。");
    $("#exportStatus").textContent = response.message;
  } catch (error) {
    $("#exportStatus").textContent = `未完成另存为：${error.message || String(error)}`;
  } finally {
    $("#export").disabled = false;
  }
});

if (extensionContextAvailable) loadSnapshot().catch((error) => {
  $("#exportStatus").textContent = `读取本地结果失败：${error.message || String(error)}`;
});

if (extensionContextAvailable) chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.latest || changes.scanState || changes.scanCheckpoint || changes.exportState)) loadSnapshot();
});
