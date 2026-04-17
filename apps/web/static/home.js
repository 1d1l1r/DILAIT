const jsonHeaders = { "Content-Type": "application/json" };

const DAY_BITS = {
  mon: 1 << 0,
  tue: 1 << 1,
  wed: 1 << 2,
  thu: 1 << 3,
  fri: 1 << 4,
  sat: 1 << 5,
  sun: 1 << 6,
};

const els = {
  heroStats: document.getElementById("hero-stats"),
  tabButtons: [...document.querySelectorAll("[data-view]")],
  panels: [...document.querySelectorAll("[data-view-panel]")],
  roomsGrid: document.getElementById("rooms-grid"),
  roomDetail: document.getElementById("room-detail"),
  roomDetailBody: document.getElementById("room-detail-body"),
  devicesGrid: document.getElementById("devices-grid"),
  scenesGrid: document.getElementById("scenes-grid"),
  schedulesList: document.getElementById("schedules-list"),
  linksList: document.getElementById("links-list"),
  roomForm: document.getElementById("room-form"),
  sceneForm: document.getElementById("scene-form"),
  scheduleForm: document.getElementById("schedule-form"),
  linkForm: document.getElementById("link-form"),
  discoveryStatus: document.getElementById("discovery-status"),
  discoverySupported: document.getElementById("discovery-supported"),
  discoveryExisting: document.getElementById("discovery-existing"),
  discoveryOther: document.getElementById("discovery-other"),
  discoverButton: document.getElementById("discover-devices"),
  candidateOnboarding: document.getElementById("candidate-onboarding"),
  candidateTitle: document.getElementById("candidate-title"),
  candidateSubtitle: document.getElementById("candidate-subtitle"),
  deviceForm: document.getElementById("device-form"),
  deviceRoomSelect: document.getElementById("device-room-select"),
  clearOnboarding: document.getElementById("clear-onboarding"),
  sceneRoomSelect: document.getElementById("scene-room-select"),
  scheduleTargetType: document.getElementById("schedule-target-type"),
  scheduleTargetId: document.getElementById("schedule-target-id"),
  scheduleRuleType: document.getElementById("schedule-rule-type"),
  scheduleAction: document.getElementById("schedule-action"),
  scheduleDelayFields: document.getElementById("schedule-delay-fields"),
  scheduleOnceFields: document.getElementById("schedule-once-fields"),
  scheduleRecurringFields: document.getElementById("schedule-recurring-fields"),
  scheduleAstronomicalFields: document.getElementById("schedule-astronomical-fields"),
  scheduleActionFields: document.getElementById("schedule-action-fields"),
  scheduleTimezone: document.getElementById("schedule-timezone"),
  customDays: document.getElementById("custom-days"),
  linkTargetType: document.getElementById("link-target-type"),
  linkTargetId: document.getElementById("link-target-id"),
  linkActionType: document.getElementById("link-action-type"),
  linkFormTitle: document.getElementById("link-form-title"),
  linkFormKicker: document.getElementById("link-form-kicker"),
  linkFormReset: document.getElementById("link-form-reset"),
  roomsRefresh: document.getElementById("rooms-refresh"),
  devicesRefresh: document.getElementById("devices-refresh"),
};

const state = {
  activeView: "rooms",
  selectedRoomId: null,
  selectedCandidate: null,
  editingLinkId: null,
  discovery: null,
  system: null,
  dashboard: null,
  rooms: [],
  devices: [],
  groups: [],
  scenes: [],
  rules: [],
  actionLinks: [],
};

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return response.text();
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rgbToHex(rgb) {
  const toHex = (value) => Number(value || 0).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function hexToRgb(value) {
  const normalized = value.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function roomLabel(roomId) {
  return state.rooms.find((room) => room.id === roomId)?.name || "Unassigned";
}

function targetLabel(type, id) {
  if (type === "group") {
    return state.groups.find((group) => group.id === id)?.name || `Group ${id}`;
  }
  if (type === "scene") {
    return state.scenes.find((scene) => scene.id === id)?.name || `Scene ${id}`;
  }
  return state.devices.find((device) => device.id === id)?.name || `Device ${id}`;
}

function targetOptionsFor(type) {
  if (type === "group") {
    return state.groups.map((group) => ({ value: group.id, label: group.name }));
  }
  if (type === "scene") {
    return state.scenes.map((scene) => ({ value: scene.id, label: scene.name }));
  }
  return state.devices.map((device) => ({
    value: device.id,
    label: `${device.name} · ${roomLabel(device.room_id)}`,
  }));
}

function fillSelect(select, options, { allowBlank = false, blankLabel = "None" } = {}) {
  const previous = select.value;
  select.innerHTML = "";
  if (allowBlank) {
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = blankLabel;
    select.append(blank);
  }
  if (!options.length && !allowBlank) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Nothing available";
    select.append(placeholder);
  }
  options.forEach((option) => {
    const node = document.createElement("option");
    node.value = String(option.value);
    node.textContent = option.label;
    if (String(option.value) === previous) {
      node.selected = true;
    }
    select.append(node);
  });
  if (!previous && select.options.length) {
    select.options[0].selected = true;
  }
}

function activateView(view) {
  state.activeView = view;
  els.tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  els.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
  });
}

