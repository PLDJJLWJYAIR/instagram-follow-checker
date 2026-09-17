const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CONTENT_VERSION = "5.2.0";
const COUNT_TOLERANCE = 3;
const MAX_SCAN_ROUNDS = 2;
const RETRY_WAIT_MS = 5000;

function acceptableCount(result) {
  if (!Number.isInteger(result.expected) || result.expected < 0) return false;
  const gap = result.expected - result.users.length;
  return gap >= 0 && gap <= COUNT_TOLERANCE
    && (result.users.length > 0 || result.expected === 0);
}

const RESERVED_PATHS = new Set([
  "accounts", "direct", "explore", "reels", "stories", "about", "legal", "web"
]);

function usernameFromHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, location.origin);
    if (url.hostname !== "www.instagram.com" && url.hostname !== "instagram.com") return null;
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length !== 1) return null;
    const value = decodeURIComponent(pathParts[0] || "").toLowerCase();
    if (!value || RESERVED_PATHS.has(value) || !/^[a-z0-9._]+$/i.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function isVisible(element) {
  if (!(element instanceof Element)) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function readableText(element) {
  return [
    element?.innerText,
    element?.textContent,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title")
  ].filter(Boolean).map((s) => s.replace(/\s+/g, " ").trim()).filter((s, i, a) => a.indexOf(s) === i).join(" ");
}

function statLink(kind) {
  const pattern = kind === "followers" ? /粉丝|followers/i : /关注|following/i;
  const scope = document;
  const candidates = [...scope.querySelectorAll('a, button, [role="link"]')].filter(isVisible);
  return candidates.find((link) => {
    const text = readableText(link);
    if (/已关注|following you/i.test(text)) return false;
    return pattern.test(text) && /\d/.test(text);
  });
}

function displayedCount(link) {
  const match = readableText(link).replace(/[,.\s]/g, "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function activeDialog() {
  const semanticDialog = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
    .find(isVisible);
  if (semanticDialog) return semanticDialog;

  const inputs = [...document.querySelectorAll('input[placeholder*="搜索"], input[placeholder*="Search" i], input[aria-label*="搜索"], input[aria-label*="Search" i]')]
    .filter(isVisible);
  for (const input of inputs) {
    let node = input.parentElement;
    while (node && node !== document.body) {
      const text = readableText(node).slice(0, 120);
      const hasTitle = /粉丝|关注|followers|following/i.test(text);
      const hasClose = [...node.querySelectorAll("button")].some((button) => {
        const label = readableText(button);
        return isVisible(button) && /^(关闭|close)$/i.test(label);
      });
      if (hasTitle && hasClose) return node;
      node = node.parentElement;
    }
  }
  return null;
}

function dialogCloseButton(dialog = activeDialog()) {
  if (!dialog) return null;
  const labelled = dialog.querySelector('[aria-label="关闭"], [aria-label="Close" i], [title="关闭"], [title="Close" i]');
  if (labelled) return labelled.closest("button") || labelled;
  return [...dialog.querySelectorAll("button")]
    .find((button) => isVisible(button) && /^(关闭|close)$/i.test(readableText(button))) || null;
}

async function closeDialog() {
  const dialog = activeDialog();
  if (!dialog) return;
  const button = dialogCloseButton(dialog);
  if (button && typeof button.click === "function") button.click();
  else button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  for (let i = 0; i < 15 && activeDialog(); i++) await sleep(100);
}

function scrollContainer(dialog) {
  return [dialog, ...dialog.querySelectorAll("*")]
    .filter((el) => {
      if (!isVisible(el) || el.clientHeight < 120 || el.scrollHeight <= el.clientHeight + 24) return false;
      const overflowY = getComputedStyle(el).overflowY;
      return /auto|scroll|overlay/.test(overflowY) || el.scrollHeight > el.clientHeight + 80;
    })
    .sort((a, b) => {
      const score = (element) => {
        const overflowY = getComputedStyle(element).overflowY;
        const overflowScore = /auto|scroll|overlay/.test(overflowY) ? 100000 : 0;
        const linkScore = (element.querySelectorAll?.('a[href]').length || 0) * 100;
        return overflowScore + linkScore + element.scrollHeight - element.clientHeight;
      };
      return score(b) - score(a);
    })[0] || null;
}

function collectVisible(dialog, users, expected) {
  for (const anchor of dialog.querySelectorAll("a[href]")) {
    const username = usernameFromHref(anchor.getAttribute("href"));
    if (username) users.add(username);
  }
}

function setScrollTop(element, top) {
  if (typeof element.scrollTo === "function") element.scrollTo({ top, behavior: "auto" });
  else element.scrollTop = top;
  element.dispatchEvent(new Event("scroll", { bubbles: true }));
}

async function scanPass(dialog, users, expected, options) {
  let stableAtEnd = 0;
  let container = scrollContainer(dialog);
  if (!container) throw new Error("找不到列表滚动区域。");
  setScrollTop(container, options.direction > 0 ? 0 : container.scrollHeight);
  await sleep(options.initialWait);

  for (let stepIndex = 0; stepIndex < options.maxSteps; stepIndex++) {
    collectVisible(dialog, users, expected);
    if (options.onCheckpoint && stepIndex % 8 === 0) await options.onCheckpoint();
    container = scrollContainer(dialog) || container;
    const beforeSize = users.size;
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const distance = Math.max(260, Math.floor(container.clientHeight * options.stepRatio));
    const nextTop = options.direction > 0
      ? Math.min(maxTop, container.scrollTop + distance)
      : Math.max(0, container.scrollTop - distance);
    setScrollTop(container, nextTop);
    await sleep(options.delay);
    collectVisible(dialog, users, expected);

    const atEnd = options.direction > 0 ? nextTop >= maxTop - 4 : nextTop <= 4;
    stableAtEnd = atEnd && users.size === beforeSize ? stableAtEnd + 1 : 0;
    if (stableAtEnd >= options.stableLimit) {
      await sleep(options.endWait);
      collectVisible(dialog, users, expected);
      if (users.size === beforeSize) return;
      stableAtEnd = 0;
    }
  }
}

async function openList(kind) {
  await closeDialog();
  const link = statLink(kind);
  if (!link) throw new Error(`找不到${kind === "followers" ? "粉丝" : "关注"}入口，请打开自己的个人主页。`);
  const expected = displayedCount(link);
  link.click();
  for (let i = 0; i < 50 && !activeDialog(); i++) await sleep(100);
  const dialog = activeDialog();
  if (!dialog) throw new Error("列表弹窗没有打开。");
  await sleep(300);
  return { dialog, expected };
}

async function collectList(kind, options = {}) {
  const { dialog, expected } = await openList(kind);
  const seedMatchesCurrentCount = options.seedExpected === null
    || options.seedExpected === undefined
    || expected === null
    || Number(options.seedExpected) === Number(expected);
  const users = new Set(seedMatchesCurrentCount ? (options.seedUsers || []) : []);

  const saveCheckpoint = async () => {
    if (typeof options.onCheckpoint === "function") {
      await options.onCheckpoint([...users], expected);
    }
  };

  try {
    await scanPass(dialog, users, expected, {
      direction: 1, stepRatio: 0.78, delay: 300, initialWait: 450,
      endWait: 1000, stableLimit: 4, maxSteps: 260, onCheckpoint: saveCheckpoint
    });
    await saveCheckpoint();

    // One traversal per round. Retrying is controlled only by collectWithRetries.
  } finally {
    await saveCheckpoint();
    await closeDialog();
  }
  return { users: [...users], expected, complete: expected !== null && users.size === expected };
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function searchMembership(kind, candidates, onProgress = async () => {}) {
  const result = { found: [], absent: [], unknown: [] };
  if (!candidates.length) return result;
  const { dialog } = await openList(kind);
  const input = dialog.querySelector('input[placeholder*="搜索"], input[placeholder*="Search"], input');
  if (!input) {
    await closeDialog();
    result.unknown = [...candidates];
    return result;
  }
  try {
    for (const [index, username] of candidates.entries()) {
      await onProgress(`正在核验${kind === "followers" ? "粉丝" : "关注"}关系 ${index + 1}/${candidates.length}……`);
      let verdict = "unknown";
      let negativeResponses = 0;
      for (let attempt = 0; attempt < 2; attempt++) {
        setInputValue(input, "");
        await sleep(600);
        let changed = false;
        const observer = new MutationObserver(() => { changed = true; });
        observer.observe(dialog, { subtree: true, childList: true, characterData: true });
        setInputValue(input, username);
        let emptySamples = 0;
        try {
          for (let tick = 0; tick < 24; tick++) {
            await sleep(250);
            if (!dialog.isConnected || input.value.trim().toLowerCase() !== username) break;
            const busy = [...dialog.querySelectorAll('[role="progressbar"], [aria-busy="true"]')].some(isVisible);
            const found = [...dialog.querySelectorAll('a[href]')].some((anchor) =>
              isVisible(anchor) && usernameFromHref(anchor.getAttribute("href")) === username);
            if (found && !busy && tick >= 2) { verdict = "found"; break; }
            const empty = [...dialog.querySelectorAll('span, p, div')].some((el) =>
              isVisible(el) && /^(未找到用户|未找到结果|找不到用户|没有找到用户|没有找到结果|无结果|no results found\.?|no users found\.?|no results\.?)$/i.test((el.textContent || "").trim()));
            emptySamples = changed && empty && !busy && tick >= 3 ? emptySamples + 1 : 0;
            if (emptySamples >= 3) { negativeResponses++; break; }
          }
        } finally { observer.disconnect(); }
        if (verdict === "found") break;
        // A timeout is unknown. Only two explicit empty responses count as absent.
        if (negativeResponses === 0) break;
      }
      if (verdict !== "found" && negativeResponses === 2) verdict = "absent";
      result[verdict].push(username);
    }
  } finally {
    await closeDialog();
  }
  return result;
}

async function verifyFollowerCandidates(candidates) {
  const result = await searchMembership("followers", candidates);
  if (result.unknown.length) throw new Error(`${result.unknown.length} 个候选暂时无法核验，请稍后重试。`);
  return result.absent;
}

async function scanAll(onProgress = async () => {}) {
  const profile = usernameFromHref(location.href);
  if (!profile) throw new Error("请打开自己的 Instagram 个人主页。");
  const { scanCheckpoint: storedCheckpoint } = await chrome.storage.local.get("scanCheckpoint");
  const checkpointIsCurrent = storedCheckpoint?.profile === profile
    && Date.now() - new Date(storedCheckpoint.updatedAt || 0).getTime() < 24 * 60 * 60 * 1000;
  const checkpoint = checkpointIsCurrent
    ? storedCheckpoint
    : { version: 1, profile, following: null, followers: null, updatedAt: new Date().toISOString() };

  const saveCheckpoint = async (kind, users, expected) => {
    checkpoint[kind] = { users: [...new Set(users)].sort(), expected };
    checkpoint.phase = kind;
    checkpoint.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ scanCheckpoint: checkpoint });
  };

  async function collectWithRetries(kind) {
    const label = kind === "following" ? "关注" : "粉丝";
    // Old followers could hide a recent unfollow. Always read them anew.
    let seed = kind === "following" ? checkpoint.following : null;
    let result;
    for (let attempt = 0; attempt < MAX_SCAN_ROUNDS; attempt++) {
      if (attempt) {
        await onProgress(`${label}读取 ${result.users.length}/${result.expected ?? "?"}，5 秒后自动补扫（${attempt + 1}/${MAX_SCAN_ROUNDS}）……`);
        await sleep(RETRY_WAIT_MS);
      }
      await onProgress(`正在读取当前${label}列表（${attempt + 1}/${MAX_SCAN_ROUNDS}）……`);
      result = await collectList(kind, {
        seedUsers: seed?.users || [],
        seedExpected: seed?.expected,
        onCheckpoint: async (users, expected) => {
          await saveCheckpoint(kind, users, expected);
          await onProgress(`正在读取${label}：${users.length}/${expected ?? "?"}（${attempt + 1}/${MAX_SCAN_ROUNDS}）……`);
        }
      });
      if (acceptableCount(result)) break;
      seed = result;
    }
    if (!result.users.length && result.expected !== 0) throw new Error(`${label}列表未读到账号，进度已保留，请稍后重试。`);
    return result;
  }

  const followingResult = await collectWithRetries("following");
  let warning = "";
  if (!followingResult.complete) warning += `关注已读 ${followingResult.users.length}/${followingResult.expected ?? "?"}，${acceptableCount(followingResult) ? "缺口在 3 个容差内，已跳过补扫" : "未覆盖全部关注"}；`;

  await onProgress(`已读取 ${followingResult.users.length} 个关注，正在读取粉丝列表……`);
  const followersResult = await collectWithRetries("followers");
  const followerSet = new Set(followersResult.users);
  const rawCandidates = followingResult.users.filter((username) => !followerSet.has(username));
  if (!followersResult.complete) {
    warning += `粉丝列表读取 ${followersResult.users.length}/${followersResult.expected ?? "?"}，${acceptableCount(followersResult) ? "缺口在 3 个容差内，已进入核验" : "未读全"}；`;
  }
  await onProgress(`正在复核 ${rawCandidates.length} 个未互关候选……`);
  const followerCheck = await searchMembership("followers", rawCandidates, onProgress);
  // A resumed following list may contain an account the user has since unfollowed.
  const followingCheck = await searchMembership("following", followerCheck.absent, onProgress);
  const notFollowingBack = followingCheck.found;
  const unresolved = [...new Set([...followerCheck.unknown, ...followingCheck.unknown])].sort();
  if (unresolved.length) warning += `${unresolved.length} 个待确认，未计入未互关。`;
  const partial = !acceptableCount(followingResult) || !acceptableCount(followersResult) || unresolved.length > 0;

  return {
    profile,
    partial,
    unresolved,
    followers: followersResult.users,
    following: followingResult.users,
    followersExpected: followersResult.expected,
    followingExpected: followingResult.expected,
    countTolerance: COUNT_TOLERANCE,
    notFollowingBack: [...new Set(notFollowingBack)].sort(),
    followersComplete: followersResult.complete,
    followingComplete: followingResult.complete,
    warning
  };
}

let automaticRunning = false;

async function persistAutomaticResult(result) {
  const { latest: previous } = await chrome.storage.local.get("latest");
  const followers = [...new Set(result.followers)].sort();
  const following = [...new Set(result.following)].sort();
  const followerSet = new Set(followers);
  const previousFollowers = new Set(previous?.followers || []);
  const comparable = previous?.profile === result.profile && previous?.followersComplete && result.followersComplete;
  const unfollowed = comparable
    ? [...previousFollowers].filter((username) => !followerSet.has(username)).sort()
    : [];
  const latest = {
    profile: result.profile,
    partial: Boolean(result.partial),
    unresolved: result.unresolved || [],
    followersExpected: result.followersExpected ?? null,
    followingExpected: result.followingExpected ?? null,
    countTolerance: result.countTolerance ?? 0,
    at: new Date().toISOString(),
    followers,
    following,
    notFollowingBack: [...new Set(result.notFollowingBack || [])].sort(),
    unfollowed,
    hasPrevious: Boolean(comparable),
    followersComplete: Boolean(result.followersComplete),
    followingComplete: Boolean(result.followingComplete),
    warning: result.warning || ""
  };
  await chrome.storage.local.set({
    latest,
    scanState: {
      status: "complete",
      message: `${result.partial ? "部分完成" : "完成"}：${followers.length} 粉丝，${following.length} 关注，核验出 ${latest.notFollowingBack.length} 个未互关。`,
      finishedAt: latest.at
    }
  });
  if (!result.partial) await chrome.storage.local.remove("scanCheckpoint");
}

async function runAutomaticScan() {
  if (automaticRunning || manualRunning) throw new Error("已有扫描正在进行。");
  automaticRunning = true;
  const startedAt = new Date().toISOString();
  try {
    await chrome.storage.local.set({ scanState: { status: "running", message: "正在启动扫描……", startedAt } });
    const result = await scanAll(async (message) => {
      await chrome.storage.local.set({ scanState: { status: "running", message, startedAt, updatedAt: new Date().toISOString() } });
    });
    await persistAutomaticResult(result);
  } catch (error) {
    await closeDialog();
    await chrome.storage.local.set({
      scanState: {
        status: "error",
        message: error.message || String(error),
        finishedAt: new Date().toISOString()
      }
    });
  } finally {
    automaticRunning = false;
  }
}

let manualRunning = false;

function manualOverlay() {
  let overlay = document.getElementById("ig-follow-checker-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "ig-follow-checker-overlay";
  overlay.style.cssText = [
    "position:fixed", "right:24px", "bottom:24px", "z-index:2147483647",
    "width:320px", "padding:16px", "border-radius:12px", "background:#fff",
    "color:#1f2937", "box-shadow:0 8px 30px rgba(0,0,0,.28)",
    "font:14px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
  ].join(";");
  overlay.innerHTML = `
    <div style="font-size:17px;font-weight:700;margin-bottom:8px">Instagram 手动辅助扫描</div>
    <div data-role="status" style="margin-bottom:12px">准备中……</div>
    <button data-role="finish" style="border:0;border-radius:8px;padding:9px 12px;background:#e1306c;color:#fff;cursor:pointer">完成当前列表</button>
    <button data-role="cancel" style="border:0;border-radius:8px;padding:9px 12px;margin-left:6px;background:#e5e7eb;color:#374151;cursor:pointer">取消</button>
    <pre data-role="result" style="display:none;max-height:180px;overflow:auto;white-space:pre-wrap;background:#f3f4f6;padding:8px;border-radius:6px"></pre>`;
  document.documentElement.appendChild(overlay);
  return overlay;
}

function setManualStatus(text) {
  const overlay = manualOverlay();
  overlay.querySelector('[data-role="status"]').textContent = text;
}

async function manuallyCollect(kind, options = {}) {
  const { dialog, expected } = await openList(kind);
  const seedMatchesCurrentCount = options.seedExpected === null
    || options.seedExpected === undefined
    || expected === null
    || Number(options.seedExpected) === Number(expected);
  const users = new Set(seedMatchesCurrentCount ? (options.seedUsers || []) : []);
  const overlay = manualOverlay();
  const finish = overlay.querySelector('[data-role="finish"]');
  const cancel = overlay.querySelector('[data-role="cancel"]');
  const label = kind === "followers" ? "粉丝" : "关注";
  let cancelled = false;
  finish.style.display = "inline-block";
  finish.textContent = options.finishText || "完成当前列表";
  cancel.style.display = "inline-block";
  cancel.textContent = "取消";

  const update = () => {
    collectVisible(dialog, users, expected);
    setManualStatus(`请手动滚动${label}列表：已读取 ${users.size}/${expected ?? "?"}。滚到底后点击“${finish.textContent}”。`);
  };
  update();
  const observer = new MutationObserver(update);
  observer.observe(dialog, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  const timer = setInterval(update, 250);

  await new Promise((resolve) => {
    finish.onclick = () => {
      update();
      if (expected !== null && users.size < expected) {
        if (options.allowPartial) {
          resolve();
          return;
        }
        setManualStatus(`${label}尚未读完：${users.size}/${expected}。请继续向下滚动；若长期不增长，请稍后再试。`);
        return;
      }
      resolve();
    };
    cancel.onclick = () => {
      cancelled = true;
      resolve();
    };
  });

  clearInterval(timer);
  observer.disconnect();
  await closeDialog();
  if (cancelled) throw new Error("手动辅助扫描已取消。");
  return { users: [...users], expected, complete: expected === null || users.size === expected };
}

function showManualResult(status, lines = []) {
  const overlay = manualOverlay();
  const resultBox = overlay.querySelector('[data-role="result"]');
  setManualStatus(status);
  resultBox.style.display = lines.length ? "block" : "none";
  resultBox.textContent = lines.join("\n");
  overlay.querySelector('[data-role="finish"]').style.display = "none";
  const cancel = overlay.querySelector('[data-role="cancel"]');
  cancel.style.display = "inline-block";
  cancel.textContent = "关闭";
  cancel.onclick = () => overlay.remove();
}

async function buildFollowingLibrary() {
  if (manualRunning) throw new Error("已有扫描正在进行。");
  manualRunning = true;
  try {
    const scanned = await manuallyCollect("following", { allowPartial: true, finishText: "保存当前进度" });
    const { followingLibrary: previous } = await chrome.storage.local.get("followingLibrary");
    const merged = scanned.complete
      ? new Set(scanned.users)
      : new Set([...(previous?.users || []), ...scanned.users]);
    const expected = scanned.expected ?? previous?.expected ?? null;
    const followingLibrary = {
      users: [...merged].sort(),
      expected,
      complete: expected !== null && merged.size === expected,
      updatedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ followingLibrary });
    const missing = expected === null ? "?" : Math.max(0, expected - followingLibrary.users.length);
    const completionNote = followingLibrary.complete
      ? "关注库已完整。"
      : expected !== null && followingLibrary.users.length > expected
        ? `库中比页面计数多 ${followingLibrary.users.length - expected} 个，可能含已取消关注的旧账号，请清空后重建。`
        : `还缺 ${missing} 个，下次补扫会自动合并。`;
    showManualResult(
      `关注库已保存 ${followingLibrary.users.length}/${expected ?? "?"}。${completionNote}`,
      followingLibrary.users.slice(0, 20).map((username) => `@${username}`)
    );
  } catch (error) {
    showManualResult(error.message || String(error));
  } finally {
    manualRunning = false;
  }
}

async function compareFollowersWithLibrary() {
  if (manualRunning) throw new Error("已有扫描正在进行。");
  manualRunning = true;
  try {
    const { followingLibrary } = await chrome.storage.local.get("followingLibrary");
    if (!followingLibrary?.users?.length) throw new Error("请先建立本地关注库。");
    const followersResult = await manuallyCollect("followers", { allowPartial: true, finishText: "完成并对比" });
    const gap = followersResult.expected === null ? 0 : Math.max(0, followersResult.expected - followersResult.users.length);
    if (gap > 5) throw new Error(`粉丝列表仍缺 ${gap} 个，请继续滚动或稍后再试。`);

    const followerSet = new Set(followersResult.users);
    const rawCandidates = followingLibrary.users.filter((username) => !followerSet.has(username));
    setManualStatus(`正在复核 ${rawCandidates.length} 个未互关候选，请稍候……`);
    const notFollowingBack = await verifyFollowerCandidates(rawCandidates);
    const { latest: previous } = await chrome.storage.local.get("latest");
    const previousFollowers = new Set(previous?.followers || []);
    const unfollowed = previous && gap === 0
      ? [...previousFollowers].filter((username) => !followerSet.has(username)).sort()
      : [];
    const latest = {
      at: new Date().toISOString(),
      followers: [...followerSet].sort(),
      following: [...followingLibrary.users],
      notFollowingBack: [...new Set(notFollowingBack)].sort(),
      unfollowed,
      hasPrevious: Boolean(previous && gap === 0),
      libraryComplete: Boolean(followingLibrary.complete)
    };
    await chrome.storage.local.set({ latest });
    const libraryNote = followingLibrary.complete
      ? "关注库完整。"
      : `关注库为 ${followingLibrary.users.length}/${followingLibrary.expected ?? "?"}，结果可能漏掉尚未入库的账号。`;
    showManualResult(
      `对比完成：发现 ${latest.notFollowingBack.length} 个未互关。${libraryNote}`,
      latest.notFollowingBack.map((username) => `@${username}`)
    );
  } catch (error) {
    showManualResult(error.message || String(error));
  } finally {
    manualRunning = false;
  }
}

async function saveManualResult(followingResult, followersResult) {
  const followerSet = new Set(followersResult.users);
  const rawCandidates = followingResult.users.filter((username) => !followerSet.has(username));
  setManualStatus(`正在复核 ${rawCandidates.length} 个未互关候选，请稍候……`);
  const notFollowingBack = (await verifyFollowerCandidates(rawCandidates)).sort();
  const { latest: previous } = await chrome.storage.local.get("latest");
  const previousFollowers = new Set(previous?.followers || []);
  const unfollowed = previous && followersResult.complete
    ? [...previousFollowers].filter((username) => !followerSet.has(username)).sort()
    : [];
  const latest = {
    at: new Date().toISOString(),
    followers: [...new Set(followersResult.users)].sort(),
    following: [...new Set(followingResult.users)].sort(),
    notFollowingBack,
    unfollowed,
    hasPrevious: Boolean(previous && followersResult.complete),
    followersComplete: followersResult.complete,
    followingComplete: followingResult.complete
  };
  await chrome.storage.local.set({
    latest,
    scanState: {
      status: "complete",
      message: `完成：${latest.followers.length} 粉丝，${latest.following.length} 关注，${latest.notFollowingBack.length} 个未互关。`,
      finishedAt: latest.at
    }
  });
  return latest;
}

async function startManualWorkflow() {
  if (manualRunning) throw new Error("已有手动辅助扫描正在进行。");
  manualRunning = true;
  const overlay = manualOverlay();
  const resultBox = overlay.querySelector('[data-role="result"]');
  resultBox.style.display = "none";
  try {
    const profile = usernameFromHref(location.href);
    const { scanCheckpoint } = await chrome.storage.local.get("scanCheckpoint");
    const checkpointIsCurrent = scanCheckpoint?.profile === profile
      && Date.now() - new Date(scanCheckpoint.updatedAt || 0).getTime() < 24 * 60 * 60 * 1000;
    const resumeCheckpoint = checkpointIsCurrent ? scanCheckpoint : null;
    await chrome.storage.local.set({
      scanState: {
        status: "running",
        message: "手动辅助扫描正在进行……",
        startedAt: new Date().toISOString()
      }
    });
    setManualStatus("第一步：即将打开关注列表。");
    const followingResult = await manuallyCollect("following", {
      allowPartial: true,
      finishText: "保存并继续",
      seedUsers: resumeCheckpoint?.following?.users || [],
      seedExpected: resumeCheckpoint?.following?.expected
    });
    await chrome.storage.local.set({
      scanCheckpoint: {
        ...(resumeCheckpoint || { version: 1, profile }),
        profile,
        phase: "following",
        following: { users: [...new Set(followingResult.users)].sort(), expected: followingResult.expected },
        updatedAt: new Date().toISOString()
      }
    });
    setManualStatus("关注列表已完成。第二步：即将打开粉丝列表。");
    await sleep(500);
    const followersResult = await manuallyCollect("followers", {
      allowPartial: true,
      finishText: "完成并对比",
      seedUsers: resumeCheckpoint?.followers?.users || [],
      seedExpected: resumeCheckpoint?.followers?.expected
    });
    const followerGap = followersResult.expected === null
      ? 0
      : Math.max(0, followersResult.expected - followersResult.users.length);
    if (followerGap > 5) throw new Error(`粉丝列表仍缺 ${followerGap} 个，请继续滚动或稍后重试。`);
    const latest = await saveManualResult(followingResult, followersResult);
    await chrome.storage.local.remove("scanCheckpoint");
    const partialNote = followingResult.complete ? "" : ` 关注列表保存为 ${followingResult.users.length}/${followingResult.expected ?? "?"}。`;
    setManualStatus(`扫描完成：${latest.followers.length} 粉丝，${latest.following.length} 关注，${latest.notFollowingBack.length} 个未互关。${partialNote}`);
    resultBox.style.display = "block";
    resultBox.textContent = latest.notFollowingBack.length
      ? latest.notFollowingBack.map((username) => `@${username}`).join("\n")
      : "暂无未互关账号";
    overlay.querySelector('[data-role="finish"]').style.display = "none";
    const cancel = overlay.querySelector('[data-role="cancel"]');
    cancel.textContent = "关闭";
    cancel.onclick = () => overlay.remove();
  } catch (error) {
    await chrome.storage.local.set({
      scanState: {
        status: "error",
        message: error.message || String(error),
        finishedAt: new Date().toISOString()
      }
    });
    setManualStatus(error.message || String(error));
    overlay.querySelector('[data-role="finish"]').style.display = "none";
    const cancel = overlay.querySelector('[data-role="cancel"]');
    cancel.textContent = "关闭";
    cancel.onclick = () => overlay.remove();
  } finally {
    manualRunning = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_CONTENT_VERSION") {
    sendResponse({ ok: true, version: CONTENT_VERSION });
    return;
  }
  if (message?.type === "BUILD_FOLLOWING_LIBRARY") {
    if (manualRunning) {
      sendResponse({ ok: false, error: "已有扫描正在进行。" });
      return;
    }
    sendResponse({ ok: true });
    buildFollowingLibrary();
    return;
  }
  if (message?.type === "COMPARE_WITH_LIBRARY") {
    if (manualRunning) {
      sendResponse({ ok: false, error: "已有扫描正在进行。" });
      return;
    }
    sendResponse({ ok: true });
    compareFollowersWithLibrary();
    return;
  }
  if (message?.type === "START_MANUAL") {
    if (manualRunning) {
      sendResponse({ ok: false, error: "已有手动辅助扫描正在进行。" });
      return;
    }
    sendResponse({ ok: true });
    startManualWorkflow();
    return;
  }
  if (message?.type !== "SCAN") return;
  if (automaticRunning || manualRunning) {
    sendResponse({ ok: false, error: "已有扫描正在进行。" });
    return;
  }
  sendResponse({ ok: true, started: true });
  runAutomaticScan();
});
