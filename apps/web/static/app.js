const jsonHeaders = { "Content-Type": "application/json" };

const els = {
  cards: document.getElementById("dashboard-cards"),
  rooms: document.getElementById("rooms-list"),
  devices: document.getElementById("devices-list"),
  groups: document.getElementById("groups-list"),
  scenes: document.getElementById("scenes-list"),
  rules: document.getElementById("rules-list"),
  discovery: document.getElementById("discovery-list"),
  upcoming: document.getElementById("upcoming-list"),
  failures: document.getElementById("failures-list"),
  actionLinks: document.getElementById("action-links-list"),
  deviceFamily: document.getElementById("device-family"),
  discoverButton: document.getElementById("discover-devices"),
  discoveryStatus: document.getElementById("discovery-status"),
  groupAttachGroup: document.getElementById("group-attach-group"),
  groupAttachDevice: document.getElementById("group-attach-device"),
  sceneActionScene: document.getElementById("scene-action-scene"),
  sceneTargetType: document.getElementById("scene-target-type"),
  sceneTargetId: document.getElementById("scene-target-id"),
  ruleTargetType: document.getElementById("rule-target-type"),
  ruleTargetId: document.getElementById("rule-target-id"),
  actionLinkTargetType: document.getElementById("action-link-target-type"),
  actionLinkTargetId: document.getElementById("action-link-target-id"),
  actionLinkActionType: document.getElementById("action-link-action-type"),
};