function heroStat(label, value) {
  return `<article class="hero-stat"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function deviceState(device) {
  return device.known_state_json || device.desired_state_json || {};
}

function relevantRoomDevices(roomId) {
  return state.devices.filter((device) => device.room_id === roomId);
}

function averageRoomColor(devices) {
  if (!devices.length) {
    return { r: 94, g: 242, b: 255, isActive: false };
  }
  const active = devices.filter((device) => deviceState(device).is_on);
  const source = active.length ? active : devices;
  let totalWeight = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  source.forEach((device) => {
    const stateValue = deviceState(device);
    const rgb = stateValue.rgb || { r: 80, g: 110, b: 160 };
    const weight = Math.max(0.2, Number(stateValue.brightness ?? 100) / 100);
    totalWeight += weight;
    r += Number(rgb.r || 0) * weight;
    g += Number(rgb.g || 0) * weight;
    b += Number(rgb.b || 0) * weight;
  });
  return {
    r: Math.round(r / totalWeight),
    g: Math.round(g / totalWeight),
    b: Math.round(b / totalWeight),
    isActive: active.length > 0,
  };
}

function roomTintStyle(roomId) {
  const tint = averageRoomColor(relevantRoomDevices(roomId));
  const alpha = tint.isActive ? 0.24 : 0.12;
  const borderAlpha = tint.isActive ? 0.34 : 0.18;
  return `--room-glow: rgba(${tint.r}, ${tint.g}, ${tint.b}, ${alpha}); --room-border: rgba(${tint.r}, ${tint.g}, ${tint.b}, ${borderAlpha});`;
}

function renderHero() {
  const roomCount = state.rooms.length;
  const activeDevices = state.devices.filter((device) => deviceState(device).is_on).length;
  const sceneCount = state.scenes.length;
  const linkCount = state.actionLinks.filter((link) => link.is_enabled).length;
  els.heroStats.innerHTML = [
    heroStat("Rooms", roomCount),
    heroStat("Lights on", activeDevices),
    heroStat("Scenes", sceneCount),
    heroStat("Links", linkCount),
  ].join("");
}

async function handleDeviceAction(deviceId, action, payload = null) {
  await api(`/api/devices/${deviceId}/${action}`, {
    method: "POST",
    headers: payload ? jsonHeaders : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  await refreshAll();
}

async function runRoomAction(roomId, action, payload = null) {
  const devices = relevantRoomDevices(roomId);
  if (!devices.length) {
    alert("This room has no devices yet.");
    return;
  }
  const results = await Promise.allSettled(
    devices.map((device) =>
      api(`/api/devices/${device.id}/${action}`, {
        method: "POST",
        headers: payload ? jsonHeaders : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      }),
    ),
  );
  const failures = results.filter((item) => item.status === "rejected");
  await refreshAll();
  if (failures.length) {
    alert(`${failures.length} room action(s) failed. Check /advanced for details.`);
  }
}

async function handleGroupAction(groupId, action, payload = null) {
  await api(`/api/groups/${groupId}/${action}`, {
    method: "POST",
    headers: payload ? jsonHeaders : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  await refreshAll();
}

function renderRooms() {
  els.roomsGrid.innerHTML = "";
  if (!state.rooms.length) {
    els.roomsGrid.innerHTML = '<article class="card"><p class="body-copy muted">Add a room to start organizing daily control.</p></article>';
    els.roomDetail.classList.add("is-hidden");
    return;
  }

  state.rooms.forEach((room) => {
    const devices = relevantRoomDevices(room.id);
    const activeCount = devices.filter((device) => deviceState(device).is_on).length;
    const node = document.createElement("article");
    node.className = "room-card";
    node.style = roomTintStyle(room.id);
    node.innerHTML = `
      <div class="room-card-head">
        <div>
          <p class="section-kicker">${escapeHtml(activeCount ? "Active room" : "Room")}</p>
          <h3>${escapeHtml(room.name)}</h3>
          <div class="room-meta">
            <span class="meta-pill">${devices.length} device(s)</span>
            <span class="meta-pill">${activeCount} on</span>
          </div>
        </div>
        <button class="pill-button" type="button">Open</button>
      </div>
      <div class="room-quick-grid">
        <button class="primary-button" type="button" data-action="on">Room on</button>
        <button class="ghost-button" type="button" data-action="off">Room off</button>
        <label class="field">
          <span>Brightness</span>
          <input data-field="brightness" type="range" min="0" max="100" value="70" />
        </label>
        <button class="secondary-button" type="button" data-action="brightness">Apply</button>
        <label class="field">
          <span>Tint</span>
          <input data-field="color" type="color" value="#6de9ff" />
        </label>
        <button class="ghost-button" type="button" data-action="color">Tint room</button>
      </div>
    `;
    node.querySelector(".pill-button").addEventListener("click", () => {
      state.selectedRoomId = room.id;
      renderRoomDetail();
    });
    node.querySelector('[data-action="on"]').addEventListener("click", () => runRoomAction(room.id, "on"));
    node.querySelector('[data-action="off"]').addEventListener("click", () => runRoomAction(room.id, "off"));
    node.querySelector('[data-action="brightness"]').addEventListener("click", () => {
      const value = Number(node.querySelector('[data-field="brightness"]').value);
      runRoomAction(room.id, "brightness", { value });
    });
    node.querySelector('[data-action="color"]').addEventListener("click", () => {
      const color = hexToRgb(node.querySelector('[data-field="color"]').value);
      runRoomAction(room.id, "color", color);
    });
    els.roomsGrid.append(node);
  });

  if (!state.selectedRoomId && state.rooms.length) {
    state.selectedRoomId = state.rooms[0].id;
  }
  renderRoomDetail();
}

function miniCard(title, subtitle, actions = []) {
  const node = document.createElement("article");
  node.className = "mini-card";
  node.innerHTML = `<strong>${escapeHtml(title)}</strong><div class="muted">${subtitle}</div>`;
  if (actions.length) {
    const row = document.createElement("div");
    row.className = "inline-actions";
    actions.forEach((button) => row.append(button));
    node.append(row);
  }
  return node;
}

function renderRoomDetail() {
  const room = state.rooms.find((item) => item.id === state.selectedRoomId);
  if (!room) {
    els.roomDetail.classList.add("is-hidden");
    return;
  }
  const roomDevices = relevantRoomDevices(room.id);
  const roomGroups = state.groups.filter((group) => group.room_id === room.id);
  const roomScenes = state.scenes.filter((scene) => scene.room_id === room.id);
  const detail = document.createElement("div");
  detail.innerHTML = `
    <div class="room-detail-head">
      <div>
        <p class="section-kicker">Room detail</p>
        <h3>${escapeHtml(room.name)}</h3>
        <p class="body-copy muted">Devices, groups, and scenes relevant to this room.</p>
      </div>
      <button class="ghost-button" type="button">Close</button>
    </div>
  `;
  detail.querySelector(".ghost-button").addEventListener("click", () => {
    state.selectedRoomId = null;
    els.roomDetail.classList.add("is-hidden");
  });

  const grid = document.createElement("div");
  grid.className = "detail-grid";

  const devicesPanel = document.createElement("section");
  devicesPanel.innerHTML = '<p class="section-kicker">Devices</p><div class="mini-list"></div>';
  const deviceList = devicesPanel.querySelector(".mini-list");
  if (!roomDevices.length) {
    deviceList.innerHTML = '<div class="muted">No devices in this room yet.</div>';
  } else {
    roomDevices.forEach((device) => {
      const run = document.createElement("button");
      run.className = "pill-button";
      run.textContent = deviceState(device).is_on ? "Turn off" : "Turn on";
      run.addEventListener("click", () => handleDeviceAction(device.id, deviceState(device).is_on ? "off" : "on"));
      deviceList.append(
        miniCard(
          device.name,
          `${device.family} · brightness ${deviceState(device).brightness ?? 100}%`,
          [run],
        ),
      );
    });
  }

  const groupsPanel = document.createElement("section");
  groupsPanel.innerHTML = '<p class="section-kicker">Groups</p><div class="mini-list"></div>';
  const groupList = groupsPanel.querySelector(".mini-list");
  if (!roomGroups.length) {
    groupList.innerHTML = '<div class="muted">No room-specific groups yet.</div>';
  } else {
    roomGroups.forEach((group) => {
      const on = document.createElement("button");
      on.className = "pill-button";
      on.textContent = "On";
      on.addEventListener("click", () => handleGroupAction(group.id, "on"));
      const off = document.createElement("button");
      off.className = "ghost-button";
      off.textContent = "Off";
      off.addEventListener("click", () => handleGroupAction(group.id, "off"));
      groupList.append(
        miniCard(group.name, `${group.devices?.length || 0} member(s)`, [on, off]),
      );
    });
  }

  const scenesPanel = document.createElement("section");
  scenesPanel.innerHTML = '<p class="section-kicker">Scenes</p><div class="mini-list"></div>';
  const sceneList = scenesPanel.querySelector(".mini-list");
  if (!roomScenes.length) {
    sceneList.innerHTML = '<div class="muted">No room scenes yet.</div>';
  } else {
    roomScenes.forEach((scene) => {
      const run = document.createElement("button");
      run.className = "pill-button";
      run.textContent = "Run";
      run.addEventListener("click", async () => {
        await api(`/api/scenes/${scene.id}/run`, { method: "POST" });
        await refreshAll();
      });
      sceneList.append(miniCard(scene.name, `${scene.actions?.length || 0} action(s)`, [run]));
    });
  }

  grid.append(devicesPanel, groupsPanel, scenesPanel);
  detail.append(grid);
  els.roomDetailBody.innerHTML = "";
  els.roomDetailBody.append(detail);
  els.roomDetail.classList.remove("is-hidden");
}

function renderDevices() {
  els.devicesGrid.innerHTML = "";
  if (!state.devices.length) {
    els.devicesGrid.innerHTML = '<article class="card"><p class="body-copy muted">No devices onboarded yet.</p></article>';
    return;
  }
  state.devices.forEach((device) => {
    const stateValue = deviceState(device);
    const node = document.createElement("article");
    node.className = "device-card";
    node.innerHTML = `
      <div class="device-card-head">
        <div>
          <p class="section-kicker">${escapeHtml(roomLabel(device.room_id))}</p>
          <h3>${escapeHtml(device.name)}</h3>
          <div class="device-meta">
            <span class="family-badge">${escapeHtml(device.family)}</span>
            <span class="meta-pill">${stateValue.is_on ? "on" : "off"}</span>
          </div>
        </div>
        <button class="pill-button" type="button">${stateValue.is_on ? "Off" : "On"}</button>
      </div>
      <div class="device-quick-grid">
        <label class="field">
          <span>Brightness</span>
          <input data-field="brightness" type="range" min="0" max="100" value="${Number(stateValue.brightness ?? 100)}" />
        </label>
        <button class="secondary-button" type="button" data-action="brightness">Apply</button>
        <label class="field">
          <span>Color</span>
          <input data-field="color" type="color" value="${rgbToHex(stateValue.rgb || { r: 255, g: 255, b: 255 })}" />
        </label>
        <button class="ghost-button" type="button" data-action="color">Color</button>
      </div>
    `;
    node.querySelector(".pill-button").addEventListener("click", () =>
      handleDeviceAction(device.id, stateValue.is_on ? "off" : "on"),
    );
    node.querySelector('[data-action="brightness"]').addEventListener("click", () => {
      const value = Number(node.querySelector('[data-field="brightness"]').value);
      handleDeviceAction(device.id, "brightness", { value });
    });
    node.querySelector('[data-action="color"]').addEventListener("click", () => {
      const rgb = hexToRgb(node.querySelector('[data-field="color"]').value);
      handleDeviceAction(device.id, "color", rgb);
    });
    els.devicesGrid.append(node);
  });
}

function renderScenes() {
  els.scenesGrid.innerHTML = "";
  if (!state.scenes.length) {
    els.scenesGrid.innerHTML = '<article class="card"><p class="body-copy muted">Create a scene here, then tune its actions in /advanced.</p></article>';
    return;
  }
  state.scenes.forEach((scene) => {
    const node = document.createElement("article");
    node.className = "scene-card";
    node.innerHTML = `
      <div class="scene-card-head">
        <div>
          <p class="section-kicker">${escapeHtml(roomLabel(scene.room_id))}</p>
          <h3>${escapeHtml(scene.name)}</h3>
          <div class="scene-meta">
            <span class="meta-pill">${scene.actions?.length || 0} action(s)</span>
            <span class="meta-pill">${scene.is_enabled ? "ready" : "disabled"}</span>
          </div>
        </div>
        <button class="primary-button" type="button">Run scene</button>
      </div>
      <p class="body-copy muted">${
        scene.actions?.length
          ? "Use it as a reusable preset. Fine-grained editing stays in /advanced."
          : "Scene shell created. Add technical actions in /advanced."
      }</p>
    `;
    node.querySelector(".primary-button").addEventListener("click", async () => {
      await api(`/api/scenes/${scene.id}/run`, { method: "POST" });
      await refreshAll();
    });
    els.scenesGrid.append(node);
  });
}

function describeDays(mask) {
  if (mask === 127) return "Every day";
  if (mask === DAY_BITS.mon + DAY_BITS.tue + DAY_BITS.wed + DAY_BITS.thu + DAY_BITS.fri) return "Weekdays";
  if (mask === DAY_BITS.sat + DAY_BITS.sun) return "Weekends";
  return Object.entries(DAY_BITS)
    .filter(([, bit]) => mask & bit)
    .map(([name]) => name.toUpperCase())
    .join(", ");
}

function describeRule(rule) {
  const payload = rule.payload_json || {};
  const action = payload.action || (rule.target_type === "scene" ? "run_scene" : "on");
  if (rule.rule_type === "delay") {
    return `After ${payload.delay_seconds ?? 0}s -> ${action} ${targetLabel(rule.target_type, rule.target_id)}`;
  }
  if (rule.rule_type === "once") {
    return `Once at ${payload.run_at || "unspecified"} -> ${action}`;
  }
  if (rule.rule_type === "recurring") {
    return `${describeDays(rule.days_of_week_mask)} at ${payload.time || "--:--"} -> ${action}`;
  }
  if (rule.rule_type === "astronomical") {
    return `${describeDays(rule.days_of_week_mask)} ${payload.solar_event || "sunset"} (${payload.offset_minutes || 0} min) -> ${action}`;
  }
  return `${rule.rule_type} -> ${action}`;
}

function renderRules() {
  els.schedulesList.innerHTML = "";
  if (!state.rules.length) {
    els.schedulesList.innerHTML = '<article class="card"><p class="body-copy muted">No schedules yet.</p></article>';
    return;
  }
  state.rules.forEach((rule) => {
    const node = document.createElement("article");
    node.className = "schedule-card";
    node.innerHTML = `
      <div class="schedule-card-head">
        <div>
          <p class="section-kicker">${escapeHtml(targetLabel(rule.target_type, rule.target_id))}</p>
          <h3>${escapeHtml(rule.name)}</h3>
          <p class="body-copy muted">${escapeHtml(describeRule(rule))}</p>
        </div>
        <button class="pill-button" type="button">${rule.is_enabled ? "Disable" : "Enable"}</button>
      </div>
      <div class="schedule-meta">
        <span class="meta-pill">${escapeHtml(rule.rule_type)}</span>
        <span class="meta-pill">${rule.next_run_at ? `Next ${rule.next_run_at}` : "No next run"}</span>
      </div>
    `;
    node.querySelector(".pill-button").addEventListener("click", async () => {
      await api(`/api/rules/${rule.id}/${rule.is_enabled ? "disable" : "enable"}`, { method: "POST" });
      await refreshAll();
    });
    els.schedulesList.append(node);
  });
}

function renderLinks() {
  els.linksList.innerHTML = "";
  if (!state.actionLinks.length) {
    els.linksList.innerHTML = '<article class="card"><p class="body-copy muted">No action links yet.</p></article>';
    return;
  }
  state.actionLinks.forEach((link) => {
    const href = `${window.location.origin}/a/${link.token}`;
    const node = document.createElement("article");
    node.className = "link-card";
    node.innerHTML = `
      <div class="link-card-head">
        <div>
          <p class="section-kicker">${escapeHtml(targetLabel(link.target_type, link.target_id))}</p>
          <h3>${escapeHtml(link.name)}</h3>
          <div class="link-meta">
            <span class="meta-pill">${link.is_enabled ? "enabled" : "disabled"}</span>
            <span class="meta-pill">${link.requires_confirmation ? "confirm first" : "instant"}</span>
            <span class="meta-pill">${escapeHtml(link.action_type)}</span>
          </div>
        </div>
        <button class="pill-button" type="button">${link.is_enabled ? "Disable" : "Enable"}</button>
      </div>
      <p class="body-copy muted">${escapeHtml(href)}</p>
      <div class="inline-actions">
        <a class="primary-button" href="${escapeHtml(href)}">${link.requires_confirmation ? "Open" : "Run"}</a>
        <button class="secondary-button" type="button" data-action="copy">Copy URL</button>
        <button class="ghost-button" type="button" data-action="edit">Edit</button>
        <button class="ghost-button" type="button" data-action="delete">Delete</button>
      </div>
    `;
    node.querySelector(".pill-button").addEventListener("click", async () => {
      await api(`/api/action-links/${link.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ is_enabled: !link.is_enabled }),
      });
      await refreshAll();
    });
    node.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      await navigator.clipboard.writeText(href);
    });
    node.querySelector('[data-action="edit"]').addEventListener("click", () => loadLinkIntoForm(link));
    node.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      await api(`/api/action-links/${link.id}`, { method: "DELETE" });
      if (state.editingLinkId === link.id) resetLinkForm();
      await refreshAll();
    });
    els.linksList.append(node);
  });
}

