function localTimestamp(date) {
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const offset = -date.getTimezoneOffset();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function buildTextExport(snapshot, exportedAt = new Date()) {
  if (!snapshot) throw new Error("尚无扫描结果可导出。");
  const scanDate = new Date(snapshot.at);
  const validScanDate = !Number.isNaN(scanDate.getTime());
  const section = (label, users) => [
    "", `${label}（${users?.length || 0}）`,
    ...(users?.length ? users.map((u) => `@${u}`) : ["无"])
  ];
  const gap = (expected, users) => Number.isInteger(expected) ? String(expected - (users?.length || 0)) : "未知";
  const text = [
    "Instagram 差集扫描结果",
    `账号：${snapshot.profile ? '@' + snapshot.profile : '未记录'}`,
    `扫描完成时间（本地，含时区）：${validScanDate ? localTimestamp(scanDate) : '未记录'}`,
    `扫描完成时间（UTC）：${validScanDate ? scanDate.toISOString() : '未记录'}`,
    `导出时间（本地，含时区）：${localTimestamp(exportedAt)}`,
    `导出时间（UTC）：${exportedAt.toISOString()}`,
    `状态：${snapshot.partial ? '部分完成' : '完成（按本次容差及核验规则）'}`,
    `容差：${snapshot.countTolerance ?? '未记录'} 个`,
    `关注：实际读取 ${snapshot.following?.length || 0} / 页面显示 ${snapshot.followingExpected ?? '未记录'}；差额 ${gap(snapshot.followingExpected, snapshot.following)}`,
    `粉丝：实际读取 ${snapshot.followers?.length || 0} / 页面显示 ${snapshot.followersExpected ?? '未记录'}；差额 ${gap(snapshot.followersExpected, snapshot.followers)}`,
    `说明：${snapshot.warning || '无'}`,
    "容差仅影响是否继续补扫；未读取到的账号可能导致漏报，搜索超时不视为未互关。",
    ...section("已核验未互关", snapshot.notFollowingBack),
    ...section("待确认（不计入未互关）", snapshot.unresolved),
    ...(snapshot.hasPrevious ? section("本次从粉丝中消失", snapshot.unfollowed) : ["", "本次从粉丝中消失：暂无可比较的历史快照"]),
    ...section("本次读取的关注账号", snapshot.following),
    ...section("本次读取的粉丝账号", snapshot.followers),
    ""
  ].join("\r\n");
  const profile = (snapshot.profile || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamp = (validScanDate ? scanDate : exportedAt).toISOString().replace(/[:.]/g, "-");
  return { filename: `Instagram-${profile}-${stamp}.txt`, text };
}

if (typeof module !== "undefined") module.exports = { buildTextExport, localTimestamp };