const state = {
  system: null,
  selectedCandidate: null,
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

function renderList(target, items, renderItem) {
  target.innerHTML = "";
  if (!items.length) {
    target.innerHTML = `<div class="item"><div class="item-main muted">Nothing here yet.</div></div>`;
    return;
  }
  items.forEach((item) => target.append(renderItem(item)));
}

function card(title, value, note) {
  const node = document.createElement("article");
  node.className = "card";
  node.innerHTML = `<p class="eyebrow">${title}</p><h2>${value}</h2><div class="muted">${note}</div>`;
  return node;
}

function simpleCard(title, details, action) {
  const node = document.createElement("article");
  node.className = "item";
  node.innerHTML = `<div class="item-main"><strong>${title}</strong><div>${details}</div></div>`;
  if (action) {
    const wrapper = document.createElement("div");
    wrapper.className = "item-actions";
    wrapper.append(action);
    node.append(wrapper);
  }
  return node;
}

function escapeHtml(value) {
  return String(value)
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

function targetOptionsFor(type) {
  if (type === "group") {
    return state.groups.map((group) => ({ value: group.id, label: `#${group.id} ${group.name}` }));
  }
  if (type === "scene") {
    return state.scenes.map((scene) => ({ value: scene.id, label: `#${scene.id} ${scene.name}` }));
  }
  return state.devices.map((device) => ({
    value: device.id,
    label: `#${device.id} ${device.name} (${device.family})`,
  }));
}

function fillSelect(select, options, placeholder = "Select...") {
  const previous = select.value;
  select.innerHTML = "";
  if (!options.length) {
    select.innerHTML = `<option value="">${placeholder}</option>`;
    select.value = "";
    return;
  }
  options.forEach((option, index) => {
    const node = document.createElement("option");
    node.value = String(option.value);
    node.textContent = option.label;
    if (previous && previous === String(option.value)) {
      node.selected = true;
    }
    if (!previous && index === 0) {
      node.selected = true;
    }
    select.append(node);
  });
}

function syncTargetSelect(typeSelect, targetSelect) {
  fillSelect(targetSelect, targetOptionsFor(typeSelect.value), `No ${typeSelect.value}s yet`);
}

function syncActionLinkActionOptions() {
  const targetType = els.actionLinkTargetType.value;
  const options = targetType === "scene" ? ["run_scene"] : ["on", "off", "toggle"];
  const current = els.actionLinkActionType.value;
  els.actionLinkActionType.innerHTML = options.map((value) => `<option value="${value}">${value}</option>`).join("");
  if (options.includes(current)) {
    els.actionLinkActionType.value = current;
  }
}

function groupFamilySummary(group) {
  const families = [...new Set((group.devices || []).map((device) => device.family))];
  return families.length ? families.join(", ") : "no devices";
}

async function handleGroupAction(groupId, action, payload = null) {
  await api(`/api/groups/${groupId}/${action}`, {
    method: "POST",
    headers: payload ? jsonHeaders : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  await refreshAll();
}

async function handleDeviceDelete(deviceId) {
  await api(`/api/devices/${deviceId}`, { method: "DELETE" });
  await refreshAll();
}

async function handleSceneRename(scene) {
  const nextName = window.prompt("Rename scene", scene.name);
  if (!nextName || nextName === scene.name) return;
  await api(`/api/scenes/${scene.id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ name: nextName }),
  });
  await refreshAll();
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function deviceCard(device) {
  const template = document.getElementById("device-card-template");
  const node = template.content.firstElementChild.cloneNode(true);
  const known = device.known_state_json || {};
  const brightnessValue = known.brightness ?? 100;
  const rgb = known.rgb || { r: 255, g: 255, b: 255 };
  node.querySelector(".item-main").innerHTML = `
    <strong>#${device.id} ${escapeHtml(device.name)}</strong>
    <div class="badge">${escapeHtml(device.family)}</div>
    <div>State: ${known.is_on ? "on" : "off"}, brightness ${brightnessValue}%</div>
    <div class="muted">${escapeHtml(device.ble_identifier)}${device.ble_address ? ` | ${escapeHtml(device.ble_address)}` : ""}</div>
  `;
  const brightnessInput = node.querySelector('[data-field="brightness"]');
  const colorInput = node.querySelector('[data-field="color"]');
  brightnessInput.value = String(brightnessValue);
  colorInput.value = rgbToHex(rgb);

  node.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      if (action === "brightness") {
        await api(`/api/devices/${device.id}/brightness`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ value: Number(brightnessInput.value) }),
        });
      } else if (action === "color") {
        await api(`/api/devices/${device.id}/color`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(hexToRgb(colorInput.value)),
        });
      } else {
        await api(`/api/devices/${device.id}/${action}`, { method: "POST" });
      }
      await refreshAll();
    });
  });

  const removeButton = document.createElement("button");
  removeButton.className = "button button-small button-ghost";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => handleDeviceDelete(device.id));
  node.querySelector(".item-actions").append(removeButton);
  return node;
}

function renderGroupCard(group) {
  const node = document.createElement("article");
  node.className = "item";
  const knownFamilies = groupFamilySummary(group);
  const devicesMarkup = (group.devices || [])
    .map(
      (device) =>
        `<span class="pill">${escapeHtml(device.name)}<span class="muted"> ${escapeHtml(device.family)}</span></span>`,
    )
    .join("");
  node.innerHTML = `
    <div class="item-main">
      <strong>#${group.id} ${escapeHtml(group.name)}</strong>
      <div class="badge">${escapeHtml(knownFamilies)}</div>
      <div>${group.devices?.length || 0} member(s)</div>
      <div class="pill-row">${devicesMarkup || '<span class="muted">Attach devices to make this a mixed-family group.</span>'}</div>
    </div>
  `;

  const actions = document.createElement("div");
  actions.className = "item-actions";
  [
    ["On", () => handleGroupAction(group.id, "on")],
    ["Off", () => handleGroupAction(group.id, "off")],
  ].forEach(([label, handler], index) => {
    const button = document.createElement("button");
    button.className = `button button-small${index === 1 ? " button-secondary" : ""}`;
    button.textContent = label;
    button.addEventListener("click", handler);
    actions.append(button);
  });
  node.append(actions);

  const controls = document.createElement("div");
  controls.className = "device-control-grid";
  controls.innerHTML = `
    <label>
      <span>Brightness</span>
      <input data-field="brightness" type="range" min="0" max="100" value="100" />
    </label>
    <button data-action="brightness" class="button button-small">Apply Brightness</button>
    <label>
      <span>Color</span>
      <input data-field="color" type="color" value="#ffffff" />
    </label>
    <button data-action="color" class="button button-small button-ghost">Apply Color</button>
  `;
  const brightnessInput = controls.querySelector('[data-field="brightness"]');
  const colorInput = controls.querySelector('[data-field="color"]');
  controls.querySelector('[data-action="brightness"]').addEventListener("click", async () => {
    await handleGroupAction(group.id, "brightness", { value: Number(brightnessInput.value) });
  });
  controls.querySelector('[data-action="color"]').addEventListener("click", async () => {
    await handleGroupAction(group.id, "color", hexToRgb(colorInput.value));
  });
  node.append(controls);

  if ((group.devices || []).length) {
    const list = document.createElement("div");
    list.className = "stack compact-stack";
    group.devices.forEach((device) => {
      const row = document.createElement("div");
      row.className = "inline-chip-row";
      row.innerHTML = `<span>${escapeHtml(device.name)} (${escapeHtml(device.family)})</span>`;
      const remove = document.createElement("button");
      remove.className = "button button-small button-ghost";
      remove.textContent = "Detach";
      remove.addEventListener("click", async () => {
        await api(`/api/groups/${group.id}/devices/${device.id}`, { method: "DELETE" });
        await refreshAll();
      });
      row.append(remove);
      list.append(row);
    });
    node.append(list);
  }

  return node;
}

function renderSceneCard(scene) {
  const node = document.createElement("article");
  node.className = "item";
  node.innerHTML = `
    <div class="item-main">
      <strong>#${scene.id} ${escapeHtml(scene.name)}</strong>
      <div>${scene.actions?.length || 0} action(s)</div>
      <div class="muted">${scene.is_enabled ? "enabled" : "disabled"}</div>
    </div>
  `;

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const run = document.createElement("button");
  run.className = "button button-small";
  run.textContent = "Run";
  run.addEventListener("click", async () => {
    await api(`/api/scenes/${scene.id}/run`, { method: "POST" });
    await refreshAll();
  });
  actions.append(run);

  const rename = document.createElement("button");
  rename.className = "button button-small button-secondary";
  rename.textContent = "Rename";
  rename.addEventListener("click", () => handleSceneRename(scene));
  actions.append(rename);
  node.append(actions);

  const actionList = document.createElement("div");
  actionList.className = "stack compact-stack";
  (scene.actions || []).forEach((action) => {
    const row = document.createElement("div");
    row.className = "inline-chip-row";
    row.innerHTML = `
      <span>
        ${escapeHtml(action.action_type)} -> ${escapeHtml(action.target_type)} #${action.target_id}
        <span class="muted">${escapeHtml(JSON.stringify(action.action_payload_json || {}))}</span>
      </span>
    `;
    const remove = document.createElement("button");
    remove.className = "button button-small button-ghost";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      await api(`/api/scenes/${scene.id}/actions/${action.id}`, { method: "DELETE" });
      await refreshAll();
    });
    row.append(remove);
    actionList.append(row);
  });
  if (!scene.actions?.length) {
    actionList.innerHTML = `<div class="muted">Add device or group actions to build a mixed-family scene.</div>`;
  }
  node.append(actionList);
  return node;
}

function renderActionLinkCard(link) {
  const node = document.createElement("article");
  node.className = "item";
  const href = `${window.location.origin}/a/${link.token}`;
  node.innerHTML = `
    <div class="item-main">
      <strong>#${link.id} ${escapeHtml(link.name)}</strong>
      <div class="pill-row">
        <span class="pill">${link.is_enabled ? "enabled" : "disabled"}</span>
        <span class="pill">${link.requires_confirmation ? "confirm first" : "instant"}</span>
        <span class="pill">${escapeHtml(link.action_type)} -> ${escapeHtml(link.target_type)} #${link.target_id}</span>
      </div>
      <div class="link-copy-row">
        <code>${escapeHtml(href)}</code>
      </div>
      <div class="muted">Last used: ${link.last_used_at || "never"}</div>
    </div>
  `;
  const actions = document.createElement("div");
  actions.className = "item-actions";

  const openButton = document.createElement("a");
  openButton.className = "button button-small";
  openButton.href = href;
  openButton.textContent = link.requires_confirmation ? "Open link" : "Run link";
  actions.append(openButton);

  const copyButton = document.createElement("button");
  copyButton.className = "button button-small button-secondary";
  copyButton.textContent = "Copy URL";
  copyButton.addEventListener("click", async () => {
    await copyText(href);
    copyButton.textContent = "Copied";
    window.setTimeout(() => {
      copyButton.textContent = "Copy URL";
    }, 1000);
  });
  actions.append(copyButton);

  const toggleButton = document.createElement("button");
  toggleButton.className = "button button-small button-ghost";
  toggleButton.textContent = link.is_enabled ? "Disable" : "Enable";
  toggleButton.addEventListener("click", async () => {
    await api(`/api/action-links/${link.id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ is_enabled: !link.is_enabled }),
    });
    await refreshAll();
  });
  actions.append(toggleButton);

  const deleteButton = document.createElement("button");
  deleteButton.className = "button button-small button-ghost";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    await api(`/api/action-links/${link.id}`, { method: "DELETE" });
    await refreshAll();
  });
  actions.append(deleteButton);

  node.append(actions);
  return node;
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
  state.rooms = rooms;
  state.devices = devices;
  state.groups = groups;
  state.scenes = scenes;
  state.rules = rules;
  state.actionLinks = actionLinks;

  els.deviceFamily.innerHTML = system.supported_families.map((family) => `<option value="${family}">${family}</option>`).join("");
  fillSelect(
    els.groupAttachGroup,
    groups.map((group) => ({ value: group.id, label: `#${group.id} ${group.name}` })),
    "No groups yet",
  );
  fillSelect(
    els.groupAttachDevice,
    devices.map((device) => ({ value: device.id, label: `#${device.id} ${device.name} (${device.family})` })),
    "No devices yet",
  );
  fillSelect(
    els.sceneActionScene,
    scenes.map((scene) => ({ value: scene.id, label: `#${scene.id} ${scene.name}` })),
    "No scenes yet",
  );
  syncTargetSelect(els.sceneTargetType, els.sceneTargetId);
  syncTargetSelect(els.ruleTargetType, els.ruleTargetId);
  syncTargetSelect(els.actionLinkTargetType, els.actionLinkTargetId);
  syncActionLinkActionOptions();

  els.cards.innerHTML = "";
  els.cards.append(
    card("Devices", dashboard.devices_total, "ELK, ZENGGE, BJ, and mock"),
    card("Groups", dashboard.groups_total, "mixed-family actions"),
    card("Scenes", dashboard.scenes_total, "device + group recipes"),
    card("Rules", dashboard.enabled_rules_total, `timezone ${system.timezone}`),
  );

  renderList(els.rooms, rooms, (room) => simpleCard(`#${room.id} ${room.name}`, `sort ${room.sort_order}`));
  renderList(els.devices, devices, deviceCard);
  renderList(els.groups, groups, renderGroupCard);
  renderList(els.scenes, scenes, renderSceneCard);
  renderList(els.actionLinks, actionLinks, renderActionLinkCard);
  renderList(
    els.rules,
    rules,
    (rule) =>
      simpleCard(
        `#${rule.id} ${rule.name}`,
        `${rule.rule_type} -> ${rule.target_type} ${rule.target_id}<br><span class="muted">next: ${rule.next_run_at || "none"}</span>`,
        (() => {
          const button = document.createElement("button");
          button.className = "button button-small button-secondary";
          button.textContent = rule.is_enabled ? "Disable" : "Enable";
          button.addEventListener("click", async () => {
            await api(`/api/rules/${rule.id}/${rule.is_enabled ? "disable" : "enable"}`, { method: "POST" });
            await refreshAll();
          });
          return button;
        })(),
      ),
  );
  renderList(
    els.upcoming,
    dashboard.upcoming_rules,
    (rule) => simpleCard(rule.name, `${rule.rule_type} at ${rule.next_run_at || "pending"}`),
  );
  renderList(
    els.failures,
    dashboard.recent_failures,
    (run) => simpleCard(`Rule #${run.rule_id}`, `${run.status}${run.error_text ? `: ${run.error_text}` : ""}`),
  );
}