function categorizedDiscovery() {
  const candidates = state.discovery || [];
  const onboarded = new Map(state.devices.map((device) => [device.ble_identifier, device]));
  return {
    newSupported: candidates.filter(
      (candidate) =>
        candidate.source === "real" &&
        candidate.is_supported &&
        candidate.family !== "mock" &&
        !onboarded.has(candidate.ble_identifier),
    ),
    existing: candidates.filter((candidate) => onboarded.has(candidate.ble_identifier)),
    other: candidates.filter(
      (candidate) =>
        !(
          candidate.source === "real" &&
          candidate.is_supported &&
          candidate.family !== "mock" &&
          !onboarded.has(candidate.ble_identifier)
        ) &&
        !onboarded.has(candidate.ble_identifier),
    ),
  };
}

function candidateCard(candidate, mode = "new") {
  const existing = state.devices.find((device) => device.ble_identifier === candidate.ble_identifier);
  const node = document.createElement("article");
  node.className = "candidate-card";
  const subtitle =
    mode === "existing"
      ? `${existing?.name || candidate.name} · ${roomLabel(existing?.room_id ?? null)}`
      : `${candidate.source === "real" ? "Nearby light" : "Simulated"} · RSSI ${candidate.rssi ?? "n/a"}`;
  node.innerHTML = `
    <div class="candidate-card-head">
      <div>
        <h4>${escapeHtml(candidate.name)}</h4>
        <p class="body-copy muted">${escapeHtml(subtitle)}</p>
        <div class="room-meta">
          <span class="candidate-family">${escapeHtml(candidate.family)}</span>
          <span class="candidate-state">${mode === "new" ? "Ready to add" : mode === "existing" ? "Already added" : "Not supported yet"}</span>
        </div>
      </div>
    </div>
  `;
  if (mode === "new") {
    const button = document.createElement("button");
    button.className = "primary-button";
    button.textContent = "Add light";
    button.addEventListener("click", () => selectCandidate(candidate));
    node.append(button);
  }
  return node;
}

