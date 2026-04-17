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
  deviceFamily: document.getElementById("device-family"),
};

const state = {
  system: null,
};

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
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

function deviceCard(device) {
  const template = document.getElementById("device-card-template");
  const node = template.content.firstElementChild.cloneNode(true);
  const known = device.known_state_json || {};
  node.querySelector(".item-main").innerHTML = `
    <strong>#${device.id} ${device.name}</strong>
    <div class="badge">${device.family}</div>
    <div>State: ${known.is_on ? "on" : "off"}, brightness ${known.brightness ?? 100}%</div>
    <div class="muted">${device.ble_identifier}</div>
  `;
  node.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      if (action === "warm") {
        await api(`/api/devices/${device.id}/color`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ r: 255, g: 160, b: 88 }),
        });
      } else {
        await api(`/api/devices/${device.id}/${action}`, { method: "POST" });
      }
      await refreshAll();
    });
  });
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

async function refreshAll() {
  const [system, dashboard, rooms, devices, groups, scenes, rules] = await Promise.all([
    api("/api/system/info"),
    api("/api/dashboard"),
    api("/api/rooms"),
    api("/api/devices"),
    api("/api/groups"),
    api("/api/scenes"),
    api("/api/rules"),
  ]);

  state.system = system;
  els.deviceFamily.innerHTML = system.supported_families.map((family) => `<option value="${family}">${family}</option>`).join("");

  els.cards.innerHTML = "";
  els.cards.append(
    card("Devices", dashboard.devices_total, "mock and future BLE families"),
    card("Groups", dashboard.groups_total, "shared actions"),
    card("Scenes", dashboard.scenes_total, "ordered action sets"),
    card("Rules", dashboard.enabled_rules_total, `timezone ${system.timezone}`),
  );

  renderList(els.rooms, rooms, (room) => simpleCard(`#${room.id} ${room.name}`, `sort ${room.sort_order}`));
  renderList(els.devices, devices, deviceCard);
  renderList(
    els.groups,
    groups,
    (group) =>
      simpleCard(
        `#${group.id} ${group.name}`,
        `devices: ${(group.devices || []).map((device) => device.name).join(", ") || "none"}`,
      ),
  );
  renderList(
    els.scenes,
    scenes,
    (scene) =>
      simpleCard(
        `#${scene.id} ${scene.name}`,
        `actions: ${(scene.actions || []).map((item) => `${item.action_type} -> ${item.target_type} ${item.target_id}`).join(" | ") || "none"}`,
        (() => {
          const button = document.createElement("button");
          button.className = "button button-small";
          button.textContent = "Run";
          button.addEventListener("click", async () => {
            await api(`/api/scenes/${scene.id}/run`, { method: "POST" });
            await refreshAll();
          });
          return button;
        })(),
      ),
  );
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
  const candidates = await api("/api/devices/discover", { method: "POST" });
  renderList(
    els.discovery,
    candidates,
    (candidate) =>
      simpleCard(
        candidate.name,
        `${candidate.family} | RSSI ${candidate.rssi ?? "n/a"} | ${candidate.ble_identifier}`,
        (() => {
          const button = document.createElement("button");
          button.className = "button button-small";
          button.textContent = "Add";
          button.addEventListener("click", async () => {
            await api("/api/devices", {
              method: "POST",
              headers: jsonHeaders,
              body: JSON.stringify({
                name: candidate.name,
                family: candidate.family,
                ble_identifier: candidate.ble_identifier,
                vendor_name: candidate.vendor_name,
              }),
            });
            await refreshAll();
          });
          return button;
        })(),
      ),
  );
}

function handleForm(formId, onSubmit) {
  document.getElementById(formId).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    await onSubmit(data);
    form.reset();
    if (formId === "rule-form") {
      form.querySelector("[name=timezone]").value = state.system?.timezone || "Asia/Qyzylorda";
      form.querySelector("[name=days_of_week_mask]").value = 127;
      form.querySelector("[name=payload_json]").value = '{"action":"on","time":"19:00:00"}';
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
      room_id: data.room_id ? Number(data.room_id) : null,
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
document.getElementById("discover-devices").addEventListener("click", refreshDiscovery);

refreshAll().catch((error) => {
  console.error(error);
  alert(error.message);
});