async function refreshDiscovery() {
  const startedAt = performance.now();
  els.discoverButton.disabled = true;
  els.discoverButton.textContent = "Scanning...";
  els.discoveryStatus.textContent = "Scanning nearby BLE devices. This can take a few seconds on Windows.";
  els.discovery.innerHTML =
    '<div class="item"><div class="item-main muted">Scanning in progress. Nearby BLE devices will appear here when the pass completes.</div></div>';

  try {
    const candidates = await api("/api/devices/discover", { method: "POST" });
    const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    els.discoveryStatus.textContent = `Scan complete in ${elapsedSeconds}s. Found ${candidates.length} candidate(s).`;
    renderList(
      els.discovery,
      candidates,
      (candidate) =>
        simpleCard(
          candidate.name,
          `${candidate.family} | ${candidate.source} | RSSI ${candidate.rssi ?? "n/a"} | ${candidate.ble_identifier}<br><span class="muted">${candidate.classification_reason || "manual family override available"}${candidate.services?.length ? ` | services: ${candidate.services.join(", ")}` : ""}</span>`,
          (() => {
            const button = document.createElement("button");
            button.className = "button button-small";
            button.textContent = "Use in onboarding";
            button.addEventListener("click", () => selectCandidate(candidate));
            return button;
          })(),
        ),
    );
  } catch (error) {
    els.discoveryStatus.textContent = `BLE scan failed: ${error.message}`;
    els.discovery.innerHTML = `<div class="item"><div class="item-main muted">Scan failed. ${escapeHtml(error.message)}</div></div>`;
    throw error;
  } finally {
    els.discoverButton.disabled = false;
    els.discoverButton.textContent = "Scan BLE";
  }
}