function renderDiscovery() {
  if (!state.discovery) {
    els.discoverySupported.innerHTML =
      '<div class="muted">Tap “Scan for lights” to look for new supported LED devices nearby.</div>';
    els.discoveryExisting.innerHTML =
      '<div class="muted">Already onboarded discovery matches will appear here after a scan.</div>';
    els.discoveryOther.innerHTML =
      '<div class="muted">Unsupported BLE devices stay tucked away here after a scan.</div>';
    return;
  }
  const groups = categorizedDiscovery();
  const renderList = (target, items, emptyText, mode) => {
    target.innerHTML = "";
    if (!items.length) {
      target.innerHTML = `<div class="muted">${emptyText}</div>`;
      return;
    }
    items.forEach((item) => target.append(candidateCard(item, mode)));
  };
  renderList(
    els.discoverySupported,
    groups.newSupported,
    "No new supported lights found yet. Try scanning again when the target light is powered.",
    "new",
  );
  renderList(
    els.discoveryExisting,
    groups.existing,
    "No onboarded devices are currently visible in discovery.",
    "existing",
  );
  renderList(
    els.discoveryOther,
    groups.other,
    "No unsupported BLE noise was captured in the last scan.",
    "other",
  );
}

function selectCandidate(candidate) {
  state.selectedCandidate = candidate;
  els.candidateOnboarding.classList.remove("is-hidden");
  els.candidateTitle.textContent = candidate.name;
  els.candidateSubtitle.textContent = `${candidate.family} · ready to add to a room`;
  els.deviceForm.querySelector('[name="name"]').value = candidate.name;
  els.deviceForm.querySelector('[name="family"]').value = candidate.family;
  els.deviceForm.querySelector('[name="ble_identifier"]').value = candidate.ble_identifier;
  els.deviceForm.querySelector('[name="ble_address"]').value = candidate.address || "";
  els.deviceForm.querySelector('[name="vendor_name"]').value = candidate.vendor_name || "";
  els.deviceForm.querySelector('[name="meta_json"]').value = JSON.stringify({
    discovery: {
      source: candidate.source,
      classification_reason: candidate.classification_reason,
      services: candidate.services,
      manufacturer_data: candidate.manufacturer_data,
      metadata: candidate.metadata,
    },
  });
}

