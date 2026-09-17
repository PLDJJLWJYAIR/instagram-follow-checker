importScripts("report.js");

async function exportLatestResult() {
  try {
    const { latest } = await chrome.storage.local.get("latest");
    if (!latest) throw new Error("尚无已保存的扫描结果。请等待扫描完成；已有断点不能作为最终名单导出。");
    if (!chrome.downloads?.download) throw new Error("下载权限尚未生效，请在 chrome://extensions 重新加载扩展。");
    const report = buildTextExport(latest);
    await chrome.storage.local.set({ exportState: {
      status: "preparing", at: new Date().toISOString(),
      message: "正在打开 Chrome 保存窗口，请选择 TXT 的保存位置。"
    } });
    const downloadId = await chrome.downloads.download({
      url: `data:text/plain;charset=utf-8,${encodeURIComponent('\uFEFF' + report.text)}`,
      filename: report.filename, saveAs: true, conflictAction: "uniquify"
    });
    const message = "TXT 下载已创建，可在 Chrome 下载列表中查看保存状态。";
    await chrome.storage.local.set({ exportState: {
      status: "started", downloadId, filename: report.filename,
      at: new Date().toISOString(), message
    } });
    return { ok: true, message };
  } catch (error) {
    const message = error.message || String(error);
    await chrome.storage.local.set({ exportState: {
      status: "error", at: new Date().toISOString(), message: `未完成另存为：${message}`
    } });
    return { ok: false, error: message };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXPORT_TXT") return;
  exportLatestResult().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
