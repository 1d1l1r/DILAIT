import { chromeCopy as getChromeCopy, dayLabel as getDayLabel, legacyText, normalizeLocale } from "./home-i18n.js?v=20260516a";

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

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const COMMON_TIMEZONES = [
  "Asia/Qyzylorda",
  "Asia/Almaty",
  "Asia/Tashkent",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Istanbul",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

const els = {
  pageKicker: document.getElementById("page-kicker"),
  pageTitle: document.getElementById("page-title"),
  pageSubtitle: document.getElementById("page-subtitle"),
  backButton: document.getElementById("back-button"),
  homeButton: document.getElementById("home-button"),
  refreshButton: document.getElementById("refresh-button"),
  content: document.getElementById("screen-content"),
  toast: document.getElementById("toast"),
  dockButtons: [...document.querySelectorAll("[data-add-screen]")],
  localeButtons: [...document.querySelectorAll("[data-locale]")],
};

const state = {
  system: null,
  dashboard: null,
  rooms: [],
  devices: [],
  groups: [],
  scenes: [],
  rules: [],
  actionLinks: [],
  discovery: null,
  selectedCandidate: null,
  timezones: [],
  locale: normalizeLocale(window.localStorage.getItem("lights-hub-locale") || "ru"),
  screen: { name: "home", params: {} },
  history: [],
  refreshTimer: null,
  toastTimer: null,
  pendingDeviceActions: new Set(),
};

function chromeCopy() {
  return getChromeCopy(state.locale);
}

function lang(ru, en) {
  return legacyText(state.locale, ru, en);
}

function dayLabel(day) {
  return getDayLabel(state.locale, day);
}

function pluralRu(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function lightsLabel(count) {
  return lang(`${count} ${pluralRu(count, "свет", "света", "света")}`, `${count} light(s)`);
}

function activeLabel(count) {
  return lang(`${count} вкл.`, `${count} on`);
}

function membersLabel(count) {
  return lang(`${count} ${pluralRu(count, "участник", "участника", "участников")}`, `${count} member(s)`);
}

function actionsLabel(count) {
  return lang(`${count} ${pluralRu(count, "действие", "действия", "действий")}`, `${count} action(s)`);
}

function countLabel(count, ruOne, ruFew, ruMany, enLabel) {
  return lang(`${count} ${pluralRu(count, ruOne, ruFew, ruMany)}`, `${count} ${enLabel}(s)`);
}

function localizeDynamicText(text) {
  const lightsRuMatch = text.match(/^(\d+)\s+свет(?:а)?$/);
  if (lightsRuMatch) return lightsLabel(Number(lightsRuMatch[1]));

  const activeRuMatch = text.match(/^(\d+)\s+вкл\.$/);
  if (activeRuMatch) return activeLabel(Number(activeRuMatch[1]));

  const memberRuMatch = text.match(/^(\d+)\s+участник(?:а|ов)?$/);
  if (memberRuMatch) return membersLabel(Number(memberRuMatch[1]));

  const actionRuMatch = text.match(/^(\d+)\s+действи(?:е|я|й)$/);
  if (actionRuMatch) return actionsLabel(Number(actionRuMatch[1]));

  const memberMatch = text.match(/^(\d+)\s+member\(s\)$/);
  if (memberMatch) return membersLabel(Number(memberMatch[1]));

  const actionMatch = text.match(/^(\d+)\s+action\(s\)$/);
  if (actionMatch) return actionsLabel(Number(actionMatch[1]));

  const groupMatch = text.match(/^(\d+)\s+member\(s\)\s+across\s+(\d+)\s+family group\(s\)\.$/);
  if (groupMatch) {
    const members = Number(groupMatch[1]);
    const families = Number(groupMatch[2]);
    return lang(
      `${membersLabel(members)}, ${families} ${pluralRu(families, "семейство", "семейства", "семейств")}.`,
      `${members} member(s) across ${families} family group(s).`,
    );
  }

  const sceneReadyMatch = text.match(/^(\d+)\s+action\(s\)\s+ready to run\.$/);
  if (sceneReadyMatch) {
    const actions = Number(sceneReadyMatch[1]);
    return lang(`${actionsLabel(actions)} готовы к запуску.`, `${actions} action(s) ready to run.`);
  }

  return null;
}

function applyChromeCopy() {
  const copy = chromeCopy();
  document.documentElement.lang = state.locale;
  document.title = "DILIAT";
  document.querySelector(".footer-link").textContent = copy.advanced;
  els.pageKicker.textContent = copy.kicker;
  els.refreshButton.textContent = copy.refresh;
  els.backButton.textContent = copy.back;
  els.homeButton.textContent = copy.home;
  els.backButton.setAttribute("aria-label", copy.back);
  els.homeButton.setAttribute("aria-label", copy.home);
  els.dockButtons.forEach((button) => {
    button.textContent = copy.dock[button.dataset.addScreen] || button.textContent;
  });
  els.localeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.locale === state.locale);
  });
}

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
  const source = rgb || { r: 255, g: 255, b: 255 };
  const toHex = (value) => Number(value || 0).toString(16).padStart(2, "0");
  return `#${toHex(source.r)}${toHex(source.g)}${toHex(source.b)}`;
}

function hexToRgb(value) {
  const normalized = value.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function currentScreen() {
  return state.screen;
}

function openScreen(name, params = {}, { replace = false } = {}) {
  const current = currentScreen();
  if (!replace && current) {
    state.history.push({ name: current.name, params: { ...current.params } });
  }
  state.screen = { name, params };
  renderScreen();
}

function goBack() {
  const previous = state.history.pop();
  if (!previous) {
    state.screen = { name: "home", params: {} };
  } else {
    state.screen = previous;
  }
  renderScreen();
}

function goHome() {
  state.history = [];
  state.screen = { name: "home", params: {} };
  renderScreen();
}

function setHeader({ kicker, title, subtitle, canBack = true }) {
  els.pageKicker.textContent = kicker;
  els.pageTitle.textContent = title;
  els.pageSubtitle.textContent = subtitle || "";
  els.pageSubtitle.classList.toggle("is-hidden", !subtitle);
  els.backButton.classList.toggle("is-inert", !canBack);
  els.homeButton.classList.toggle("is-inert", !canBack);
  els.backButton.tabIndex = canBack ? 0 : -1;
  els.homeButton.tabIndex = canBack ? 0 : -1;
}

function isAddScreen(name) {
  return name.startsWith("add-");
}

function updateDockState() {
  const dock = document.querySelector(".add-dock");
  dock?.classList.toggle("is-home", currentScreen().name === "home");
  els.dockButtons.forEach((button) => {
    button.classList.toggle("is-active", currentScreen().name === button.dataset.addScreen);
  });
}

function showToast(message, type = "info") {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  state.toastTimer = window.setTimeout(() => {
    els.toast.className = "toast is-hidden";
  }, 2400);
}

function enqueueRefresh(delayMs = 180) {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => {
    refreshAll({ silent: true }).catch((error) => {
      console.error(error);
      showToast(error.message, "error");
    });
  }, delayMs);
}