function clearCandidate() {
  state.selectedCandidate = null;
  els.candidateOnboarding.classList.add("is-hidden");
  els.deviceForm.reset();
  fillSelect(
    els.deviceRoomSelect,
    state.rooms.map((room) => ({ value: room.id, label: room.name })),
    { allowBlank: true, blankLabel: "No room yet" },
  );
}

function syncScheduleTargets() {
  fillSelect(els.scheduleTargetId, targetOptionsFor(els.scheduleTargetType.value));
  syncScheduleActions();
}

function syncScheduleActions() {
  const targetType = els.scheduleTargetType.value;
  const options = targetType === "scene" ? ["run_scene"] : ["on", "off", "toggle", "brightness", "color"];
  const current = els.scheduleAction.value;
  els.scheduleAction.innerHTML = options.map((value) => `<option value="${value}">${value}</option>`).join("");
  if (options.includes(current)) {
    els.scheduleAction.value = current;
  }
  syncScheduleVisibility();
}

function syncScheduleVisibility() {
  const ruleType = els.scheduleRuleType.value;
  const action = els.scheduleAction.value;
  els.scheduleDelayFields.classList.toggle("is-hidden", ruleType !== "delay");
  els.scheduleOnceFields.classList.toggle("is-hidden", ruleType !== "once");
  els.scheduleRecurringFields.classList.toggle("is-hidden", ruleType !== "recurring");
  els.scheduleAstronomicalFields.classList.toggle("is-hidden", ruleType !== "astronomical");
  els.scheduleActionFields.querySelector('[data-action-field="brightness"]').classList.toggle("is-hidden", action !== "brightness");
  els.scheduleActionFields.querySelector('[data-action-field="color"]').classList.toggle("is-hidden", action !== "color");
}

