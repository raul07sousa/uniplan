# Alterações implementadas no UniPlan 3.0

## Aplicação Windows

`INSTALAR_UNIPLAN.bat` instala a aplicação em `%LOCALAPPDATA%\UniPlan`, cria atalhos com ícone no Ambiente de Trabalho e no menu Iniciar e regista o UniPlan nas Aplicações Instaladas do Windows. A aplicação abre numa janela própria do Chrome ou Edge e não requer Python.

## Assistente inicial

Cria o primeiro semestre, define a disponibilidade semanal e adiciona a primeira disciplina através de um único fluxo guiado.

## Vários semestres

Permite criar, editar, arquivar e alternar entre períodos letivos. Cada disciplina, tarefa, sessão e compromisso fica associado ao respetivo semestre.

## Histórico académico

Calcula ECTS inscritos e aprovados, média ponderada por ECTS, taxa de aprovação, disciplinas concluídas e previsão da média.

## Regras de avaliação completas

Suporta componentes, pesos, mínimos, assiduidade, arredondamento, avaliações obrigatórias, época normal, exame, recurso e melhoria. Um recurso pode substituir uma avaliação específica ou a pior nota da componente.

## Simulador de notas

Permite testar resultados hipotéticos sem alterar as notas guardadas. Mostra nota prevista, média necessária, melhor resultado possível e bloqueios.

## Plano adaptativo

Distribui tarefas conforme prazo, prioridade, risco da disciplina e estudo já realizado. Desconta aulas e compromissos da capacidade diária. Sessões planeadas podem ser arrastadas para outro dia.

## Registo de estudo

Inclui cronómetro, sessões manuais, foco, notas e método de estudo. Compara horas planeadas e realizadas.

## Alertas

Mostra tarefas atrasadas e avaliações próximas. Pode apresentar notificações do navegador após autorização.

## Importações e exportações

Inclui backup JSON, modelo e importação CSV, importação e exportação ICS, recuperação da cópia anterior e relatório imprimível em PDF.

## Sincronização opcional

Permite escolher um ficheiro JSON numa pasta sincronizada por OneDrive, Google Drive ou Dropbox. Pode guardar automaticamente nesse ficheiro sem servidor central.

## Qualidade

30 testes automáticos e fluxos de interface validados em Chromium, incluindo vista móvel.