function formatDateTime(value) {
  if (!value) return lang("Не запланировано", "Not scheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function deviceState(device) {
  return device.known_state_json || device.desired_state_json || {};
}

function roomById(roomId) {
  return state.rooms.find((room) => room.id === roomId) || null;
}

function roomLabel(roomId) {
  return roomById(roomId)?.name || lang("Без комнаты", "No room");
}

function groupById(groupId) {
  return state.groups.find((group) => group.id === groupId) || null;
}

function sceneById(sceneId) {
  return state.scenes.find((scene) => scene.id === sceneId) || null;
}

function deviceById(deviceId) {
  return state.devices.find((device) => device.id === deviceId) || null;
}

function targetLabel(targetType, targetId) {
  if (targetType === "group") return groupById(targetId)?.name || lang("Группа", "Group");
  if (targetType === "scene") return sceneById(targetId)?.name || lang("Сцена", "Scene");
  return deviceById(targetId)?.name || lang("Устройство", "Device");
}

function targetOptionsFor(type) {
  if (type === "group") {
    return state.groups.map((group) => ({ value: group.id, label: group.name }));
  }
  if (type === "scene") {
    return state.scenes.map((scene) => ({ value: scene.id, label: scene.name }));
  }
  return state.devices.map((device) => ({ value: device.id, label: `${device.name} - ${roomLabel(device.room_id)}` }));
}

function roomOptionsMarkup(selected = "", { allowBlank = true, blankLabel = "No room" } = {}) {
  const options = [];
  if (allowBlank) {
    options.push(`<option value=""${selected === "" ? " selected" : ""}>${escapeHtml(blankLabel)}</option>`);
  }
  state.rooms.forEach((room) => {
    options.push(
      `<option value="${room.id}"${String(selected) === String(room.id) ? " selected" : ""}>${escapeHtml(room.name)}</option>`,
    );
  });
  return options.join("");
}

function targetOptionsMarkup(type, selected = "") {
  const options = targetOptionsFor(type);
  if (!options.length) {
    return `<option value="">${escapeHtml(lang("Пока пусто", "Nothing available"))}</option>`;
  }
  return options
    .map(
      (option) =>
        `<option value="${option.value}"${String(selected) === String(option.value) ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
    )
    .join("");
}

function linkActionOptionsMarkup(targetType, selected = "on") {
  const options = targetType === "scene" ? ["run_scene"] : ["on", "off", "toggle"];
  return options
    .map(
      (option) =>
        `<option value="${option}"${option === selected ? " selected" : ""}>${escapeHtml(actionTypeLabel(option))}</option>`,
    )
    .join("");
}

function sceneActionOptionsMarkup(selected = "on") {
  return ["on", "off", "brightness", "color"]
    .map(
      (option) =>
        `<option value="${option}"${option === selected ? " selected" : ""}>${escapeHtml(actionTypeLabel(option))}</option>`,
    )
    .join("");
}

function scheduleActionOptionsMarkup(targetType, selected = "on") {
  const options = targetType === "scene" ? ["run_scene"] : ["on", "off", "toggle", "brightness", "color"];
  return options
    .map(
      (option) =>
        `<option value="${option}"${option === selected ? " selected" : ""}>${escapeHtml(actionTypeLabel(option))}</option>`,
    )
    .join("");
}

function actionTypeLabel(action) {
  return {
    on: lang("Включить", "Turn on"),
    off: lang("Выключить", "Turn off"),
    toggle: lang("Переключить", "Toggle"),
    brightness: lang("Яркость", "Brightness"),
    color: lang("Цвет", "Color"),
    run_scene: lang("Запустить сцену", "Run scene"),
  }[action] || action;
}

function ruleTypeLabel(type) {
  return {
    delay: lang("Задержка", "Delay"),
    once: lang("Один раз", "Once"),
    recurring: lang("Повтор", "Recurring"),
    astronomical: lang("Астрономическое", "Astronomical"),
  }[type] || type;
}

function solarEventLabel(type) {
  return {
    sunset: lang("Закат", "Sunset"),
    sunrise: lang("Рассвет", "Sunrise"),
  }[type] || type;
}

function timezoneOffsetLabel(timeZone) {
  const now = new Date();
  for (const style of ["longOffset", "shortOffset"]) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: style,
        hour: "2-digit",
      }).formatToParts(now);
      const value = parts.find((part) => part.type === "timeZoneName")?.value;
      if (value) return value.replace("UTC", "GMT");
    } catch (error) {
      console.debug(error);
    }
  }
  return "GMT";
}

function buildTimezoneOptions(defaultZone) {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const set = new Set([...COMMON_TIMEZONES, ...(all.length ? all : []), defaultZone].filter(Boolean));
  return [...set]
    .map((timeZone) => ({
      value: timeZone,
      label: `${timezoneOffsetLabel(timeZone)} - ${timeZone}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function timezoneOptionsMarkup(selected) {
  return state.timezones
    .map(
      (zone) =>
        `<option value="${escapeHtml(zone.value)}"${zone.value === selected ? " selected" : ""}>${escapeHtml(zone.label)}</option>`,
    )
    .join("");
}

function relevantRoomDevices(roomId) {
  return state.devices.filter((device) => device.room_id === roomId);
}

function averageRoomColor(devices) {
  if (!devices.length) {
    return { r: 92, g: 106, b: 142, active: false };
  }
  const active = devices.filter((device) => deviceState(device).is_on);
  const source = active.length ? active : devices;
  let weightTotal = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  source.forEach((device) => {
    const current = deviceState(device);
    const rgb = current.rgb || { r: 78, g: 112, b: 164 };
    const weight = Math.max(0.25, Number(current.brightness ?? 100) / 100);
    weightTotal += weight;
    r += Number(rgb.r || 0) * weight;
    g += Number(rgb.g || 0) * weight;
    b += Number(rgb.b || 0) * weight;
  });
  return {
    r: Math.round(r / weightTotal),
    g: Math.round(g / weightTotal),
    b: Math.round(b / weightTotal),
    active: active.length > 0,
  };
}

function roomTintStyle(roomId) {
  const tint = averageRoomColor(relevantRoomDevices(roomId));
  const alpha = tint.active ? 0.22 : 0.11;
  const borderAlpha = tint.active ? 0.34 : 0.18;
  return `--room-glow: rgba(${tint.r}, ${tint.g}, ${tint.b}, ${alpha}); --room-border: rgba(${tint.r}, ${tint.g}, ${tint.b}, ${borderAlpha});`;
}

function describeDays(mask) {
  if (mask === 127) return lang("Каждый день", "Every day");
  const weekdays = DAY_BITS.mon | DAY_BITS.tue | DAY_BITS.wed | DAY_BITS.thu | DAY_BITS.fri;
  const weekends = DAY_BITS.sat | DAY_BITS.sun;
  if (mask === weekdays) return lang("Будни", "Weekdays");
  if (mask === weekends) return lang("Выходные", "Weekends");
  return DAY_ORDER.filter((day) => (mask & DAY_BITS[day]) > 0)
    .map((day) => dayLabel(day))
    .join(", ");
}

function describeRule(rule) {
  const payload = rule.payload_json || {};
  const action = actionTypeLabel(payload.action || "run_scene");
  if (rule.rule_type === "delay") {
    return lang(`Через ${payload.delay_seconds || 0} c -> ${action}`, `After ${payload.delay_seconds || 0}s -> ${action}`);
  }
  if (rule.rule_type === "once") {
    return `${formatDateTime(payload.run_at)} -> ${action}`;
  }
  if (rule.rule_type === "recurring") {
    return lang(
      `${describeDays(rule.days_of_week_mask)} в ${(payload.time || "--:--").slice(0, 5)} -> ${action}`,
      `${describeDays(rule.days_of_week_mask)} at ${(payload.time || "--:--").slice(0, 5)} -> ${action}`,
    );
  }
  if (rule.rule_type === "astronomical") {
    return lang(
      `${describeDays(rule.days_of_week_mask)} ${solarEventLabel(payload.solar_event || "sunset")} (${payload.offset_minutes || 0} мин) -> ${action}`,
      `${describeDays(rule.days_of_week_mask)} ${payload.solar_event || "sunset"} (${payload.offset_minutes || 0} min) -> ${action}`,
    );
  }
  return `${ruleTypeLabel(rule.rule_type)} -> ${action}`;
}

function ruleDayMode(mask) {
  const weekdays = DAY_BITS.mon | DAY_BITS.tue | DAY_BITS.wed | DAY_BITS.thu | DAY_BITS.fri;
  const weekends = DAY_BITS.sat | DAY_BITS.sun;
  if (mask === 127) return "everyday";
  if (mask === weekdays) return "weekdays";
  if (mask === weekends) return "weekends";
  return "custom";
}

function computeDaysMaskFromForm(form) {
  const mode = form.querySelector('input[name="day_mode"]:checked')?.value || "everyday";
  if (mode === "everyday") return 127;
  if (mode === "weekdays") return DAY_BITS.mon | DAY_BITS.tue | DAY_BITS.wed | DAY_BITS.thu | DAY_BITS.fri;
  if (mode === "weekends") return DAY_BITS.sat | DAY_BITS.sun;
  const selected = [...form.querySelectorAll('input[name="custom_day"]:checked')].map((input) => input.value);
  const mask = selected.reduce((total, day) => total + DAY_BITS[day], 0);
  if (!mask) throw new Error(lang("Выбери хотя бы один день.", "Choose at least one custom day."));
  return mask;
}

function scheduleFormDataFromRule(rule) {
  const payload = rule?.payload_json || {};
  return {
    name: rule?.name || "",
    target_type: rule?.target_type || "device",
    target_id: rule?.target_id || "",
    rule_type: rule?.rule_type || "recurring",
    action: payload.action || (rule?.target_type === "scene" ? "run_scene" : "on"),
    brightness_value: payload.value ?? 60,
    color_value: payload.r != null ? rgbToHex({ r: payload.r, g: payload.g, b: payload.b }) : "#6de9ff",
    delay_seconds: payload.delay_seconds ?? 5,
    run_at: payload.run_at ? new Date(payload.run_at).toISOString().slice(0, 16) : "",
    recurring_time: payload.time ? payload.time.slice(0, 5) : "19:00",
    solar_event: payload.solar_event || "sunset",
    offset_minutes: payload.offset_minutes ?? -20,
    lat: payload.lat ?? 43.2389,
    lon: payload.lon ?? 76.8897,
    timezone: rule?.timezone || state.system?.timezone || "Asia/Qyzylorda",
    day_mode: ruleDayMode(rule?.days_of_week_mask ?? 127),
    days_mask: rule?.days_of_week_mask ?? 127,
    is_enabled: rule?.is_enabled ?? true,
  };
}

function linkFormDataFromLink(link) {
  return {
    name: link?.name || "",
    target_type: link?.target_type || "device",
    target_id: link?.target_id || "",
    action_type: link?.action_type || "on",
    requires_confirmation: link?.requires_confirmation || false,
    is_enabled: link?.is_enabled ?? true,
  };
}

function sceneActionSummary(action) {
  const payload = action.action_payload_json || {};
  if (action.action_type === "brightness") {
    return `${action.action_type} ${payload.value ?? "--"}%`;
  }
  if (action.action_type === "color") {
    return `${action.action_type} ${rgbToHex({ r: payload.r || 0, g: payload.g || 0, b: payload.b || 0 })}`;
  }
  return action.action_type;
}

function setContent(html) {
  els.content.innerHTML = html;
}

function syncDeviceInState(device) {
  const index = state.devices.findIndex((item) => item.id === device.id);
  if (index >= 0) {
    state.devices[index] = device;
  } else {
    state.devices.push(device);
  }
}

function patchDeviceState(deviceId, patch) {
  const device = deviceById(deviceId);
  if (!device) return;
  device.known_state_json = { ...(device.known_state_json || {}), ...patch };
  device.desired_state_json = { ...(device.desired_state_json || {}), ...patch };
}

function applyLocalTargetPatch(targetType, targetId, actionName, payload = {}) {
  if (targetType === "device") {
    if (actionName === "on") patchDeviceState(targetId, { is_on: true });
    if (actionName === "off") patchDeviceState(targetId, { is_on: false });
    if (actionName === "toggle") {
      const device = deviceById(targetId);
      patchDeviceState(targetId, { is_on: !deviceState(device).is_on });
    }
    if (actionName === "brightness") patchDeviceState(targetId, { is_on: true, brightness: Number(payload.value) });
    if (actionName === "color") {
      patchDeviceState(targetId, {
        is_on: true,
        rgb: { r: Number(payload.r), g: Number(payload.g), b: Number(payload.b) },
      });
    }
    return;
  }

  if (targetType === "group") {
    const group = groupById(targetId);
    (group?.devices || []).forEach((device) => applyLocalTargetPatch("device", device.id, actionName, payload));
    return;
  }

  if (targetType === "scene") {
    const scene = sceneById(targetId);
    (scene?.actions || []).forEach((action) => {
      applyLocalTargetPatch(action.target_type, action.target_id, action.action_type, action.action_payload_json || {});
    });
  }
}

async function handleDeviceAction(deviceId, actionName, payload = null) {
  if (state.pendingDeviceActions.has(deviceId)) {
    showToast(lang("Команда уже отправляется.", "Command already in progress."));
    return null;
  }
  state.pendingDeviceActions.add(deviceId);
  try {
    const response = await api(`/api/devices/${deviceId}/${actionName}`, {
      method: "POST",
      headers: payload ? jsonHeaders : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    syncDeviceInState(response);
    return response;
  } finally {
    state.pendingDeviceActions.delete(deviceId);
    renderScreen();
    enqueueRefresh();
  }
}

async function runRoomAction(roomId, actionName, payload = null) {
  const devices = relevantRoomDevices(roomId);
  if (!devices.length) {
      showToast(lang("В этой комнате пока нет света.", "This room has no lights yet."));
    return;
  }
  const results = await Promise.allSettled(
    devices.map((device) =>
      api(`/api/devices/${device.id}/${actionName}`, {
        method: "POST",
        headers: payload ? jsonHeaders : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      }),
    ),
  );
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      syncDeviceInState(result.value);
    } else {
      const device = devices[index];
      console.warn("Room action failed", device?.name, result.reason);
    }
  });
  renderScreen();
  enqueueRefresh();
  const failureCount = results.filter((result) => result.status === "rejected").length;
  if (failureCount) {
        showToast(
          lang(
          `${failureCount} действий комнаты с ошибкой. Подробности в расширенном разделе.`,
          `${failureCount} room action(s) failed. See Advanced for details.`,
          ),
          "error",
        );
  }
}

async function handleGroupAction(groupId, actionName, payload = null) {
  await api(`/api/groups/${groupId}/${actionName}`, {
    method: "POST",
    headers: payload ? jsonHeaders : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  applyLocalTargetPatch("group", groupId, actionName, payload || {});
  renderScreen();
  enqueueRefresh();
}

async function handleSceneRun(sceneId) {
  await api(`/api/scenes/${sceneId}/run`, { method: "POST" });
  applyLocalTargetPatch("scene", sceneId, "run_scene", {});
  renderScreen();
  enqueueRefresh();
}

function discoveryGroups() {
  const candidates = state.discovery || [];
  const visibleCandidates = candidates.filter((candidate) => candidate.source !== "mock");
  const onboarded = new Map(state.devices.map((device) => [device.ble_identifier, device]));
  return {
    supported: visibleCandidates.filter(
      (candidate) =>
        candidate.source === "real" &&
        candidate.is_supported &&
        candidate.family !== "mock" &&
        !onboarded.has(candidate.ble_identifier),
    ),
    existing: visibleCandidates.filter((candidate) => onboarded.has(candidate.ble_identifier)),
    other: visibleCandidates.filter(
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

async function refreshDiscovery() {
  const button = els.content.querySelector('[data-action="scan"]');
  const status = els.content.querySelector('[data-role="discovery-status"]');
  if (button) {
    button.disabled = true;
    button.textContent = "Сканирование...";
  }
  if (status) {
    status.textContent = "Идёт поиск ближайших поддерживаемых ламп. На Windows BLE-сканирование может занять несколько секунд.";
  }
  const startedAt = performance.now();
  try {
    state.discovery = await api("/api/devices/discover", { method: "POST" });
    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    const groups = discoveryGroups();
    if (status) {
      status.textContent = `Сканирование завершено за ${elapsed} c. Новых поддерживаемых ламп: ${groups.supported.length}.`;
    }
    renderScreen();
  } catch (error) {
    console.error(error);
    if (status) {
      status.textContent = `Ошибка поиска: ${error.message}`;
    }
    showToast(error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Искать лампы";
    }
  }
}

async function refreshAll({ silent = false } = {}) {
  try {
    if (!silent) {
      els.refreshButton.disabled = true;
      els.refreshButton.textContent = chromeCopy().refreshing;
    }
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
    if (!state.timezones.length) {
      state.timezones = buildTimezoneOptions(system.timezone || "UTC");
    }
    renderScreen();
    if (!silent) {
    showToast(lang("Обновлено", "Refreshed"));
    }
  } finally {
    els.refreshButton.disabled = false;
    els.refreshButton.textContent = chromeCopy().refresh;
  }
}

function overviewCardMarkup(kind, label, value, note) {
  return `
    <button class="overview-card" data-open-screen="${kind}" type="button">
      <p class="section-kicker">${escapeHtml(label)}</p>
      <strong>${escapeHtml(value)}</strong>
      <span>${note ? escapeHtml(note) : ""}</span>
    </button>
  `;
}

function roomCardMarkup(room) {
  const devices = relevantRoomDevices(room.id);
  const activeCount = devices.filter((device) => deviceState(device).is_on).length;
  return `
    <article class="room-card clickable" data-room-card="${room.id}" style="${roomTintStyle(room.id)}">
      <div class="card-head">
        <div>
          <p class="section-kicker">${activeCount ? lang("Активная комната", "Active room") : lang("Комната", "Room")}</p>
          <h3>${escapeHtml(room.name)}</h3>
          <div class="meta-row">
            <span class="meta-pill">${lightsLabel(devices.length)}</span>
            <span class="meta-pill">${activeLabel(activeCount)}</span>
          </div>
        </div>
        <button class="pill-button" type="button" data-open-room="${room.id}">${lang("Открыть", "Open")}</button>
      </div>
      <div class="quick-grid control-grid">
        <button class="primary-button" type="button" data-room-action="${room.id}" data-action-name="on">${lang("Включить", "Turn on")}</button>
        <button class="ghost-button" type="button" data-room-action="${room.id}" data-action-name="off">${lang("Выключить", "Turn off")}</button>
        <label class="field">
          <span>${lang("Яркость", "Brightness")}</span>
          <input type="range" min="0" max="100" value="70" data-room-brightness="${room.id}" />
        </label>
        <button class="soft-button" type="button" data-room-action="${room.id}" data-action-name="brightness">${lang("Применить", "Apply")}</button>
        <label class="field">
          <span>${lang("Цвет", "Color")}</span>
          <input type="color" value="#6de9ff" data-room-color="${room.id}" />
        </label>
        <button class="ghost-button" type="button" data-room-action="${room.id}" data-action-name="color">${lang("Покрасить", "Tint")}</button>
      </div>
    </article>
  `;
}

function deviceCardMarkup(device) {
  const current = deviceState(device);
  return `
    <article class="list-card">
      <div class="card-head">
        <div>
          <p class="section-kicker">${escapeHtml(roomLabel(device.room_id))}</p>
          <h3>${escapeHtml(device.name)}</h3>
          <div class="pill-row">
            <span class="family-pill">${escapeHtml(device.family)}</span>
            <span class="status-pill ${current.is_on ? "good" : "warn"}">${current.is_on ? lang("Вкл", "On") : lang("Выкл", "Off")}</span>
          </div>
        </div>
        <div class="inline-actions">
          <button class="pill-button" type="button" data-open-device="${device.id}">${lang("Открыть", "Open")}</button>
          <button class="primary-button" type="button" data-device-toggle="${device.id}">${current.is_on ? lang("Выключить", "Turn off") : lang("Включить", "Turn on")}</button>
        </div>
      </div>
      <div class="quick-grid control-grid">
        <label class="field">
          <span>${lang("Яркость", "Brightness")}</span>
          <input type="range" min="0" max="100" value="${Number(current.brightness ?? 100)}" data-device-brightness="${device.id}" />
        </label>
        <button class="soft-button" type="button" data-device-action="${device.id}" data-action-name="brightness">${lang("Применить", "Apply")}</button>
        <label class="field">
          <span>${lang("Цвет", "Color")}</span>
          <input type="color" value="${rgbToHex(current.rgb)}" data-device-color="${device.id}" />
        </label>
        <button class="ghost-button" type="button" data-device-action="${device.id}" data-action-name="color">${lang("Применить", "Apply")}</button>
      </div>
    </article>
  `;
}

function groupFamilies(group) {
  return [...new Set((group.devices || []).map((device) => device.family))];
}

function groupCardMarkup(group) {
  const families = groupFamilies(group);
  return `
    <article class="list-card">
      <div class="card-head">
        <div>
          <p class="section-kicker">${escapeHtml(roomLabel(group.room_id))}</p>
          <h3>${escapeHtml(group.name)}</h3>
          <div class="pill-row">
            <span class="meta-pill">${membersLabel(group.devices?.length || 0)}</span>
            <span class="family-pill">${escapeHtml(families.join(", ") || lang("Пусто", "Empty"))}</span>
          </div>
        </div>
        <div class="inline-actions">
          <button class="pill-button" type="button" data-open-group="${group.id}">${lang("Открыть", "Open")}</button>
          <button class="primary-button" type="button" data-group-action="${group.id}" data-action-name="on">${lang("Вкл", "On")}</button>
          <button class="ghost-button" type="button" data-group-action="${group.id}" data-action-name="off">${lang("Выкл", "Off")}</button>
        </div>
      </div>
    </article>
  `;
}

function sceneCardMarkup(scene) {
  return `
    <article class="list-card">
      <div class="card-head">
        <div>
          <p class="section-kicker">${escapeHtml(roomLabel(scene.room_id))}</p>
          <h3>${escapeHtml(scene.name)}</h3>
          <div class="pill-row">
            <span class="meta-pill">${actionsLabel(scene.actions?.length || 0)}</span>
            <span class="status-pill ${scene.is_enabled ? "good" : "warn"}">${scene.is_enabled ? lang("Включена", "Enabled") : lang("Выключена", "Disabled")}</span>
          </div>
        </div>
        <div class="inline-actions">
          <button class="pill-button" type="button" data-open-scene="${scene.id}">${lang("Открыть", "Open")}</button>
          <button class="primary-button" type="button" data-run-scene="${scene.id}">${lang("Запустить", "Run")}</button>
        </div>
      </div>
    </article>
  `;
}

function ruleCardMarkup(rule) {
  return `
    <article class="list-card">
      <div class="card-head">
        <div>
          <p class="section-kicker">${escapeHtml(targetLabel(rule.target_type, rule.target_id))}</p>
          <h3>${escapeHtml(rule.name)}</h3>
          <p class="body-copy">${escapeHtml(describeRule(rule))}</p>
          <div class="pill-row">
            <span class="meta-pill">${escapeHtml(ruleTypeLabel(rule.rule_type))}</span>
            <span class="meta-pill">${escapeHtml(formatDateTime(rule.next_run_at))}</span>
          </div>
        </div>
        <div class="inline-actions">
          <button class="pill-button" type="button" data-open-rule="${rule.id}">${lang("Открыть", "Open")}</button>
          <button class="soft-button" type="button" data-toggle-rule="${rule.id}">${rule.is_enabled ? lang("Выключить", "Disable") : lang("Включить", "Enable")}</button>
        </div>
      </div>
    </article>
  `;
}

function linkCardMarkup(link) {
  const href = `${window.location.origin}/a/${link.token}`;
  return `
    <article class="list-card">
      <div class="card-head">
        <div>
          <p class="section-kicker">${escapeHtml(targetLabel(link.target_type, link.target_id))}</p>
          <h3>${escapeHtml(link.name)}</h3>
          <div class="pill-row">
            <span class="status-pill ${link.is_enabled ? "good" : "warn"}">${link.is_enabled ? lang("Включена", "Enabled") : lang("Выключена", "Disabled")}</span>
            <span class="meta-pill">${link.requires_confirmation ? lang("Сначала подтверждение", "Confirm first") : lang("Сразу", "Instant")}</span>
            <span class="meta-pill">${escapeHtml(actionTypeLabel(link.action_type))}</span>
          </div>
        </div>
        <div class="inline-actions">
          <button class="pill-button" type="button" data-open-link="${link.id}">${lang("Открыть", "Open")}</button>
          <a class="primary-button" href="${escapeHtml(href)}">${link.requires_confirmation ? lang("Проверить", "Review") : lang("Запустить", "Run")}</a>
        </div>
      </div>
    </article>
  `;
}

function renderHomeScreen() {
  const roomsPreview = state.rooms.slice(0, 4);
  const unassignedCount = state.devices.filter((device) => device.room_id == null).length;
  setHeader({
    kicker: lang("Главная", "Home"),
    title: "DILIAT",
    subtitle: "",
    canBack: false,
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">Обзор</p>
            <h2>Разделы</h2>
          </div>
        </div>
        <div class="overview-grid">
          ${overviewCardMarkup("rooms", "Комнаты", state.rooms.length, "")}
          ${overviewCardMarkup("devices", "Устройства", state.devices.length, "")}
          ${overviewCardMarkup("groups", "Группы", state.groups.length, "")}
          ${overviewCardMarkup("scenes", "Сцены", state.scenes.length, "")}
          ${overviewCardMarkup("schedules", "Расписания", state.rules.length, "")}
          ${overviewCardMarkup("links", "Ссылки", state.actionLinks.length, "")}
        </div>
      </section>

      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">Комнаты</p>
            <h2>Быстрый доступ</h2>
          </div>
          <button class="pill-button" type="button" data-open-screen="rooms">Все комнаты</button>
        </div>
        ${
          roomsPreview.length
            ? `<div class="room-grid">${roomsPreview.map((room) => roomCardMarkup(room)).join("")}</div>`
            : `<div class="empty-state">${lang("Комнат пока нет. Добавь первую через нижнюю панель.", "No rooms yet. Add the first one from the dock below.")}</div>`
        }
          ${
            unassignedCount
              ? `<div class="details-panel"><div class="card-head"><div><p class="section-kicker">${lang("Нужно разложить", "Needs sorting")}</p><h3>${lang("Свет без комнаты", "Unassigned lights")}</h3><p class="body-copy">${lang(`${unassignedCount} устройству(ам) ещё не назначена комната.`, `${unassignedCount} light(s) still need a room.`)}</p></div><button class="pill-button" type="button" data-open-screen="devices-unassigned">${lang("Разобрать", "Sort out")}</button></div></div>`
              : ""
          }
      </section>
    </div>
  `);
  bindOverviewCards();
  bindRoomCards();
}

function renderRoomsScreen() {
  setHeader({
    kicker: lang("Комнаты", "Rooms"),
    title: lang("Все комнаты", "All rooms"),
    subtitle: lang("Открывай комнату и управляй светом, группами и сценами без длинной прокрутки.", "Open a room and control lights, groups, and scenes without a long scroll."),
  });
  const unassignedCount = state.devices.filter((device) => device.room_id == null).length;
  setContent(`
    <div class="screen-stack">
          ${
            unassignedCount
              ? `<section class="details-panel"><div class="card-head"><div><p class="section-kicker">${lang("Без комнаты", "Unassigned")}</p><h3>${lang("Есть неразобранный свет", "Lights still need a room")}</h3><p class="body-copy">${lang(`${unassignedCount} устройству(ам) всё ещё нужна комната.`, `${unassignedCount} light(s) still need a room.`)}</p></div><button class="primary-button" type="button" data-open-screen="devices-unassigned">${lang("Назначить", "Assign")}</button></div></section>`
              : ""
          }
      ${
        state.rooms.length
          ? `<div class="room-grid">${state.rooms.map((room) => roomCardMarkup(room)).join("")}</div>`
          : `<div class="empty-state">${lang("Комнат пока нет. Создай первую через нижнюю панель.", "No rooms yet. Create the first one from the dock below.")}</div>`
      }
    </div>
  `);
  bindRoomCards();
  bindOverviewCards();
}

function renderRoomDetailScreen(roomId) {
  const room = roomById(roomId);
  if (!room) {
    openScreen("rooms", {}, { replace: true });
    return;
  }
  const devices = relevantRoomDevices(room.id);
  const groups = state.groups.filter((group) => group.room_id === room.id);
  const scenes = state.scenes.filter((scene) => scene.room_id === room.id);
  setHeader({
    kicker: lang("Комната", "Room"),
    title: room.name,
    subtitle: lang(
      `${lightsLabel(devices.length)}, ${countLabel(groups.length, "группа", "группы", "групп", "group")}, ${countLabel(scenes.length, "сцена", "сцены", "сцен", "scene")}.`,
      `${devices.length} light(s), ${groups.length} group(s), ${scenes.length} scene(s).`,
    ),
  });
  setContent(`
    <div class="screen-stack">
      <section class="room-card" style="${roomTintStyle(room.id)}">
        <div class="detail-header">
          <div>
            <p class="section-kicker">${lang("Быстрое управление", "Quick control")}</p>
            <h3>${escapeHtml(room.name)}</h3>
            <div class="pill-row">
              <span class="meta-pill">${lightsLabel(devices.length)}</span>
              <span class="meta-pill">${activeLabel(devices.filter((device) => deviceState(device).is_on).length)}</span>
            </div>
          </div>
          <div class="inline-actions">
            <button class="primary-button" type="button" data-room-action="${room.id}" data-action-name="on">${lang("Включить", "Turn on")}</button>
            <button class="ghost-button" type="button" data-room-action="${room.id}" data-action-name="off">${lang("Выключить", "Turn off")}</button>
          </div>
        </div>
        <div class="quick-grid control-grid">
          <label class="field">
            <span>${lang("Яркость", "Brightness")}</span>
            <input type="range" min="0" max="100" value="70" data-room-brightness="${room.id}" />
          </label>
          <button class="soft-button" type="button" data-room-action="${room.id}" data-action-name="brightness">${lang("Применить", "Apply")}</button>
          <label class="field">
            <span>${lang("Цвет", "Color")}</span>
            <input type="color" value="#6de9ff" data-room-color="${room.id}" />
          </label>
          <button class="ghost-button" type="button" data-room-action="${room.id}" data-action-name="color">${lang("Покрасить", "Tint")}</button>
        </div>
      </section>

      <section class="form-card">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">${lang("Настройки", "Settings")}</p>
            <h3>${lang("Изменить комнату", "Edit room")}</h3>
          </div>
        </div>
        <form id="room-edit-form" class="form-stack">
          <div class="field-grid">
            <label class="field">
              <span>${lang("Название", "Name")}</span>
              <input name="name" value="${escapeHtml(room.name)}" required />
            </label>
            <label class="field">
              <span>${lang("Порядок", "Sort order")}</span>
              <input name="sort_order" type="number" value="${room.sort_order}" />
            </label>
          </div>
          <div class="inline-actions">
            <button class="primary-button" type="submit">${lang("Сохранить", "Save")}</button>
            <button class="danger-button" type="button" id="room-delete-button">${lang("Удалить комнату", "Delete room")}</button>
            <button class="soft-button" type="button" data-open-screen="add-group" data-room-id="${room.id}">${lang("Новая группа", "New group")}</button>
            <button class="soft-button" type="button" data-open-screen="add-scene" data-room-id="${room.id}">${lang("Новая сцена", "New scene")}</button>
          </div>
        </form>
      </section>

      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Свет", "Lights")}</p>
            <h2>${devices.length ? lang("В этой комнате", "In this room") : lang("Света пока нет", "No lights yet")}</h2>
          </div>
          <button class="pill-button" type="button" data-open-screen="devices-room" data-room-id="${room.id}">${lang("Открыть список", "Open list")}</button>
        </div>
        ${
          devices.length
            ? `<div class="mini-stack">${devices
                .map(
                  (device) => `
                    <article class="mini-card clickable" data-open-device="${device.id}">
                      <div class="card-head">
                        <div>
                          <strong>${escapeHtml(device.name)}</strong>
                          <div class="pill-row">
                            <span class="family-pill">${escapeHtml(device.family)}</span>
                            <span class="status-pill ${deviceState(device).is_on ? "good" : "warn"}">${deviceState(device).is_on ? lang("Вкл", "On") : lang("Выкл", "Off")}</span>
                          </div>
                        </div>
                        <button class="pill-button" type="button" data-open-device="${device.id}">${lang("Открыть", "Open")}</button>
                      </div>
                    </article>`,
                )
                .join("")}</div>`
            : `<div class="empty-state">${lang("В этой комнате пока нет света.", "No lights in this room yet.")}</div>`
        }
      </section>

      <div class="two-up-grid">
        <section class="screen-card">
          <div class="section-head">
            <div>
              <p class="section-kicker">${lang("Группы", "Groups")}</p>
              <h2>${groups.length ? lang("Группы комнаты", "Room groups") : lang("Групп пока нет", "No groups yet")}</h2>
            </div>
          </div>
          ${
            groups.length
              ? `<div class="mini-stack">${groups
                  .map(
                    (group) => `
                      <article class="mini-card clickable" data-open-group="${group.id}">
                        <div class="card-head">
                          <div>
                            <strong>${escapeHtml(group.name)}</strong>
                            <div class="pill-row"><span class="meta-pill">${membersLabel(group.devices?.length || 0)}</span></div>
                          </div>
                          <button class="pill-button" type="button" data-open-group="${group.id}">${lang("Открыть", "Open")}</button>
                        </div>
                      </article>`,
                  )
                  .join("")}</div>`
              : `<div class="empty-state">${lang("В этой комнате пока нет групп.", "No groups attached to this room yet.")}</div>`
          }
        </section>

        <section class="screen-card">
          <div class="section-head">
            <div>
              <p class="section-kicker">${lang("Сцены", "Scenes")}</p>
              <h2>${scenes.length ? lang("Сцены комнаты", "Room scenes") : lang("Сцен пока нет", "No scenes yet")}</h2>
            </div>
          </div>
          ${
            scenes.length
              ? `<div class="mini-stack">${scenes
                  .map(
                    (scene) => `
                      <article class="mini-card clickable" data-open-scene="${scene.id}">
                        <div class="card-head">
                          <div>
                            <strong>${escapeHtml(scene.name)}</strong>
                            <div class="pill-row"><span class="meta-pill">${actionsLabel(scene.actions?.length || 0)}</span></div>
                          </div>
                          <button class="primary-button" type="button" data-run-scene="${scene.id}">${lang("Запустить", "Run")}</button>
                        </div>
                      </article>`,
                  )
                  .join("")}</div>`
              : `<div class="empty-state">${lang("В этой комнате пока нет сцен.", "No scenes attached to this room yet.")}</div>`
          }
        </section>
      </div>
    </div>
  `);
  bindRoomCards();
  bindOverviewCards();

  els.content.querySelector("#room-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    await api(`/api/rooms/${room.id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ name: data.name, sort_order: Number(data.sort_order || 0) }),
    });
    await refreshAll({ silent: true });
    showToast(lang("Комната обновлена", "Room updated"));
  });

  els.content.querySelector("#room-delete-button").addEventListener("click", async () => {
    if (!window.confirm(lang(`Удалить комнату "${room.name}"?`, `Delete room "${room.name}"?`))) return;
    try {
      await api(`/api/rooms/${room.id}`, { method: "DELETE" });
    showToast(lang("Комната удалена", "Room deleted"));
      openScreen("rooms", {}, { replace: true });
      await refreshAll({ silent: true });
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function renderDevicesScreen({ roomId = null, onlyUnassigned = false } = {}) {
  let devices = state.devices;
  let subtitle = lang("Повседневное управление каждым светильником.", "Everyday control for each light.");
  if (roomId != null) {
    devices = devices.filter((device) => device.room_id === roomId);
    subtitle = lang(`Показываю только свет из комнаты ${roomLabel(roomId)}.`, `Showing only lights from ${roomLabel(roomId)}.`);
  }
  if (onlyUnassigned) {
    devices = devices.filter((device) => device.room_id == null);
    subtitle = lang("Этому свету нужна комната, чтобы он оказался на своём месте.", "These lights need a room so they show up in the right place.");
  }
  setHeader({
    kicker: lang("Устройства", "Devices"),
    title: onlyUnassigned ? lang("Свет без комнаты", "Unassigned lights") : roomId != null ? roomLabel(roomId) : lang("Все устройства", "All devices"),
    subtitle,
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Свет", "Lights")}</p>
            <h2>${devices.length ? lang("Выбери устройство", "Choose a light") : lang("Устройств пока нет", "No lights yet")}</h2>
          </div>
          <button class="primary-button" type="button" data-open-screen="add-device">${lang("Добавить свет", "Add light")}</button>
        </div>
        ${
          devices.length
            ? `<div class="list-grid">${devices.map((device) => deviceCardMarkup(device)).join("")}</div>`
            : `<div class="empty-state">${lang("В этом разделе пока ничего нет.", "Nothing is here yet.")}</div>`
        }
      </section>
    </div>
  `);
  bindDeviceCards();
  bindOverviewCards();
}

function renderDeviceDetailScreen(deviceId) {
  const device = deviceById(deviceId);
  if (!device) {
    openScreen("devices", {}, { replace: true });
    return;
  }
  const current = deviceState(device);
  const groupNames = state.groups.filter((group) => (group.devices || []).some((member) => member.id === device.id)).map((group) => group.name);
  setHeader({
    kicker: lang("Устройство", "Device"),
    title: device.name,
    subtitle: lang(`${device.family} в комнате ${roomLabel(device.room_id)}.`, `${device.family} in ${roomLabel(device.room_id)}.`),
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="detail-header">
          <div>
            <p class="section-kicker">${lang("Быстрое управление", "Quick control")}</p>
            <h3>${escapeHtml(device.name)}</h3>
            <div class="pill-row">
              <span class="family-pill">${escapeHtml(device.family)}</span>
              <span class="status-pill ${current.is_on ? "good" : "warn"}">${current.is_on ? lang("Вкл", "On") : lang("Выкл", "Off")}</span>
              <span class="meta-pill">${escapeHtml(roomLabel(device.room_id))}</span>
            </div>
          </div>
          <div class="inline-actions">
            <button class="primary-button" type="button" data-device-toggle="${device.id}">${current.is_on ? lang("Выключить", "Turn off") : lang("Включить", "Turn on")}</button>
          </div>
        </div>
        <div class="quick-grid control-grid">
          <label class="field">
            <span>${lang("Яркость", "Brightness")}</span>
            <input type="range" min="0" max="100" value="${Number(current.brightness ?? 100)}" data-device-brightness="${device.id}" />
          </label>
          <button class="soft-button" type="button" data-device-action="${device.id}" data-action-name="brightness">${lang("Применить", "Apply")}</button>
          <label class="field">
            <span>${lang("Цвет", "Color")}</span>
            <input type="color" value="${rgbToHex(current.rgb)}" data-device-color="${device.id}" />
          </label>
          <button class="ghost-button" type="button" data-device-action="${device.id}" data-action-name="color">${lang("Применить", "Apply")}</button>
        </div>
      </section>

      <section class="form-card">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">${lang("Настройки", "Settings")}</p>
            <h3>${lang("Изменить устройство", "Edit light")}</h3>
          </div>
        </div>
        <form id="device-edit-form" class="form-stack">
          <div class="field-grid">
            <label class="field">
              <span>${lang("Название", "Name")}</span>
              <input name="name" value="${escapeHtml(device.name)}" required />
            </label>
            <label class="field">
              <span>${lang("Комната", "Room")}</span>
              <select name="room_id">${roomOptionsMarkup(device.room_id ?? "", { allowBlank: true, blankLabel: lang("Без комнаты", "No room") })}</select>
            </label>
          </div>
          <label class="toggle-row">
            <input name="is_enabled" type="checkbox"${device.is_enabled ? " checked" : ""} />
            <span>${lang("Оставить устройство активным в приложении", "Keep this light enabled in the app")}</span>
          </label>
          ${
            groupNames.length
              ? `<div class="details-panel"><p class="section-kicker">${lang("Группы", "Groups")}</p><div class="pill-row">${groupNames
                  .map((name) => `<span class="meta-pill">${escapeHtml(name)}</span>`)
                  .join("")}</div></div>`
              : ""
          }
          <div class="inline-actions">
            <button class="primary-button" type="submit">${lang("Сохранить", "Save")}</button>
            <button class="danger-button" type="button" id="device-delete-button">${lang("Удалить устройство", "Delete light")}</button>
          </div>
        </form>
      </section>
    </div>
  `);
  bindDeviceCards();

  els.content.querySelector("#device-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const updated = await api(`/api/devices/${device.id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({
        name: data.name,
        room_id: data.room_id ? Number(data.room_id) : null,
        is_enabled: form.querySelector('[name="is_enabled"]').checked,
      }),
    });
    syncDeviceInState(updated);
    renderScreen();
    enqueueRefresh();
    showToast(lang("Свет обновлён", "Light updated"));
  });

  els.content.querySelector("#device-delete-button").addEventListener("click", async () => {
    if (!window.confirm(lang(`Удалить устройство "${device.name}"?`, `Delete light "${device.name}"?`))) return;
    await api(`/api/devices/${device.id}`, { method: "DELETE" });
    showToast(lang("Свет удалён", "Light deleted"));
    openScreen("devices", {}, { replace: true });
    await refreshAll({ silent: true });
  });
}

function renderGroupsScreen() {
  setHeader({
    kicker: lang("Группы", "Groups"),
    title: lang("Смешанные группы", "Mixed groups"),
    subtitle: lang("Собирай поддерживаемые семейства и управляй ими вместе.", "Combine supported families and control them together."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Группы", "Groups")}</p>
            <h2>${state.groups.length ? lang("Выбери группу", "Choose a group") : lang("Групп пока нет", "No groups yet")}</h2>
          </div>
          <button class="primary-button" type="button" data-open-screen="add-group">${lang("Добавить группу", "Add group")}</button>
        </div>
        ${
          state.groups.length
            ? `<div class="list-grid">${state.groups.map((group) => groupCardMarkup(group)).join("")}</div>`
            : `<div class="empty-state">${lang("Создай группу, когда хочешь двигать разный свет вместе.", "Create a group when you want different lights to move together.")}</div>`
        }
      </section>
    </div>
  `);
  bindGroupCards();
  bindOverviewCards();
}

function renderGroupDetailScreen(groupId) {
  const group = groupById(groupId);
  if (!group) {
    openScreen("groups", {}, { replace: true });
    return;
  }
  const memberIds = new Set((group.devices || []).map((device) => device.id));
  const availableDevices = state.devices.filter((device) => !memberIds.has(device.id));
  setHeader({
    kicker: lang("Группа", "Group"),
    title: group.name,
    subtitle: localizeDynamicText(`${group.devices?.length || 0} member(s) across ${groupFamilies(group).length || 0} family group(s).`),
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="detail-header">
          <div>
            <p class="section-kicker">${lang("Быстрое управление", "Quick control")}</p>
            <h3>${escapeHtml(group.name)}</h3>
            <div class="pill-row">
              <span class="meta-pill">${membersLabel(group.devices?.length || 0)}</span>
              <span class="family-pill">${escapeHtml(groupFamilies(group).join(", ") || lang("Пусто", "Empty"))}</span>
            </div>
          </div>
          <div class="inline-actions">
            <button class="primary-button" type="button" data-group-action="${group.id}" data-action-name="on">${lang("Вкл", "On")}</button>
            <button class="ghost-button" type="button" data-group-action="${group.id}" data-action-name="off">${lang("Выкл", "Off")}</button>
          </div>
        </div>
        <div class="quick-grid control-grid">
          <label class="field">
            <span>${lang("Яркость", "Brightness")}</span>
            <input type="range" min="0" max="100" value="70" data-group-brightness="${group.id}" />
          </label>
          <button class="soft-button" type="button" data-group-action="${group.id}" data-action-name="brightness">${lang("Применить", "Apply")}</button>
          <label class="field">
            <span>${lang("Цвет", "Color")}</span>
            <input type="color" value="#6de9ff" data-group-color="${group.id}" />
          </label>
          <button class="ghost-button" type="button" data-group-action="${group.id}" data-action-name="color">${lang("Применить", "Apply")}</button>
        </div>
      </section>

      <div class="two-up-grid">
        <section class="form-card">
          <div class="section-head compact">
            <div>
              <p class="section-kicker">${lang("Настройки", "Settings")}</p>
              <h3>${lang("Изменить группу", "Edit group")}</h3>
            </div>
          </div>
          <form id="group-edit-form" class="form-stack">
            <div class="field-grid">
              <label class="field">
                <span>${lang("Название", "Name")}</span>
                <input name="name" value="${escapeHtml(group.name)}" required />
              </label>
              <label class="field">
                <span>${lang("Комната", "Room")}</span>
                <select name="room_id">${roomOptionsMarkup(group.room_id ?? "", { allowBlank: true, blankLabel: lang("Без комнаты", "No room") })}</select>
              </label>
            </div>
            <div class="inline-actions">
              <button class="primary-button" type="submit">${lang("Сохранить группу", "Save group")}</button>
              <button class="danger-button" type="button" id="group-delete-button">${lang("Удалить группу", "Delete group")}</button>
            </div>
          </form>
        </section>

        <section class="form-card">
          <div class="section-head compact">
            <div>
              <p class="section-kicker">${lang("Участники", "Members")}</p>
              <h3>${lang("Добавить свет", "Add a light")}</h3>
            </div>
          </div>
          <form id="group-attach-form" class="form-stack">
            <label class="field">
              <span>${lang("Свет", "Light")}</span>
              <select name="device_id">${availableDevices.length ? availableDevices
                .map((device) => `<option value="${device.id}">${escapeHtml(device.name)} - ${escapeHtml(roomLabel(device.room_id))}</option>`)
                .join("") : `<option value="">${lang("Больше нечего добавлять", "No more lights to add")}</option>`}</select>
            </label>
            <button class="primary-button" type="submit"${availableDevices.length ? "" : " disabled"}>${lang("Добавить свет", "Attach light")}</button>
          </form>
        </section>
      </div>

      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Участники", "Current members")}</p>
            <h2>${group.devices?.length ? lang("Подключённый свет", "Attached lights") : lang("Участников пока нет", "No members yet")}</h2>
          </div>
        </div>
        ${
          group.devices?.length
            ? `<div class="mini-stack">${group.devices
                .map(
                  (device) => `
                    <article class="mini-card">
                      <div class="card-head">
                        <div>
                          <strong>${escapeHtml(device.name)}</strong>
                          <div class="pill-row">
                            <span class="family-pill">${escapeHtml(device.family)}</span>
                            <span class="meta-pill">${escapeHtml(roomLabel(device.room_id))}</span>
                          </div>
                        </div>
                        <div class="inline-actions">
                          <button class="pill-button" type="button" data-open-device="${device.id}">${lang("Открыть", "Open")}</button>
                          <button class="danger-button" type="button" data-detach-device="${device.id}">${lang("Убрать", "Remove")}</button>
                        </div>
                      </div>
                    </article>`,
                )
                .join("")}</div>`
            : `<div class="empty-state">${lang("Добавь хотя бы один свет, чтобы группа стала полезной.", "Attach at least one light to make this group useful.")}</div>`
        }
      </section>
    </div>
  `);
  bindGroupCards();
  bindDeviceCards();

  els.content.querySelector("#group-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api(`/api/groups/${group.id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ name: data.name, room_id: data.room_id ? Number(data.room_id) : null }),
    });
    await refreshAll({ silent: true });
    showToast(lang("Группа обновлена", "Group updated"));
  });

  els.content.querySelector("#group-delete-button").addEventListener("click", async () => {
    if (!window.confirm(lang(`Удалить группу "${group.name}"?`, `Delete group "${group.name}"?`))) return;
    await api(`/api/groups/${group.id}`, { method: "DELETE" });
    showToast(lang("Группа удалена", "Group deleted"));
    openScreen("groups", {}, { replace: true });
    await refreshAll({ silent: true });
  });

  els.content.querySelector("#group-attach-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!data.device_id) return;
    await api(`/api/groups/${group.id}/devices`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ device_id: Number(data.device_id) }),
    });
    await refreshAll({ silent: true });
    showToast(lang("Свет добавлен в группу", "Light added to group"));
  });

  els.content.querySelectorAll("[data-detach-device]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/groups/${group.id}/devices/${button.dataset.detachDevice}`, { method: "DELETE" });
      await refreshAll({ silent: true });
    showToast(lang("Свет убран из группы", "Light removed from group"));
    });
  });
}