function computeDaysMask() {
  const dayMode = els.scheduleForm.querySelector('input[name="day_mode"]:checked')?.value || "everyday";
  if (dayMode === "everyday") return 127;
  if (dayMode === "weekdays") return DAY_BITS.mon | DAY_BITS.tue | DAY_BITS.wed | DAY_BITS.thu | DAY_BITS.fri;
  if (dayMode === "weekends") return DAY_BITS.sat | DAY_BITS.sun;
  const selected = [...els.scheduleForm.querySelectorAll('input[name="custom_day"]:checked')].map((input) => input.value);
  const mask = selected.reduce((total, day) => total + DAY_BITS[day], 0);
  if (!mask) {
    throw new Error("Choose at least one custom day.");
  }
  return mask;
}

function syncLinkTargets() {
  fillSelect(els.linkTargetId, targetOptionsFor(els.linkTargetType.value));
  const targetType = els.linkTargetType.value;
  const options = targetType === "scene" ? ["run_scene"] : ["on", "off", "toggle"];
  const current = els.linkActionType.value;
  els.linkActionType.innerHTML = options.map((value) => `<option value="${value}">${value}</option>`).join("");
  if (options.includes(current)) {
    els.linkActionType.value = current;
  }
}

function loadLinkIntoForm(link) {
  state.editingLinkId = link.id;
  els.linkForm.querySelector('[name="link_id"]').value = String(link.id);
  els.linkForm.querySelector('[name="name"]').value = link.name;
  els.linkTargetType.value = link.target_type;
  syncLinkTargets();
  els.linkTargetId.value = String(link.target_id);
  els.linkActionType.value = link.action_type;
  els.linkForm.querySelector('[name="requires_confirmation"]').checked = link.requires_confirmation;
  els.linkForm.querySelector('[name="is_enabled"]').checked = link.is_enabled;
  els.linkFormTitle.textContent = "Edit local link";
  els.linkFormKicker.textContent = "Editing shortcut";
  els.linkFormReset.classList.remove("is-hidden");
  activateView("links");
}

