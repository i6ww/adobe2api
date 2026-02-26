document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const LOGS_POLL_MS = 10000;

  function isLogsTabActive() {
    const logsPane = document.getElementById("logs");
    return Boolean(logsPane && logsPane.classList.contains("active"));
  }

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active");
      if (btn.dataset.target === "logs") {
        loadLogs();
      } else if (logsAutoTimer) {
        clearTimeout(logsAutoTimer);
        logsAutoTimer = null;
      }
    });
  });

  // Token Management
  const tokenInput = document.getElementById("tokenInput");
  const addBtn = document.getElementById("addBtn");
  const addMsg = document.getElementById("addMsg");
  const openAddTokenModalBtn = document.getElementById("openAddTokenModalBtn");
  const tokenModal = document.getElementById("tokenModal");
  const tokenModalCloseBtn = document.getElementById("tokenModalCloseBtn");
  const openRefreshModalBtn = document.getElementById("openRefreshModalBtn");
  const refreshModal = document.getElementById("refreshModal");
  const refreshModalCloseBtn = document.getElementById("refreshModalCloseBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const refreshCreditsBatchBtn = document.getElementById("refreshCreditsBatchBtn");
  const tbody = document.querySelector("#tokenTable tbody");

  const STATUS_MAP = {
    "active": "生效中",
    "exhausted": "额度耗尽",
    "invalid": "已失效",
    "error": "请求异常",
    "disabled": "已禁用"
  };

  async function loadTokens() {
    try {
      const res = await fetch("/api/v1/tokens");
      const data = await res.json();
      renderTable(data.tokens || []);
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="color: #ffb4bc;">加载失败</td></tr>`;
    }
  }

  function openDialog(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("open");
    modalEl.setAttribute("aria-hidden", "false");
  }

  function closeDialog(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("open");
    modalEl.setAttribute("aria-hidden", "true");
  }

  function formatExpiry(token) {
    if (!token || token.expires_at == null) {
      return '<span style="color:#7f96ad;">未知</span>';
    }
    const remain = Number(token.remaining_seconds || 0);
    const abs = Math.abs(remain);
    const days = Math.floor(abs / 86400);
    const hours = Math.floor((abs % 86400) / 3600);
    const mins = Math.floor((abs % 3600) / 60);
    const rel = days > 0 ? `${days}天${hours}小时` : `${hours}小时${mins}分`;
    if (remain <= 0 || token.is_expired) {
      return `<span style="color:#ffb4bc;">已过期 (${token.expires_at_text || '-'})</span>`;
    }
    if (remain < 3600 * 6) {
      return `<span style="color:#ffca58;">剩余 ${rel}<br><span style="color:#7f96ad;">${token.expires_at_text || '-'}</span></span>`;
    }
    return `<span style="color:#a8bfd8;">剩余 ${rel}<br><span style="color:#7f96ad;">${token.expires_at_text || '-'}</span></span>`;
  }

  function formatCredits(token) {
    const available = Number(token?.credits_available);
    const total = Number(token?.credits_total);
    const availableUntil = String(token?.credits_available_until || "").trim();
    const err = String(token?.credits_error || "").trim();

    if (err) {
      return `<span style="color:#ffb4bc;">刷新失败</span><br><span style="color:#7f96ad;">${escapeHtml(err)}</span>`;
    }
    if (!Number.isFinite(available) || !Number.isFinite(total)) {
      return `<span style="color:#7f96ad;">未获取</span>`;
    }

    const resetText = availableUntil ? new Date(availableUntil).toLocaleString() : "-";
    return `<span style="color:#a8bfd8;">${available} / ${total}</span><br><span style="color:#7f96ad;">重置 ${resetText}</span>`;
  }

  function renderTable(tokens) {
    if (!tokens.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">当前没有可用的 Token，请在上方添加。</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    tokens.forEach(t => {
      const tr = document.createElement("tr");

      const statusClass = `status-${t.status.toLowerCase()}`;
      const isStatusActive = t.status === "active";
      const isFrozen = t.status === "exhausted" || t.status === "invalid";
      const displayStatus = STATUS_MAP[t.status.toLowerCase()] || t.status;
      const tokenProfileName = String(t.refresh_profile_name || "").trim();
      const tokenProfileEmail = String(t.refresh_profile_email || "").trim();
      const refreshProfileNameSafe = escapeHtml(tokenProfileName);
      const refreshProfileEmailSafe = escapeHtml(tokenProfileEmail);
      const accountName = refreshProfileNameSafe || '<span style="color:#7f96ad;">手动 Token</span>';
      const accountEmail = refreshProfileEmailSafe || '<span style="color:#7f96ad;">-</span>';
      const autoEnabled = t.auto_refresh && t.auto_refresh_enabled !== false;
      const autoRefreshCell = t.auto_refresh
        ? `<div style="display: flex; align-items: center;"><button class="switch-btn ${autoEnabled ? "on" : "off"}" onclick="toggleAutoRefresh('${t.id}', ${autoEnabled ? "false" : "true"})" title="${autoEnabled ? "点击关闭自动刷新" : "点击开启自动刷新"}"><span class="switch-knob"></span></button><span class="switch-text">${autoEnabled ? "开启" : "关闭"}</span></div>`
        : `<div style="display: flex; align-items: center;"><button class="switch-btn off" disabled title="手动 token 不支持自动刷新"><span class="switch-knob"></span></button><span class="switch-text" style="color:#7f96ad;">手动</span></div>`;
      
      const d = new Date(t.added_at * 1000);
      const dateStr = d.toLocaleString();

      const refreshTokenBtn = t.auto_refresh
        ? `<button class="action-mini" onclick="refreshToken('${t.id}')">刷新</button>`
        : `<button class="action-mini" disabled title="仅自动刷新 token 支持刷新">刷新</button>`;
      const statusBtn = isFrozen
        ? `<button class="action-mini" disabled title="额度耗尽或已失效 token 不可启用">不可启用</button>`
        : `<button class="action-mini" onclick="toggleToken('${t.id}', '${isStatusActive ? 'disabled' : 'active'}')">${isStatusActive ? '禁用' : '启用'}</button>`;
      const actionsGrid = `
        <div class="action-btns">
          <button class="action-mini" onclick="refreshTokenCredits('${t.id}')">积分</button>
          ${refreshTokenBtn}
          ${statusBtn}
          <button class="action-mini danger" onclick="deleteToken('${t.id}')">删除</button>
        </div>
      `;

      tr.innerHTML = `
        <td style="color: #a8bfd8; font-size: 12px;" title="添加时间: ${dateStr}">${accountName}<br>${accountEmail}</td>
        <td class="token-val">${t.value}</td>
        <td><span class="status-badge ${statusClass}">${displayStatus}</span></td>
        <td>${autoRefreshCell}</td>
        <td style="font-size:12px; line-height:1.35;">${formatCredits(t)}</td>
        <td style="color: ${t.fails > 0 ? '#ffb4bc' : '#a8bfd8'};">${t.fails}</td>
        <td style="font-size:12px; line-height:1.35;">${formatExpiry(t)}</td>
        <td>${actionsGrid}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  addBtn.addEventListener("click", async () => {
    const raw = String(tokenInput.value || "");
    const tokens = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!tokens.length) {
      showMsg(addMsg, "请先输入 Token 内容", true);
      return;
    }

    addBtn.disabled = true;
    try {
      const endpoint = tokens.length > 1 ? "/api/v1/tokens/batch" : "/api/v1/tokens";
      const payload = tokens.length > 1 ? { tokens } : { token: tokens[0] };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        tokenInput.value = "";
        if (tokens.length > 1) {
          const data = await res.json();
          const addedCount = Number(data?.added_count || 0);
          showMsg(addMsg, `批量添加成功（${addedCount} 个）`, false);
        } else {
          showMsg(addMsg, "添加成功", false);
        }
        loadTokens();
        closeDialog(tokenModal);
      } else {
        let detail = "添加失败，请重试";
        try {
          const body = await res.json();
          detail = body.detail || detail;
        } catch (_) {
          // ignore json parse errors
        }
        showMsg(addMsg, detail, true);
      }
    } catch (err) {
      showMsg(addMsg, err.message, true);
    }
    addBtn.disabled = false;
  });

  refreshBtn.addEventListener("click", loadTokens);

  if (openAddTokenModalBtn) {
    openAddTokenModalBtn.addEventListener("click", () => openDialog(tokenModal));
  }
  if (tokenModalCloseBtn) {
    tokenModalCloseBtn.addEventListener("click", () => closeDialog(tokenModal));
  }
  if (tokenModal) {
    tokenModal.addEventListener("click", (event) => {
      if (event.target === tokenModal) closeDialog(tokenModal);
    });
  }

  if (openRefreshModalBtn) {
    openRefreshModalBtn.addEventListener("click", async () => {
      await loadRefreshProfiles();
      openDialog(refreshModal);
    });
  }
  if (refreshModalCloseBtn) {
    refreshModalCloseBtn.addEventListener("click", () => closeDialog(refreshModal));
  }
  if (refreshModal) {
    refreshModal.addEventListener("click", (event) => {
      if (event.target === refreshModal) closeDialog(refreshModal);
    });
  }

  window.deleteToken = async (id) => {
    if (!confirm("确定要删除这个 Token 吗？")) return;
    try {
      await fetch(`/api/v1/tokens/${id}`, { method: "DELETE" });
      loadTokens();
    } catch (err) {
      alert("删除失败");
    }
  };

  window.toggleToken = async (id, newStatus) => {
    try {
      const res = await fetch(`/api/v1/tokens/${id}/status?status=${newStatus}`, { method: "PUT" });
      if (!res.ok) {
        const text = await res.text();
        alert(`状态更新失败: ${text}`);
        return;
      }
      loadTokens();
    } catch (err) {
      alert("状态更新失败");
    }
  };

  window.refreshToken = async (id) => {
    try {
      const res = await fetch(`/api/v1/tokens/${id}/refresh`, { method: "POST" });
      if (!res.ok) {
        let detail = "刷新失败";
        try {
          const body = await res.json();
          detail = body.detail || JSON.stringify(body);
        } catch (_) {
          detail = await res.text();
        }
        alert(`刷新失败: ${detail || "unknown error"}`);
        return;
      }
      showMsg(refreshMsg, "刷新成功", false);
      await loadTokens();
      await loadRefreshProfiles();
    } catch (err) {
      alert("刷新失败");
    }
  };

  window.refreshTokenCredits = async (id) => {
    try {
      const res = await fetch(`/api/v1/tokens/${id}/credits/refresh`, { method: "POST" });
      if (!res.ok) {
        let detail = "刷新积分失败";
        try {
          const body = await res.json();
          detail = body.detail || JSON.stringify(body);
        } catch (_) {
          detail = await res.text();
        }
        alert(detail || "刷新积分失败");
        return;
      }
      await loadTokens();
    } catch (err) {
      alert("刷新积分失败");
    }
  };

  window.toggleAutoRefresh = async (id, enabled) => {
    try {
      const res = await fetch(`/api/v1/tokens/${id}/auto-refresh?enabled=${enabled ? "true" : "false"}`, {
        method: "PUT"
      });
      if (!res.ok) {
        let detail = "自动刷新设置失败";
        try {
          const body = await res.json();
          detail = body.detail || JSON.stringify(body);
        } catch (_) {
          detail = await res.text();
        }
        alert(detail || "自动刷新设置失败");
        return;
      }
      await loadTokens();
      await loadRefreshProfiles();
    } catch (err) {
      alert("自动刷新设置失败");
    }
  };

  if (refreshCreditsBatchBtn) {
    refreshCreditsBatchBtn.addEventListener("click", async () => {
      refreshCreditsBatchBtn.disabled = true;
      try {
        const res = await fetch("/api/v1/tokens/credits/refresh-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          let detail = "批量刷新积分失败";
          try {
            const body = await res.json();
            detail = body.detail || JSON.stringify(body);
          } catch (_) {
            detail = await res.text();
          }
          alert(detail || "批量刷新积分失败");
          return;
        }
        const data = await res.json();
        const ok = Number(data.refreshed_count || 0);
        const fail = Number(data.failed_count || 0);
        alert(`批量刷新积分完成：成功 ${ok}，失败 ${fail}`);
        await loadTokens();
      } catch (err) {
        alert("批量刷新积分失败");
      } finally {
        refreshCreditsBatchBtn.disabled = false;
      }
    });
  }

  // Config Management
  const confApiKey = document.getElementById("confApiKey");
  const confUseProxy = document.getElementById("confUseProxy");
  const confProxy = document.getElementById("confProxy");
  const confGenerateTimeout = document.getElementById("confGenerateTimeout");
  const confRetryEnabled = document.getElementById("confRetryEnabled");
  const confRetryMaxAttempts = document.getElementById("confRetryMaxAttempts");
  const confRetryBackoffSeconds = document.getElementById("confRetryBackoffSeconds");
  const confRetryOnStatusCodes = document.getElementById("confRetryOnStatusCodes");
  const confRetryOnErrorTypes = document.getElementById("confRetryOnErrorTypes");
  const confTokenRotationStrategy = document.getElementById("confTokenRotationStrategy");
  const confRefreshIntervalHours = document.getElementById("confRefreshIntervalHours");
  const saveConfigBtn = document.getElementById("saveConfigBtn");
  const configMsg = document.getElementById("configMsg");
  const refreshBundleInput = document.getElementById("refreshBundleInput");
  const refreshBundleFile = document.getElementById("refreshBundleFile");
  const importRefreshBtn = document.getElementById("importRefreshBtn");
  const refreshProfiles = document.getElementById("refreshProfiles");
  const refreshMsg = document.getElementById("refreshMsg");
  let latestRefreshProfiles = [];
  let logsAutoTimer = null;

  // Logs
  const logsTbody = document.querySelector("#logsTable tbody");
  const refreshLogsBtn = document.getElementById("refreshLogsBtn");
  const clearLogsBtn = document.getElementById("clearLogsBtn");
  const logStatsRange = document.getElementById("logStatsRange");
  const logStatsUpdatedAt = document.getElementById("logStatsUpdatedAt");
  const logsStatsImageCount = document.getElementById("logsStatsImageCount");
  const logsStatsVideoCount = document.getElementById("logsStatsVideoCount");
  const logsStatsTotalCount = document.getElementById("logsStatsTotalCount");
  const logsStatsFailCount = document.getElementById("logsStatsFailCount");
  const previewModal = document.getElementById("previewModal");
  const previewContent = document.getElementById("previewContent");
  const previewCloseBtn = document.getElementById("previewCloseBtn");
  const previewDownloadBtn = document.getElementById("previewDownloadBtn");

  async function loadConfig() {
    try {
      const res = await fetch("/api/v1/config");
      if (res.ok) {
        const data = await res.json();
        confApiKey.value = data.api_key || "";
        confUseProxy.checked = data.use_proxy || false;
        confProxy.value = data.proxy || "";
        confGenerateTimeout.value = Number(data.generate_timeout || 300);
        confRetryEnabled.checked = Boolean(data.retry_enabled ?? true);
        confRetryMaxAttempts.value = Number(data.retry_max_attempts || 3);
        confRetryBackoffSeconds.value = Number(data.retry_backoff_seconds ?? 1.0);
        confRetryOnStatusCodes.value = Array.isArray(data.retry_on_status_codes)
          ? data.retry_on_status_codes.join(",")
          : "429,451,500,502,503,504";
        confRetryOnErrorTypes.value = Array.isArray(data.retry_on_error_types)
          ? data.retry_on_error_types.join(",")
          : "timeout,connection,proxy";
        confTokenRotationStrategy.value = String(data.token_rotation_strategy || "round_robin");
        confRefreshIntervalHours.value = Number(data.refresh_interval_hours || 15);
      }
    } catch (err) {
      console.error("加载配置失败", err);
    }
  }

  saveConfigBtn.addEventListener("click", async () => {
    saveConfigBtn.disabled = true;
    try {
      // 保留未在此页面显示的配置项
      const currentRes = await fetch("/api/v1/config");
      const currentData = await currentRes.json();
      
      const payload = {
        ...currentData,
        api_key: confApiKey.value.trim(),
        use_proxy: confUseProxy.checked,
        proxy: confProxy.value.trim(),
        generate_timeout: Math.max(1, Number(confGenerateTimeout.value || 300)),
        retry_enabled: confRetryEnabled.checked,
        retry_max_attempts: Math.max(1, Math.min(10, Number(confRetryMaxAttempts.value || 3))),
        retry_backoff_seconds: Math.max(0, Math.min(30, Number(confRetryBackoffSeconds.value || 1))),
        retry_on_status_codes: String(confRetryOnStatusCodes.value || "")
          .split(",")
          .map(s => Number(String(s).trim()))
          .filter(n => Number.isInteger(n) && n >= 100 && n <= 599),
        retry_on_error_types: String(confRetryOnErrorTypes.value || "")
          .split(",")
          .map(s => String(s).trim().toLowerCase())
          .filter(Boolean),
        token_rotation_strategy: String(confTokenRotationStrategy.value || "round_robin").trim() || "round_robin",
        refresh_interval_hours: Number(confRefreshIntervalHours.value || 15),
      };

      if (!Number.isInteger(payload.refresh_interval_hours) || payload.refresh_interval_hours < 1 || payload.refresh_interval_hours > 24) {
        throw new Error("自动刷新间隔必须是 1-24 的整数小时");
      }
      if (!Number.isInteger(payload.retry_max_attempts) || payload.retry_max_attempts < 1 || payload.retry_max_attempts > 10) {
        throw new Error("最大尝试次数必须是 1-10 的整数");
      }
      if (!Number.isFinite(payload.retry_backoff_seconds) || payload.retry_backoff_seconds < 0 || payload.retry_backoff_seconds > 30) {
        throw new Error("重试退避基数必须是 0-30 的数字");
      }
      if (!["round_robin", "random"].includes(payload.token_rotation_strategy)) {
        throw new Error("Token 轮换策略无效");
      }

      const res = await fetch("/api/v1/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showMsg(configMsg, "配置已保存", false);
      } else {
        showMsg(configMsg, "保存失败，请检查服务状态", true);
      }
    } catch (err) {
      showMsg(configMsg, err.message, true);
    }
    saveConfigBtn.disabled = false;
  });

  function formatTs(ts) {
    if (!ts) return "-";
    const d = new Date(Number(ts) * 1000);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncateText(value, maxLen) {
    const text = String(value || "");
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}...`;
  }

  function renderRefreshProfiles(items) {
    if (!refreshProfiles) return;
    if (!Array.isArray(items) || !items.length) {
      refreshProfiles.innerHTML = "<div>暂无自动刷新配置</div>";
      return;
    }
    const rows = items.map((item) => {
      const state = item.state || {};
      const enabled = Boolean(item.enabled);
      const fullAccountName = String(item.account?.display_name || item.name || "-");
      const accountName = escapeHtml(truncateText(fullAccountName, 18));
      const accountEmail = escapeHtml(item.account?.email || "-");
      const errText = state.last_error ? escapeHtml(state.last_error) : "-";
      return `
        <tr>
          <td style="white-space: nowrap; color: #e7f1fd;" title="${escapeHtml(fullAccountName)}">${accountName}</td>
          <td style="color:#a8bfd8;">${accountEmail}</td>
          <td><span class="status-badge ${enabled ? "status-active" : "status-disabled"}">${enabled ? "启用" : "停用"}</span></td>
          <td style="color:#a8bfd8;">${state.last_success_at_text || formatTs(state.last_success_at)}</td>
          <td style="max-width: 280px; color:#a8bfd8;" title="${errText}">${errText}</td>
          <td class="action-btns">
            <button class="danger" onclick="deleteRefreshProfileById('${item.id}')">删除</button>
          </td>
        </tr>
      `;
    });
    refreshProfiles.innerHTML = `
      <div style="margin-bottom: 8px; color:#7f96ad;">共 ${items.length} 个刷新配置</div>
      <div class="table-wrapper">
        <table class="refresh-profiles-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>邮箱</th>
              <th>状态</th>
              <th>最近成功</th>
              <th>最近错误</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadRefreshProfiles() {
    try {
      const res = await fetch("/api/v1/refresh-profiles");
      if (!res.ok) throw new Error("状态加载失败");
      const data = await res.json();
      latestRefreshProfiles = Array.isArray(data.profiles) ? data.profiles : [];
      renderRefreshProfiles(latestRefreshProfiles);
    } catch (err) {
      latestRefreshProfiles = [];
      renderRefreshProfiles([]);
    }
  }

  async function importRefreshBundle() {
    const text = String(refreshBundleInput?.value || "").trim();
    if (!text) {
      showMsg(refreshMsg, "请先粘贴或上传 JSON", true);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      showMsg(refreshMsg, "JSON 格式错误", true);
      return;
    }

    const toBatchItems = (value) => {
      if (Array.isArray(value)) {
        return value.map((item, idx) => {
          if (!item || typeof item !== "object") {
            throw new Error(`第 ${idx + 1} 项不是对象`);
          }
          if (item.bundle && typeof item.bundle === "object") {
            return {
              bundle: item.bundle,
              name: String(item.name || "").trim() || null,
            };
          }
          return {
            bundle: item,
            name: null,
          };
        });
      }

      if (value && typeof value === "object" && Array.isArray(value.items)) {
        return toBatchItems(value.items);
      }

      if (value && typeof value === "object") {
        return [
          {
            bundle: value,
            name: null,
          },
        ];
      }
      throw new Error("导入 JSON 必须是对象或数组");
    };

    let items = [];
    try {
      items = toBatchItems(parsed);
    } catch (err) {
      showMsg(refreshMsg, err.message || "导入数据格式错误", true);
      return;
    }

    if (!items.length) {
      showMsg(refreshMsg, "未找到可导入的 bundle", true);
      return;
    }

    try {
      const endpoint = items.length > 1
        ? "/api/v1/refresh-profiles/import-batch"
        : "/api/v1/refresh-profiles/import";
      const payload = items.length > 1
        ? { items }
        : { bundle: items[0].bundle, name: items[0].name || null };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        let detailText = "导入失败";
        try {
          const body = await res.json();
          const detail = body?.detail;
          if (typeof detail === "string") {
            detailText = detail;
          } else if (detail && typeof detail === "object") {
            const failedCount = Number(detail.failed_count || 0);
            const refreshFailedCount = Number(detail.refresh_failed_count || 0);
            detailText = `导入失败（成功 ${Number(detail.imported_count || 0)}，导入失败 ${failedCount}，刷新失败 ${refreshFailedCount}）`;
          }
        } catch (_) {
          const txt = await res.text();
          if (txt) detailText = txt;
        }
        throw new Error(detailText);
      }
      const result = await res.json();
      if (items.length > 1) {
        const okCount = Number(result.imported_count || 0);
        const failedCount = Number(result.failed_count || 0);
        const refreshFailedCount = Number(result.refresh_failed_count || 0);
        showMsg(
          refreshMsg,
          `批量导入完成：成功 ${okCount}，导入失败 ${failedCount}，刷新失败 ${refreshFailedCount}`,
          failedCount > 0 || refreshFailedCount > 0
        );
      } else {
        const refreshError = String(result.refresh_error || "").trim();
        if (refreshError) {
          showMsg(refreshMsg, `导入成功，但自动刷新失败：${refreshError}`, true);
        } else {
          showMsg(refreshMsg, "导入成功，并已自动刷新", false);
        }
      }
      if (refreshBundleInput) refreshBundleInput.value = "";
      if (refreshBundleFile) refreshBundleFile.value = "";
      await loadRefreshProfiles();
    } catch (err) {
      showMsg(refreshMsg, err.message || "导入失败", true);
    }
  }

  async function setRefreshProfileEnabled(profileId, enabled) {
    try {
      const res = await fetch(`/api/v1/refresh-profiles/${encodeURIComponent(profileId)}/enabled`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: Boolean(enabled) }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "状态更新失败");
      }
      showMsg(refreshMsg, "状态更新成功", false);
      await loadRefreshProfiles();
    } catch (err) {
      showMsg(refreshMsg, err.message || "状态更新失败", true);
    }
  }

  async function deleteRefreshProfile(profileId) {
    if (!confirm("确定要删除这个自动刷新配置吗？")) return;
    try {
      const res = await fetch(`/api/v1/refresh-profiles/${encodeURIComponent(profileId)}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "删除失败");
      }
      showMsg(refreshMsg, "删除成功", false);
      await loadRefreshProfiles();
      await loadTokens();
    } catch (err) {
      showMsg(refreshMsg, err.message || "删除失败", true);
    }
  }

  window.deleteRefreshProfileById = async (id) => {
    await deleteRefreshProfile(String(id || ""));
  };

  if (refreshBundleFile) {
    refreshBundleFile.addEventListener("change", async () => {
      const files = refreshBundleFile.files ? Array.from(refreshBundleFile.files) : [];
      if (!files.length) return;
      try {
        if (files.length === 1) {
          const text = await files[0].text();
          if (refreshBundleInput) refreshBundleInput.value = text;
          return;
        }

        const items = [];
        for (const file of files) {
          const raw = await file.text();
          const parsed = JSON.parse(raw);
          const baseName = String(file.name || "")
            .replace(/\.json$/i, "")
            .trim();
          items.push({
            name: baseName || null,
            bundle: parsed,
          });
        }
        if (refreshBundleInput) {
          refreshBundleInput.value = JSON.stringify(items, null, 2);
        }
      } catch (err) {
        showMsg(refreshMsg, "读取文件失败", true);
      }
    });
  }

  if (importRefreshBtn) importRefreshBtn.addEventListener("click", importRefreshBundle);
  // profile operation handlers are attached as window methods above.

  async function loadLogs() {
    if (!logsTbody) return;
    try {
      const rangeValue = logStatsRange ? String(logStatsRange.value || "today") : "today";
      const [logsResult, statsResult] = await Promise.allSettled([
        fetch("/api/v1/logs?limit=200"),
        fetch(`/api/v1/logs/stats?range=${encodeURIComponent(rangeValue)}`),
      ]);

      if (logsResult.status !== "fulfilled" || !logsResult.value.ok) {
        throw new Error("加载日志失败");
      }

      const logsData = await logsResult.value.json();
      renderLogs(logsData.logs || []);

      if (statsResult.status === "fulfilled" && statsResult.value.ok) {
        const statsData = await statsResult.value.json();
        renderLogStats(statsData);
      } else {
        renderLogStats(null);
      }
    } catch (err) {
      logsTbody.innerHTML = `<tr><td colspan="9" class="empty-state" style="color: #ffb4bc;">${err.message || "日志加载失败"}</td></tr>`;
      renderLogStats(null);
    }
  }

  function renderLogStats(stats) {
    const imageCount = Number(stats?.generated_images || 0);
    const videoCount = Number(stats?.generated_videos || 0);
    const totalCount = Number(stats?.total_requests || 0);
    const failCount = Number(stats?.failed_requests || 0);

    if (logsStatsImageCount) logsStatsImageCount.textContent = String(imageCount);
    if (logsStatsVideoCount) logsStatsVideoCount.textContent = String(videoCount);
    if (logsStatsTotalCount) logsStatsTotalCount.textContent = String(totalCount);
    if (logsStatsFailCount) logsStatsFailCount.textContent = String(failCount);

    if (!logStatsUpdatedAt) return;
    if (!stats) {
      logStatsUpdatedAt.textContent = "统计信息暂不可用";
      return;
    }

    const selectedLabel = logStatsRange?.selectedOptions?.[0]?.textContent || "当前范围";
    const endTs = Number(stats.end_ts || 0);
    const updatedText = endTs > 0 ? new Date(endTs * 1000).toLocaleString() : "-";
    logStatsUpdatedAt.textContent = `${selectedLabel}统计，更新于 ${updatedText}`;
  }

  function renderLogs(logs) {
    if (logsAutoTimer) {
      clearTimeout(logsAutoTimer);
      logsAutoTimer = null;
    }
    if (!logs.length) {
      logsTbody.innerHTML = `<tr><td colspan="9" class="empty-state">暂无请求日志</td></tr>`;
      return;
    }

    logsTbody.innerHTML = "";
    let hasInProgress = false;
    logs.forEach(item => {
      const tr = document.createElement("tr");
      const dt = new Date((item.ts || 0) * 1000);
      const t = Number(item.duration_sec || 0);
      const status = Number(item.status_code || 0);
      const statusClass = status >= 500 ? "log-status-5xx" : (status >= 400 ? "log-status-4xx" : "log-status-2xx");
      const taskStatus = String(item.task_status || "").toUpperCase();
      if (taskStatus === "IN_PROGRESS") hasInProgress = true;
      const taskProgressRaw = Number(item.task_progress);
      const progressCell = taskStatus === "IN_PROGRESS"
        ? `<span class="status-badge status-active">${Number.isFinite(taskProgressRaw) ? Math.round(taskProgressRaw) : 0}%</span>`
        : `<span style="color:#7f96ad;">-</span>`;
      const previewUrl = String(item.preview_url || "").trim();
      const previewKind = String(item.preview_kind || "").trim();
      const tokenName = String(item.token_account_name || "").trim();
      const tokenEmail = String(item.token_account_email || "").trim();
      const tokenId = String(item.token_id || "").trim();
      const tokenSource = String(item.token_source || "").trim();
      const tokenAttempt = Number(item.token_attempt || 0);
      const tokenTitleParts = [];
      if (tokenId) tokenTitleParts.push(`ID: ${tokenId}`);
      if (tokenSource) tokenTitleParts.push(`来源: ${tokenSource}`);
      if (tokenAttempt > 0) tokenTitleParts.push(`尝试: 第${tokenAttempt}次`);
      const tokenTitle = escapeHtml(tokenTitleParts.join(" | "));
      const tokenCell = tokenName || tokenEmail
        ? `<span style="color:#a8bfd8;">${escapeHtml(tokenName || tokenEmail)}</span><br><span style="color:#7f96ad;">${escapeHtml(tokenEmail || "-")}</span>`
        : `<span style="color:#7f96ad;">-</span>`;
      const previewCell = previewUrl
        ? `<button class="small preview-btn" data-url="${encodeURIComponent(previewUrl)}" data-kind="${previewKind || ""}">查看</button>`
        : `<span style="color:#7f96ad;">-</span>`;
      tr.innerHTML = `
        <td style="white-space: nowrap; color: #a8bfd8;">${dt.toLocaleString()}</td>
        <td><span class="status-badge ${statusClass}">${status || "-"}</span></td>
        <td style="color:#a8bfd8;">${t}</td>
        <td>${progressCell}</td>
        <td title="${tokenTitle}">${tokenCell}</td>
        <td class="token-val">${item.model || "-"}</td>
        <td title="${(item.prompt_preview || "").replace(/"/g, "&quot;")}" style="max-width: 280px; color: #a8bfd8;">${item.prompt_preview || "-"}</td>
        <td style="font-family: 'IBM Plex Mono', monospace; color:#a8bfd8;">${typeof item.proxy_used === "boolean" ? (item.proxy_used ? "是" : "否") : "-"}</td>
        <td>${previewCell}</td>
      `;
      logsTbody.appendChild(tr);
    });

    if (hasInProgress && isLogsTabActive()) {
      logsAutoTimer = setTimeout(() => {
        if (isLogsTabActive()) loadLogs();
      }, LOGS_POLL_MS);
    }
  }

  function inferPreviewKind(url) {
    const lowered = String(url || "").toLowerCase();
    if (/(\.mp4|\.webm|\.ogg)(\?|$)/.test(lowered)) return "video";
    return "image";
  }

  function closePreview() {
    if (!previewModal || !previewContent) return;
    previewModal.classList.remove("open");
    previewModal.setAttribute("aria-hidden", "true");
    previewContent.innerHTML = "";
    if (previewDownloadBtn) {
      previewDownloadBtn.setAttribute("href", "#");
      previewDownloadBtn.setAttribute("download", "");
    }
  }

  function buildDownloadFilename(url, kind) {
    try {
      const u = new URL(url, window.location.origin);
      const fromPath = (u.pathname.split("/").pop() || "").trim();
      if (fromPath) return fromPath;
    } catch (err) {
      // ignore parse errors and fallback
    }
    const ext = kind === "video" ? "mp4" : "png";
    return `asset-${Date.now()}.${ext}`;
  }

  function openPreview(url, kind) {
    if (!previewModal || !previewContent || !url) return;
    const mediaKind = kind || inferPreviewKind(url);
    if (mediaKind === "video") {
      previewContent.innerHTML = `<video controls autoplay playsinline src="${url}"></video>`;
    } else {
      previewContent.innerHTML = `<img src="${url}" alt="预览图" />`;
    }
    if (previewDownloadBtn) {
      previewDownloadBtn.setAttribute("href", url);
      previewDownloadBtn.setAttribute("download", buildDownloadFilename(url, mediaKind));
    }
    previewModal.classList.add("open");
    previewModal.setAttribute("aria-hidden", "false");
  }

  if (logsTbody) {
    logsTbody.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains("preview-btn")) return;
      const encodedUrl = target.getAttribute("data-url") || "";
      const kind = (target.getAttribute("data-kind") || "").trim();
      if (!encodedUrl) return;
      openPreview(decodeURIComponent(encodedUrl), kind);
    });
  }

  if (previewCloseBtn) {
    previewCloseBtn.addEventListener("click", closePreview);
  }

  if (previewModal) {
    previewModal.addEventListener("click", (event) => {
      if (event.target === previewModal) closePreview();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePreview();
      closeDialog(tokenModal);
      closeDialog(refreshModal);
    }
  });

  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener("click", loadLogs);
  }

  if (logStatsRange) {
    logStatsRange.addEventListener("change", loadLogs);
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener("click", async () => {
      if (!confirm("确定清空请求日志吗？")) return;
      try {
        const res = await fetch("/api/v1/logs", { method: "DELETE" });
        if (!res.ok) throw new Error("清空失败");
        loadLogs();
      } catch (err) {
        alert(err.message || "清空失败");
      }
    });
  }


  function showMsg(el, text, isError) {
    el.textContent = text;
    el.style.color = isError ? "#ffb4bc" : "#4de2c4";
    setTimeout(() => { el.textContent = ""; }, 3000);
  }

  // Init
  loadTokens();
  loadConfig();
  loadLogs();
  loadRefreshProfiles();
});