function sceneActionFormMarkup(scene) {
  return `
    <form id="scene-action-form" class="form-stack">
      <div class="field-grid">
        <label class="field">
          <span>${lang("Тип цели", "Target type")}</span>
          <select name="target_type" id="scene-target-type">
            <option value="device">${lang("Устройство", "Device")}</option>
            <option value="group">${lang("Группа", "Group")}</option>
          </select>
        </label>
        <label class="field">
          <span>${lang("Цель", "Target")}</span>
          <select name="target_id" id="scene-target-id">${targetOptionsMarkup("device")}</select>
        </label>
        <label class="field">
          <span>${lang("Действие", "Action")}</span>
          <select name="action_type" id="scene-action-type">${sceneActionOptionsMarkup("on")}</select>
        </label>
        <label class="field">
          <span>${lang("Порядок", "Sort order")}</span>
          <input name="sort_order" type="number" value="${scene.actions?.length || 0}" />
        </label>
      </div>
      <div class="field-grid" id="scene-action-extra">
        <label class="field is-hidden" data-scene-extra="brightness">
          <span>${lang("Яркость", "Brightness")}</span>
          <input name="brightness_value" type="range" min="0" max="100" value="60" />
        </label>
        <label class="field is-hidden" data-scene-extra="color">
          <span>${lang("Цвет", "Color")}</span>
          <input name="color_value" type="color" value="#6de9ff" />
        </label>
      </div>
      <button class="primary-button" type="submit">${lang("Добавить действие", "Add action")}</button>
    </form>
  `;
}