function selectCandidate(candidate) {
  state.selectedCandidate = candidate;
  const form = document.getElementById("device-form");
  form.querySelector("[name=name]").value = candidate.name;
  form.querySelector("[name=ble_identifier]").value = candidate.ble_identifier;
  form.querySelector("[name=ble_address]").value = candidate.address || candidate.ble_identifier;
  form.querySelector("[name=vendor_name]").value = candidate.vendor_name || "";
  if (state.system?.supported_families?.includes(candidate.family)) {
    form.querySelector("[name=family]").value = candidate.family;
  }
  form.querySelector("[name=meta_json]").value = JSON.stringify({
    discovery: {
      source: candidate.source,
      classification_reason: candidate.classification_reason,
      services: candidate.services,
      manufacturer_data: candidate.manufacturer_data,
      metadata: candidate.metadata,
    },
  });
  document.getElementById("device-candidate-note").textContent =
    `Selected discovery candidate: ${candidate.name} (${candidate.family})`;
}

function clearSelectedCandidate() {
  state.selectedCandidate = null;
  const form = document.getElementById("device-form");
  form.querySelector("[name=meta_json]").value = "{}";
  form.querySelector("[name=vendor_name]").value = "";
  form.querySelector("[name=ble_address]").value = "";
  document.getElementById("device-candidate-note").textContent = "Manual entry or pick a discovery candidate below.";
}