function resetLinkForm() {
  state.editingLinkId = null;
  els.linkForm.reset();
  els.linkForm.querySelector('[name="link_id"]').value = "";
  els.linkForm.querySelector('[name="is_enabled"]').checked = true;
  els.linkFormTitle.textContent = "Create a local link";
  els.linkFormKicker.textContent = "New shortcut";
  els.linkFormReset.classList.add("is-hidden");
  syncLinkTargets();
}

async function refreshAll() {
  const [system, dashboard, rooms, devices, groups, scenes, rules, actionLinks] = await Promise.all([
    api("/api/system/info"),
    api("/api/dashboard"),
    api("/api/rooms"),
    api("/api/devices"),
    api("/api/groups"),
    api("/api/scenes"),
    api("/api/rules"),
    api("/api/action-links"),
  ]);

  state.system = system;
  state.dashboard = dashboard;
  state.rooms = rooms;
  state.devices = devices;
  state.groups = groups;
  state.scenes = scenes;
  state.rules = rules;
  state.actionLinks = actionLinks;

  els.scheduleTimezone.value = system.timezone || "Asia/Qyzylorda";
  fillSelect(
    els.deviceRoomSelect,
    rooms.map((room) => ({ value: room.id, label: room.name })),
    { allowBlank: true, blankLabel: "No room yet" },
  );
  fillSelect(
    els.sceneRoomSelect,
    rooms.map((room) => ({ value: room.id, label: room.name })),
    { allowBlank: true, blankLabel: "No room" },
  );
  syncScheduleTargets();
  syncLinkTargets();
  renderHero();
  renderRooms();
  renderDevices();
  renderScenes();
  renderRules();
  renderLinks();
  renderDiscovery();
}