function renderScenesScreen() {
  setHeader({
    kicker: lang("Сцены", "Scenes"),
    title: lang("Сцены", "Scenes"),
    subtitle: lang("Сохраняй смешанные действия как пресеты и запускай в один тап.", "Save mixed actions as reusable presets and run them in one tap."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Сцены", "Scenes")}</p>
            <h2>${state.scenes.length ? lang("Выбери сцену", "Choose a scene") : lang("Сцен пока нет", "No scenes yet")}</h2>
          </div>
          <button class="primary-button" type="button" data-open-screen="add-scene">${lang("Добавить сцену", "Add scene")}</button>
        </div>
        ${
          state.scenes.length
            ? `<div class="list-grid">${state.scenes.map((scene) => sceneCardMarkup(scene)).join("")}</div>`
            : `<div class="empty-state">${lang("Создай сцену, когда нужен one-tap запуск смешанного поведения.", "Create a scene when you want one-tap mixed behavior.")}</div>`
        }
      </section>
    </div>
  `);
  bindSceneCards();
  bindOverviewCards();
}

function renderSceneDetailScreen(sceneId) {
  const scene = sceneById(sceneId);
  if (!scene) {
    openScreen("scenes", {}, { replace: true });
    return;
  }
  setHeader({
    kicker: lang("Сцена", "Scene"),
    title: scene.name,
    subtitle: localizeDynamicText(`${scene.actions?.length || 0} action(s) ready to run.`),
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="detail-header">
          <div>
            <p class="section-kicker">${lang("Запуск", "Run")}</p>
            <h3>${escapeHtml(scene.name)}</h3>
            <div class="pill-row">
              <span class="meta-pill">${actionsLabel(scene.actions?.length || 0)}</span>
              <span class="status-pill ${scene.is_enabled ? "good" : "warn"}">${scene.is_enabled ? lang("Включена", "Enabled") : lang("Выключена", "Disabled")}</span>
            </div>
          </div>
          <button class="primary-button" type="button" data-run-scene="${scene.id}">${lang("Запустить сцену", "Run scene")}</button>
        </div>
      </section>

      <div class="two-up-grid">
        <section class="form-card">
          <div class="section-head compact">
            <div>
              <p class="section-kicker">${lang("Настройки", "Settings")}</p>
              <h3>${lang("Изменить сцену", "Edit scene")}</h3>
            </div>
          </div>
          <form id="scene-edit-form" class="form-stack">
            <div class="field-grid">
              <label class="field">
                <span>${lang("Название", "Name")}</span>
                <input name="name" value="${escapeHtml(scene.name)}" required />
              </label>
              <label class="field">
                <span>${lang("Комната", "Room")}</span>
                <select name="room_id">${roomOptionsMarkup(scene.room_id ?? "", { allowBlank: true, blankLabel: lang("Без комнаты", "No room") })}</select>
              </label>
            </div>
            <label class="toggle-row">
              <input name="is_enabled" type="checkbox"${scene.is_enabled ? " checked" : ""} />
              <span>${lang("Держать сцену включённой", "Keep this scene enabled")}</span>
            </label>
            <div class="inline-actions">
              <button class="primary-button" type="submit">${lang("Сохранить сцену", "Save scene")}</button>
              <button class="danger-button" type="button" id="scene-delete-button">${lang("Удалить сцену", "Delete scene")}</button>
            </div>
          </form>
        </section>

        <section class="form-card">
          <div class="section-head compact">
            <div>
              <p class="section-kicker">${lang("Собрать действия", "Build actions")}</p>
              <h3>${lang("Добавить шаг", "Add a step")}</h3>
            </div>
          </div>
          ${sceneActionFormMarkup(scene)}
        </section>
      </div>

      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Действия", "Actions")}</p>
            <h2>${scene.actions?.length ? lang("Текущие шаги сцены", "Current scene steps") : lang("Действий пока нет", "No actions yet")}</h2>
          </div>
        </div>
        ${
          scene.actions?.length
            ? `<div class="mini-stack">${scene.actions
                .map(
                  (action) => `
                    <article class="mini-card">
                      <div class="card-head">
                        <div>
                          <strong>${escapeHtml(targetLabel(action.target_type, action.target_id))}</strong>
                          <div class="pill-row">
                            <span class="meta-pill">${escapeHtml(targetLabel(action.target_type, action.target_id))}</span>
                            <span class="meta-pill">${escapeHtml(sceneActionSummary(action))}</span>
                            <span class="meta-pill">${lang(`Шаг ${action.sort_order}`, `Step ${action.sort_order}`)}</span>
                          </div>
                        </div>
                        <button class="danger-button" type="button" data-scene-action-delete="${action.id}">${lang("Убрать", "Remove")}</button>
                      </div>
                    </article>`,
                )
                .join("")}</div>`
            : `<div class="empty-state">${lang("Добавляй сюда шаги устройств или групп.", "Add device or group steps here.")}</div>`
        }
      </section>
    </div>
  `);
  bindSceneCards();
  bindSceneActionForm(scene);

  els.content.querySelector("#scene-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    await api(`/api/scenes/${scene.id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({
        name: data.name,
        room_id: data.room_id ? Number(data.room_id) : null,
        is_enabled: form.querySelector('[name="is_enabled"]').checked,
      }),
    });
    await refreshAll({ silent: true });
    showToast(lang("Сцена обновлена", "Scene updated"));
  });

  els.content.querySelector("#scene-delete-button").addEventListener("click", async () => {
    if (!window.confirm(lang(`Удалить сцену "${scene.name}"?`, `Delete scene "${scene.name}"?`))) return;
    await api(`/api/scenes/${scene.id}`, { method: "DELETE" });
    showToast(lang("Сцена удалена", "Scene deleted"));
    openScreen("scenes", {}, { replace: true });
    await refreshAll({ silent: true });
  });

  els.content.querySelectorAll("[data-scene-action-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/scenes/${scene.id}/actions/${button.dataset.sceneActionDelete}`, { method: "DELETE" });
      await refreshAll({ silent: true });
    showToast(lang("Действие сцены удалено", "Scene action removed"));
    });
  });
}

