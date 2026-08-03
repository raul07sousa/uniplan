const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

function courseFixture() {
  return {
    id:'c1', semesterId:'s1', name:'Programação', ects:6, target:14, passingGrade:9.5, difficulty:4,
    roundingMode:'none', attendanceRequired:false, attendanceMinimum:0, attendancePercentage:100,
    components:[
      {id:'theory',name:'Teórica',weight:60,minimumGrade:8},
      {id:'project',name:'Projeto',weight:40,minimumGrade:9.5}
    ],
    assessments:[
      {id:'t1',name:'Teste 1',componentId:'theory',weight:50,grade:12,date:'2026-06-01',minimumGrade:7.5,mandatory:true,replacementFor:'',replacementMode:'target',replacementPolicy:'best',attemptType:'normal'},
      {id:'t2',name:'Teste 2',componentId:'theory',weight:50,grade:'',date:'2026-07-01',minimumGrade:7.5,mandatory:true,replacementFor:'',replacementMode:'target',replacementPolicy:'best',attemptType:'normal'},
      {id:'p1',name:'Projeto',componentId:'project',weight:100,grade:15,date:'2026-06-15',minimumGrade:9.5,mandatory:true,replacementFor:'',replacementMode:'target',replacementPolicy:'best',attemptType:'normal'}
    ]
  };
}

test('datas locais não recuam no horário de verão', () => {
  assert.equal(Core.localDateString(Core.parseLocalDate('2026-07-29')), '2026-07-29');
  assert.equal(Core.localDateString(Core.addDays('2026-07-29', 1)), '2026-07-30');
});

test('segunda-feira é calculada corretamente', () => {
  assert.equal(Core.localDateString(Core.mondayOf('2026-07-29')), '2026-07-27');
});

test('calcula duração de compromissos', () => {
  assert.equal(Core.minutesBetween('09:15','11:00'),105);
  assert.equal(Core.minutesBetween('11:00','09:00'),0);
});

test('calcula contribuição conhecida com componentes', () => {
  const result = Core.calculateCourseProgress(courseFixture());
  assert.equal(result.knownContribution, 9.6);
  assert.equal(result.gradedOverallWeight, 70);
  assert.equal(result.requiredAverage, 14.67);
});

test('recurso específico substitui nota sem duplicar peso', () => {
  const course = courseFixture();
  course.assessments.push({id:'r1',name:'Recurso',componentId:'theory',weight:0,grade:17,date:'2026-07-20',minimumGrade:0,mandatory:false,replacementFor:'t1',replacementMode:'target',replacementPolicy:'best',attemptType:'resit'});
  const result = Core.calculateCourseProgress(course);
  assert.equal(result.knownContribution, 11.1);
  assert.equal(result.gradedOverallWeight, 70);
});

test('melhoria mantém a melhor nota quando configurada', () => {
  const course = courseFixture();
  course.assessments.push({id:'m1',name:'Melhoria',componentId:'theory',weight:0,grade:10,date:'2026-07-20',replacementFor:'t1',replacementMode:'target',replacementPolicy:'best'});
  assert.equal(Core.calculateCourseProgress(course).knownContribution,9.6);
});

test('substituição sempre pode reduzir a nota', () => {
  const course = courseFixture();
  course.assessments.push({id:'r1',name:'Recurso',componentId:'theory',weight:0,grade:10,date:'2026-07-20',replacementFor:'t1',replacementMode:'target',replacementPolicy:'always'});
  assert.equal(Core.calculateCourseProgress(course).knownContribution,9);
});

test('recurso pode substituir a pior nota da componente', () => {
  const course = courseFixture(); course.assessments[1].grade=9;
  course.assessments.push({id:'r1',name:'Recurso',componentId:'theory',weight:0,grade:16,date:'2026-07-20',replacementFor:'',replacementMode:'worst_in_component',replacementPolicy:'best'});
  const result=Core.calculateCourseProgress(course);
  assert.equal(result.componentResults[0].currentAverage,14);
});