async function refreshDiscovery() {
  const startedAt = performance.now();
  els.discoverButton.disabled = true;
  els.discoverButton.textContent = "Scanning...";
  els.discoveryStatus.textContent = "Scanning nearby supported lights. Windows BLE scans can take a few seconds.";
  try {
    state.discovery = await api("/api/devices/discover", { method: "POST" });
    const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    const groups = categorizedDiscovery();
    els.discoveryStatus.textContent =
      `Scan complete in ${elapsedSeconds}s. ${groups.newSupported.length} new supported light(s) ready to add.`;
    renderDiscovery();
  } catch (error) {
    els.discoveryStatus.textContent = `Discovery failed: ${error.message}`;
    throw error;
  } finally {
    els.discoverButton.disabled = false;
    els.discoverButton.textContent = "Scan for lights";
  }
}

els.tabButtons.forEach((button) => button.addEventListener("click", () => activateView(button.dataset.view)));

els.roomForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  await api("/api/rooms", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: data.name, sort_order: Number(data.sort_order || 0) }),
  });
  form.reset();
  await refreshAll();
});

els.sceneForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  await api("/api/scenes", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: data.name, room_id: data.room_id ? Number(data.room_id) : null }),
  });
  form.reset();
  fillSelect(
    els.sceneRoomSelect,
    state.rooms.map((room) => ({ value: room.id, label: room.name })),
    { allowBlank: true, blankLabel: "No room" },
  );
  await refreshAll();
});

els.deviceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  await api("/api/devices", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: data.name,
      family: data.family,
      ble_identifier: data.ble_identifier,
      ble_address: data.ble_address || null,
      vendor_name: data.vendor_name || null,
      room_id: data.room_id ? Number(data.room_id) : null,
      meta_json: JSON.parse(data.meta_json || "{}"),
    }),
  });
  clearCandidate();
  await refreshAll();
});

els.scheduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const payload = { action: data.action };

  if (data.action === "brightness") {
    payload.value = Number(data.brightness_value);
  }
  if (data.action === "color") {
    Object.assign(payload, hexToRgb(data.color_value));
  }

  if (data.rule_type === "delay") {
    payload.delay_seconds = Number(data.delay_seconds || 0);
  }
  if (data.rule_type === "once") {
    payload.run_at = new Date(data.run_at).toISOString();
  }
  if (data.rule_type === "recurring") {
    payload.time = `${data.recurring_time}:00`.slice(0, 8);
  }
  if (data.rule_type === "astronomical") {
    payload.solar_event = data.solar_event;
    payload.offset_minutes = Number(data.offset_minutes || 0);
    payload.lat = Number(data.lat);
    payload.lon = Number(data.lon);
  }

  await api("/api/rules", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: data.name,
      target_type: data.target_type,
      target_id: Number(data.target_id),
      rule_type: data.rule_type,
      is_enabled: form.querySelector('[name="is_enabled"]').checked,
      timezone: data.timezone,
      days_of_week_mask: computeDaysMask(),
      payload_json: payload,
    }),
  });
  form.reset();
  form.querySelector('[name="is_enabled"]').checked = true;
  form.querySelector('[name="day_mode"][value="everyday"]').checked = true;
  els.customDays.classList.add("is-hidden");
  els.scheduleTimezone.value = state.system?.timezone || "Asia/Qyzylorda";
  syncScheduleTargets();
  syncScheduleVisibility();
  await refreshAll();
});

els.linkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const payload = {
    name: data.name,
    target_type: data.target_type,
    target_id: Number(data.target_id),
    action_type: data.action_type,
    requires_confirmation: form.querySelector('[name="requires_confirmation"]').checked,
    is_enabled: form.querySelector('[name="is_enabled"]').checked,
  };
  if (state.editingLinkId) {
    await api(`/api/action-links/${state.editingLinkId}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
  } else {
    await api("/api/action-links", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
  }
  resetLinkForm();
  await refreshAll();
});

els.linkFormReset.addEventListener("click", resetLinkForm);
els.clearOnboarding.addEventListener("click", clearCandidate);
els.scheduleTargetType.addEventListener("change", syncScheduleTargets);
els.scheduleRuleType.addEventListener("change", syncScheduleVisibility);
els.scheduleAction.addEventListener("change", syncScheduleVisibility);
els.linkTargetType.addEventListener("change", syncLinkTargets);
els.discoverButton.addEventListener("click", refreshDiscovery);
els.roomsRefresh.addEventListener("click", refreshAll);
els.devicesRefresh.addEventListener("click", refreshAll);

[...els.scheduleForm.querySelectorAll('input[name="day_mode"]')].forEach((input) => {
  input.addEventListener("change", () => {
    els.customDays.classList.toggle("is-hidden", input.value !== "custom" || !input.checked);
  });
});

refreshAll().catch((error) => {
  console.error(error);
  alert(error.message);
});