function scheduleFormMarkup(rule = null) {
  const data = scheduleFormDataFromRule(rule);
  const customDays = data.day_mode === "custom";
  return `
    <form id="schedule-form" class="form-stack" data-mode="${rule ? "edit" : "create"}">
      <div class="field-grid">
        <label class="field">
          <span>${lang("Название", "Name")}</span>
          <input name="name" value="${escapeHtml(data.name)}" placeholder="${lang("Вечерний свет", "Weeknight glow")}" required />
        </label>
        <label class="field">
          <span>${lang("Тип цели", "Target type")}</span>
          <select name="target_type" id="schedule-target-type">
            <option value="device"${data.target_type === "device" ? " selected" : ""}>${lang("Устройство", "Device")}</option>
            <option value="group"${data.target_type === "group" ? " selected" : ""}>${lang("Группа", "Group")}</option>
            <option value="scene"${data.target_type === "scene" ? " selected" : ""}>${lang("Сцена", "Scene")}</option>
          </select>
        </label>
        <label class="field">
          <span>${lang("Цель", "Target")}</span>
          <select name="target_id" id="schedule-target-id">${targetOptionsMarkup(data.target_type, data.target_id)}</select>
        </label>
        <label class="field">
          <span>${lang("Тип правила", "Rule type")}</span>
          <select name="rule_type" id="schedule-rule-type">
            <option value="delay"${data.rule_type === "delay" ? " selected" : ""}>${lang("Задержка", "Delay")}</option>
            <option value="once"${data.rule_type === "once" ? " selected" : ""}>${lang("Один раз", "Once")}</option>
            <option value="recurring"${data.rule_type === "recurring" ? " selected" : ""}>${lang("Повтор", "Recurring")}</option>
            <option value="astronomical"${data.rule_type === "astronomical" ? " selected" : ""}>${lang("Астрономическое", "Astronomical")}</option>
          </select>
        </label>
        <label class="field">
          <span>${lang("Действие", "Action")}</span>
          <select name="action" id="schedule-action">${scheduleActionOptionsMarkup(data.target_type, data.action)}</select>
        </label>
        <label class="field">
          <span>${lang("Часовой пояс", "Timezone")}</span>
          <select name="timezone">${timezoneOptionsMarkup(data.timezone)}</select>
        </label>
      </div>

      <div class="field-grid" id="schedule-action-fields">
        <label class="field${data.action === "brightness" ? "" : " is-hidden"}" data-rule-extra="brightness">
          <span>${lang("Яркость", "Brightness")}</span>
          <input name="brightness_value" type="range" min="0" max="100" value="${data.brightness_value}" />
        </label>
        <label class="field${data.action === "color" ? "" : " is-hidden"}" data-rule-extra="color">
          <span>${lang("Цвет", "Color")}</span>
          <input name="color_value" type="color" value="${data.color_value}" />
        </label>
      </div>

      <div class="field-grid${data.rule_type === "delay" ? "" : " is-hidden"}" id="delay-fields">
        <label class="field">
          <span>${lang("Задержка в секундах", "Delay seconds")}</span>
          <input name="delay_seconds" type="number" min="0" value="${data.delay_seconds}" />
        </label>
      </div>

      <div class="field-grid${data.rule_type === "once" ? "" : " is-hidden"}" id="once-fields">
        <label class="field">
          <span>${lang("Запустить в", "Run at")}</span>
          <input name="run_at" type="datetime-local" value="${data.run_at}" />
        </label>
      </div>

      <div class="field-grid${data.rule_type === "recurring" ? "" : " is-hidden"}" id="recurring-fields">
        <label class="field">
          <span>${lang("Время", "Time")}</span>
          <input name="recurring_time" type="time" value="${data.recurring_time}" />
        </label>
      </div>

      <div class="field-grid${data.rule_type === "astronomical" ? "" : " is-hidden"}" id="astronomical-fields">
        <label class="field">
          <span>${lang("Солнечное событие", "Solar event")}</span>
          <select name="solar_event">
            <option value="sunset"${data.solar_event === "sunset" ? " selected" : ""}>${lang("Закат", "Sunset")}</option>
            <option value="sunrise"${data.solar_event === "sunrise" ? " selected" : ""}>${lang("Рассвет", "Sunrise")}</option>
          </select>
        </label>
        <label class="field">
          <span>${lang("Смещение в минутах", "Offset minutes")}</span>
          <input name="offset_minutes" type="number" value="${data.offset_minutes}" />
        </label>
        <label class="field">
          <span>${lang("Широта", "Latitude")}</span>
          <input name="lat" type="number" step="0.0001" value="${data.lat}" />
        </label>
        <label class="field">
          <span>${lang("Долгота", "Longitude")}</span>
          <input name="lon" type="number" step="0.0001" value="${data.lon}" />
        </label>
      </div>

      <div class="details-panel">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">${lang("Дни", "Days")}</p>
            <h3>${lang("Выбери, когда запускать", "Choose when it runs")}</h3>
          </div>
        </div>
        <div class="chip-row">
          <label class="choice-chip"><input type="radio" name="day_mode" value="everyday"${data.day_mode === "everyday" ? " checked" : ""} /><span>${lang("Каждый день", "Every day")}</span></label>
          <label class="choice-chip"><input type="radio" name="day_mode" value="weekdays"${data.day_mode === "weekdays" ? " checked" : ""} /><span>${lang("Будни", "Weekdays")}</span></label>
          <label class="choice-chip"><input type="radio" name="day_mode" value="weekends"${data.day_mode === "weekends" ? " checked" : ""} /><span>${lang("Выходные", "Weekends")}</span></label>
          <label class="choice-chip"><input type="radio" name="day_mode" value="custom"${data.day_mode === "custom" ? " checked" : ""} /><span>${lang("Свои", "Custom")}</span></label>
        </div>
        <div class="chip-row${customDays ? "" : " is-hidden"}" id="custom-days">
          ${DAY_ORDER.map((day) => `<label class="choice-chip"><input type="checkbox" name="custom_day" value="${day}"${data.days_mask & DAY_BITS[day] ? " checked" : ""} /><span>${dayLabel(day)}</span></label>`).join("")}
        </div>
      </div>

      <label class="toggle-row">
        <input name="is_enabled" type="checkbox"${data.is_enabled ? " checked" : ""} />
        <span>${lang("Держать включённым", "Keep this schedule enabled")}</span>
      </label>

      <div class="inline-actions">
        <button class="primary-button" type="submit">${rule ? lang("Сохранить расписание", "Save schedule") : lang("Создать расписание", "Create schedule")}</button>
        ${
          rule
            ? `<button class="danger-button" type="button" id="schedule-delete-button">${lang("Удалить расписание", "Delete schedule")}</button>`
            : ""
        }
      </div>
    </form>
  `;
}

