(() => {
  "use strict";

  const config = window.RIM_CONFIG || { status: "preview", endpoint: "", capacity: 50, eventId: "rim-2026-11-28", organizerEmail: "" };
  const form = document.getElementById("registrationForm");
  const submitButton = document.getElementById("submitButton");
  const submitLabel = document.getElementById("submitLabel");
  const submitNote = document.getElementById("submitNote");
  const statusPill = document.getElementById("statusPill");
  const modeNotice = document.getElementById("modeNotice");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const progressTrack = document.getElementById("progressTrack");
  const errorSummary = document.getElementById("errorSummary");
  const errorList = document.getElementById("errorList");
  const companionField = document.getElementById("companionField");
  const companionName = document.getElementById("companionName");
  const phone = document.getElementById("phone");
  const iframe = document.getElementById("submissionTarget");
  const dialog = document.getElementById("resultDialog");
  const dialogTitle = document.getElementById("dialogTitle");
  const dialogMessage = document.getElementById("dialogMessage");
  const confirmationCode = document.getElementById("confirmationCode");
  const dialogClose = document.getElementById("dialogClose");
  let awaitingResponse = false;
  let fallbackTimer = null;

  const state = ["preview", "open", "closed"].includes(config.status) ? config.status : "preview";
  document.body.dataset.registrationState = state;
  document.getElementById("eventId").value = config.eventId || "rim-2026-11-28";
  document.getElementById("startedAt").value = new Date().toISOString();

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `rim-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  document.getElementById("requestId").value = createRequestId();

  function setMode() {
    const contact = document.getElementById("organizerContact");
    if (config.organizerEmail) {
      contact.innerHTML = `聯絡信箱：<a href="mailto:${escapeHtml(config.organizerEmail)}">${escapeHtml(config.organizerEmail)}</a>`;
    }

    statusPill.dataset.state = state;
    if (state === "open" && config.endpoint) {
      statusPill.textContent = "報名開放中";
      modeNotice.hidden = true;
      submitLabel.textContent = "送出報名";
      submitNote.textContent = "送出後請留意 Email 正取／候補確認信。";
      return;
    }
    if (state === "closed") {
      statusPill.textContent = "報名已停止";
      modeNotice.hidden = false;
      modeNotice.innerHTML = '<span class="mode-notice-mark" aria-hidden="true"></span><div><strong>目前停止收件</strong><span>表單可供閱讀，但已無法送出。請留意主辦人後續公告。</span></div>';
      submitLabel.textContent = "目前停止收件";
      submitButton.disabled = true;
      [...form.elements].forEach((control) => { if (control.type !== "hidden") control.disabled = true; });
      submitNote.textContent = "";
      return;
    }
    if (state === "open" && !config.endpoint) {
      statusPill.textContent = "系統設定中";
      statusPill.dataset.state = "closed";
      modeNotice.hidden = false;
      modeNotice.innerHTML = '<span class="mode-notice-mark" aria-hidden="true"></span><div><strong>收件端點尚未設定</strong><span>目前無法送出，請聯絡主辦人完成後端設定。</span></div>';
      submitLabel.textContent = "暫時無法送出";
      submitButton.disabled = true;
      submitNote.textContent = "請先在 config.js 設定 Google Apps Script Web App 網址。";
      return;
    }
    statusPill.textContent = "系統預覽";
    modeNotice.hidden = false;
    submitLabel.textContent = "預覽送出流程";
    submitNote.textContent = "預覽模式不會傳送或保存任何填寫資料。";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function selectedSeats() {
    return Number(form.querySelector('input[name="seats"]:checked')?.value || 1);
  }

  function toggleCompanion() {
    const needsCompanion = selectedSeats() === 2;
    companionField.hidden = !needsCompanion;
    companionName.required = needsCompanion;
    if (!needsCompanion) {
      companionName.value = "";
      clearFieldError(companionName);
    }
    updateProgress();
  }

  function validatePhone() {
    const raw = phone.value.trim();
    const digits = raw.replace(/\D/g, "");
    if (!raw) phone.setCustomValidity("請填寫聯絡電話。");
    else if (digits.length < 8 || digits.length > 15 || !/^[+()\-\d\s]+$/.test(raw)) phone.setCustomValidity("請輸入有效的聯絡電話，例如 0912 345 678。");
    else phone.setCustomValidity("");
  }

  function fieldLabel(control) {
    const label = form.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    return label ? label.textContent.replace(/＊|必填/g, "").trim() : control.name;
  }

  function messageFor(control) {
    if (control.validity.valueMissing) return `請填寫或勾選「${fieldLabel(control)}」。`;
    if (control.validity.typeMismatch) return `「${fieldLabel(control)}」格式不正確。`;
    return control.validationMessage || `請檢查「${fieldLabel(control)}」。`;
  }

  function showFieldError(control) {
    control.setAttribute("aria-invalid", "true");
    const target = document.getElementById(`${control.id}Error`);
    if (target) {
      target.textContent = messageFor(control);
      target.hidden = false;
    }
  }

  function clearFieldError(control) {
    control.removeAttribute("aria-invalid");
    const target = document.getElementById(`${control.id}Error`);
    if (target) {
      target.textContent = "";
      target.hidden = true;
    }
  }

  function validateForm() {
    validatePhone();
    const invalid = [...form.querySelectorAll("input, textarea")].filter((control) => !control.disabled && !control.checkValidity());
    [...form.querySelectorAll('[aria-invalid="true"]')].forEach(clearFieldError);
    invalid.forEach(showFieldError);
    errorList.replaceChildren();
    if (invalid.length) {
      invalid.forEach((control) => {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#${control.id}`;
        link.textContent = messageFor(control);
        link.addEventListener("click", (event) => {
          event.preventDefault();
          control.focus();
        });
        item.appendChild(link);
        errorList.appendChild(item);
      });
      errorSummary.hidden = false;
      errorSummary.focus();
      return false;
    }
    errorSummary.hidden = true;
    return true;
  }

  function requiredControls() {
    const controls = [
      document.getElementById("fullName"),
      phone,
      document.getElementById("email"),
      document.getElementById("ageConfirm"),
      document.getElementById("privacyConsent")
    ];
    if (selectedSeats() === 2) controls.push(companionName);
    return controls;
  }

  function updateProgress() {
    validatePhone();
    const controls = requiredControls();
    const completed = controls.filter((control) => {
      if (control.type === "checkbox") return control.checked;
      return control.value.trim() !== "" && control.checkValidity();
    }).length;
    const value = Math.round((completed / controls.length) * 100);
    progressBar.style.width = `${value}%`;
    progressText.textContent = `${value}%`;
    progressTrack.setAttribute("aria-valuenow", String(value));
  }

  function setCounter(id, value, max) {
    document.getElementById(id).textContent = `${value.length} / ${max}`;
  }

  function setSubmitting(active) {
    submitButton.disabled = active;
    if (active) {
      submitLabel.innerHTML = '<span class="button-loading"><span class="spinner" aria-hidden="true"></span>正在送出…</span>';
      submitButton.setAttribute("aria-busy", "true");
    } else {
      submitLabel.textContent = state === "preview" ? "預覽送出流程" : "送出報名";
      submitButton.removeAttribute("aria-busy");
    }
  }

  function showResult(payload) {
    const preview = payload.preview === true;
    dialogTitle.textContent = preview ? "預覽流程完成" : "報名資料已送出";
    dialogMessage.textContent = preview
      ? "欄位驗證、送出狀態與完成畫面皆正常；本次資料未傳送、未儲存。正式開放前請設定收件端點。"
      : payload.message || "正取／候補結果與報名編號只會寄到您填寫的信箱，請查收確認信（含垃圾郵件匣）。";
    if (payload.registrationCode) {
      confirmationCode.hidden = false;
      confirmationCode.textContent = `報名編號：${payload.registrationCode}`;
    } else {
      confirmationCode.hidden = true;
      confirmationCode.textContent = "";
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function showSubmissionError(message) {
    errorList.replaceChildren();
    const item = document.createElement("li");
    item.textContent = message || "系統暫時無法收件，請稍後再試。";
    errorList.appendChild(item);
    errorSummary.hidden = false;
    errorSummary.focus();
  }

  function trustedAppsScriptOrigin(origin) {
    try {
      const host = new URL(origin).hostname;
      return host === "script.google.com" || host.endsWith(".googleusercontent.com");
    } catch (_) {
      return false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validateForm()) return;
    document.getElementById("submittedAt").value = new Date().toISOString();

    if (state === "preview") {
      showResult({ preview: true });
      return;
    }
    if (state !== "open" || !config.endpoint) {
      showSubmissionError("報名系統目前未開放，請稍後再試。");
      return;
    }

    setSubmitting(true);
    awaitingResponse = true;
    form.action = config.endpoint;
    form.target = "submissionTarget";
    HTMLFormElement.prototype.submit.call(form);
    fallbackTimer = window.setTimeout(() => {
      if (!awaitingResponse) return;
      awaitingResponse = false;
      setSubmitting(false);
      // 未收到明確回應時不清空表單，讓使用者可在確認失敗後重送（同一 requestId 不會重複佔位）。
      showResult({ message: "資料已送往報名系統，但尚未收到確認回應。若 10 分鐘內未收到確認信，請重新送出一次或聯絡主辦人。" });
    }, 12000);
  });

  function resetAfterSuccess() {
    // 成功送出後清空畫面上的個資，避免共用裝置殘留；並換新的請求識別碼。
    form.reset();
    [...form.querySelectorAll('[aria-invalid="true"]')].forEach(clearFieldError);
    document.getElementById("requestId").value = createRequestId();
    document.getElementById("startedAt").value = new Date().toISOString();
    setCounter("questionCount", "", 500);
    setCounter("accessibilityCount", "", 300);
    toggleCompanion();
    updateProgress();
  }

  window.addEventListener("message", (event) => {
    if (!awaitingResponse) return;
    // 只接受隱藏 iframe（Apps Script 回應頁）送來的訊息，且來源網域必須是 Google。
    if (event.source !== iframe.contentWindow || !trustedAppsScriptOrigin(event.origin)) return;
    const payload = event.data;
    if (!payload || typeof payload !== "object" || payload.source !== "rim-registration") return;
    awaitingResponse = false;
    window.clearTimeout(fallbackTimer);
    setSubmitting(false);
    if (payload.ok === true) {
      showResult({ message: typeof payload.message === "string" ? payload.message : "" });
      resetAfterSuccess();
    } else {
      showSubmissionError(typeof payload.message === "string" ? payload.message : "");
    }
  });

  iframe.addEventListener("load", () => {
    // Apps Script 會優先用 postMessage 回傳明確結果；此事件僅保留作為網路完成訊號。
  });

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("input, textarea")) {
      if (target === phone) validatePhone();
      if (target.checkValidity()) clearFieldError(target);
      updateProgress();
    }
  });
  form.addEventListener("change", (event) => {
    if (event.target.name === "seats") toggleCompanion();
    updateProgress();
  });
  phone.addEventListener("blur", validatePhone);
  document.getElementById("question").addEventListener("input", (event) => setCounter("questionCount", event.target.value, 500));
  document.getElementById("accessibilityNeeds").addEventListener("input", (event) => setCounter("accessibilityCount", event.target.value, 300));
  dialogClose.addEventListener("click", () => dialog.close ? dialog.close() : dialog.removeAttribute("open"));

  setMode();
  toggleCompanion();
  updateProgress();
})();
