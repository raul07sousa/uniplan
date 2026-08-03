(function () {
  "use strict";

  const Core = window.UniPlanCore;
  const STORAGE_KEY = "uniplan.v4";
  const PREVIOUS_KEY = "uniplan.v4.previous";
  const LEGACY_KEYS = ["uniplan.v3", "uniplan.v2", "uniplan.v1"];
  const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const TYPE_LABELS = { class: "Aula", personal: "Pessoal", work: "Trabalho", other: "Outro" };
  const ACTIVITY_LABELS = { reading: "Leitura", exercises: "Exercícios", project: "Projeto", review: "Revisão", class: "Aula", other: "Outro" };
  const ATTEMPT_LABELS = { normal: "Normal", exam: "Exame", resit: "Recurso", improvement: "Melhoria" };
  const initialState = Core.sanitizeState({ version: 4, courses: [], tasks: [], sessions: [], commitments: [], settings: {} }).state;

  let state = loadState();
  let calendarWeekStart = Core.localDateString(Core.mondayOf(Core.localDateString()));
  let timerInterval = null;
  let deferredInstallPrompt = null;
  let syncDebounce = null;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const formatNumber = (value, decimals = 1) => Number.isFinite(Number(value)) ? new Intl.NumberFormat("pt-PT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value)) : "—";
  const formatDate = (value, options = { day: "2-digit", month: "short" }) => { const d = Core.parseLocalDate(value); return d ? new Intl.DateTimeFormat("pt-PT", options).format(d) : "Sem data"; };
  const formatLongDate = value => formatDate(value, { weekday: "long", day: "2-digit", month: "long" });

  const el = {
    storageAlert: $("#storageAlert"), onboarding: $("#onboarding"), semesterSelect: $("#semesterSelect"), notificationCount: $("#notificationCount"),
    semesterProgress: $("#semesterProgress"), courseCount: $("#courseCount"), pendingTaskCount: $("#pendingTaskCount"), nextDeadline: $("#nextDeadline"), studyHours7: $("#studyHours7"), passedEcts: $("#passedEcts"), forecastAverage: $("#forecastAverage"),
    dashboardReminderStrip: $("#dashboardReminderStrip"), riskOverview: $("#riskOverview"), riskCards: $("#riskCards"), dashboardEmpty: $("#dashboardEmpty"),
    coursesList: $("#coursesList"), coursesEmpty: $("#coursesEmpty"), courseTemplate: $("#courseTemplate"),
    tasksList: $("#tasksList"), tasksEmpty: $("#tasksEmpty"), taskStatusFilter: $("#taskStatusFilter"), taskCourseFilter: $("#taskCourseFilter"), taskActivityFilter: $("#taskActivityFilter"),
    weeklyCalendar: $("#weeklyCalendar"), calendarTitle: $("#calendarTitle"), calendarWarnings: $("#calendarWarnings"), planComparison: $("#planComparison"),
    sessionsList: $("#sessionsList"), sessionsEmpty: $("#sessionsEmpty"), sessionCourseFilter: $("#sessionCourseFilter"), studyKpis: $("#studyKpis"), studyBars: $("#studyBars"), activityBreakdown: $("#activityBreakdown"),
    timerDisplay: $("#timerDisplay"), startTimerBtn: $("#startTimerBtn"), stopTimerBtn: $("#stopTimerBtn"),
    simulatorCourseSelect: $("#simulatorCourseSelect"), simulatorInputs: $("#simulatorInputs"), simulatorResult: $("#simulatorResult"), historyKpis: $("#historyKpis"), semesterHistory: $("#semesterHistory"),
    notificationsList: $("#notificationsList"), toastRegion: $("#toastRegion"), installBtn: $("#installBtn")
  };

  function activeSemester() { return state.semesters.find(item => item.id === state.activeSemesterId) || state.semesters[0]; }
  function semesterCourses(id = state.activeSemesterId) { return state.courses.filter(item => item.semesterId === id && !item.archived); }
  function semesterTasks(id = state.activeSemesterId) { return state.tasks.filter(item => item.semesterId === id); }
  function semesterSessions(id = state.activeSemesterId) { return state.sessions.filter(item => item.semesterId === id); }
  function semesterCommitments(id = state.activeSemesterId) { return state.commitments.filter(item => item.semesterId === id); }
  function semesterOverrides(id = state.activeSemesterId) { return state.planOverrides.filter(item => item.semesterId === id); }
  function courseById(id) { return state.courses.find(item => item.id === id); }
  function taskById(id) { return state.tasks.find(item => item.id === id); }
  function isOverdue(task) { return !task.done && task.dueDate && Core.daysBetween(Core.localDateString(), task.dueDate) < 0; }
  function courseName(id) { return courseById(id)?.name || "Sem disciplina"; }
  function currentCoursesMap() { return new Map(semesterCourses().map(course => [course.id, course])); }

  function showToast(message) {
    const node = document.createElement("div"); node.className = "toast"; node.textContent = message;
    el.toastRegion.appendChild(node); setTimeout(() => node.remove(), 3600);
  }

  function loadState() {
    for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
      try {
        const raw = localStorage.getItem(key); if (!raw) continue;
        const result = Core.sanitizeState(JSON.parse(raw));
        if (result.errors.length) throw new Error(result.errors.join(" "));
        if (key !== STORAGE_KEY) localStorage.setItem(STORAGE_KEY, JSON.stringify(result.state));
        return result.state;
      } catch (error) { console.error("Falha ao carregar", key, error); }
    }
    return clone(initialState);
  }

  function persist(options = {}) {
    state.updatedAt = new Date().toISOString();
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current && options.snapshot !== false) localStorage.setItem(PREVIOUS_KEY, current);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      el.storageAlert.hidden = true;
      renderAll();
      if (state.settings.sync?.auto && options.sync !== false) scheduleAutoSync();
      return true;
    } catch (error) {
      console.error(error); el.storageAlert.hidden = false; el.storageAlert.textContent = "Não foi possível guardar. Exporta imediatamente um backup JSON."; renderAll(); return false;
    }
  }

  function scheduleAutoSync() {
    clearTimeout(syncDebounce);
    syncDebounce = setTimeout(() => writeSyncFile(true).catch(console.error), 900);
  }

  function setTab(name) {
    $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === name));
    $$(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `${name}Tab`));
    if (name === "simulator") renderSimulator();
    if (name === "history") renderHistory();
  }

  function applyTheme() {
    const theme = state.settings.theme || "system";
    if (theme === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme = theme;
    $("#themeBtn").title = `Tema: ${theme}`;
  }

  function renderAll() {
    applyTheme(); renderSemesterSelector(); renderOnboarding(); renderOptions(); renderSummary(); renderDashboard(); renderCourses(); renderTasks(); renderCalendar(); renderStudy(); renderTimer(); renderSimulator(); renderHistory(); renderNotifications();
  }

  function renderSemesterSelector() {
    const selected = state.activeSemesterId;
    el.semesterSelect.innerHTML = state.semesters.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${item.archived ? " · arquivado" : ""}</option>`).join("");
    el.semesterSelect.value = selected;
  }

  function renderOnboarding() { el.onboarding.hidden = state.settings.onboardingDone || state.courses.length > 0; }

  function setSelectOptions(select, items, firstLabel, selected = "") {
    if (!select) return;
    select.innerHTML = `<option value="">${firstLabel}</option>${items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.title)}</option>`).join("")}`;
    select.value = [...select.options].some(option => option.value === selected) ? selected : "";
  }

  function renderOptions() {
    const courses = semesterCourses();
    const courseSelectIds = ["taskCourseId", "sessionCourseId", "commitmentCourseId", "timerCourseId"];
    for (const id of courseSelectIds) { const select = $(`#${id}`); setSelectOptions(select, courses, "Sem disciplina", select?.value || ""); }
    for (const id of ["taskCourseFilter", "sessionCourseFilter"]) {
      const select = $(`#${id}`); const selected = select?.value || "all";
      if (select) { select.innerHTML = `<option value="all">Todas</option>${courses.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}`; select.value = [...select.options].some(option => option.value === selected) ? selected : "all"; }
    }
    renderTaskOptions($("#sessionTaskId"), $("#sessionCourseId")?.value, $("#sessionTaskId")?.value);
    renderTaskOptions($("#timerTaskId"), $("#timerCourseId")?.value, $("#timerTaskId")?.value);
    const simulatorSelected = el.simulatorCourseSelect.value;
    el.simulatorCourseSelect.innerHTML = courses.length ? courses.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("") : `<option value="">Sem disciplinas</option>`;
    el.simulatorCourseSelect.value = courses.some(item => item.id === simulatorSelected) ? simulatorSelected : courses[0]?.id || "";
  }

  function renderTaskOptions(select, courseId, selected = "") {
    if (!select) return;
    const tasks = semesterTasks().filter(task => !task.done && (!courseId || task.courseId === courseId));
    setSelectOptions(select, tasks, "Sem tarefa", selected);
  }

  function renderSummary() {
    const courses = semesterCourses(); const tasks = semesterTasks(); const sessions = semesterSessions();
    const pending = tasks.filter(task => !task.done); const stats = Core.studyStats(sessions, { days: 7 }); const academic = Core.academicSummary(courses);
    el.courseCount.textContent = courses.length; el.pendingTaskCount.textContent = pending.length;
    el.semesterProgress.textContent = `${Math.round(Core.getSemesterProgress(courses))}%`;
    const nextDates = [
      ...pending.filter(task => task.dueDate).map(task => ({ date: task.dueDate, overdue: isOverdue(task) })),
      ...courses.flatMap(course => course.assessments.filter(item => item.date && Core.normalizeGrade(item.grade) === "").map(item => ({ date: item.date, overdue: Core.daysBetween(Core.localDateString(), item.date) < 0 })))
    ].sort((a, b) => a.date.localeCompare(b.date));
    el.nextDeadline.textContent = nextDates[0] ? `${nextDates[0].overdue ? "Atrasado · " : ""}${formatDate(nextDates[0].date)}` : "—";
    el.studyHours7.textContent = `${formatNumber(stats.hours, stats.hours % 1 ? 1 : 0)} h`;
    el.passedEcts.textContent = formatNumber(academic.passedEcts, academic.passedEcts % 1 ? 1 : 0);
    el.forecastAverage.textContent = academic.forecastAverage ? formatNumber(academic.forecastAverage, 1) : "—";
  }

  function getCurrentReminders() {
    const settings = state.settings.notifications || {};
    return Core.generateReminders(state, { semesterId: state.activeSemesterId, assessmentDays: settings.assessmentDays ?? 7, taskDays: settings.taskDays ?? 3 });
  }

  function renderDashboard() {
    const courses = semesterCourses(); const tasks = semesterTasks(); const sessions = semesterSessions();
    const risks = courses.map(course => ({ course, risk: Core.calculateCourseRisk(course, { tasks, sessions }) })).sort((a, b) => b.risk.score - a.risk.score);
    el.dashboardEmpty.hidden = risks.length > 0; el.riskCards.innerHTML = "";
    const counts = { low: 0, medium: 0, high: 0, critical: 0 }; risks.forEach(item => counts[item.risk.level]++);
    el.riskOverview.innerHTML = `<div><strong>${risks.length}</strong><small>disciplinas analisadas</small></div><div><strong>${counts.high + counts.critical}</strong><small>com risco elevado</small></div><div><strong>${tasks.filter(isOverdue).length}</strong><small>tarefas atrasadas</small></div><div><strong>${formatNumber(Core.studyStats(sessions, { days: 14 }).hours, 1)} h</strong><small>estudo em 14 dias</small></div>`;
    for (const { course, risk } of risks) {
      const card = document.createElement("article"); card.className = `risk-card card ${risk.level}`; card.dataset.courseId = course.id;
      card.innerHTML = `<h3><span>${escapeHtml(course.name)}</span><span class="risk-badge ${risk.level}">${risk.label}</span></h3><div class="risk-score">${risk.score}/100</div><div class="risk-meter"><span style="width:${risk.score}%"></span></div>${risk.reasons.length ? `<ul>${risk.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : `<p class="hint">Sem sinais críticos.</p>`}<p><strong>Próxima ação:</strong> ${escapeHtml(risk.recommendation)}</p><button class="button secondary open-risk-course" type="button">Abrir disciplina</button>`;
      el.riskCards.appendChild(card);
    }
    const reminders = getCurrentReminders().slice(0, 4);
    el.dashboardReminderStrip.innerHTML = reminders.map(item => `<div class="reminder ${item.severity}"><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.detail)}</div>`).join("");
  }

  function statusHtml(progress, course) {
    const alerts = [];
    if (progress.overweight) alerts.push(`<div class="alert danger">Os pesos ultrapassam 100%.</div>`);
    if (progress.underconfigured) alerts.push(`<div class="alert warning">A fórmula ainda não cobre 100% da nota.</div>`);
    if (progress.blockers.length) alerts.push(`<div class="alert danger">${progress.blockers.map(escapeHtml).join(" · ")}</div>`);
    if (progress.mandatoryPending.length) alerts.push(`<div class="alert warning">Obrigatórias pendentes: ${progress.mandatoryPending.map(escapeHtml).join(", ")}.</div>`);
    if (progress.passed) alerts.push(`<div class="alert success">Disciplina concluída com ${formatNumber(progress.finalGrade, 1)} valores.</div>`);
    if (course.attendanceRequired) alerts.push(`<div class="alert info">Assiduidade: ${formatNumber(course.attendancePercentage, 1)}% · mínimo ${formatNumber(course.attendanceMinimum, 1)}%.</div>`);
    return alerts.join("");
  }

  function renderCourses() {
    const courses = semesterCourses(); el.coursesList.innerHTML = ""; el.coursesEmpty.hidden = courses.length > 0;
    for (const course of courses) {
      const progress = Core.calculateCourseProgress(course); const node = el.courseTemplate.content.firstElementChild.cloneNode(true); node.dataset.courseId = course.id;
      node.querySelector(".course-name").textContent = course.name; node.querySelector(".course-ects").textContent = `${formatNumber(course.ects, course.ects % 1 ? 1 : 0)} ECTS`;
      node.querySelector(".course-summary").textContent = `Objetivo ${formatNumber(course.target, 1)} · mínimo final ${formatNumber(course.passingGrade, 1)} · dificuldade ${course.difficulty}/5`;
      node.querySelector(".course-score strong").textContent = formatNumber(progress.knownContribution, 2); node.querySelector(".progress span").style.width = `${Math.min(100, progress.gradedOverallWeight)}%`;
      node.querySelector(".course-status").innerHTML = statusHtml(progress, course);
      const needed = progress.remainingOverallWeight <= 0 ? "Fechado" : progress.requiredAverage > 20 ? "Impossível" : formatNumber(Math.max(0, progress.requiredAverage), 1);
      node.querySelector(".course-insights").innerHTML = `<div class="insight"><strong>${formatNumber(progress.gradedOverallWeight, 1)}%</strong><small>avaliado</small></div><div class="insight"><strong>${needed}</strong><small>média necessária</small></div><div class="insight"><strong>${formatNumber(progress.bestPossible, 1)}</strong><small>melhor possível</small></div><div class="insight"><strong>${formatNumber(course.attendancePercentage, 0)}%</strong><small>assiduidade</small></div><div class="insight"><strong>${progress.finalGrade === null ? "—" : formatNumber(progress.finalGrade, 1)}</strong><small>nota final</small></div>`;
      const componentsContainer = node.querySelector(".components");
      for (const componentResult of progress.componentResults) {
        const component = course.components.find(item => item.id === componentResult.id); const comp = document.createElement("section"); comp.className = "component"; comp.dataset.componentId = component.id;
        const rows = componentResult.items.map(item => {
          const grade = item.effectiveGrade === "" ? "Pendente" : formatNumber(item.effectiveGrade, 1); const replacement = item.replacedBy ? ` · substituída por ${escapeHtml(item.replacementName)}` : "";
          return `<div class="assessment-row ${item.replacedBy ? "replacement" : ""}" data-assessment-id="${escapeHtml(item.id)}"><div><strong>${escapeHtml(item.name)}</strong><small>${ATTEMPT_LABELS[item.attemptType] || "Normal"}${item.mandatory ? " · obrigatória" : ""}${replacement}</small></div><span>${formatNumber(item.weight, 1)}%</span><span>${grade}</span><span>${item.date ? formatDate(item.date) : "Sem data"}</span><div class="row-actions"><button class="icon-button edit-assessment" type="button" title="Editar">✎</button><button class="icon-button delete-assessment" type="button" title="Eliminar">×</button></div></div>`;
        }).join("");
        const replacements = course.assessments.filter(item => item.replacementFor || item.replacementMode === "worst_in_component").filter(item => item.componentId === component.id).map(item => `<div class="assessment-row replacement" data-assessment-id="${escapeHtml(item.id)}"><div><strong>${escapeHtml(item.name)}</strong><small>${ATTEMPT_LABELS[item.attemptType]} · ${item.replacementMode === "worst_in_component" ? "substitui pior nota" : "substituição"}</small></div><span>—</span><span>${item.grade === "" ? "Pendente" : formatNumber(item.grade, 1)}</span><span>${item.date ? formatDate(item.date) : "Sem data"}</span><div class="row-actions"><button class="icon-button edit-assessment" type="button">✎</button><button class="icon-button delete-assessment" type="button">×</button></div></div>`).join("");
        comp.innerHTML = `<div class="component-header"><div><h4>${escapeHtml(component.name)}</h4><p class="component-meta">${formatNumber(component.weight, 1)}% da nota · mínimo ${formatNumber(component.minimumGrade, 1)} · configurado ${formatNumber(componentResult.declaredWeight, 1)}%</p></div><div class="component-actions"><button class="icon-button edit-component" type="button">✎</button><button class="icon-button delete-component" type="button">×</button></div></div><div class="assessments">${rows}${replacements || "<p class=\"hint\">Sem avaliações nesta componente.</p>"}</div>`;
        componentsContainer.appendChild(comp);
      }
      el.coursesList.appendChild(node);
    }
  }

  function renderTasks() {
    const status = el.taskStatusFilter.value; const courseFilter = el.taskCourseFilter.value; const activityFilter = el.taskActivityFilter.value;
    let tasks = semesterTasks();
    if (status === "pending") tasks = tasks.filter(item => !item.done); if (status === "done") tasks = tasks.filter(item => item.done); if (status === "overdue") tasks = tasks.filter(isOverdue);
    if (courseFilter !== "all") tasks = tasks.filter(item => item.courseId === courseFilter); if (activityFilter !== "all") tasks = tasks.filter(item => item.activityType === activityFilter);
    tasks.sort((a, b) => Number(a.done) - Number(b.done) || String(a.dueDate).localeCompare(String(b.dueDate)));
    el.tasksList.innerHTML = ""; el.tasksEmpty.hidden = tasks.length > 0;
    for (const task of tasks) {
      const doneHours = Core.sessionHoursForTask(task.id, semesterSessions()); const remaining = Math.max(0, task.hours - doneHours); const row = document.createElement("article"); row.className = `task-row card ${task.done ? "done" : ""} ${isOverdue(task) ? "overdue" : ""}`; row.dataset.taskId = task.id;
      row.innerHTML = `<input class="toggle-task" type="checkbox" ${task.done ? "checked" : ""} aria-label="Concluir tarefa"><div><div class="task-title">${escapeHtml(task.title)}</div><div class="task-meta">${escapeHtml(courseName(task.courseId))} · ${task.dueDate ? formatDate(task.dueDate) : "Sem prazo"}</div><div class="task-progress">${formatNumber(doneHours, 1)} h realizadas · ${formatNumber(remaining, 1)} h restantes</div></div><div><span class="priority ${task.priority}">${task.priority === "high" ? "Alta" : task.priority === "low" ? "Baixa" : "Média"}</span><span class="activity-badge">${ACTIVITY_LABELS[task.activityType] || "Outro"}</span></div><div class="row-actions"><button class="icon-button edit-task" type="button">✎</button><button class="icon-button delete-task" type="button">×</button></div>`;
      el.tasksList.appendChild(row);
    }
  }

  function currentPlan() {
    return Core.generateStudyPlan(semesterTasks(), { startDate: calendarWeekStart, days: 7, availability: state.settings.availability, maxSessionHours: state.settings.maxSessionHours, sessions: semesterSessions(), commitments: semesterCommitments(), courses: semesterCourses(), overrides: semesterOverrides() });
  }

  function renderCalendar() {
    const courses = semesterCourses(); const tasks = semesterTasks(); const sessions = semesterSessions(); const commitments = semesterCommitments(); const plan = currentPlan();
    const weekEnd = Core.localDateString(Core.addDays(calendarWeekStart, 6)); el.calendarTitle.textContent = `${formatDate(calendarWeekStart, { day: "2-digit", month: "long" })} — ${formatDate(weekEnd, { day: "2-digit", month: "long", year: "numeric" })}`;
    const comparison = Core.plannedVsActual(plan, sessions);
    el.planComparison.innerHTML = `<span><strong>${formatNumber(plan.totalCapacity, 1)} h</strong><small>capacidade líquida</small></span><span><strong>${formatNumber(plan.totalOccupied, 1)} h</strong><small>compromissos</small></span><span><strong>${formatNumber(comparison.planned, 1)} h</strong><small>planeado</small></span><span><strong>${formatNumber(comparison.actual, 1)} h</strong><small>realizado</small></span><span><strong>${formatNumber(comparison.adherence, 0)}%</strong><small>execução</small></span>`;
    el.calendarWarnings.innerHTML = plan.unscheduled.length ? `<div class="alert warning">Sem capacidade antes do prazo: ${plan.unscheduled.map(item => `${escapeHtml(item.title)} (${formatNumber(item.hours, 1)} h)`).join(" · ")}</div>` : "";
    el.weeklyCalendar.innerHTML = "";
    for (const day of plan.days) {
      const dayNode = document.createElement("article"); dayNode.className = `calendar-day card ${day.date === Core.localDateString() ? "today" : ""}`; dayNode.dataset.date = day.date;
      const events = [];
      for (const course of courses) for (const assessment of course.assessments) if (assessment.date === day.date && Core.normalizeGrade(assessment.grade) === "") events.push({ type: "assessment", title: assessment.name, detail: course.name, time: "" });
      for (const task of tasks) if (!task.done && task.dueDate === day.date) events.push({ type: "task", title: task.title, detail: `Prazo · ${courseName(task.courseId)}`, time: "" });
      for (const commitment of commitments.filter(item => item.date === day.date)) events.push({ type: "commitment", title: commitment.title, detail: `${TYPE_LABELS[commitment.type]} · ${courseName(commitment.courseId)}`, time: `${commitment.startTime}–${commitment.endTime}`, id: commitment.id });
      for (const session of sessions.filter(item => item.date === day.date)) events.push({ type: "session", title: `${Math.round(session.durationMinutes)} min · ${ACTIVITY_LABELS[session.activityType] || "Estudo"}`, detail: courseName(session.courseId), time: "" });
      for (const item of day.items) events.push({ type: "plan", title: item.title, detail: `${formatNumber(item.hours, 1)} h · ${ACTIVITY_LABELS[item.activityType] || "Outro"}`, time: "", taskId: item.taskId, courseId: item.courseId, hours: item.hours, manual: item.manual });
      dayNode.innerHTML = `<div class="calendar-day-header"><div><h3>${formatLongDate(day.date)}</h3><small>${formatNumber(day.used, 1)} / ${formatNumber(day.capacity, 1)} h</small></div></div><div class="capacity"><span style="width:${day.capacity ? Math.min(100, day.used / day.capacity * 100) : 0}%"></span></div><div class="calendar-events">${events.map(event => {
        const controls = event.type === "plan" ? `<div class="event-actions"><button class="button secondary complete-plan" data-task-id="${escapeHtml(event.taskId)}" data-course-id="${escapeHtml(event.courseId)}" data-date="${day.date}" data-hours="${event.hours}" type="button">Concluir</button></div>` : event.type === "commitment" ? `<div class="event-actions"><button class="icon-button edit-commitment" data-id="${event.id}" type="button">✎</button><button class="icon-button delete-commitment" data-id="${event.id}" type="button">×</button></div>` : "";
        return `<div class="calendar-event ${event.type}" ${event.type === "plan" ? `draggable="true" data-task-id="${escapeHtml(event.taskId)}" data-hours="${event.hours}" data-date="${day.date}"` : ""}><span class="event-type">${event.type === "plan" ? "Plano" : event.type === "assessment" ? "Avaliação" : event.type === "task" ? "Prazo" : event.type === "session" ? "Realizado" : "Compromisso"}</span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.time ? `${event.time} · ${event.detail}` : event.detail)}</small>${controls}</div>`;
      }).join("") || `<p class="hint">Sem eventos.</p>`}</div>`;
      el.weeklyCalendar.appendChild(dayNode);
    }
  }

  function renderStudy() {
    const sessions = semesterSessions(); const filter = el.sessionCourseFilter.value;
    const visible = sessions.filter(item => filter === "all" || item.courseId === filter).sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
    const stats = Core.studyStats(sessions, { days: 7 }); const plan = currentPlan(); const comparison = Core.plannedVsActual(plan, sessions);
    el.studyKpis.innerHTML = `<div><strong>${formatNumber(stats.hours, 1)} h</strong><small>realizado</small></div><div><strong>${stats.sessions}</strong><small>sessões</small></div><div><strong>${formatNumber(stats.averageFocus, 1)}/5</strong><small>foco médio</small></div><div><strong>${formatNumber(comparison.adherence, 0)}%</strong><small>execução do plano</small></div>`;
    const dates = Array.from({ length: 7 }, (_, index) => Core.localDateString(Core.addDays(Core.localDateString(), index - 6)));
    const values = dates.map(date => sessions.filter(item => item.date === date).reduce((sum, item) => sum + item.durationMinutes / 60, 0)); const max = Math.max(1, ...values);
    el.studyBars.innerHTML = dates.map((date, index) => `<div class="study-bar"><span style="height:${Math.max(3, values[index] / max * 100)}%" title="${formatNumber(values[index], 1)} h"></span><small>${formatDate(date, { weekday: "short" })}</small></div>`).join("");
    el.activityBreakdown.innerHTML = Object.entries(stats.byActivity).map(([type, minutes]) => `<span class="activity-badge">${ACTIVITY_LABELS[type] || "Outro"}: ${formatNumber(minutes / 60, 1)} h</span>`).join("") || `<span class="hint">Sem distribuição por método.</span>`;
    el.sessionsList.innerHTML = ""; el.sessionsEmpty.hidden = visible.length > 0;
    for (const session of visible) {
      const row = document.createElement("article"); row.className = "study-row card"; row.dataset.sessionId = session.id;
      row.innerHTML = `<div class="session-main"><strong>${escapeHtml(courseName(session.courseId))}</strong><small>${formatDate(session.date, { day: "2-digit", month: "long", year: "numeric" })} · ${session.durationMinutes} min · ${ACTIVITY_LABELS[session.activityType] || "Outro"}</small><p>${escapeHtml(session.notes || "Sem notas.")}</p></div><div><span class="focus-dots">${"●".repeat(session.focus)}${"○".repeat(5 - session.focus)}</span></div><div class="row-actions"><button class="icon-button edit-session" type="button">✎</button><button class="icon-button delete-session" type="button">×</button></div>`;
      el.sessionsList.appendChild(row);
    }
  }

  function renderTimer() {
    clearInterval(timerInterval); const timer = state.settings.activeTimer;
    const update = () => {
      if (!timer) { el.timerDisplay.textContent = "00:00:00"; return; }
      const total = Math.max(0, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000)); const h = Math.floor(total / 3600); const m = Math.floor(total % 3600 / 60); const s = total % 60;
      el.timerDisplay.textContent = [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
    };
    update(); if (timer) timerInterval = setInterval(update, 1000);
    el.startTimerBtn.disabled = Boolean(timer); el.stopTimerBtn.disabled = !timer;
  }

  function renderSimulator() {
    const course = courseById(el.simulatorCourseSelect.value); if (!course || course.semesterId !== state.activeSemesterId) { el.simulatorInputs.innerHTML = "<p class=\"hint\">Adiciona uma disciplina.</p>"; el.simulatorResult.innerHTML = ""; return; }
    const base = course.assessments.filter(item => !item.replacementFor && item.replacementMode !== "worst_in_component");
    const existing = Object.fromEntries($$(".sim-grade").map(input => [input.dataset.assessmentId, input.value]));
    el.simulatorInputs.innerHTML = base.map(item => `<label class="simulator-input"><span>${escapeHtml(item.name)} <small>${item.grade === "" ? "pendente" : `atual ${formatNumber(item.grade, 1)}`}</small></span><input class="sim-grade" data-assessment-id="${escapeHtml(item.id)}" type="number" min="0" max="20" step="0.1" value="${escapeHtml(existing[item.id] ?? item.grade)}" placeholder="Nota"></label>`).join("") || `<p class="hint">Sem avaliações configuradas.</p>`;
    updateSimulation();
  }

  function updateSimulation() {
    const course = courseById(el.simulatorCourseSelect.value); if (!course) return;
    const grades = {}; $$(".sim-grade").forEach(input => { if (input.value !== "") grades[input.dataset.assessmentId] = Number(input.value); });
    const result = Core.simulateCourse(course, grades); const status = result.complete ? (result.passed ? "Aprovado" : "Não aprovado") : result.bestPossible < result.target ? "Objetivo impossível" : "Simulação incompleta";
    el.simulatorResult.innerHTML = `<p class="eyebrow">Resultado hipotético</p><div class="big-grade">${result.finalGrade === null ? formatNumber(result.knownContribution, 2) : formatNumber(result.finalGrade, 1)}</div><h3>${status}</h3><div class="course-insights"><div class="insight"><strong>${formatNumber(result.gradedOverallWeight, 1)}%</strong><small>avaliado</small></div><div class="insight"><strong>${result.requiredAverage > 20 ? "Impossível" : formatNumber(Math.max(0, result.requiredAverage), 1)}</strong><small>média em falta</small></div><div class="insight"><strong>${formatNumber(result.bestPossible, 1)}</strong><small>melhor possível</small></div></div>${result.blockers.length ? `<div class="alert danger">${result.blockers.map(escapeHtml).join(" · ")}</div>` : `<div class="alert info">Os valores aqui não alteram as notas guardadas.</div>`}`;
  }

  function renderHistory() {
    const allSummary = Core.academicSummary(state.courses); const semesters = state.semesters;
    el.historyKpis.innerHTML = `<article class="card"><strong>${formatNumber(allSummary.passedEcts, 1)}</strong><small>ECTS aprovados</small></article><article class="card"><strong>${formatNumber(allSummary.totalEcts, 1)}</strong><small>ECTS inscritos</small></article><article class="card"><strong>${allSummary.average ? formatNumber(allSummary.average, 2) : "—"}</strong><small>média concluída</small></article><article class="card"><strong>${allSummary.forecastAverage ? formatNumber(allSummary.forecastAverage, 2) : "—"}</strong><small>média prevista</small></article><article class="card"><strong>${formatNumber(allSummary.completionRate, 0)}%</strong><small>taxa de aprovação</small></article>`;
    el.semesterHistory.innerHTML = semesters.map(semester => {
      const courses = state.courses.filter(item => item.semesterId === semester.id); const summary = Core.academicSummary(courses);
      return `<article class="semester-card card ${semester.archived ? "archived" : ""}" data-semester-id="${escapeHtml(semester.id)}"><div><h3>${escapeHtml(semester.name)}</h3><p class="hint">${semester.startDate ? formatDate(semester.startDate, { month: "short", year: "numeric" }) : ""}${semester.endDate ? ` — ${formatDate(semester.endDate, { month: "short", year: "numeric" })}` : ""}</p></div><div><strong>${courses.length}</strong><small>disciplinas</small></div><div><strong>${formatNumber(summary.passedEcts, 1)}</strong><small>ECTS aprovados</small></div><div><strong>${summary.average ? formatNumber(summary.average, 2) : "—"}</strong><small>média</small></div><div><strong>${formatNumber(summary.completionRate, 0)}%</strong><small>aprovação</small></div><div class="row-actions"><button class="button secondary open-semester" type="button">Abrir</button><button class="icon-button edit-semester" type="button">✎</button></div></article>`;
    }).join("");
  }

  function renderNotifications() {
    const reminders = getCurrentReminders(); el.notificationCount.textContent = reminders.length;
    el.notificationsList.innerHTML = reminders.length ? reminders.map(item => `<div class="reminder ${item.severity}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div>`).join("") : `<div class="empty"><h3>Sem alertas.</h3><p>Não existem prazos próximos ou atrasados.</p></div>`;
  }

  function openDialog(id) { const dialog = typeof id === "string" ? $(`#${id}`) : id; if (dialog && !dialog.open) dialog.showModal(); }
  function closeDialog(id) { const dialog = typeof id === "string" ? $(`#${id}`) : id; if (dialog?.open) dialog.close(); }

  function openCourse(course = null) {
    $("#courseForm").reset(); $("#courseEditId").value = course?.id || ""; $("#courseDialogTitle").textContent = course ? "Editar disciplina" : "Adicionar disciplina";
    $("#courseName").value = course?.name || ""; $("#courseEcts").value = course?.ects ?? 6; $("#courseDifficulty").value = course?.difficulty ?? 3; $("#courseTarget").value = course?.target ?? 12; $("#coursePassingGrade").value = course?.passingGrade ?? 9.5; $("#courseRounding").value = course?.roundingMode || "none"; $("#courseAttendance").value = course?.attendancePercentage ?? 100; $("#courseAttendanceRequired").checked = Boolean(course?.attendanceRequired); $("#courseAttendanceMinimum").value = course?.attendanceMinimum ?? 75; toggleAttendanceField(); openDialog("courseDialog");
  }

  function openComponent(courseId, component = null) {
    $("#componentForm").reset(); $("#componentCourseId").value = courseId; $("#componentEditId").value = component?.id || ""; $("#componentDialogTitle").textContent = component ? "Editar componente" : "Adicionar componente"; $("#componentName").value = component?.name || ""; $("#componentWeight").value = component?.weight ?? 50; $("#componentMinimum").value = component?.minimumGrade ?? 0; openDialog("componentDialog");
  }

  function openAssessment(courseId, assessment = null, componentId = "") {
    const course = courseById(courseId); if (!course) return;
    $("#assessmentForm").reset(); $("#assessmentCourseId").value = courseId; $("#assessmentEditId").value = assessment?.id || ""; $("#assessmentDialogTitle").textContent = assessment ? "Editar avaliação" : "Adicionar avaliação";
    $("#assessmentComponentId").innerHTML = course.components.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join(""); $("#assessmentComponentId").value = assessment?.componentId || componentId || course.components[0]?.id || "";
    $("#assessmentReplacementFor").innerHTML = `<option value="">Selecionar</option>${course.assessments.filter(item => item.id !== assessment?.id && !item.replacementFor && item.replacementMode !== "worst_in_component").map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}`;
    $("#assessmentName").value = assessment?.name || ""; $("#assessmentAttemptType").value = assessment?.attemptType || "normal";
    const mode = assessment?.replacementMode === "worst_in_component" ? "worst_in_component" : assessment?.replacementFor ? "target" : "none"; $("#assessmentReplacementMode").value = mode; $("#assessmentReplacementFor").value = assessment?.replacementFor || ""; $("#assessmentReplacementPolicy").value = assessment?.replacementPolicy || "best";
    $("#assessmentWeight").value = assessment?.weight ?? 0; $("#assessmentGrade").value = assessment?.grade ?? ""; $("#assessmentDate").value = assessment?.date || ""; $("#assessmentMinimum").value = assessment?.minimumGrade ?? 0; $("#assessmentMandatory").checked = Boolean(assessment?.mandatory); updateReplacementFields(); openDialog("assessmentDialog");
  }

  function openTask(task = null) {
    $("#taskForm").reset(); $("#taskEditId").value = task?.id || ""; $("#taskDialogTitle").textContent = task ? "Editar tarefa" : "Adicionar tarefa"; renderOptions(); $("#taskTitle").value = task?.title || ""; $("#taskCourseId").value = task?.courseId || ""; $("#taskDueDate").value = task?.dueDate || Core.localDateString(Core.addDays(Core.localDateString(), 7)); $("#taskPriority").value = task?.priority || "medium"; $("#taskActivityType").value = task?.activityType || "other"; $("#taskHours").value = task?.hours ?? 2; openDialog("taskDialog");
  }

  function openCommitment(commitment = null) {
    $("#commitmentForm").reset(); $("#commitmentEditId").value = commitment?.id || ""; $("#commitmentDialogTitle").textContent = commitment ? "Editar compromisso" : "Adicionar compromisso"; renderOptions(); $("#commitmentTitle").value = commitment?.title || ""; $("#commitmentDate").value = commitment?.date || Core.localDateString(); $("#commitmentType").value = commitment?.type || "class"; $("#commitmentStart").value = commitment?.startTime || "09:00"; $("#commitmentEnd").value = commitment?.endTime || "10:00"; $("#commitmentCourseId").value = commitment?.courseId || ""; openDialog("commitmentDialog");
  }

  function openSession(session = null) {
    $("#sessionForm").reset(); $("#sessionEditId").value = session?.id || ""; $("#sessionDialogTitle").textContent = session ? "Editar sessão" : "Registar sessão"; renderOptions(); $("#sessionDate").value = session?.date || Core.localDateString(); $("#sessionDuration").value = session?.durationMinutes ?? 60; $("#sessionCourseId").value = session?.courseId || ""; renderTaskOptions($("#sessionTaskId"), $("#sessionCourseId").value, session?.taskId || ""); $("#sessionActivityType").value = session?.activityType || "other"; $("#sessionFocus").value = session?.focus ?? 3; $("#sessionNotes").value = session?.notes || ""; openDialog("sessionDialog");
  }

  function openSettings() {
    DAYS.forEach((_, index) => { $(`#availability${index}`).value = state.settings.availability[index]; }); $("#maxSessionHours").value = state.settings.maxSessionHours; const notifications = state.settings.notifications || {}; $("#notificationsEnabled").checked = Boolean(notifications.enabled); $("#assessmentReminderDays").value = notifications.assessmentDays ?? 7; $("#taskReminderDays").value = notifications.taskDays ?? 3; $("#autoSyncEnabled").checked = Boolean(state.settings.sync?.auto); updateSyncStatus(); openDialog("settingsDialog");
  }

  function openSemesterDialog(semester = null) {
    $("#semesterForm").reset(); $("#semesterEditId").value = semester?.id || ""; $("#semesterDialogTitle").textContent = semester ? "Editar semestre" : "Novo semestre"; $("#semesterName").value = semester?.name || ""; $("#semesterStart").value = semester?.startDate || ""; $("#semesterEnd").value = semester?.endDate || ""; $("#semesterArchived").checked = Boolean(semester?.archived); renderSemesterManager(); openDialog("semesterDialog");
  }

  function renderSemesterManager() {
    $("#semesterListManager").innerHTML = state.semesters.map(item => `<div class="card inset" data-semester-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><small>${state.courses.filter(course => course.semesterId === item.id).length} disciplinas${item.archived ? " · arquivado" : ""}</small><div class="row-actions"><button class="icon-button manager-edit-semester" type="button">✎</button></div></div>`).join("");
  }

  function toggleAttendanceField() { $("#attendanceMinimumLabel").hidden = !$("#courseAttendanceRequired").checked; }
  function updateReplacementFields() {
    const mode = $("#assessmentReplacementMode").value; $("#replacementTargetLabel").hidden = mode !== "target"; $("#assessmentWeight").disabled = mode !== "none"; if (mode !== "none") $("#assessmentWeight").value = 0;
  }

  function loadDemo() {
    const semester = activeSemester(); const s = semester.id; const today = Core.localDateString();
    const p = uid("course"), r = uid("course"), m = uid("course");
    state.courses = state.courses.filter(item => item.semesterId !== s).concat([
      { id: p, semesterId: s, name: "Programação I", ects: 6, target: 14, passingGrade: 9.5, difficulty: 4, roundingMode: "oneDecimal", attendanceRequired: true, attendanceMinimum: 75, attendancePercentage: 88, archived: false, components: [{ id: `${p}_t`, name: "Testes", weight: 60, minimumGrade: 8 }, { id: `${p}_p`, name: "Projeto", weight: 40, minimumGrade: 9.5 }], assessments: [{ id: `${p}_t1`, name: "Teste 1", componentId: `${p}_t`, weight: 50, grade: 12, date: Core.localDateString(Core.addDays(today, -18)), minimumGrade: 7.5, mandatory: true, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }, { id: `${p}_t2`, name: "Teste 2", componentId: `${p}_t`, weight: 50, grade: "", date: Core.localDateString(Core.addDays(today, 9)), minimumGrade: 7.5, mandatory: true, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }, { id: `${p}_pr`, name: "Projeto final", componentId: `${p}_p`, weight: 100, grade: 15, date: Core.localDateString(Core.addDays(today, -5)), minimumGrade: 9.5, mandatory: true, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }] },
      { id: r, semesterId: s, name: "Redes", ects: 6, target: 12, passingGrade: 9.5, difficulty: 5, roundingMode: "none", attendanceRequired: false, attendanceMinimum: 0, attendancePercentage: 100, archived: false, components: [{ id: `${r}_g`, name: "Avaliação", weight: 100, minimumGrade: 0 }], assessments: [{ id: `${r}_t1`, name: "Teste", componentId: `${r}_g`, weight: 50, grade: 8, date: Core.localDateString(Core.addDays(today, -12)), minimumGrade: 7, mandatory: true, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }, { id: `${r}_t2`, name: "Projeto de rede", componentId: `${r}_g`, weight: 50, grade: "", date: Core.localDateString(Core.addDays(today, 5)), minimumGrade: 0, mandatory: true, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }] },
      { id: m, semesterId: s, name: "Matemática Discreta", ects: 6, target: 13, passingGrade: 9.5, difficulty: 4, roundingMode: "nearestInteger", attendanceRequired: false, attendanceMinimum: 0, attendancePercentage: 100, archived: false, components: [{ id: `${m}_g`, name: "Testes", weight: 100, minimumGrade: 0 }], assessments: [{ id: `${m}_a`, name: "Teste 1", componentId: `${m}_g`, weight: 50, grade: 14, date: Core.localDateString(Core.addDays(today, -20)), minimumGrade: 0, mandatory: false, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }, { id: `${m}_b`, name: "Teste 2", componentId: `${m}_g`, weight: 50, grade: "", date: Core.localDateString(Core.addDays(today, 14)), minimumGrade: 0, mandatory: false, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }] }
    ]);
    state.tasks = state.tasks.filter(item => item.semesterId !== s).concat([
      { id: uid("task"), semesterId: s, title: "Concluir projeto de Redes", courseId: r, dueDate: Core.localDateString(Core.addDays(today, 5)), priority: "high", activityType: "project", hours: 7, done: false, createdAt: new Date().toISOString(), completedAt: null },
      { id: uid("task"), semesterId: s, title: "Resolver exercícios do Teste 2", courseId: p, dueDate: Core.localDateString(Core.addDays(today, 8)), priority: "high", activityType: "exercises", hours: 5, done: false, createdAt: new Date().toISOString(), completedAt: null },
      { id: uid("task"), semesterId: s, title: "Rever grafos", courseId: m, dueDate: Core.localDateString(Core.addDays(today, 12)), priority: "medium", activityType: "review", hours: 3, done: false, createdAt: new Date().toISOString(), completedAt: null }
    ]);
    state.sessions = state.sessions.filter(item => item.semesterId !== s).concat([{ id: uid("session"), semesterId: s, date: Core.localDateString(Core.addDays(today, -1)), durationMinutes: 75, courseId: p, taskId: "", activityType: "exercises", focus: 4, notes: "Exercícios de arrays e ficheiros.", source: "manual", createdAt: new Date().toISOString() }]);
    state.commitments = state.commitments.filter(item => item.semesterId !== s).concat([{ id: uid("commitment"), semesterId: s, title: "Aula de Programação", date: Core.localDateString(Core.addDays(today, 1)), startTime: "10:00", endTime: "12:00", courseId: p, type: "class" }]);
    state.settings.onboardingDone = true; persist(); showToast("Demonstração carregada.");
  }

  function exportFile(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportState() { exportFile(`UniPlan-backup-${Core.localDateString()}.json`, JSON.stringify(state, null, 2), "application/json"); showToast("Backup exportado."); }
  function toIcsDate(date, time = "09:00") { return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`; }
  function escapeIcs(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n"); }
  function exportIcs() {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UniPlan//PT", "CALSCALE:GREGORIAN"];
    for (const course of semesterCourses()) for (const item of course.assessments) if (item.date) lines.push("BEGIN:VEVENT", `UID:${item.id}@uniplan`, `DTSTART:${toIcsDate(item.date)}`, `DTEND:${toIcsDate(item.date, "10:00")}`, `SUMMARY:${escapeIcs(`${item.name} — ${course.name}`)}`, "END:VEVENT");
    for (const task of semesterTasks()) if (task.dueDate) lines.push("BEGIN:VEVENT", `UID:${task.id}@uniplan`, `DTSTART:${toIcsDate(task.dueDate, "18:00")}`, `DTEND:${toIcsDate(task.dueDate, "19:00")}`, `SUMMARY:${escapeIcs(`Prazo: ${task.title}`)}`, "END:VEVENT");
    for (const item of semesterCommitments()) lines.push("BEGIN:VEVENT", `UID:${item.id}@uniplan`, `DTSTART:${toIcsDate(item.date, item.startTime)}`, `DTEND:${toIcsDate(item.date, item.endTime)}`, `SUMMARY:${escapeIcs(item.title)}`, "END:VEVENT");
    lines.push("END:VCALENDAR"); exportFile(`UniPlan-calendario-${Core.localDateString()}.ics`, lines.join("\r\n"), "text/calendar"); showToast("Calendário exportado.");
  }

  function downloadCsvTemplate() {
    const csv = "tipo;semestre;disciplina;ects;objetivo;nome;data;peso;nota;prazo;horas;prioridade;tipo_estudo\n" +
      `disciplina;${activeSemester().name};Programação I;6;14;;;;;;;;\n` +
      `avaliacao;;Programação I;;;Teste 1;2026-10-15;50;;;;;\n` +
      `tarefa;;Programação I;;;Resolver ficha;;;;2026-10-10;3;alta;exercises\n`;
    exportFile("UniPlan-modelo-importacao.csv", csv, "text/csv;charset=utf-8");
  }

  function importCsvRows(rows) {
    let added = 0; const semester = activeSemester();
    for (const row of rows) {
      const type = (row.tipo || row.type || "").toLowerCase();
      if (type === "disciplina" || type === "course") {
        const name = row.disciplina || row.nome; if (!name) continue; const id = uid("course");
        state.courses.push({ id, semesterId: semester.id, name, ects: Number(row.ects || 6), target: Number(row.objetivo || 10), passingGrade: 9.5, difficulty: 3, roundingMode: "none", attendanceRequired: false, attendanceMinimum: 0, attendancePercentage: 100, archived: false, components: [Core.defaultComponent(id)], assessments: [] }); added++;
      } else if (type === "tarefa" || type === "task") {
        const course = semesterCourses().find(item => item.name.toLowerCase() === String(row.disciplina || "").toLowerCase()); if (!row.nome && !row.titulo) continue;
        const priorityMap = { alta: "high", media: "medium", média: "medium", baixa: "low" };
        state.tasks.push({ id: uid("task"), semesterId: semester.id, title: row.nome || row.titulo, courseId: course?.id || "", dueDate: row.prazo || row.data || Core.localDateString(), priority: priorityMap[String(row.prioridade || "").toLowerCase()] || row.prioridade || "medium", activityType: Core.ACTIVITY_TYPES.includes(row.tipo_estudo) ? row.tipo_estudo : "other", hours: Number(row.horas || 1), done: false, createdAt: new Date().toISOString(), completedAt: null }); added++;
      } else if (type === "avaliacao" || type === "assessment") {
        const course = semesterCourses().find(item => item.name.toLowerCase() === String(row.disciplina || "").toLowerCase()); if (!course || !row.nome) continue;
        course.assessments.push({ id: uid("assessment"), name: row.nome, componentId: course.components[0].id, weight: Number(row.peso || 0), grade: row.nota === "" || row.nota == null ? "" : Number(row.nota), date: row.data || "", minimumGrade: 0, mandatory: false, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }); added++;
      }
    }
    persist(); showToast(`${added} registos importados do CSV.`);
  }

  async function requestNotifications() {
    if (!("Notification" in window)) { alert("Este navegador não suporta notificações."); return false; }
    const permission = await Notification.requestPermission(); return permission === "granted";
  }

  function showDailyNotifications() {
    const settings = state.settings.notifications || {}; if (!settings.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const today = Core.localDateString(); if (settings.lastShownDate === today) return;
    const reminders = getCurrentReminders().slice(0, 3); if (!reminders.length) return;
    new Notification("UniPlan — prioridades de hoje", { body: reminders.map(item => `${item.title}: ${item.detail}`).join("\n"), icon: "icon-192.png", tag: `uniplan-${today}` });
    settings.lastShownDate = today; persist({ snapshot: false, sync: false });
  }

  function openSyncDb() {
    return new Promise((resolve, reject) => { const request = indexedDB.open("uniplan-files", 1); request.onupgradeneeded = () => request.result.createObjectStore("handles"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  async function storeSyncHandle(handle) { const db = await openSyncDb(); await new Promise((resolve, reject) => { const tx = db.transaction("handles", "readwrite"); tx.objectStore("handles").put(handle, "sync"); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
  async function getSyncHandle() { try { const db = await openSyncDb(); const value = await new Promise((resolve, reject) => { const tx = db.transaction("handles", "readonly"); const request = tx.objectStore("handles").get("sync"); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); }); db.close(); return value; } catch { return null; } }
  async function ensureHandlePermission(handle, write = false) { const options = { mode: write ? "readwrite" : "read" }; if (await handle.queryPermission(options) === "granted") return true; return await handle.requestPermission(options) === "granted"; }
  async function connectSyncFile() {
    if (!("showSaveFilePicker" in window)) { alert("A sincronização por ficheiro requer Chrome ou Edge recente e uma origem segura/local."); return; }
    const handle = await showSaveFilePicker({ suggestedName: "UniPlan-Sync.json", types: [{ description: "Backup UniPlan", accept: { "application/json": [".json"] } }] }); await storeSyncHandle(handle); await writeSyncFile(); updateSyncStatus();
  }
  async function writeSyncFile(silent = false) {
    const handle = await getSyncHandle(); if (!handle) { if (!silent) alert("Liga primeiro um ficheiro de sincronização."); return false; }
    if (!await ensureHandlePermission(handle, true)) return false;
    const writable = await handle.createWritable(); await writable.write(JSON.stringify(state, null, 2)); await writable.close(); state.settings.sync.lastSyncAt = new Date().toISOString(); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    if (!silent) showToast("Ficheiro sincronizado."); updateSyncStatus(); return true;
  }
  async function loadSyncFile() {
    const handle = await getSyncHandle(); if (!handle) { alert("Liga primeiro um ficheiro de sincronização."); return; } if (!await ensureHandlePermission(handle)) return;
    const file = await handle.getFile(); const result = Core.sanitizeState(JSON.parse(await file.text()), { strict: true }); if (result.errors.length) throw new Error(result.errors.join("\n")); if (!confirm(`Carregar o ficheiro sincronizado atualizado em ${new Date(file.lastModified).toLocaleString("pt-PT")}?`)) return; state = result.state; persist({ snapshot: true, sync: false }); showToast("Dados carregados do ficheiro.");
  }
  async function updateSyncStatus() { const node = $("#syncStatus"); if (!node) return; const handle = await getSyncHandle(); node.textContent = handle ? `Ligado a: ${handle.name}${state.settings.sync.lastSyncAt ? ` · último envio ${new Date(state.settings.sync.lastSyncAt).toLocaleString("pt-PT")}` : ""}` : "Nenhum ficheiro ligado."; }

  function setupStaticFields() {
    $("#availabilityFields").innerHTML = DAYS.map((day, index) => `<label>${day}<input id="availability${index}" type="number" min="0" max="16" step="0.5" value="${state.settings.availability[index]}"></label>`).join("");
    $("#onboardingAvailability").innerHTML = DAYS.map((day, index) => `<label>${day}<input id="onboardingAvailability${index}" type="number" min="0" max="16" step="0.5" value="${state.settings.availability[index]}"></label>`).join("");
  }

  function setupEvents() {
    document.addEventListener("click", event => { const close = event.target.closest("[data-close]"); if (close) closeDialog(close.dataset.close); });
    $$(".tab").forEach(button => button.addEventListener("click", () => setTab(button.dataset.tab)));
    el.semesterSelect.addEventListener("change", () => { state.activeSemesterId = el.semesterSelect.value; calendarWeekStart = Core.localDateString(Core.mondayOf(Core.localDateString())); persist({ snapshot: false }); });
    $("#manageSemestersBtn").addEventListener("click", () => openSemesterDialog()); $("#newSemesterBtn").addEventListener("click", () => openSemesterDialog());
    $("#themeBtn").addEventListener("click", () => { const order = ["system", "light", "dark"]; state.settings.theme = order[(order.indexOf(state.settings.theme || "system") + 1) % order.length]; persist({ snapshot: false }); });
    $("#notificationBtn").addEventListener("click", () => openDialog("notificationsDialog")); $("#dataBtn").addEventListener("click", () => openDialog("dataDialog")); $("#settingsBtn").addEventListener("click", openSettings);
    $("#onboardingStartBtn").addEventListener("click", () => { const semester = activeSemester(); $("#onboardingSemesterName").value = semester.name; $("#onboardingStartDate").value = semester.startDate; $("#onboardingEndDate").value = semester.endDate; openDialog("onboardingDialog"); });
    $("#onboardingDemoBtn").addEventListener("click", loadDemo);
    $("#onboardingForm").addEventListener("submit", event => { event.preventDefault(); const semester = activeSemester(); semester.name = $("#onboardingSemesterName").value.trim(); semester.startDate = $("#onboardingStartDate").value; semester.endDate = $("#onboardingEndDate").value; state.settings.availability = DAYS.map((_, index) => Number($(`#onboardingAvailability${index}`).value)); const id = uid("course"); state.courses.push({ id, semesterId: semester.id, name: $("#onboardingCourseName").value.trim(), ects: Number($("#onboardingCourseEcts").value), target: Number($("#onboardingCourseTarget").value), passingGrade: 9.5, difficulty: 3, roundingMode: "none", attendanceRequired: false, attendanceMinimum: 0, attendancePercentage: 100, archived: false, components: [Core.defaultComponent(id)], assessments: [] }); state.settings.onboardingDone = true; closeDialog("onboardingDialog"); persist(); showToast("Semestre configurado."); });

    $("#openCourseBtn").addEventListener("click", () => openCourse()); $("#courseTemplateBtn").addEventListener("click", () => { $("#templateForm").reset(); openDialog("templateDialog"); });
    $("#courseAttendanceRequired").addEventListener("change", toggleAttendanceField);
    $("#courseForm").addEventListener("submit", event => { event.preventDefault(); const editId = $("#courseEditId").value; const data = { name: $("#courseName").value.trim(), ects: Number($("#courseEcts").value), difficulty: Number($("#courseDifficulty").value), target: Number($("#courseTarget").value), passingGrade: Number($("#coursePassingGrade").value), roundingMode: $("#courseRounding").value, attendanceRequired: $("#courseAttendanceRequired").checked, attendancePercentage: Number($("#courseAttendance").value), attendanceMinimum: Number($("#courseAttendanceMinimum").value) };
      if (editId) Object.assign(courseById(editId), data); else { const id = uid("course"); state.courses.push({ id, semesterId: state.activeSemesterId, ...data, archived: false, components: [Core.defaultComponent(id)], assessments: [] }); }
      closeDialog("courseDialog"); persist(); showToast(editId ? "Disciplina atualizada." : "Disciplina adicionada."); });
    $("#templateForm").addEventListener("submit", event => { event.preventDefault(); const id = uid("course"); const type = $("#templateType").value; const name = $("#templateCourseName").value.trim(); let components; let assessments;
      if (type === "tests_project") { components = [{ id: `${id}_tests`, name: "Testes", weight: 60, minimumGrade: 8 }, { id: `${id}_project`, name: "Projeto", weight: 40, minimumGrade: 9.5 }]; assessments = [{ id: uid("assessment"), name: "Teste 1", componentId: components[0].id, weight: 50 }, { id: uid("assessment"), name: "Teste 2", componentId: components[0].id, weight: 50 }, { id: uid("assessment"), name: "Projeto", componentId: components[1].id, weight: 100 }]; }
      else if (type === "two_tests") { components = [{ id: `${id}_global`, name: "Testes", weight: 100, minimumGrade: 0 }]; assessments = [{ id: uid("assessment"), name: "Teste 1", componentId: components[0].id, weight: 50 }, { id: uid("assessment"), name: "Teste 2", componentId: components[0].id, weight: 50 }]; }
      else if (type === "theory_practice") { components = [{ id: `${id}_theory`, name: "Teórica", weight: 50, minimumGrade: 8 }, { id: `${id}_practice`, name: "Prática", weight: 50, minimumGrade: 9.5 }]; assessments = [{ id: uid("assessment"), name: "Teste teórico", componentId: components[0].id, weight: 100 }, { id: uid("assessment"), name: "Projeto prático", componentId: components[1].id, weight: 100 }]; }
      else { components = [{ id: `${id}_global`, name: "Exame", weight: 100, minimumGrade: 0 }]; assessments = [{ id: uid("assessment"), name: "Exame final", componentId: components[0].id, weight: 100 }]; }
      assessments = assessments.map(item => ({ ...item, grade: "", date: "", minimumGrade: 0, mandatory: true, replacementFor: "", replacementMode: "target", replacementPolicy: "best", attemptType: "normal" }));
      state.courses.push({ id, semesterId: state.activeSemesterId, name, ects: 6, target: 12, passingGrade: 9.5, difficulty: 3, roundingMode: "none", attendanceRequired: false, attendanceMinimum: 0, attendancePercentage: 100, archived: false, components, assessments }); closeDialog("templateDialog"); persist(); showToast("Disciplina criada a partir do modelo."); });

    el.coursesList.addEventListener("click", event => { const card = event.target.closest(".course-card"); if (!card) return; const course = courseById(card.dataset.courseId); if (!course) return; const componentNode = event.target.closest(".component"); const assessmentNode = event.target.closest(".assessment-row");
      if (event.target.closest(".add-component")) openComponent(course.id); if (event.target.closest(".add-assessment")) openAssessment(course.id); if (event.target.closest(".edit-course")) openCourse(course); if (event.target.closest(".simulate-course")) { el.simulatorCourseSelect.value = course.id; setTab("simulator"); renderSimulator(); }
      if (event.target.closest(".delete-course") && confirm(`Eliminar ${course.name} e os respetivos dados deste semestre?`)) { state.courses = state.courses.filter(item => item.id !== course.id); state.tasks = state.tasks.filter(item => item.courseId !== course.id); state.sessions = state.sessions.map(item => item.courseId === course.id ? { ...item, courseId: "", taskId: "" } : item); state.commitments = state.commitments.map(item => item.courseId === course.id ? { ...item, courseId: "" } : item); persist(); }
      if (event.target.closest(".edit-component") && componentNode) openComponent(course.id, course.components.find(item => item.id === componentNode.dataset.componentId));
      if (event.target.closest(".delete-component") && componentNode) { const componentId = componentNode.dataset.componentId; if (course.components.length === 1) return alert("A disciplina precisa de pelo menos uma componente."); if (course.assessments.some(item => item.componentId === componentId)) return alert("Move ou elimina primeiro as avaliações desta componente."); if (confirm("Eliminar componente?")) { course.components = course.components.filter(item => item.id !== componentId); persist(); } }
      if (event.target.closest(".edit-assessment") && assessmentNode) openAssessment(course.id, course.assessments.find(item => item.id === assessmentNode.dataset.assessmentId));
      if (event.target.closest(".delete-assessment") && assessmentNode && confirm("Eliminar avaliação?")) { course.assessments = course.assessments.filter(item => item.id !== assessmentNode.dataset.assessmentId).map(item => item.replacementFor === assessmentNode.dataset.assessmentId ? { ...item, replacementFor: "" } : item); persist(); }
    });

    $("#componentForm").addEventListener("submit", event => { event.preventDefault(); const course = courseById($("#componentCourseId").value); if (!course) return; const editId = $("#componentEditId").value; const data = { name: $("#componentName").value.trim(), weight: Number($("#componentWeight").value), minimumGrade: Number($("#componentMinimum").value) }; const totalOther = course.components.filter(item => item.id !== editId).reduce((sum, item) => sum + item.weight, 0); if (totalOther + data.weight > 100.0001) return alert(`A soma das componentes ultrapassaria 100%. Restam ${formatNumber(100 - totalOther, 1)}%.`); if (editId) Object.assign(course.components.find(item => item.id === editId), data); else course.components.push({ id: uid("component"), ...data }); closeDialog("componentDialog"); persist(); });
    $("#assessmentReplacementMode").addEventListener("change", updateReplacementFields);
    $("#assessmentForm").addEventListener("submit", event => { event.preventDefault(); const course = courseById($("#assessmentCourseId").value); if (!course) return; const editId = $("#assessmentEditId").value; const mode = $("#assessmentReplacementMode").value; const componentId = $("#assessmentComponentId").value; const replacementFor = mode === "target" ? $("#assessmentReplacementFor").value : ""; const weight = mode === "none" ? Number($("#assessmentWeight").value) : 0; if (mode === "none") { const used = course.assessments.filter(item => item.id !== editId && !item.replacementFor && item.replacementMode !== "worst_in_component" && item.componentId === componentId).reduce((sum, item) => sum + item.weight, 0); if (used + weight > 100.0001) return alert(`A componente ultrapassaria 100%. Restam ${formatNumber(100 - used, 1)}%.`); }
      const data = { name: $("#assessmentName").value.trim(), componentId, attemptType: $("#assessmentAttemptType").value, replacementMode: mode === "worst_in_component" ? "worst_in_component" : "target", replacementFor, replacementPolicy: $("#assessmentReplacementPolicy").value, weight, grade: $("#assessmentGrade").value === "" ? "" : Number($("#assessmentGrade").value), date: $("#assessmentDate").value, minimumGrade: Number($("#assessmentMinimum").value || 0), mandatory: $("#assessmentMandatory").checked };
      if (editId) Object.assign(course.assessments.find(item => item.id === editId), data); else course.assessments.push({ id: uid("assessment"), ...data }); closeDialog("assessmentDialog"); persist(); showToast(editId ? "Avaliação atualizada." : "Avaliação adicionada."); });

    $("#openTaskBtn").addEventListener("click", () => openTask()); $("#taskForm").addEventListener("submit", event => { event.preventDefault(); const id = $("#taskEditId").value; const data = { semesterId: state.activeSemesterId, title: $("#taskTitle").value.trim(), courseId: $("#taskCourseId").value, dueDate: $("#taskDueDate").value, priority: $("#taskPriority").value, activityType: $("#taskActivityType").value, hours: Number($("#taskHours").value) }; if (id) Object.assign(taskById(id), data); else state.tasks.push({ id: uid("task"), ...data, done: false, createdAt: new Date().toISOString(), completedAt: null }); closeDialog("taskDialog"); persist(); });
    el.tasksList.addEventListener("click", event => { const row = event.target.closest(".task-row"); if (!row) return; const task = taskById(row.dataset.taskId); if (!task) return; if (event.target.closest(".toggle-task")) { task.done = event.target.checked; task.completedAt = task.done ? new Date().toISOString() : null; persist(); } if (event.target.closest(".edit-task")) openTask(task); if (event.target.closest(".delete-task") && confirm("Eliminar esta tarefa?")) { state.tasks = state.tasks.filter(item => item.id !== task.id); state.sessions = state.sessions.map(item => item.taskId === task.id ? { ...item, taskId: "" } : item); state.planOverrides = state.planOverrides.filter(item => item.taskId !== task.id); persist(); } });
    [el.taskStatusFilter, el.taskCourseFilter, el.taskActivityFilter].forEach(select => select.addEventListener("change", renderTasks));

    $("#openCommitmentBtn").addEventListener("click", () => openCommitment()); $("#commitmentForm").addEventListener("submit", event => { event.preventDefault(); const id = $("#commitmentEditId").value; const data = { semesterId: state.activeSemesterId, title: $("#commitmentTitle").value.trim(), date: $("#commitmentDate").value, type: $("#commitmentType").value, startTime: $("#commitmentStart").value, endTime: $("#commitmentEnd").value, courseId: $("#commitmentCourseId").value }; if (Core.minutesBetween(data.startTime, data.endTime) <= 0) return alert("A hora de fim deve ser posterior à hora de início."); if (id) Object.assign(state.commitments.find(item => item.id === id), data); else state.commitments.push({ id: uid("commitment"), ...data }); closeDialog("commitmentDialog"); persist(); });
    el.weeklyCalendar.addEventListener("click", event => { const complete = event.target.closest(".complete-plan"); if (complete) { const task = taskById(complete.dataset.taskId); state.sessions.push({ id: uid("session"), semesterId: state.activeSemesterId, date: complete.dataset.date, durationMinutes: Math.round(Number(complete.dataset.hours) * 60), courseId: complete.dataset.courseId, taskId: complete.dataset.taskId, activityType: task?.activityType || "other", focus: 3, notes: "Sessão concluída a partir do plano.", source: "plan", createdAt: new Date().toISOString() }); if (task && Core.sessionHoursForTask(task.id, state.sessions) >= task.hours - .01) { task.done = true; task.completedAt = new Date().toISOString(); } persist(); showToast("Sessão concluída e registada."); }
      const edit = event.target.closest(".edit-commitment"); if (edit) openCommitment(state.commitments.find(item => item.id === edit.dataset.id)); const del = event.target.closest(".delete-commitment"); if (del && confirm("Eliminar compromisso?")) { state.commitments = state.commitments.filter(item => item.id !== del.dataset.id); persist(); } });
    el.weeklyCalendar.addEventListener("dragstart", event => { const item = event.target.closest(".calendar-event.plan"); if (!item) return; event.dataTransfer.setData("application/json", JSON.stringify({ taskId: item.dataset.taskId, hours: Number(item.dataset.hours), fromDate: item.dataset.date })); event.dataTransfer.effectAllowed = "move"; });
    el.weeklyCalendar.addEventListener("dragover", event => { const day = event.target.closest(".calendar-day"); if (!day) return; event.preventDefault(); day.classList.add("drag-over"); });
    el.weeklyCalendar.addEventListener("dragleave", event => event.target.closest(".calendar-day")?.classList.remove("drag-over"));
    el.weeklyCalendar.addEventListener("drop", event => { const day = event.target.closest(".calendar-day"); if (!day) return; event.preventDefault(); day.classList.remove("drag-over"); try { const data = JSON.parse(event.dataTransfer.getData("application/json")); state.planOverrides = state.planOverrides.filter(item => !(item.taskId === data.taskId && item.date === data.fromDate)); state.planOverrides.push({ id: uid("override"), semesterId: state.activeSemesterId, taskId: data.taskId, courseId: taskById(data.taskId)?.courseId || "", date: day.dataset.date, hours: data.hours }); persist(); showToast("Sessão movida e plano recalculado."); } catch (error) { console.error(error); } });
    $("#prevWeekBtn").addEventListener("click", () => { calendarWeekStart = Core.localDateString(Core.addDays(calendarWeekStart, -7)); renderCalendar(); }); $("#nextWeekBtn").addEventListener("click", () => { calendarWeekStart = Core.localDateString(Core.addDays(calendarWeekStart, 7)); renderCalendar(); }); $("#todayBtn").addEventListener("click", () => { calendarWeekStart = Core.localDateString(Core.mondayOf(Core.localDateString())); renderCalendar(); }); $("#refreshPlanBtn").addEventListener("click", () => { state.planOverrides = state.planOverrides.filter(item => item.semesterId !== state.activeSemesterId); persist(); showToast("Plano reconstruído automaticamente."); });

    $("#openSessionBtn").addEventListener("click", () => openSession()); $("#sessionCourseId").addEventListener("change", () => renderTaskOptions($("#sessionTaskId"), $("#sessionCourseId").value)); $("#timerCourseId").addEventListener("change", () => renderTaskOptions($("#timerTaskId"), $("#timerCourseId").value));
    $("#sessionForm").addEventListener("submit", event => { event.preventDefault(); const id = $("#sessionEditId").value; const data = { semesterId: state.activeSemesterId, date: $("#sessionDate").value, durationMinutes: Number($("#sessionDuration").value), courseId: $("#sessionCourseId").value, taskId: $("#sessionTaskId").value, activityType: $("#sessionActivityType").value, focus: Number($("#sessionFocus").value), notes: $("#sessionNotes").value.trim(), source: id ? state.sessions.find(item => item.id === id)?.source || "manual" : "manual" }; if (id) Object.assign(state.sessions.find(item => item.id === id), data); else state.sessions.push({ id: uid("session"), ...data, createdAt: new Date().toISOString() }); closeDialog("sessionDialog"); persist(); });
    el.sessionsList.addEventListener("click", event => { const row = event.target.closest(".study-row"); if (!row) return; const session = state.sessions.find(item => item.id === row.dataset.sessionId); if (event.target.closest(".edit-session")) openSession(session); if (event.target.closest(".delete-session") && confirm("Eliminar sessão?")) { state.sessions = state.sessions.filter(item => item.id !== session.id); persist(); } }); el.sessionCourseFilter.addEventListener("change", renderStudy);
    el.startTimerBtn.addEventListener("click", () => { state.settings.activeTimer = { startedAt: new Date().toISOString(), courseId: $("#timerCourseId").value, taskId: $("#timerTaskId").value, activityType: $("#timerActivityType").value }; persist({ snapshot: false }); }); el.stopTimerBtn.addEventListener("click", () => { const timer = state.settings.activeTimer; if (!timer) return; const minutes = Math.max(1, Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 60000)); state.sessions.push({ id: uid("session"), semesterId: state.activeSemesterId, date: Core.localDateString(), durationMinutes: minutes, courseId: timer.courseId, taskId: timer.taskId, activityType: timer.activityType || "other", focus: 3, notes: "Sessão registada pelo cronómetro.", source: "timer", createdAt: new Date().toISOString() }); state.settings.activeTimer = null; persist({ snapshot: false }); showToast(`Sessão de ${minutes} minutos guardada.`); });

    el.simulatorCourseSelect.addEventListener("change", renderSimulator); el.simulatorInputs.addEventListener("input", updateSimulation);
    el.riskCards.addEventListener("click", event => { const button = event.target.closest(".open-risk-course"); if (!button) return; setTab("courses"); el.coursesList.querySelector(`[data-course-id="${button.closest(".risk-card").dataset.courseId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#printReportBtn").addEventListener("click", () => window.print()); el.semesterHistory.addEventListener("click", event => { const card = event.target.closest(".semester-card"); if (!card) return; const semester = state.semesters.find(item => item.id === card.dataset.semesterId); if (event.target.closest(".open-semester")) { state.activeSemesterId = semester.id; persist({ snapshot: false }); setTab("dashboard"); } if (event.target.closest(".edit-semester")) openSemesterDialog(semester); });

    $("#semesterForm").addEventListener("submit", event => { event.preventDefault(); const editId = $("#semesterEditId").value; const data = { name: $("#semesterName").value.trim(), startDate: $("#semesterStart").value, endDate: $("#semesterEnd").value, archived: $("#semesterArchived").checked }; if (data.startDate && data.endDate && Core.daysBetween(data.startDate, data.endDate) < 0) return alert("A data final deve ser posterior à inicial."); if (editId) Object.assign(state.semesters.find(item => item.id === editId), data); else { const semester = { id: uid("semester"), ...data }; state.semesters.push(semester); state.activeSemesterId = semester.id; } closeDialog("semesterDialog"); persist(); }); $("#semesterListManager").addEventListener("click", event => { const row = event.target.closest("[data-semester-id]"); if (row && event.target.closest(".manager-edit-semester")) openSemesterDialog(state.semesters.find(item => item.id === row.dataset.semesterId)); });

    $("#settingsForm").addEventListener("submit", async event => { event.preventDefault(); state.settings.availability = DAYS.map((_, index) => Number($(`#availability${index}`).value)); state.settings.maxSessionHours = Number($("#maxSessionHours").value); const wantsNotifications = $("#notificationsEnabled").checked; if (wantsNotifications && !await requestNotifications()) $("#notificationsEnabled").checked = false; state.settings.notifications = { ...state.settings.notifications, enabled: $("#notificationsEnabled").checked, assessmentDays: Number($("#assessmentReminderDays").value), taskDays: Number($("#taskReminderDays").value) }; state.settings.sync.auto = $("#autoSyncEnabled").checked; closeDialog("settingsDialog"); persist(); showDailyNotifications(); });
    $("#connectSyncBtn").addEventListener("click", () => connectSyncFile().catch(error => alert(error.message))); $("#saveSyncBtn").addEventListener("click", () => writeSyncFile().catch(error => alert(error.message))); $("#loadSyncBtn").addEventListener("click", () => loadSyncFile().catch(error => alert(error.message)));

    $("#exportBtn").addEventListener("click", exportState); $("#exportIcsBtn").addEventListener("click", exportIcs); $("#downloadCsvTemplateBtn").addEventListener("click", downloadCsvTemplate);
    $("#importInput").addEventListener("change", async event => { const file = event.target.files[0]; if (!file) return; try { const result = Core.sanitizeState(JSON.parse(await file.text()), { strict: true }); if (result.errors.length) throw new Error(result.errors.join("\n")); if (!confirm(`Importar ${result.state.semesters.length} semestres e ${result.state.courses.length} disciplinas?`)) return; localStorage.setItem(PREVIOUS_KEY, JSON.stringify(state)); state = result.state; persist({ snapshot: false }); closeDialog("dataDialog"); showToast("Backup importado."); } catch (error) { alert(`Importação recusada:\n${error.message}`); } finally { event.target.value = ""; } });
    $("#importIcsInput").addEventListener("change", async event => { const file = event.target.files[0]; if (!file) return; const events = Core.parseICS(await file.text()); if (!events.length) alert("Não foram encontrados eventos válidos."); else { state.commitments.push(...events.map(item => ({ id: uid("commitment"), semesterId: state.activeSemesterId, courseId: "", ...item }))); persist(); showToast(`${events.length} eventos importados.`); } event.target.value = ""; });
    $("#importCsvInput").addEventListener("change", async event => { const file = event.target.files[0]; if (!file) return; importCsvRows(Core.parseCSV(await file.text())); event.target.value = ""; });
    $("#restorePreviousBtn").addEventListener("click", () => { try { const previous = localStorage.getItem(PREVIOUS_KEY); if (!previous) return alert("Não existe cópia anterior."); const result = Core.sanitizeState(JSON.parse(previous), { strict: true }); if (result.errors.length) throw new Error(result.errors.join("\n")); if (confirm("Restaurar a cópia anterior?")) { state = result.state; persist({ snapshot: false }); showToast("Cópia anterior restaurada."); } } catch (error) { alert(`Falha na recuperação: ${error.message}`); } });
    $("#resetBtn").addEventListener("click", () => { if (!confirm("Apagar todos os dados? Será mantida uma cópia local anterior.")) return; try { localStorage.setItem(PREVIOUS_KEY, JSON.stringify(state)); } catch {} state = clone(initialState); persist({ snapshot: false }); closeDialog("dataDialog"); });

    window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; el.installBtn.hidden = false; }); el.installBtn.addEventListener("click", async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; el.installBtn.hidden = true; });
  }

  setupStaticFields(); setupEvents(); renderAll();
  if (["#dashboard","#courses","#tasks","#calendar","#study","#simulator","#history"].includes(location.hash)) setTab(location.hash.slice(1));
  updateSyncStatus(); showDailyNotifications();
  if ("serviceWorker" in navigator && ["http:", "https:"].includes(location.protocol)) navigator.serviceWorker.register("sw.js").catch(console.error);
  window.__UNIPLAN__ = { getState: () => clone(state), Core, renderAll, loadDemo, currentPlan, importCsvRows };
})();