function renderSchedulesScreen() {
  setHeader({
    kicker: lang("Расписания", "Schedules"),
    title: lang("Расписания", "Schedules"),
    subtitle: lang("Собирай расписания без raw JSON.", "Create routines without touching raw JSON."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Расписания", "Schedules")}</p>
            <h2>${state.rules.length ? lang("Выбери расписание", "Choose a schedule") : lang("Расписаний пока нет", "No schedules yet")}</h2>
          </div>
          <button class="primary-button" type="button" data-open-screen="add-schedule">${lang("Добавить расписание", "Add schedule")}</button>
        </div>
        ${
          state.rules.length
            ? `<div class="list-grid">${state.rules.map((rule) => ruleCardMarkup(rule)).join("")}</div>`
            : `<div class="empty-state">${lang("Создай первое правило: задержка, один раз, повтор или астрономическое.", "Create your first delay, recurring, once, or astronomical routine.")}</div>`
        }
      </section>
    </div>
  `);
  bindRuleCards();
  bindOverviewCards();
}

function renderScheduleEditorScreen(ruleId = null) {
  const rule = ruleId ? state.rules.find((item) => item.id === ruleId) : null;
  if (ruleId && !rule) {
    openScreen("schedules", {}, { replace: true });
    return;
  }
  setHeader({
    kicker: lang("Расписание", "Schedule"),
    title: rule ? rule.name : lang("Новое расписание", "New schedule"),
    subtitle: rule ? describeRule(rule) : lang("Собери новое расписание через обычную форму.", "Build a new routine with normal form controls."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="form-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${rule ? lang("Редактирование", "Edit") : lang("Создание", "Create")}</p>
            <h3>${rule ? lang("Обновить расписание", "Update this schedule") : lang("Новое расписание", "New schedule")}</h3>
          </div>
        </div>
        ${scheduleFormMarkup(rule)}
      </section>
    </div>
  `);
  bindScheduleForm(rule);
}

function linkFormMarkup(link = null) {
  const data = linkFormDataFromLink(link);
  return `
    <form id="link-form" class="form-stack">
      <div class="field-grid">
        <label class="field">
          <span>${lang("Название", "Name")}</span>
          <input name="name" value="${escapeHtml(data.name)}" placeholder="${lang("Включить стол", "Desk tap on")}" required />
        </label>
        <label class="field">
          <span>${lang("Тип цели", "Target type")}</span>
          <select name="target_type" id="link-target-type">
            <option value="device"${data.target_type === "device" ? " selected" : ""}>${lang("Устройство", "Device")}</option>
            <option value="group"${data.target_type === "group" ? " selected" : ""}>${lang("Группа", "Group")}</option>
            <option value="scene"${data.target_type === "scene" ? " selected" : ""}>${lang("Сцена", "Scene")}</option>
          </select>
        </label>
        <label class="field">
          <span>${lang("Цель", "Target")}</span>
          <select name="target_id" id="link-target-id">${targetOptionsMarkup(data.target_type, data.target_id)}</select>
        </label>
        <label class="field">
          <span>${lang("Действие", "Action")}</span>
          <select name="action_type" id="link-action-type">${linkActionOptionsMarkup(data.target_type, data.action_type)}</select>
        </label>
      </div>
      <label class="toggle-row">
        <input name="requires_confirmation" type="checkbox"${data.requires_confirmation ? " checked" : ""} />
        <span>${lang("Спрашивать перед запуском ссылки", "Ask before running the link")}</span>
      </label>
      <label class="toggle-row">
        <input name="is_enabled" type="checkbox"${data.is_enabled ? " checked" : ""} />
        <span>${lang("Держать ссылку включённой", "Keep this link enabled")}</span>
      </label>
      <div class="inline-actions">
        <button class="primary-button" type="submit">${link ? lang("Сохранить ссылку", "Save link") : lang("Создать ссылку", "Create link")}</button>
        ${
          link
            ? `<button class="danger-button" type="button" id="link-delete-button">${lang("Удалить ссылку", "Delete link")}</button>`
            : ""
        }
      </div>
    </form>
  `;
}

function renderLinksScreen() {
  setHeader({
    kicker: lang("Ссылки", "Links"),
    title: lang("Ссылки действия", "Action links"),
    subtitle: lang("Собирай локальные ярлыки, которые потом можно повесить на NFC.", "Create local shortcuts that can later sit behind NFC tags."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Ссылки", "Links")}</p>
            <h2>${state.actionLinks.length ? lang("Выбери ссылку", "Choose a link") : lang("Ссылок пока нет", "No links yet")}</h2>
          </div>
          <button class="primary-button" type="button" data-open-screen="add-link">${lang("Добавить ссылку", "Add link")}</button>
        </div>
        ${
          state.actionLinks.length
            ? `<div class="list-grid">${state.actionLinks.map((link) => linkCardMarkup(link)).join("")}</div>`
            : `<div class="empty-state">${lang("Создай локальную ссылку для one-tap запуска с телефона или NFC.", "Create a local link when you want a one-tap phone or NFC shortcut.")}</div>`
        }
      </section>
    </div>
  `);
  bindLinkCards();
  bindOverviewCards();
}

function renderLinkEditorScreen(linkId = null) {
  const link = linkId ? state.actionLinks.find((item) => item.id === linkId) : null;
  if (linkId && !link) {
    openScreen("links", {}, { replace: true });
    return;
  }
  const href = link ? `${window.location.origin}/a/${link.token}` : "";
  setHeader({
    kicker: lang("Ссылка", "Link"),
    title: link ? link.name : lang("Новая ссылка", "New action link"),
    subtitle: link ? lang("Обнови этот локальный ярлык.", "Update this local shortcut.") : lang("Создай новый локальный ярлык.", "Create a new local shortcut."),
  });
  setContent(`
    <div class="screen-stack">
      ${
        link
          ? `<section class="screen-card"><div class="section-head"><div><p class="section-kicker">${lang("Ссылка", "Shortcut")}</p><h2>${lang("Открыть ссылку", "Use this link")}</h2></div></div><div class="details-panel"><div class="helper-line mono">${escapeHtml(href)}</div><div class="inline-actions"><a class="primary-button" href="${escapeHtml(href)}">${link.requires_confirmation ? lang("Проверить", "Review") : lang("Запустить сейчас", "Run now")}</a><button class="pill-button" type="button" id="copy-link-button">${lang("Скопировать URL", "Copy URL")}</button></div></div></section>`
          : ""
      }
      <section class="form-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${link ? lang("Редактирование", "Edit") : lang("Создание", "Create")}</p>
            <h3>${link ? lang("Обновить ссылку", "Update link") : lang("Новая ссылка", "New link")}</h3>
          </div>
        </div>
        ${linkFormMarkup(link)}
      </section>
    </div>
  `);
  bindLinkForm(link);
}

function candidateCardMarkup(candidate, mode) {
  const existing = state.devices.find((device) => device.ble_identifier === candidate.ble_identifier);
  const subtitle =
    mode === "supported"
      ? lang(`Похоже на ${candidate.family} рядом`, `Likely ${candidate.family} light nearby`)
      : mode === "existing"
        ? lang(`${existing?.name || candidate.name} уже добавлен(а)`, `${existing?.name || candidate.name} is already onboarded`)
        : lang("Неподдерживаемое или неизвестное BLE-устройство", "Unsupported or unknown BLE device");
  return `
    <article class="mini-card">
      <div class="card-head">
        <div>
          <strong>${escapeHtml(candidate.name)}</strong>
          <p class="body-copy">${escapeHtml(subtitle)}</p>
          <div class="pill-row">
            <span class="family-pill">${escapeHtml(candidate.family)}</span>
            <span class="meta-pill">RSSI ${candidate.rssi ?? "n/a"}</span>
          </div>
        </div>
        ${
          mode === "supported"
            ? `<button class="primary-button" type="button" data-select-candidate="${escapeHtml(candidate.ble_identifier)}">${lang("Добавить", "Add")}</button>`
            : ""
        }
      </div>
      ${
        mode === "other"
          ? `<div class="helper-line mono">${escapeHtml(candidate.classification_reason || lang("Нет деталей классификации", "No classification details"))}</div>`
          : ""
      }
    </article>
  `;
}

function renderAddDeviceScreen() {
  const groups = discoveryGroups();
  const selected = state.selectedCandidate;
  setHeader({
    kicker: lang("Добавить свет", "Add light"),
    title: lang("Обнаружение", "Discovery"),
    subtitle: lang("Сканируй поддерживаемый свет и добавляй его без BLE-шума.", "Scan for supported lights and onboard them without drowning in BLE noise."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Обнаружение", "Discovery")}</p>
            <h2>${lang("Найди свет рядом", "Find lights nearby")}</h2>
          </div>
          <button class="primary-button" type="button" data-action="scan">${lang("Сканировать свет", "Scan for lights")}</button>
        </div>
        <p class="body-copy" data-role="discovery-status">${state.discovery ? lang("Последний скан уже готов.", "Latest scan is ready.") : lang("Скана ещё не было. Начни отсюда, когда рядом включён свет.", "No scan yet. Start here when a light is powered nearby.")}</p>
      </section>

      ${
        selected
          ? `
            <section class="form-card">
              <div class="section-head compact">
                <div>
                  <p class="section-kicker">${lang("Выбрано", "Selected")}</p>
                  <h3>${escapeHtml(selected.name)}</h3>
                </div>
                <button class="ghost-button" type="button" id="clear-candidate-button">${lang("Сбросить", "Cancel")}</button>
              </div>
              <form id="device-onboarding-form" class="form-stack">
                <div class="field-grid">
                  <label class="field">
                    <span>${lang("Название", "Name")}</span>
                    <input name="name" value="${escapeHtml(selected.name)}" required />
                  </label>
                  <label class="field">
                    <span>${lang("Комната", "Room")}</span>
                    <select name="room_id">${roomOptionsMarkup("", { allowBlank: true, blankLabel: lang("Пока без комнаты", "No room yet") })}</select>
                  </label>
                </div>
                <div class="inline-actions">
                  <button class="primary-button" type="submit">${lang("Добавить свет", "Add light")}</button>
                </div>
              </form>
            </section>
          `
          : ""
      }

      <section class="screen-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">${lang("Новые поддерживаемые устройства", "New supported devices")}</p>
            <h2>${groups.supported.length ? lang("Готово к добавлению", "Ready to add") : lang("Пока ничего нового", "Nothing new yet")}</h2>
          </div>
        </div>
        ${
          groups.supported.length
            ? `<div class="mini-stack">${groups.supported.map((candidate) => candidateCardMarkup(candidate, "supported")).join("")}</div>`
            : `<div class="empty-state">${lang("В последнем скане новых поддерживаемых ламп не найдено.", "No new supported lights found in the last scan.")}</div>`
        }
      </section>

      <section class="details-wrap">
        <details class="details-panel">
          <summary>${lang("Уже добавленные устройства", "Already added devices")}</summary>
          ${
            groups.existing.length
              ? `<div class="mini-stack">${groups.existing.map((candidate) => candidateCardMarkup(candidate, "existing")).join("")}</div>`
              : `<div class="helper-line">${lang("В последнем скане уже добавленный свет не попался.", "No onboarded lights were seen in the last scan.")}</div>`
          }
        </details>
        <details class="details-panel">
          <summary>${lang("Другие / неподдерживаемые BLE-устройства", "Other / unsupported BLE devices")}</summary>
          ${
            groups.other.length
              ? `<div class="mini-stack">${groups.other.map((candidate) => candidateCardMarkup(candidate, "other")).join("")}</div>`
              : `<div class="helper-line">${lang("В последнем скане BLE-шум не мешал.", "No unsupported BLE noise showed up in the last scan.")}</div>`
          }
        </details>
      </section>
    </div>
  `);
  bindDiscoveryScreen();
}

function renderAddRoomScreen(prefill = {}) {
  setHeader({
    kicker: lang("Добавить комнату", "Add room"),
    title: lang("Новая комната", "New room"),
    subtitle: lang("Создай комнату, чтобы everyday UI было куда складывать свет.", "Create a room so the everyday UI has somewhere sensible to land."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="form-card">
        <form id="room-create-form" class="form-stack">
          <div class="field-grid">
            <label class="field">
              <span>${lang("Название", "Name")}</span>
              <input name="name" placeholder="${lang("Гостиная", "Living room")}" value="${escapeHtml(prefill.name || "")}" required />
            </label>
            <label class="field">
              <span>${lang("Порядок", "Sort order")}</span>
              <input name="sort_order" type="number" value="${prefill.sort_order || 0}" />
            </label>
          </div>
          <button class="primary-button" type="submit">${lang("Создать комнату", "Create room")}</button>
        </form>
      </section>
    </div>
  `);
  els.content.querySelector("#room-create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const room = await api("/api/rooms", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name: data.name, sort_order: Number(data.sort_order || 0) }),
    });
    showToast(lang("Комната создана", "Room created"));
    await refreshAll({ silent: true });
    openScreen("room-detail", { roomId: room.id }, { replace: true });
  });
}

function renderAddGroupScreen(prefill = {}) {
  setHeader({
    kicker: lang("Добавить группу", "Add group"),
    title: lang("Новая группа", "New group"),
    subtitle: lang("Собери mixed-family группу из уже добавленного света.", "Build a mixed-family control group from the lights you already onboarded."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="form-card">
        <form id="group-create-form" class="form-stack">
          <div class="field-grid">
            <label class="field">
              <span>${lang("Название", "Name")}</span>
              <input name="name" placeholder="${lang("Стол + полка", "Desk + shelf")}" required />
            </label>
            <label class="field">
              <span>${lang("Комната", "Room")}</span>
              <select name="room_id">${roomOptionsMarkup(prefill.roomId || "", { allowBlank: true, blankLabel: lang("Без комнаты", "No room") })}</select>
            </label>
          </div>
          <button class="primary-button" type="submit">${lang("Создать группу", "Create group")}</button>
        </form>
      </section>
    </div>
  `);
  els.content.querySelector("#group-create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const group = await api("/api/groups", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name: data.name, room_id: data.room_id ? Number(data.room_id) : null }),
    });
    showToast(lang("Группа создана", "Group created"));
    await refreshAll({ silent: true });
    openScreen("group-detail", { groupId: group.id }, { replace: true });
  });
}

function renderAddSceneScreen(prefill = {}) {
  setHeader({
    kicker: lang("Добавить сцену", "Add scene"),
    title: lang("Новая сцена", "New scene"),
    subtitle: lang("Создай сцену и сразу добавляй в неё действия устройств или групп.", "Create the shell, then add actual device or group actions right here."),
  });
  setContent(`
    <div class="screen-stack">
      <section class="form-card">
        <form id="scene-create-form" class="form-stack">
          <div class="field-grid">
            <label class="field">
              <span>${lang("Название", "Name")}</span>
              <input name="name" placeholder="${lang("Кино", "Movie mode")}" required />
            </label>
            <label class="field">
              <span>${lang("Комната", "Room")}</span>
              <select name="room_id">${roomOptionsMarkup(prefill.roomId || "", { allowBlank: true, blankLabel: lang("Без комнаты", "No room") })}</select>
            </label>
          </div>
          <button class="primary-button" type="submit">${lang("Создать сцену", "Create scene")}</button>
        </form>
      </section>
    </div>
  `);
  els.content.querySelector("#scene-create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const scene = await api("/api/scenes", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name: data.name, room_id: data.room_id ? Number(data.room_id) : null }),
    });
    showToast(lang("Сцена создана", "Scene created"));
    await refreshAll({ silent: true });
    openScreen("scene-detail", { sceneId: scene.id }, { replace: true });
  });
}