function handleForm(formId, onSubmit) {
  document.getElementById(formId).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    await onSubmit(data, form);
    form.reset();
    if (formId === "device-form") {
      clearSelectedCandidate();
    }
    if (formId === "rule-form") {
      form.querySelector("[name=timezone]").value = state.system?.timezone || "Asia/Qyzylorda";
      form.querySelector("[name=days_of_week_mask]").value = 127;
      form.querySelector("[name=payload_json]").value = '{"action":"on","time":"19:00:00"}';
    }
    if (formId === "action-link-form") {
      form.querySelector("[name=is_enabled]").checked = true;
    }
    await refreshAll();
  });
}

handleForm("room-form", (data) =>
  api("/api/rooms", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: data.name, sort_order: Number(data.sort_order || 0) }),
  }),
);

handleForm("device-form", (data) =>
  api("/api/devices", {
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
  }),
);

handleForm("group-form", (data) =>
  api("/api/groups", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: data.name,
      room_id: data.room_id ? Number(data.room_id) : null,
    }),
  }),
);

handleForm("group-attach-form", (data) =>
  api(`/api/groups/${Number(data.group_id)}/devices`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ device_id: Number(data.device_id) }),
  }),
);

handleForm("scene-form", (data) =>
  api("/api/scenes", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: data.name,
      room_id: data.room_id ? Number(data.room_id) : null,
    }),
  }),
);

handleForm("scene-action-form", (data) =>
  api(`/api/scenes/${Number(data.scene_id)}/actions`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      target_type: data.target_type,
      target_id: Number(data.target_id),
      action_type: data.action_type,
      action_payload_json: JSON.parse(data.action_payload_json || "{}"),
    }),
  }),
);

handleForm("action-link-form", (data, form) =>
  api("/api/action-links", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: data.name,
      token: data.token || null,
      target_type: data.target_type,
      target_id: Number(data.target_id),
      action_type: data.action_type,
      is_enabled: form.querySelector("[name=is_enabled]").checked,
      requires_confirmation: form.querySelector("[name=requires_confirmation]").checked,
    }),
  }),
);

handleForm("rule-form", (data) =>
  api("/api/rules", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: data.name,
      target_type: data.target_type,
      target_id: Number(data.target_id),
      rule_type: data.rule_type,
      timezone: data.timezone,
      days_of_week_mask: Number(data.days_of_week_mask),
      payload_json: JSON.parse(data.payload_json || "{}"),
    }),
  }),
);

document.getElementById("refresh-all").addEventListener("click", refreshAll);
els.discoverButton.addEventListener("click", refreshDiscovery);
document.getElementById("clear-onboarding").addEventListener("click", clearSelectedCandidate);
els.sceneTargetType.addEventListener("change", () => syncTargetSelect(els.sceneTargetType, els.sceneTargetId));
els.ruleTargetType.addEventListener("change", () => syncTargetSelect(els.ruleTargetType, els.ruleTargetId));
els.actionLinkTargetType.addEventListener("change", () => {
  syncTargetSelect(els.actionLinkTargetType, els.actionLinkTargetId);
  syncActionLinkActionOptions();
});

refreshAll().catch((error) => {
  console.error(error);
  alert(error.message);
});