test('mínimo individual falhado bloqueia aprovação', () => {
  const course = courseFixture(); course.assessments[0].grade = 6;
  const result = Core.calculateCourseProgress(course);
  assert.equal(result.minimumFailed, true); assert.match(result.blockers[0], /Teste 1/);
});

test('assiduidade mínima bloqueia aprovação', () => {
  const course=courseFixture(); course.assessments[1].grade=16; course.attendanceRequired=true; course.attendanceMinimum=75; course.attendancePercentage=70;
  const result=Core.calculateCourseProgress(course);
  assert.equal(result.minimumFailed,true); assert.ok(result.blockers.some(x=>x.includes('Assiduidade')));
});

test('arredondamento final é aplicado', () => {
  const course=courseFixture(); course.assessments[0].grade=9.4; course.assessments[1].grade=9.4; course.assessments[2].grade=9.4; course.roundingMode='nearestInteger';
  assert.equal(Core.calculateCourseProgress(course).finalGrade,9);
  course.roundingMode='ceilingInteger'; assert.equal(Core.calculateCourseProgress(course).finalGrade,10);
});

test('mínimo de componente é aplicado no fecho', () => {
  const course = courseFixture(); course.assessments[1].grade = 7;
  assert.equal(Core.calculateCourseProgress(course).minimumFailed, true);
});

test('deteta fórmula incompleta e peso excessivo', () => {
  const course = courseFixture(); course.components[0].weight = 80; assert.equal(Core.calculateCourseProgress(course).overweight, true);
  course.components[0].weight = 40; assert.equal(Core.calculateCourseProgress(course).underconfigured, true);
});

test('simulador não altera a disciplina original', () => {
  const course=courseFixture(); const result=Core.simulateCourse(course,{t2:18});
  assert.equal(result.finalGrade,15); assert.equal(course.assessments[1].grade,'');
});

test('plano desconta estudo já realizado', () => {
  const tasks = [{id:'t',title:'Projeto',courseId:'c',dueDate:'2026-07-31',priority:'high',activityType:'project',hours:4,done:false}];
  const sessions = [{id:'s',taskId:'t',courseId:'c',date:'2026-07-28',durationMinutes:90,focus:4}];
  const plan = Core.generateStudyPlan(tasks,{startDate:'2026-07-27',availability:[2,2,2,2,2,0,0],maxSessionHours:1,sessions});
  assert.equal(plan.totalPlanned, 2.5);
});

test('plano desconta compromissos da capacidade', () => {
  const plan=Core.generateStudyPlan([], {startDate:'2026-07-27',availability:[4,0,0,0,0,0,0],commitments:[{date:'2026-07-27',startTime:'09:00',endTime:'11:30'}]});
  assert.equal(plan.days[0].capacity,1.5); assert.equal(plan.totalOccupied,2.5);
});

test('plano respeita movimentos manuais', () => {
  const tasks=[{id:'t',title:'Ficha',courseId:'',dueDate:'2026-07-31',priority:'medium',activityType:'exercises',hours:2,done:false}];
  const plan=Core.generateStudyPlan(tasks,{startDate:'2026-07-27',availability:[2,2,2,2,2,0,0],overrides:[{id:'o',taskId:'t',date:'2026-07-29',hours:1}]});
  assert.ok(plan.days[2].items.some(x=>x.manual)); assert.equal(plan.totalPlanned,2);
});

test('plano sinaliza horas sem capacidade', () => {
  const tasks = [{id:'t',title:'Projeto',dueDate:'2026-07-27',priority:'high',hours:5,done:false}];
  const plan = Core.generateStudyPlan(tasks,{startDate:'2026-07-27',availability:[1,0,0,0,0,0,0],maxSessionHours:1,sessions:[]});
  assert.equal(plan.unscheduled[0].hours, 4);
});

test('risco sobe com objetivo impossível e atraso', () => {
  const course = courseFixture(); course.target = 20; course.assessments[0].grade = 2;
  const risk = Core.calculateCourseRisk(course,{today:'2026-07-10',tasks:[{id:'x',courseId:'c1',title:'Atrasada',dueDate:'2026-07-01',priority:'high',hours:3,done:false}],sessions:[]});
  assert.ok(risk.score >= 75); assert.ok(risk.reasons.length >= 2);
});