function renderCurrentScreen() {
  const screen = currentScreen();
  updateDockState();
  switch (screen.name) {
    case "home":
      renderHomeScreen();
      break;
    case "rooms":
      renderRoomsScreen();
      break;
    case "room-detail":
      renderRoomDetailScreen(screen.params.roomId);
      break;
    case "devices":
      renderDevicesScreen();
      break;
    case "devices-room":
      renderDevicesScreen({ roomId: Number(screen.params.roomId) });
      break;
    case "devices-unassigned":
      renderDevicesScreen({ onlyUnassigned: true });
      break;
    case "device-detail":
      renderDeviceDetailScreen(Number(screen.params.deviceId));
      break;
    case "groups":
      renderGroupsScreen();
      break;
    case "group-detail":
      renderGroupDetailScreen(Number(screen.params.groupId));
      break;
    case "scenes":
      renderScenesScreen();
      break;
    case "scene-detail":
      renderSceneDetailScreen(Number(screen.params.sceneId));
      break;
    case "schedules":
      renderSchedulesScreen();
      break;
    case "schedule-detail":
      renderScheduleEditorScreen(Number(screen.params.ruleId));
      break;
    case "links":
      renderLinksScreen();
      break;
    case "link-detail":
      renderLinkEditorScreen(Number(screen.params.linkId));
      break;
    case "add-device":
      renderAddDeviceScreen();
      break;
    case "add-room":
      renderAddRoomScreen(screen.params);
      break;
    case "add-group":
      renderAddGroupScreen(screen.params);
      break;
    case "add-scene":
      renderAddSceneScreen(screen.params);
      break;
    case "add-schedule":
      renderScheduleEditorScreen(null);
      break;
    case "add-link":
      renderLinkEditorScreen(null);
      break;
    default:
      renderHomeScreen();
      break;
  }
}

function renderScreen() {
  applyChromeCopy();
  renderCurrentScreen();
  localizeCurrentScreen();
}

function setNodeText(selector, value) {
  const node = els.content.querySelector(selector);
  if (node) node.textContent = value;
}

function setNodeHtml(selector, value) {
  const node = els.content.querySelector(selector);
  if (node) node.innerHTML = value;
}

const TEXT_REPLACEMENTS = [
  ["Все комнаты", "All rooms"],
  ["Быстрый доступ", "Quick access"],
  ["Разделы", "Sections"],
  ["Комнаты", "Rooms"],
  ["Устройства", "Devices"],
  ["Группы", "Groups"],
  ["Сцены", "Scenes"],
  ["Расписания", "Schedules"],
  ["Ссылки", "Links"],
  ["Добавить свет", "Add light"],
  ["Добавить группу", "Add group"],
  ["Добавить сцену", "Add scene"],
  ["Добавить расписание", "Add schedule"],
  ["Добавить ссылку", "Add link"],
  ["Выбери устройство", "Choose a light"],
  ["Устройств пока нет", "No lights yet"],
  ["Выбери группу", "Choose a group"],
  ["Выбери сцену", "Choose a scene"],
  ["Выбери расписание", "Choose a schedule"],
  ["Выбери ссылку", "Choose a link"],
  ["Открыть", "Open"],
  ["Включить", "Turn on"],
  ["Выключить", "Turn off"],
  ["Применить", "Apply"],
  ["Покрасить", "Tint"],
  ["Яркость", "Brightness"],
  ["Цвет", "Color"],
  ["Настройки", "Settings"],
  ["Название", "Name"],
  ["Комната", "Room"],
  ["Порядок", "Sort order"],
  ["Сохранить", "Save"],
  ["Удалить комнату", "Delete room"],
  ["Удалить устройство", "Delete device"],
  ["Новая группа", "New group"],
  ["Новая сцена", "New scene"],
  ["Свет", "Lights"],
  ["В этой комнате", "In this room"],
  ["Света пока нет", "No lights yet"],
  ["Открыть список", "Open list"],
  ["Вкл", "On"],
  ["Выкл", "Off"],
  ["Без комнаты", "No room"],
  ["Свет без комнаты", "Unassigned lights"],
  ["Назначить", "Assign"],
  ["Есть неразобранный свет", "Lights without a room"],
  ["Добавить свет", "Add light"],
  ["Обзор", "Overview"],
  ["Главная", "Home"],
  ["Свет без комнаты", "Unassigned lights"],
];

const EXTRA_TEXT_REPLACEMENTS = [
  ["Группы комнаты", "Room groups"],
  ["Групп пока нет", "No groups yet"],
  ["В этой комнате пока нет групп.", "No groups attached to this room yet."],
  ["Сцены комнаты", "Room scenes"],
  ["Сцен пока нет", "No scenes yet"],
  ["В этой комнате пока нет сцен.", "No scenes attached to this room yet."],
  ["Сначала подтверждение", "Confirm first"],
  ["Сразу", "Instant"],
  ["Проверить", "Review"],
  ["Запустить", "Run"],
  ["Запустить сейчас", "Run now"],
  ["Скопировать URL", "Copy URL"],
  ["Ссылка", "Shortcut"],
  ["Открыть ссылку", "Use this link"],
  ["Держать включённым", "Keep this schedule enabled"],
  ["Расписаний пока нет", "No schedules yet"],
  ["Ссылок пока нет", "No links yet"],
  ["Создать комнату", "Create room"],
  ["Создать группу", "Create group"],
  ["Создать сцену", "Create scene"],
  ["Создать расписание", "Create schedule"],
  ["Создать ссылку", "Create link"],
  ["Сохранить расписание", "Save schedule"],
  ["Сохранить ссылку", "Save link"],
  ["Удалить группу", "Delete group"],
  ["Удалить сцену", "Delete scene"],
  ["Удалить расписание", "Delete schedule"],
  ["Удалить ссылку", "Delete link"],
  ["Настройки", "Settings"],
  ["Участники", "Members"],
  ["Текущие участники", "Current members"],
  ["Подключённый свет", "Attached lights"],
  ["Участников пока нет", "No members yet"],
  ["Добавить свет", "Add a light"],
  ["Свет", "Light"],
  ["Больше нечего добавлять", "No more lights to add"],
  ["Убрать", "Remove"],
  ["Собрать действия", "Build actions"],
  ["Добавить шаг", "Add a step"],
  ["Текущие шаги сцены", "Current scene steps"],
  ["Действий пока нет", "No actions yet"],
  ["Держать сцену включённой", "Keep this scene enabled"],
  ["Сохранить сцену", "Save scene"],
  ["Сохранить группу", "Save group"],
  ["Новое расписание", "New schedule"],
  ["Новая ссылка", "New action link"],
  ["Ссылки действия", "Action links"],
  ["Новые поддерживаемые устройства", "New supported devices"],
  ["Готово к добавлению", "Ready to add"],
  ["Пока ничего нового", "Nothing new yet"],
  ["Последний скан уже готов.", "Latest scan is ready."],
  ["Скана ещё не было. Начни отсюда, когда рядом включён свет.", "No scan yet. Start here when a light is powered nearby."],
  ["Уже добавленные устройства", "Already added devices"],
  ["Другие / неподдерживаемые BLE-устройства", "Other / unsupported BLE devices"],
];

function applyTextReplacements() {
  const map = new Map();
  [...TEXT_REPLACEMENTS, ...EXTRA_TEXT_REPLACEMENTS].forEach(([ru, en]) => {
    const localized = legacyText(state.locale, ru, en);
    if (state.locale === "ru") map.set(en, localized);
    if (state.locale === "en") map.set(ru, localized);
    if (state.locale === "kk") {
      map.set(ru, localized);
      map.set(en, localized);
    }
  });
  const nodes = els.content.querySelectorAll("button, p, h2, h3, strong, span, a, summary, label");
  nodes.forEach((node) => {
    if (node.children.length) return;
    const text = node.textContent?.trim();
    if (!text) return;
    const dynamicReplacement = localizeDynamicText(text);
    if (dynamicReplacement) {
      node.textContent = dynamicReplacement;
      return;
    }
    const replacement = map.get(text);
    if (replacement) {
      node.textContent = replacement;
    }
  });
}

function localizeCurrentScreen() {
  const screen = currentScreen().name;
  els.pageTitle.textContent = "DILIAT";
  els.pageSubtitle.textContent = "";
  els.pageSubtitle.classList.add("is-hidden");

  if (screen === "home") {
    els.pageKicker.textContent = lang("Главная", "Home");
    setNodeText(".section-head .section-kicker", lang("Обзор", "Overview"));
    setNodeText(".section-head h2", lang("Разделы", "Sections"));
    const overview = [...els.content.querySelectorAll(".overview-card")];
    const labels = [
      lang("Комнаты", "Rooms"),
      lang("Устройства", "Devices"),
      lang("Группы", "Groups"),
      lang("Сцены", "Scenes"),
      lang("Расписания", "Schedules"),
      lang("Ссылки", "Links"),
    ];
    overview.forEach((card, index) => {
      const kicker = card.querySelector(".section-kicker");
      const note = card.querySelector("span");
      if (kicker) kicker.textContent = labels[index] || kicker.textContent;
      if (note) note.textContent = "";
    });
    const heads = els.content.querySelectorAll(".screen-card .section-head");
    if (heads[1]) {
      const kicker = heads[1].querySelector(".section-kicker");
      const title = heads[1].querySelector("h2");
      const button = heads[1].querySelector("button");
      if (kicker) kicker.textContent = lang("Комнаты", "Rooms");
      if (title) title.textContent = lang("Быстрый доступ", "Quick access");
      if (button) button.textContent = lang("Все комнаты", "All rooms");
    }
  }

  if (screen === "rooms") {
    els.pageKicker.textContent = lang("Комнаты", "Rooms");
    setNodeText(".details-panel .section-kicker", lang("Без комнаты", "Unassigned"));
    setNodeText(".details-panel h3", lang("Есть неразобранный свет", "Lights without a room"));
    const assignButton = els.content.querySelector('.details-panel button[data-open-screen="devices-unassigned"]');
    if (assignButton) assignButton.textContent = lang("Назначить", "Assign");
  }

  if (screen === "devices" || screen === "devices-room" || screen === "devices-unassigned") {
    els.pageKicker.textContent = lang("Устройства", "Devices");
    const head = els.content.querySelector(".section-head");
    if (head) {
      const kicker = head.querySelector(".section-kicker");
      const title = head.querySelector("h2");
      const button = head.querySelector("button");
      if (kicker) kicker.textContent = lang("Свет", "Lights");
      if (button) button.textContent = lang("Добавить свет", "Add light");
      if (title) {
        title.textContent = lang(
          title.textContent.includes("нет") ? "Устройств пока нет" : "Выбери устройство",
          title.textContent.includes("No") ? "No lights yet" : "Choose a light",
        );
      }
    }
  }

  if (screen === "groups") {
    els.pageKicker.textContent = lang("Группы", "Groups");
    const head = els.content.querySelector(".section-head");
    if (head) {
      const kicker = head.querySelector(".section-kicker");
      const title = head.querySelector("h2");
      const button = head.querySelector("button");
      if (kicker) kicker.textContent = lang("Группы", "Groups");
      if (button) button.textContent = lang("Добавить группу", "Add group");
      if (title) title.textContent = lang("Выбери группу", "Choose a group");
    }
  }

  if (screen === "scenes") {
    els.pageKicker.textContent = lang("Сцены", "Scenes");
    const head = els.content.querySelector(".section-head");
    if (head) {
      const kicker = head.querySelector(".section-kicker");
      const title = head.querySelector("h2");
      const button = head.querySelector("button");
      if (kicker) kicker.textContent = lang("Сцены", "Scenes");
      if (button) button.textContent = lang("Добавить сцену", "Add scene");
      if (title) title.textContent = lang("Выбери сцену", "Choose a scene");
    }
  }

  if (screen === "schedules") {
    els.pageKicker.textContent = lang("Расписания", "Schedules");
    const head = els.content.querySelector(".section-head");
    if (head) {
      const kicker = head.querySelector(".section-kicker");
      const title = head.querySelector("h2");
      const button = head.querySelector("button");
      if (kicker) kicker.textContent = lang("Расписания", "Schedules");
      if (button) button.textContent = lang("Добавить расписание", "Add schedule");
      if (title) title.textContent = lang("Выбери расписание", "Choose a schedule");
    }
  }

  if (screen === "links") {
    els.pageKicker.textContent = lang("Ссылки", "Links");
    const head = els.content.querySelector(".section-head");
    if (head) {
      const kicker = head.querySelector(".section-kicker");
      const title = head.querySelector("h2");
      const button = head.querySelector("button");
      if (kicker) kicker.textContent = lang("Ссылки", "Links");
      if (button) button.textContent = lang("Добавить ссылку", "Add link");
      if (title) title.textContent = lang("Выбери ссылку", "Choose a link");
    }
  }

  applyTextReplacements();
}

