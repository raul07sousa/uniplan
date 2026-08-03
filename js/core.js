(function (global) {
  "use strict";

  const DAY_MS = 86_400_000;
  const PRIORITY_SCORE = { high: 3, medium: 2, low: 1 };
  const DEFAULT_AVAILABILITY = [2, 2, 2, 2, 2, 4, 3];
  const ACTIVITY_TYPES = ["reading", "exercises", "project", "review", "class", "other"];
  const RISK_LEVELS = [
    { max: 30, key: "low", label: "Baixo" },
    { max: 55, key: "medium", label: "Moderado" },
    { max: 75, key: "high", label: "Alto" },
    { max: 100, key: "critical", label: "Crítico" }
  ];

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function parseNumber(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
  function round(value, decimals = 2) { const f = 10 ** decimals; return Math.round((value + Number.EPSILON) * f) / f; }
  function cleanText(value, maxLength = 120) { return String(value ?? "").trim().slice(0, maxLength); }
  function normalizeGrade(value) {
    if (value === "" || value === null || value === undefined) return "";
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, 0, 20) : "";
  }

  function localDateString(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function parseLocalDate(value) {
    if (value instanceof Date) {
      const d = new Date(value);
      d.setHours(12, 0, 0, 0);
      return d;
    }
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const result = new Date(y, m - 1, d, 12, 0, 0, 0);
    return result.getFullYear() === y && result.getMonth() === m - 1 && result.getDate() === d ? result : null;
  }

  function validDate(value) { return value === "" || Boolean(parseLocalDate(value)); }
  function addDays(value, amount) { const d = parseLocalDate(value) || new Date(); d.setDate(d.getDate() + amount); return d; }
  function daysBetween(fromValue, toValue) {
    const from = parseLocalDate(fromValue); const to = parseLocalDate(toValue);
    if (!from || !to) return 0;
    return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY_MS);
  }
  function mondayIndex(value) { const d = parseLocalDate(value) || new Date(); return (d.getDay() + 6) % 7; }
  function mondayOf(value) { const d = parseLocalDate(value) || parseLocalDate(localDateString()); return addDays(d, -mondayIndex(d)); }
  function minutesBetween(startTime, endTime) {
    if (!/^\d{2}:\d{2}$/.test(startTime || "") || !/^\d{2}:\d{2}$/.test(endTime || "")) return 0;
    const [sh, sm] = startTime.split(":").map(Number); const [eh, em] = endTime.split(":").map(Number);
    return Math.max(0, eh * 60 + em - (sh * 60 + sm));
  }

  function currentAcademicYear(date = new Date()) {
    const d = new Date(date); const year = d.getFullYear(); const start = d.getMonth() >= 7 ? year : year - 1;
    return `${start}/${start + 1}`;
  }

  function defaultSemester(date = new Date()) {
    const d = new Date(date); const year = currentAcademicYear(d); const second = d.getMonth() >= 1 && d.getMonth() <= 7;
    const startYear = Number(year.split("/")[0]);
    return {
      id: "semester_default",
      name: `${second ? "2.º" : "1.º"} semestre ${year}`,
      startDate: second ? `${startYear + 1}-02-01` : `${startYear}-09-01`,
      endDate: second ? `${startYear + 1}-07-31` : `${startYear + 1}-01-31`,
      archived: false
    };
  }

  function defaultComponent(courseId = "") {
    return { id: `component_default_${courseId || "course"}`, name: "Avaliação global", weight: 100, minimumGrade: 0 };
  }

  function applyRounding(value, mode = "none") {
    if (!Number.isFinite(value)) return value;
    if (mode === "nearestInteger") return Math.round(value);
    if (mode === "ceilingInteger") return Math.ceil(value);
    if (mode === "oneDecimal") return round(value, 1);
    return round(value, 2);
  }

  function componentMap(course) {
    const list = Array.isArray(course?.components) && course.components.length ? course.components : [defaultComponent(course?.id)];
    return new Map(list.map(item => [item.id, item]));
  }

  function resolveAssessments(course, options = {}) {
    const assessments = Array.isArray(course?.assessments) ? course.assessments : [];
    const hypothetical = options.hypotheticalGrades && typeof options.hypotheticalGrades === "object" ? options.hypotheticalGrades : {};
    const base = assessments.filter(item => !item.replacementFor && item.replacementMode !== "worst_in_component").map(item => ({
      ...item,
      effectiveGrade: normalizeGrade(Object.prototype.hasOwnProperty.call(hypothetical, item.id) ? hypothetical[item.id] : item.grade),
      originalGrade: normalizeGrade(item.grade),
      replacedBy: ""
    }));
    const replacements = assessments.filter(item => item.replacementFor || item.replacementMode === "worst_in_component");
    for (const replacement of replacements) {
      const replacementGrade = normalizeGrade(Object.prototype.hasOwnProperty.call(hypothetical, replacement.id) ? hypothetical[replacement.id] : replacement.grade);
      if (replacementGrade === "") continue;
      let target = null;
      if (replacement.replacementFor) target = base.find(item => item.id === replacement.replacementFor);
      if (!target && replacement.replacementMode === "worst_in_component") {
        const candidates = base.filter(item => item.componentId === replacement.componentId && item.effectiveGrade !== "");
        target = candidates.sort((a, b) => a.effectiveGrade - b.effectiveGrade)[0] || null;
      }
      if (!target) continue;
      const policy = replacement.replacementPolicy === "always" ? "always" : "best";
      const shouldReplace = policy === "always" || target.effectiveGrade === "" || replacementGrade > target.effectiveGrade;
      if (shouldReplace) {
        target.effectiveGrade = replacementGrade;
        target.replacedBy = replacement.id;
        target.replacementName = replacement.name;
      }
    }
    return { base, replacements, all: assessments };
  }

  function calculateCourseProgress(course, options = {}) {
    const components = Array.isArray(course?.components) && course.components.length ? course.components : [defaultComponent(course?.id)];
    const compMap = new Map(components.map(item => [item.id, item]));
    const fallbackId = components[0].id;
    const { base } = resolveAssessments(course, options);
    const mandatoryPending = base.filter(item => item.mandatory && normalizeGrade(item.effectiveGrade) === "").map(item => item.name);
    const target = clamp(parseNumber(course?.target, 10), 0, 20);
    const passingGrade = clamp(parseNumber(course?.passingGrade, 9.5), 0, 20);
    const componentWeightTotal = components.reduce((sum, item) => sum + clamp(parseNumber(item.weight), 0, 100), 0);
    let knownContribution = 0;
    let configuredOverallWeight = 0;
    let gradedOverallWeight = 0;
    let minimumFailed = false;
    const blockers = [];

    const componentResults = components.map(component => {
      const componentWeight = clamp(parseNumber(component.weight), 0, 100);
      const items = base.filter(item => (compMap.has(item.componentId) ? item.componentId : fallbackId) === component.id);
      let declaredWeight = 0; let gradedWeight = 0; let weightedPoints = 0;
      for (const item of items) {
        const weight = clamp(parseNumber(item.weight), 0, 100);
        declaredWeight += weight;
        configuredOverallWeight += (componentWeight * weight) / 100;
        const grade = normalizeGrade(item.effectiveGrade);
        if (grade === "") continue;
        gradedWeight += weight;
        gradedOverallWeight += (componentWeight * weight) / 100;
        weightedPoints += grade * weight;
        knownContribution += grade * componentWeight * weight / 10_000;
        const min = clamp(parseNumber(item.minimumGrade, 0), 0, 20);
        if (min > 0 && grade < min) {
          minimumFailed = true;
          blockers.push(`${item.name}: ${round(grade, 1)} abaixo do mínimo ${round(min, 1)}`);
        }
      }
      const currentAverage = gradedWeight ? weightedPoints / gradedWeight : 0;
      const finalAverage = declaredWeight >= 99.999 && gradedWeight >= 99.999 ? weightedPoints / 100 : null;
      const componentMinimum = clamp(parseNumber(component.minimumGrade, 0), 0, 20);
      if (finalAverage !== null && componentMinimum > 0 && finalAverage < componentMinimum) {
        minimumFailed = true;
        blockers.push(`${component.name}: ${round(finalAverage, 1)} abaixo do mínimo ${round(componentMinimum, 1)}`);
      }
      return {
        id: component.id,
        name: component.name,
        weight: round(componentWeight, 1),
        minimumGrade: componentMinimum,
        declaredWeight: round(declaredWeight, 1),
        gradedWeight: round(gradedWeight, 1),
        currentAverage: round(currentAverage, 2),
        finalAverage: finalAverage === null ? null : round(finalAverage, 2),
        overweight: declaredWeight > 100.0001,
        items
      };
    });

    if (course?.attendanceRequired) {
      const attendance = clamp(parseNumber(course.attendancePercentage, 0), 0, 100);
      const minimum = clamp(parseNumber(course.attendanceMinimum, 0), 0, 100);
      if (attendance < minimum) {
        minimumFailed = true;
        blockers.push(`Assiduidade: ${round(attendance, 1)}% abaixo do mínimo ${round(minimum, 1)}%`);
      }
    }

    const remainingOverallWeight = Math.max(0, 100 - gradedOverallWeight);
    const requiredAverage = remainingOverallWeight > 0 ? ((target - knownContribution) * 100) / remainingOverallWeight : (knownContribution >= target ? 0 : Infinity);
    const bestPossible = knownContribution + remainingOverallWeight * 20 / 100;
    const complete = gradedOverallWeight >= 99.999 && configuredOverallWeight >= 99.999 && componentWeightTotal >= 99.999 && mandatoryPending.length === 0;
    const rawFinalGrade = complete ? knownContribution : null;
    const finalGrade = rawFinalGrade === null ? null : applyRounding(rawFinalGrade, course?.roundingMode || "none");
    const overweight = componentWeightTotal > 100.0001 || componentResults.some(item => item.overweight);
    const underconfigured = componentWeightTotal < 99.999 || configuredOverallWeight < 99.999;
    const passed = complete && !minimumFailed && finalGrade >= passingGrade;

    return {
      target, passingGrade,
      componentWeightTotal: round(componentWeightTotal, 1),
      configuredOverallWeight: round(configuredOverallWeight, 1),
      gradedOverallWeight: round(gradedOverallWeight, 1),
      remainingOverallWeight: round(remainingOverallWeight, 1),
      knownContribution: round(knownContribution, 2),
      currentFinalEquivalent: round(knownContribution, 2),
      requiredAverage: Number.isFinite(requiredAverage) ? round(requiredAverage, 2) : requiredAverage,
      bestPossible: round(bestPossible, 2),
      minimumFailed, blockers, mandatoryPending,
      overweight, underconfigured, complete, passed,
      rawFinalGrade: rawFinalGrade === null ? null : round(rawFinalGrade, 2),
      finalGrade,
      componentResults
    };
  }

  function simulateCourse(course, hypotheticalGrades = {}) {
    const result = calculateCourseProgress(course, { hypotheticalGrades });
    const delta = result.finalGrade === null ? null : round(result.finalGrade - parseNumber(calculateCourseProgress(course).finalGrade, result.finalGrade), 2);
    return { ...result, hypotheticalGrades: { ...hypotheticalGrades }, delta };
  }

  function getSemesterProgress(courses) {
    if (!Array.isArray(courses) || !courses.length) return 0;
    const totalEcts = courses.reduce((sum, course) => sum + Math.max(0, parseNumber(course.ects, 0)), 0);
    const weighted = courses.reduce((sum, course) => {
      const weight = totalEcts > 0 ? Math.max(0, parseNumber(course.ects, 0)) : 1;
      return sum + calculateCourseProgress(course).gradedOverallWeight * weight;
    }, 0);
    return round(weighted / (totalEcts > 0 ? totalEcts : courses.length), 1);
  }

  function academicSummary(courses) {
    const list = Array.isArray(courses) ? courses : [];
    let totalEcts = 0; let passedEcts = 0; let completedEcts = 0; let weighted = 0; let forecastWeighted = 0;
    for (const course of list) {
      const ects = Math.max(0, parseNumber(course.ects, 0)); const progress = calculateCourseProgress(course);
      totalEcts += ects;
      if (progress.complete) { completedEcts += ects; weighted += progress.finalGrade * ects; }
      if (progress.passed) passedEcts += ects;
      const forecast = progress.complete ? progress.finalGrade : clamp(Math.max(progress.knownContribution, Math.min(course.target || 10, progress.bestPossible)), 0, 20);
      forecastWeighted += forecast * ects;
    }
    return {
      totalEcts: round(totalEcts, 1), passedEcts: round(passedEcts, 1), completedEcts: round(completedEcts, 1),
      average: completedEcts ? round(weighted / completedEcts, 2) : 0,
      forecastAverage: totalEcts ? round(forecastWeighted / totalEcts, 2) : 0,
      completionRate: totalEcts ? round(passedEcts / totalEcts * 100, 1) : 0,
      completedCourses: list.filter(course => calculateCourseProgress(course).complete).length,
      passedCourses: list.filter(course => calculateCourseProgress(course).passed).length
    };
  }

  function sessionHoursForTask(taskId, sessions) {
    return round((Array.isArray(sessions) ? sessions : []).filter(item => item.taskId === taskId).reduce((sum, item) => sum + parseNumber(item.durationMinutes, 0) / 60, 0), 2);
  }

  function taskUrgency(task, startDate, riskScore = 0) {
    const dueIn = task?.dueDate ? daysBetween(startDate, task.dueDate) : 365;
    return (dueIn < 0 ? 150 : Math.max(0, 50 - dueIn * 4)) + (PRIORITY_SCORE[task?.priority] || 2) * 14 + riskScore * 0.55;
  }

  function commitmentHoursForDate(commitments, date) {
    return round((commitments || []).filter(item => item.date === date).reduce((sum, item) => sum + minutesBetween(item.startTime, item.endTime) / 60, 0), 2);
  }

  function generateStudyPlan(tasks, options = {}) {
    const startDate = parseLocalDate(options.startDate) || parseLocalDate(localDateString());
    const daysCount = clamp(Math.round(parseNumber(options.days, 7)), 1, 31);
    const availability = Array.isArray(options.availability) && options.availability.length === 7 ? options.availability.map(v => clamp(parseNumber(v, 0), 0, 16)) : [...DEFAULT_AVAILABILITY];
    const maxSessionHours = clamp(parseNumber(options.maxSessionHours, 1.5), 0.25, 4);
    const sessions = Array.isArray(options.sessions) ? options.sessions : [];
    const commitments = Array.isArray(options.commitments) ? options.commitments : [];
    const courses = Array.isArray(options.courses) ? options.courses : [];
    const riskByCourse = new Map(courses.map(course => [course.id, calculateCourseRisk(course, { tasks, sessions, today: localDateString(startDate) }).score]));
    const days = Array.from({ length: daysCount }, (_, index) => {
      const date = localDateString(addDays(startDate, index));
      const rawCapacity = availability[mondayIndex(date)] ?? 0;
      const occupied = commitmentHoursForDate(commitments, date);
      return { date, rawCapacity: round(rawCapacity, 1), occupied, capacity: round(Math.max(0, rawCapacity - occupied), 1), used: 0, items: [] };
    });
    const pending = (Array.isArray(tasks) ? tasks : []).filter(task => task && !task.done).map(task => {
      const doneHours = sessionHoursForTask(task.id, sessions);
      const riskScore = riskByCourse.get(task.courseId) || 0;
      return { ...task, remaining: Math.max(0, parseNumber(task.hours, 1) - doneHours), doneHours, score: taskUrgency(task, localDateString(startDate), riskScore), riskScore };
    }).filter(task => task.remaining > 0.05).sort((a, b) => b.score - a.score || String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31")));

    const overrides = Array.isArray(options.overrides) ? options.overrides : [];
    for (const override of overrides) {
      const task = pending.find(item => item.id === override.taskId); const day = days.find(item => item.date === override.date);
      if (!task || !day || task.remaining <= 0) continue;
      const hours = Math.min(task.remaining, parseNumber(override.hours, maxSessionHours), Math.max(0, day.capacity - day.used));
      if (hours < 0.25) continue;
      day.items.push({ id: override.id || "", taskId: task.id, title: task.title, courseId: task.courseId || "", priority: task.priority, activityType: ACTIVITY_TYPES.includes(task.activityType) ? task.activityType : "other", hours: round(hours, 2), dueDate: task.dueDate || "", overdue: task.dueDate ? daysBetween(localDateString(startDate), task.dueDate) < 0 : false, manual: true });
      day.used = round(day.used + hours, 2); task.remaining = round(task.remaining - hours, 2);
    }

    const unscheduled = [];
    for (const task of pending) {
      const rawDueIndex = task.dueDate ? daysBetween(localDateString(startDate), task.dueDate) : daysCount - 1;
      const lastAllowedIndex = clamp(rawDueIndex, 0, daysCount - 1);
      while (task.remaining > 0.01) {
        const candidates = days.map((day, index) => ({ day, index })).filter(({ day, index }) => index <= lastAllowedIndex && day.capacity - day.used >= 0.25).sort((a, b) => (a.day.used / Math.max(a.day.capacity, .1)) - (b.day.used / Math.max(b.day.capacity, .1)) || a.index - b.index);
        if (!candidates.length) break;
        const day = candidates[0].day;
        const hours = Math.min(task.remaining, day.capacity - day.used, maxSessionHours);
        day.items.push({ id: "", taskId: String(task.id || ""), title: cleanText(task.title, 120) || "Tarefa", courseId: String(task.courseId || ""), priority: PRIORITY_SCORE[task.priority] ? task.priority : "medium", activityType: ACTIVITY_TYPES.includes(task.activityType) ? task.activityType : "other", hours: round(hours, 2), dueDate: String(task.dueDate || ""), overdue: rawDueIndex < 0, manual: false });
        day.used = round(day.used + hours, 2); task.remaining = round(task.remaining - hours, 2);
      }
      if (task.remaining > 0.05) unscheduled.push({ taskId: task.id, title: task.title, hours: round(task.remaining, 1), dueDate: task.dueDate || "", riskScore: task.riskScore });
    }
    return { days, unscheduled, totalCapacity: round(days.reduce((sum, day) => sum + day.capacity, 0), 1), totalOccupied: round(days.reduce((sum, day) => sum + day.occupied, 0), 1), totalPlanned: round(days.reduce((sum, day) => sum + day.used, 0), 1) };
  }

  function calculateCourseRisk(course, context = {}) {
    const today = context.today || localDateString();
    const progress = calculateCourseProgress(course);
    const tasks = (context.tasks || []).filter(task => task.courseId === course.id && !task.done);
    const sessions = (context.sessions || []).filter(item => item.courseId === course.id);
    const recentMinutes = sessions.filter(item => daysBetween(item.date, today) >= 0 && daysBetween(item.date, today) <= 13).reduce((sum, item) => sum + parseNumber(item.durationMinutes, 0), 0);
    const overdue = tasks.filter(task => task.dueDate && daysBetween(today, task.dueDate) < 0).length;
    const upcomingDates = (course.assessments || []).filter(item => !item.replacementFor && normalizeGrade(item.grade) === "" && item.date && daysBetween(today, item.date) >= 0).map(item => daysBetween(today, item.date));
    const nextAssessmentDays = upcomingDates.length ? Math.min(...upcomingDates) : null;
    let score = clamp(parseNumber(course.difficulty, 3), 1, 5) * 4;
    const reasons = [];
    if (progress.overweight) { score += 35; reasons.push("Estrutura de pesos inválida"); }
    if (progress.minimumFailed) { score += 45; reasons.push("Existe uma condição mínima falhada"); }
    if (progress.mandatoryPending.length) { score += 12; reasons.push(`${progress.mandatoryPending.length} avaliação obrigatória pendente`); }
    if (progress.requiredAverage > 20 || progress.bestPossible < progress.target) { score += 45; reasons.push("Objetivo atual matematicamente impossível"); }
    else if (progress.requiredAverage > 16) { score += 30; reasons.push(`Precisas de média ${round(progress.requiredAverage, 1)}`); }
    else if (progress.requiredAverage > 14) { score += 20; reasons.push(`Precisas de média ${round(progress.requiredAverage, 1)}`); }
    else if (progress.requiredAverage > 12) { score += 10; reasons.push(`Precisas de média ${round(progress.requiredAverage, 1)}`); }
    if (overdue) { score += Math.min(24, overdue * 8); reasons.push(`${overdue} tarefa${overdue === 1 ? "" : "s"} atrasada${overdue === 1 ? "" : "s"}`); }
    if (nextAssessmentDays !== null && nextAssessmentDays <= 7 && recentMinutes < 120) { score += 18; reasons.push(`Avaliação em ${nextAssessmentDays} dia${nextAssessmentDays === 1 ? "" : "s"} com pouco estudo recente`); }
    else if (nextAssessmentDays !== null && nextAssessmentDays <= 14 && recentMinutes < 60) { score += 10; reasons.push("Avaliação próxima sem estudo registado suficiente"); }
    if (tasks.reduce((sum, task) => sum + Math.max(0, parseNumber(task.hours, 0) - sessionHoursForTask(task.id, sessions)), 0) > 12) { score += 10; reasons.push("Carga pendente superior a 12 horas"); }
    score = clamp(Math.round(score), 0, 100);
    const level = RISK_LEVELS.find(item => score <= item.max) || RISK_LEVELS.at(-1);
    const recommendation = reasons.length ? (overdue ? "Resolve primeiro as tarefas atrasadas e recalcula o plano." : nextAssessmentDays !== null && nextAssessmentDays <= 7 ? "Reserva sessões antes da próxima avaliação." : "Revê a meta e distribui o esforço pelas componentes em falta.") : "Mantém o ritmo e regista as sessões concluídas.";
    return { score, level: level.key, label: level.label, reasons, recommendation, recentMinutes, overdue, nextAssessmentDays, progress };
  }

  function studyStats(sessions, options = {}) {
    const today = options.today || localDateString();
    const days = clamp(parseNumber(options.days, 7), 1, 365);
    const filtered = (sessions || []).filter(item => { const diff = daysBetween(item.date, today); return diff >= 0 && diff < days; });
    const minutes = filtered.reduce((sum, item) => sum + parseNumber(item.durationMinutes, 0), 0);
    const focused = filtered.filter(item => parseNumber(item.focus, 0) > 0);
    const byActivity = {};
    for (const item of filtered) byActivity[item.activityType || "other"] = (byActivity[item.activityType || "other"] || 0) + parseNumber(item.durationMinutes, 0);
    return { sessions: filtered.length, minutes: round(minutes), hours: round(minutes / 60, 1), averageFocus: focused.length ? round(focused.reduce((sum, item) => sum + parseNumber(item.focus, 0), 0) / focused.length, 1) : 0, byActivity };
  }

  function plannedVsActual(plan, sessions) {
    const planned = round((plan?.days || []).reduce((sum, day) => sum + parseNumber(day.used, 0), 0), 2);
    const dates = new Set((plan?.days || []).map(day => day.date));
    const actual = round((sessions || []).filter(item => dates.has(item.date)).reduce((sum, item) => sum + parseNumber(item.durationMinutes, 0) / 60, 0), 2);
    return { planned, actual, adherence: planned ? round(actual / planned * 100, 1) : 0, difference: round(actual - planned, 2) };
  }

  function generateReminders(state, options = {}) {
    const today = options.today || localDateString();
    const assessmentDays = clamp(parseNumber(options.assessmentDays, 7), 0, 30);
    const taskDays = clamp(parseNumber(options.taskDays, 3), 0, 30);
    const semesterId = options.semesterId || state.activeSemesterId;
    const reminders = [];
    for (const course of state.courses || []) {
      if (semesterId && course.semesterId !== semesterId) continue;
      for (const assessment of course.assessments || []) {
        if (!assessment.date || normalizeGrade(assessment.grade) !== "") continue;
        const days = daysBetween(today, assessment.date);
        if (days >= 0 && days <= assessmentDays) reminders.push({ id: `assessment:${assessment.id}:${assessment.date}`, type: "assessment", severity: days <= 1 ? "urgent" : "normal", title: assessment.name, detail: `${course.name} · ${days === 0 ? "hoje" : `em ${days} dia${days === 1 ? "" : "s"}`}`, date: assessment.date });
      }
    }
    for (const task of state.tasks || []) {
      if (semesterId && task.semesterId !== semesterId) continue;
      if (task.done || !task.dueDate) continue;
      const days = daysBetween(today, task.dueDate);
      if (days < 0) reminders.push({ id: `task:${task.id}:overdue`, type: "task", severity: "urgent", title: task.title, detail: `Atrasada há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`, date: task.dueDate });
      else if (days <= taskDays) reminders.push({ id: `task:${task.id}:${task.dueDate}`, type: "task", severity: days <= 1 ? "urgent" : "normal", title: task.title, detail: days === 0 ? "Termina hoje" : `Prazo em ${days} dia${days === 1 ? "" : "s"}`, date: task.dueDate });
    }
    return reminders.sort((a, b) => (a.severity === "urgent" ? -1 : 1) - (b.severity === "urgent" ? -1 : 1) || a.date.localeCompare(b.date));
  }

  function parseCSV(text) {
    const rows = []; let row = []; let field = ""; let quoted = false;
    const input = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (quoted) {
        if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === "," || c === ";") { row.push(field.trim()); field = ""; }
      else if (c === "\n") { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
    if (!rows.length) return [];
    const headers = rows.shift().map(value => value.toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  }

  function parseICS(text) {
    const unfolded = String(text || "").replace(/\r?\n[ \t]/g, "");
    const events = [];
    for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
      const body = block.split("END:VEVENT")[0]; const data = {};
      for (const line of body.split(/\r?\n/)) {
        const index = line.indexOf(":"); if (index < 0) continue;
        const key = line.slice(0, index).split(";")[0]; data[key] = line.slice(index + 1).replace(/\\n/g, "\n").replace(/\\,/g, ",");
      }
      const dateRaw = data.DTSTART || ""; const endRaw = data.DTEND || "";
      const date = /^\d{8}/.test(dateRaw) ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}` : "";
      const startTime = /T\d{4}/.test(dateRaw) ? `${dateRaw.slice(9, 11)}:${dateRaw.slice(11, 13)}` : "09:00";
      const endTime = /T\d{4}/.test(endRaw) ? `${endRaw.slice(9, 11)}:${endRaw.slice(11, 13)}` : "10:00";
      if (data.SUMMARY && date) events.push({ title: data.SUMMARY, date, startTime, endTime, type: "other" });
    }
    return events;
  }

  function sanitizeState(input, options = {}) {
    const strict = Boolean(options.strict); const errors = []; const warnings = [];
    const source = input && typeof input === "object" ? input : {};
    if (!input || typeof input !== "object") errors.push("O backup não contém um objeto válido.");
    if (strict && !Array.isArray(source.courses)) errors.push("O backup não contém disciplinas.");
    if (strict && !Array.isArray(source.tasks)) errors.push("O backup não contém tarefas.");

    const semesterIds = new Set(); const semesters = [];
    const rawSemesters = Array.isArray(source.semesters) && source.semesters.length ? source.semesters : [defaultSemester()];
    for (const [index, raw] of rawSemesters.entries()) {
      let id = cleanText(raw?.id, 80) || `semester_${index}`; if (semesterIds.has(id)) id += `_${index}`; semesterIds.add(id);
      const startDate = validDate(raw?.startDate || "") ? cleanText(raw?.startDate, 10) : "";
      const endDate = validDate(raw?.endDate || "") ? cleanText(raw?.endDate, 10) : "";
      semesters.push({ id, name: cleanText(raw?.name, 100) || `Semestre ${index + 1}`, startDate, endDate, archived: Boolean(raw?.archived) });
    }
    const fallbackSemesterId = semesters[0].id;
    const activeSemesterId = semesterIds.has(source.activeSemesterId) ? source.activeSemesterId : semesters.find(item => !item.archived)?.id || fallbackSemesterId;

    const courseIds = new Set(); const courses = [];
    for (const [index, raw] of (Array.isArray(source.courses) ? source.courses : []).entries()) {
      const name = cleanText(raw?.name, 80); if (!name) { (strict ? errors : warnings).push(`Disciplina ${index + 1}: nome inválido.`); continue; }
      let id = cleanText(raw?.id, 80) || `course_import_${index}`; if (courseIds.has(id)) id += `_${index}`; courseIds.add(id);
      const rawComponents = Array.isArray(raw?.components) && raw.components.length ? raw.components : [defaultComponent(id)];
      const componentIds = new Set(); const components = [];
      for (const [ci, item] of rawComponents.entries()) {
        const componentName = cleanText(item?.name, 80) || `Componente ${ci + 1}`;
        let componentId = cleanText(item?.id, 80) || `component_${index}_${ci}`; if (componentIds.has(componentId)) componentId += `_${ci}`; componentIds.add(componentId);
        components.push({ id: componentId, name: componentName, weight: round(clamp(parseNumber(item?.weight, rawComponents.length === 1 ? 100 : 0), 0, 100), 1), minimumGrade: round(clamp(parseNumber(item?.minimumGrade, 0), 0, 20), 1) });
      }
      const firstComponentId = components[0].id;
      const assessmentIds = new Set(); const assessments = [];
      for (const [ai, item] of (Array.isArray(raw?.assessments) ? raw.assessments : []).entries()) {
        const assessmentName = cleanText(item?.name, 80); const weight = parseNumber(item?.weight, NaN); const date = cleanText(item?.date, 10);
        if (!assessmentName || !Number.isFinite(weight) || weight < 0 || weight > 100 || !validDate(date)) { (strict ? errors : warnings).push(`${name}, avaliação ${ai + 1}: dados inválidos.`); continue; }
        let assessmentId = cleanText(item?.id, 80) || `assessment_${index}_${ai}`; if (assessmentIds.has(assessmentId)) assessmentId += `_${ai}`; assessmentIds.add(assessmentId);
        assessments.push({ id: assessmentId, name: assessmentName, componentId: componentIds.has(item?.componentId) ? item.componentId : firstComponentId, weight: round(weight, 1), grade: normalizeGrade(item?.grade), date, minimumGrade: round(clamp(parseNumber(item?.minimumGrade, 0), 0, 20), 1), mandatory: Boolean(item?.mandatory), replacementFor: cleanText(item?.replacementFor, 80), replacementMode: item?.replacementMode === "worst_in_component" ? "worst_in_component" : "target", replacementPolicy: item?.replacementPolicy === "always" ? "always" : "best", attemptType: ["normal", "exam", "resit", "improvement"].includes(item?.attemptType) ? item.attemptType : "normal" });
      }
      const validAssessmentIds = new Set(assessments.map(item => item.id));
      assessments.forEach(item => { if (!validAssessmentIds.has(item.replacementFor) || item.replacementFor === item.id) item.replacementFor = ""; });
      courses.push({
        id, semesterId: semesterIds.has(raw?.semesterId) ? raw.semesterId : fallbackSemesterId, name,
        ects: round(clamp(parseNumber(raw?.ects, 6), 0, 30), 1), target: round(clamp(parseNumber(raw?.target, 10), 0, 20), 1), passingGrade: round(clamp(parseNumber(raw?.passingGrade ?? raw?.minimumGrade, 9.5), 0, 20), 1), difficulty: Math.round(clamp(parseNumber(raw?.difficulty, 3), 1, 5)),
        roundingMode: ["none", "oneDecimal", "nearestInteger", "ceilingInteger"].includes(raw?.roundingMode) ? raw.roundingMode : "none",
        attendanceRequired: Boolean(raw?.attendanceRequired), attendanceMinimum: round(clamp(parseNumber(raw?.attendanceMinimum, 0), 0, 100), 1), attendancePercentage: round(clamp(parseNumber(raw?.attendancePercentage, 100), 0, 100), 1),
        archived: Boolean(raw?.archived), components, assessments
      });
    }

    const tasks = []; const taskIds = new Set();
    for (const [index, raw] of (Array.isArray(source.tasks) ? source.tasks : []).entries()) {
      const title = cleanText(raw?.title, 120); const dueDate = cleanText(raw?.dueDate, 10); const hours = parseNumber(raw?.hours, NaN);
      if (!title || !validDate(dueDate) || !Number.isFinite(hours) || hours < .25 || hours > 500) { (strict ? errors : warnings).push(`Tarefa ${index + 1}: dados inválidos.`); continue; }
      let id = cleanText(raw?.id, 80) || `task_${index}`; if (taskIds.has(id)) id += `_${index}`; taskIds.add(id);
      const courseId = courseIds.has(raw?.courseId) ? raw.courseId : ""; const course = courses.find(item => item.id === courseId);
      tasks.push({ id, semesterId: semesterIds.has(raw?.semesterId) ? raw.semesterId : course?.semesterId || fallbackSemesterId, title, courseId, dueDate, priority: PRIORITY_SCORE[raw?.priority] ? raw.priority : "medium", activityType: ACTIVITY_TYPES.includes(raw?.activityType) ? raw.activityType : "other", hours: round(hours, 1), done: Boolean(raw?.done), createdAt: cleanText(raw?.createdAt, 35) || new Date().toISOString(), completedAt: raw?.done ? cleanText(raw?.completedAt, 35) || new Date().toISOString() : null });
    }

    const sessions = [];
    for (const [index, raw] of (Array.isArray(source.sessions) ? source.sessions : []).entries()) {
      const date = cleanText(raw?.date, 10); const durationMinutes = parseNumber(raw?.durationMinutes, NaN);
      if (!validDate(date) || !date || !Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) { if (strict) errors.push(`Sessão ${index + 1}: dados inválidos.`); continue; }
      const courseId = courseIds.has(raw?.courseId) ? raw.courseId : ""; const taskId = taskIds.has(raw?.taskId) ? raw.taskId : ""; const course = courses.find(item => item.id === courseId); const task = tasks.find(item => item.id === taskId);
      sessions.push({ id: cleanText(raw?.id, 80) || `session_${index}`, semesterId: semesterIds.has(raw?.semesterId) ? raw.semesterId : course?.semesterId || task?.semesterId || fallbackSemesterId, date, durationMinutes: Math.round(durationMinutes), courseId, taskId, activityType: ACTIVITY_TYPES.includes(raw?.activityType) ? raw.activityType : task?.activityType || "other", focus: Math.round(clamp(parseNumber(raw?.focus, 3), 1, 5)), notes: cleanText(raw?.notes, 300), source: ["manual", "timer", "plan"].includes(raw?.source) ? raw.source : "manual", createdAt: cleanText(raw?.createdAt, 35) || new Date().toISOString() });
    }

    const commitments = [];
    for (const [index, raw] of (Array.isArray(source.commitments) ? source.commitments : []).entries()) {
      const title = cleanText(raw?.title, 100); const date = cleanText(raw?.date, 10); const startTime = cleanText(raw?.startTime, 5); const endTime = cleanText(raw?.endTime, 5);
      if (!title || !validDate(date) || !date || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || minutesBetween(startTime, endTime) <= 0) { if (strict) errors.push(`Compromisso ${index + 1}: dados inválidos.`); continue; }
      const courseId = courseIds.has(raw?.courseId) ? raw.courseId : ""; const course = courses.find(item => item.id === courseId);
      commitments.push({ id: cleanText(raw?.id, 80) || `commitment_${index}`, semesterId: semesterIds.has(raw?.semesterId) ? raw.semesterId : course?.semesterId || fallbackSemesterId, title, date, startTime, endTime, courseId, type: ["class", "personal", "work", "other"].includes(raw?.type) ? raw.type : "other" });
    }

    const planOverrides = [];
    for (const [index, raw] of (Array.isArray(source.planOverrides) ? source.planOverrides : []).entries()) {
      const taskId = taskIds.has(raw?.taskId) ? raw.taskId : ""; const date = cleanText(raw?.date, 10); const hours = parseNumber(raw?.hours, NaN);
      if (!taskId || !validDate(date) || !date || !Number.isFinite(hours) || hours < .25 || hours > 16) continue;
      const task = tasks.find(item => item.id === taskId);
      planOverrides.push({ id: cleanText(raw?.id, 80) || `override_${index}`, semesterId: task?.semesterId || fallbackSemesterId, taskId, courseId: task?.courseId || "", date, hours: round(hours, 2) });
    }

    const settingsSource = source.settings && typeof source.settings === "object" ? source.settings : {};
    const availability = Array.isArray(settingsSource.availability) && settingsSource.availability.length === 7 ? settingsSource.availability.map(v => round(clamp(parseNumber(v, 0), 0, 16), 1)) : [...DEFAULT_AVAILABILITY];
    const timer = settingsSource.activeTimer && typeof settingsSource.activeTimer === "object" && settingsSource.activeTimer.startedAt ? { startedAt: cleanText(settingsSource.activeTimer.startedAt, 35), courseId: courseIds.has(settingsSource.activeTimer.courseId) ? settingsSource.activeTimer.courseId : "", taskId: taskIds.has(settingsSource.activeTimer.taskId) ? settingsSource.activeTimer.taskId : "", activityType: ACTIVITY_TYPES.includes(settingsSource.activeTimer.activityType) ? settingsSource.activeTimer.activityType : "other" } : null;
    const notificationsSource = settingsSource.notifications && typeof settingsSource.notifications === "object" ? settingsSource.notifications : {};
    return {
      state: {
        version: 4, semesters, activeSemesterId, courses, tasks, sessions, commitments, planOverrides,
        settings: {
          availability, maxSessionHours: round(clamp(parseNumber(settingsSource.maxSessionHours, 1.5), .25, 4), 2), theme: ["light", "dark", "system"].includes(settingsSource.theme) ? settingsSource.theme : "system", onboardingDone: Boolean(settingsSource.onboardingDone), activeTimer: timer,
          notifications: { enabled: Boolean(notificationsSource.enabled), assessmentDays: Math.round(clamp(parseNumber(notificationsSource.assessmentDays, 7), 0, 30)), taskDays: Math.round(clamp(parseNumber(notificationsSource.taskDays, 3), 0, 30)), lastShownDate: cleanText(notificationsSource.lastShownDate, 10) },
          sync: { auto: Boolean(settingsSource.sync?.auto), lastSyncAt: cleanText(settingsSource.sync?.lastSyncAt, 35) }
        },
        updatedAt: cleanText(source.updatedAt, 35) || new Date().toISOString()
      }, errors, warnings
    };
  }

  const api = {
    DAY_MS, DEFAULT_AVAILABILITY, ACTIVITY_TYPES, clamp, parseNumber, round, cleanText, normalizeGrade,
    localDateString, parseLocalDate, validDate, addDays, daysBetween, mondayIndex, mondayOf, minutesBetween,
    currentAcademicYear, defaultSemester, defaultComponent, applyRounding, componentMap, resolveAssessments,
    calculateCourseProgress, simulateCourse, getSemesterProgress, academicSummary, sessionHoursForTask,
    generateStudyPlan, calculateCourseRisk, studyStats, plannedVsActual, generateReminders, parseCSV, parseICS, sanitizeState
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.UniPlanCore = api;
})(typeof window !== "undefined" ? window : globalThis);