test('estatísticas de estudo respeitam janela e método', () => {
  const stats = Core.studyStats([{date:'2026-07-29',durationMinutes:60,focus:4,activityType:'review'},{date:'2026-07-25',durationMinutes:30,focus:2,activityType:'review'},{date:'2026-07-01',durationMinutes:500,focus:5}],{today:'2026-07-29',days:7});
  assert.equal(stats.hours, 1.5); assert.equal(stats.averageFocus, 3); assert.equal(stats.byActivity.review,90);
});

test('comparação planeado versus realizado', () => {
  const result=Core.plannedVsActual({days:[{date:'2026-07-29',used:2}]},[{date:'2026-07-29',durationMinutes:90}]);
  assert.equal(result.adherence,75);
});

test('resumo académico pondera por ECTS', () => {
  const a=courseFixture(); a.assessments[1].grade=16; a.ects=6;
  const b=courseFixture(); b.id='c2'; b.ects=12; b.assessments[0].grade=10; b.assessments[1].grade=10; b.assessments[2].grade=10;
  const summary=Core.academicSummary([a,b]);
  assert.equal(summary.totalEcts,18); assert.equal(summary.passedEcts,18); assert.ok(summary.average>10 && summary.average<15);
});

test('alertas incluem tarefas atrasadas e avaliações próximas', () => {
  const course=courseFixture(); course.semesterId='s1'; course.assessments[1].date='2026-07-31';
  const state={activeSemesterId:'s1',courses:[course],tasks:[{id:'x',semesterId:'s1',title:'Atrasada',dueDate:'2026-07-20',done:false}]};
  const reminders=Core.generateReminders(state,{today:'2026-07-29',semesterId:'s1'});
  assert.ok(reminders.some(x=>x.type==='task')); assert.ok(reminders.some(x=>x.type==='assessment'));
});

test('parser CSV aceita ponto e vírgula', () => {
  const rows=Core.parseCSV('tipo;nome;horas\ntarefa;Ficha;2');
  assert.deepEqual(rows,[{tipo:'tarefa',nome:'Ficha',horas:'2'}]);
});

test('parser ICS extrai evento', () => {
  const events=Core.parseICS('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260729T090000\nDTEND:20260729T100000\nSUMMARY:Aula\nEND:VEVENT\nEND:VCALENDAR');
  assert.equal(events[0].date,'2026-07-29'); assert.equal(events[0].title,'Aula');
});

test('migra estado antigo para versão 4 e cria semestre', () => {
  const result = Core.sanitizeState({courses:[{id:'c',name:'Redes',ects:6,target:12,minimumGrade:7.5,assessments:[{id:'a',name:'Teste',weight:100,grade:14,date:'2026-06-01'}]}],tasks:[],settings:{}},{strict:true});
  assert.equal(result.errors.length,0); assert.equal(result.state.version,4); assert.equal(result.state.semesters.length,1); assert.equal(result.state.courses[0].semesterId,result.state.activeSemesterId);
});

test('backup inválido é recusado em modo estrito', () => {
  const result = Core.sanitizeState({courses:'não',tasks:'não'},{strict:true}); assert.ok(result.errors.length >= 2);
});

test('sessões inválidas não entram no estado', () => {
  const result = Core.sanitizeState({courses:[],tasks:[],sessions:[{date:'errada',durationMinutes:-2}],commitments:[]}); assert.equal(result.state.sessions.length,0);
});

test('compromissos válidos são preservados', () => {
  const result = Core.sanitizeState({courses:[],tasks:[],sessions:[],commitments:[{id:'x',title:'Aula',date:'2026-07-29',startTime:'09:00',endTime:'10:00',type:'class'}]}); assert.equal(result.state.commitments.length,1);
});

test('avaliação obrigatória pendente impede fecho', () => {
  const course = courseFixture(); course.assessments[1].weight = 0; course.assessments[2].grade = 15;
  const result = Core.calculateCourseProgress(course); assert.equal(result.complete, false); assert.deepEqual(result.mandatoryPending, ['Teste 2']);
});