function bindOverviewCards() {
  els.content.querySelectorAll("[data-open-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.openScreen;
      const params = {};
      if (button.dataset.roomId) params.roomId = Number(button.dataset.roomId);
      openScreen(name, params);
    });
  });
}

function bindRoomCards() {
  els.content.querySelectorAll("[data-open-room], [data-room-card]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const roomId = button.dataset.openRoom || button.dataset.roomCard;
      openScreen("room-detail", { roomId: Number(roomId) });
    });
  });

  els.content.querySelectorAll("[data-room-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const roomId = Number(button.dataset.roomAction);
      const actionName = button.dataset.actionName;
      if (actionName === "brightness") {
        const input = els.content.querySelector(`[data-room-brightness="${roomId}"]`);
        await runRoomAction(roomId, "brightness", { value: Number(input.value) });
      } else if (actionName === "color") {
        const input = els.content.querySelector(`[data-room-color="${roomId}"]`);
        await runRoomAction(roomId, "color", hexToRgb(input.value));
      } else {
        await runRoomAction(roomId, actionName);
      }
    });
  });
}

function bindDeviceCards() {
  els.content.querySelectorAll("[data-open-device]").forEach((button) => {
    button.addEventListener("click", () => openScreen("device-detail", { deviceId: Number(button.dataset.openDevice) }));
  });

  els.content.querySelectorAll("[data-device-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      const deviceId = Number(button.dataset.deviceToggle);
      if (state.pendingDeviceActions.has(deviceId)) return;
      button.disabled = true;
      const device = deviceById(deviceId);
      await handleDeviceAction(deviceId, deviceState(device).is_on ? "off" : "on");
    });
  });

  els.content.querySelectorAll("[data-device-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const deviceId = Number(button.dataset.deviceAction);
      if (state.pendingDeviceActions.has(deviceId)) return;
      button.disabled = true;
      const actionName = button.dataset.actionName;
      if (actionName === "brightness") {
        const input = els.content.querySelector(`[data-device-brightness="${deviceId}"]`);
        await handleDeviceAction(deviceId, "brightness", { value: Number(input.value) });
      } else if (actionName === "color") {
        const input = els.content.querySelector(`[data-device-color="${deviceId}"]`);
        await handleDeviceAction(deviceId, "color", hexToRgb(input.value));
      }
    });
  });
}

function bindGroupCards() {
  els.content.querySelectorAll("[data-open-group]").forEach((button) => {
    button.addEventListener("click", () => openScreen("group-detail", { groupId: Number(button.dataset.openGroup) }));
  });
  els.content.querySelectorAll("[data-group-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const groupId = Number(button.dataset.groupAction);
      const actionName = button.dataset.actionName;
      if (actionName === "brightness") {
        const input = els.content.querySelector(`[data-group-brightness="${groupId}"]`);
        await handleGroupAction(groupId, "brightness", { value: Number(input.value) });
      } else if (actionName === "color") {
        const input = els.content.querySelector(`[data-group-color="${groupId}"]`);
        await handleGroupAction(groupId, "color", hexToRgb(input.value));
      } else {
        await handleGroupAction(groupId, actionName);
      }
    });
  });
}

function bindSceneCards() {
  els.content.querySelectorAll("[data-open-scene]").forEach((button) => {
    button.addEventListener("click", () => openScreen("scene-detail", { sceneId: Number(button.dataset.openScene) }));
  });
  els.content.querySelectorAll("[data-run-scene]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleSceneRun(Number(button.dataset.runScene));
      showToast(lang("Сцена запущена", "Scene ran"));
    });
  });
}

function bindSceneActionForm(scene) {
  bindSceneCards();
  const form = els.content.querySelector("#scene-action-form");
  if (!form) return;
  const targetType = form.querySelector("#scene-target-type");
  const targetId = form.querySelector("#scene-target-id");
  const actionType = form.querySelector("#scene-action-type");
  const brightnessField = form.querySelector('[data-scene-extra="brightness"]');
  const colorField = form.querySelector('[data-scene-extra="color"]');

  const syncSceneForm = () => {
    targetId.innerHTML = targetOptionsMarkup(targetType.value);
    brightnessField.classList.toggle("is-hidden", actionType.value !== "brightness");
    colorField.classList.toggle("is-hidden", actionType.value !== "color");
  };

  targetType.addEventListener("change", syncSceneForm);
  actionType.addEventListener("change", syncSceneForm);
  syncSceneForm();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {};
    if (data.action_type === "brightness") {
      payload.value = Number(data.brightness_value);
    }
    if (data.action_type === "color") {
      Object.assign(payload, hexToRgb(data.color_value));
    }
    await api(`/api/scenes/${scene.id}/actions`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        target_type: data.target_type,
        target_id: Number(data.target_id),
        action_type: data.action_type,
        action_payload_json: payload,
        sort_order: Number(data.sort_order || 0),
      }),
    });
    await refreshAll({ silent: true });
    showToast(lang("Действие сцены добавлено", "Scene action added"));
  });
}

function bindRuleCards() {
  els.content.querySelectorAll("[data-open-rule]").forEach((button) => {
    button.addEventListener("click", () => openScreen("schedule-detail", { ruleId: Number(button.dataset.openRule) }));
  });
  els.content.querySelectorAll("[data-toggle-rule]").forEach((button) => {
    button.addEventListener("click", async () => {
      const ruleId = Number(button.dataset.toggleRule);
      const rule = state.rules.find((item) => item.id === ruleId);
      await api(`/api/rules/${ruleId}/${rule.is_enabled ? "disable" : "enable"}`, { method: "POST" });
      await refreshAll({ silent: true });
      showToast(rule.is_enabled ? lang("Расписание выключено", "Schedule disabled") : lang("Расписание включено", "Schedule enabled"));
    });
  });
}

function bindScheduleForm(rule) {
  const form = els.content.querySelector("#schedule-form");
  const targetType = form.querySelector("#schedule-target-type");
  const targetId = form.querySelector("#schedule-target-id");
  const ruleType = form.querySelector("#schedule-rule-type");
  const action = form.querySelector("#schedule-action");
  const customDays = form.querySelector("#custom-days");
  const delayFields = form.querySelector("#delay-fields");
  const onceFields = form.querySelector("#once-fields");
  const recurringFields = form.querySelector("#recurring-fields");
  const astronomicalFields = form.querySelector("#astronomical-fields");
  const brightnessField = form.querySelector('[data-rule-extra="brightness"]');
  const colorField = form.querySelector('[data-rule-extra="color"]');

  const syncForm = () => {
    targetId.innerHTML = targetOptionsMarkup(targetType.value, targetId.value);
    action.innerHTML = scheduleActionOptionsMarkup(targetType.value, action.value);
    const currentRuleType = ruleType.value;
    delayFields.classList.toggle("is-hidden", currentRuleType !== "delay");
    onceFields.classList.toggle("is-hidden", currentRuleType !== "once");
    recurringFields.classList.toggle("is-hidden", currentRuleType !== "recurring");
    astronomicalFields.classList.toggle("is-hidden", currentRuleType !== "astronomical");
    brightnessField.classList.toggle("is-hidden", action.value !== "brightness");
    colorField.classList.toggle("is-hidden", action.value !== "color");
    customDays.classList.toggle(
      "is-hidden",
      form.querySelector('input[name="day_mode"]:checked')?.value !== "custom",
    );
  };

  targetType.addEventListener("change", syncForm);
  ruleType.addEventListener("change", syncForm);
  action.addEventListener("change", syncForm);
  form.querySelectorAll('input[name="day_mode"]').forEach((input) => input.addEventListener("change", syncForm));
  syncForm();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = { action: data.action };
    if (data.action === "brightness") payload.value = Number(data.brightness_value);
    if (data.action === "color") Object.assign(payload, hexToRgb(data.color_value));
    if (data.rule_type === "delay") payload.delay_seconds = Number(data.delay_seconds || 0);
    if (data.rule_type === "once") payload.run_at = new Date(data.run_at).toISOString();
    if (data.rule_type === "recurring") payload.time = `${data.recurring_time}:00`.slice(0, 8);
    if (data.rule_type === "astronomical") {
      payload.solar_event = data.solar_event;
      payload.offset_minutes = Number(data.offset_minutes || 0);
      payload.lat = Number(data.lat);
      payload.lon = Number(data.lon);
    }

    const body = {
      name: data.name,
      target_type: data.target_type,
      target_id: Number(data.target_id),
      rule_type: data.rule_type,
      timezone: data.timezone,
      days_of_week_mask: computeDaysMaskFromForm(form),
      is_enabled: form.querySelector('[name="is_enabled"]').checked,
      payload_json: payload,
    };

    if (rule) {
      await api(`/api/rules/${rule.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    showToast(lang("Расписание обновлено", "Schedule updated"));
      await refreshAll({ silent: true });
    } else {
      const created = await api("/api/rules", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    showToast(lang("Расписание создано", "Schedule created"));
      await refreshAll({ silent: true });
      openScreen("schedule-detail", { ruleId: created.id }, { replace: true });
    }
  });

  const deleteButton = els.content.querySelector("#schedule-delete-button");
  if (deleteButton && rule) {
    deleteButton.addEventListener("click", async () => {
    if (!window.confirm(lang(`Удалить расписание "${rule.name}"?`, `Delete schedule "${rule.name}"?`))) return;
      await api(`/api/rules/${rule.id}`, { method: "DELETE" });
    showToast(lang("Расписание удалено", "Schedule deleted"));
      openScreen("schedules", {}, { replace: true });
      await refreshAll({ silent: true });
    });
  }
}

function bindLinkCards() {
  els.content.querySelectorAll("[data-open-link]").forEach((button) => {
    button.addEventListener("click", () => openScreen("link-detail", { linkId: Number(button.dataset.openLink) }));
  });
}

function bindLinkForm(link) {
  bindLinkCards();
  const form = els.content.querySelector("#link-form");
  const targetType = form.querySelector("#link-target-type");
  const targetId = form.querySelector("#link-target-id");
  const actionType = form.querySelector("#link-action-type");

  const syncLinkForm = () => {
    targetId.innerHTML = targetOptionsMarkup(targetType.value, targetId.value);
    actionType.innerHTML = linkActionOptionsMarkup(targetType.value, actionType.value);
  };

  targetType.addEventListener("change", syncLinkForm);
  syncLinkForm();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const body = {
      name: data.name,
      target_type: data.target_type,
      target_id: Number(data.target_id),
      action_type: data.action_type,
      requires_confirmation: form.querySelector('[name="requires_confirmation"]').checked,
      is_enabled: form.querySelector('[name="is_enabled"]').checked,
    };

    if (link) {
      await api(`/api/action-links/${link.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    showToast(lang("Ссылка обновлена", "Link updated"));
      await refreshAll({ silent: true });
    } else {
      const created = await api("/api/action-links", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
    showToast(lang("Ссылка создана", "Link created"));
      await refreshAll({ silent: true });
      openScreen("link-detail", { linkId: created.id }, { replace: true });
    }
  });

  const copyButton = els.content.querySelector("#copy-link-button");
  if (copyButton && link) {
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/a/${link.token}`);
    showToast(lang("Ссылка скопирована", "Link copied"));
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  }

  const deleteButton = els.content.querySelector("#link-delete-button");
  if (deleteButton && link) {
    deleteButton.addEventListener("click", async () => {
    if (!window.confirm(lang(`Удалить ссылку "${link.name}"?`, `Delete link "${link.name}"?`))) return;
      await api(`/api/action-links/${link.id}`, { method: "DELETE" });
    showToast(lang("Ссылка удалена", "Link deleted"));
      openScreen("links", {}, { replace: true });
      await refreshAll({ silent: true });
    });
  }
}

function bindDiscoveryScreen() {
  const scanButton = els.content.querySelector('[data-action="scan"]');
  if (scanButton) {
    scanButton.addEventListener("click", refreshDiscovery);
  }
  els.content.querySelectorAll("[data-select-candidate]").forEach((button) => {
    button.addEventListener("click", () => {
      const candidate = (state.discovery || []).find((item) => item.ble_identifier === button.dataset.selectCandidate);
      state.selectedCandidate = candidate || null;
      renderScreen();
    });
  });
  const clearButton = els.content.querySelector("#clear-candidate-button");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      state.selectedCandidate = null;
      renderScreen();
    });
  }
  const form = els.content.querySelector("#device-onboarding-form");
  if (form && state.selectedCandidate) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const candidate = state.selectedCandidate;
      const data = Object.fromEntries(new FormData(form).entries());
      const created = await api("/api/devices", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          name: data.name,
          family: candidate.family,
          ble_identifier: candidate.ble_identifier,
          ble_address: candidate.address || null,
          vendor_name: candidate.vendor_name || null,
          room_id: data.room_id ? Number(data.room_id) : null,
          meta_json: {
            discovery: {
              source: candidate.source,
              classification_reason: candidate.classification_reason,
              services: candidate.services,
              manufacturer_data: candidate.manufacturer_data,
              metadata: candidate.metadata,
            },
          },
        }),
      });
      state.selectedCandidate = null;
    showToast(lang("Свет добавлен", "Light added"));
      await refreshAll({ silent: true });
      openScreen("device-detail", { deviceId: created.id }, { replace: true });
    });
  }
}

els.backButton.addEventListener("click", goBack);
els.homeButton.addEventListener("click", goHome);
els.refreshButton.addEventListener("click", () =>
  refreshAll().catch((error) => {
    console.error(error);
    showToast(error.message, "error");
  }),
);

els.dockButtons.forEach((button) => {
  button.addEventListener("click", () => openScreen(button.dataset.addScreen));
});

els.localeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.locale = normalizeLocale(button.dataset.locale);
    window.localStorage.setItem("lights-hub-locale", state.locale);
    applyChromeCopy();
    renderScreen();
  });
});

refreshAll().catch((error) => {
  console.error(error);
  showToast(error.message, "error");
});
