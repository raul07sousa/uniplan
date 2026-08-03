# Funcionalidades do UniPlan 3.0

## Semestres e histórico

Permite criar, editar, arquivar e alternar entre vários semestres. O histórico calcula disciplinas concluídas, ECTS inscritos e aprovados, média ponderada por ECTS, taxa de aprovação e previsão de média.

## Regras académicas

Cada disciplina pode ter várias componentes, como teórica, prática, laboratório e projeto. Cada componente e avaliação pode ter peso e nota mínima. Também é possível configurar assiduidade mínima e diferentes formas de arredondamento.

As avaliações distinguem época normal, exame, recurso e melhoria. Uma nova tentativa pode:

- substituir uma avaliação específica;
- substituir automaticamente a pior nota da componente;
- substituir sempre;
- manter a melhor das duas notas.

## Simulador de notas

Permite introduzir notas hipotéticas para avaliações pendentes ou realizadas. Apresenta contribuição conhecida, nota final prevista, média ainda necessária, melhor resultado possível e bloqueios por mínimos. A simulação não altera as notas reais.

## Painel de risco

Classifica cada disciplina entre risco baixo e crítico. Considera:

- dificuldade percebida;
- notas e mínimos;
- média necessária;
- tarefas atrasadas;
- avaliações próximas;
- estudo recente;
- carga pendente.

O painel explica as causas e recomenda a próxima ação.

## Planeamento adaptativo

O plano distribui tarefas por sete dias, respeitando disponibilidade, duração máxima das sessões e prazos. Desconta:

- sessões já realizadas;
- aulas e compromissos do calendário;
- tarefas concluídas.

A prioridade também sobe quando a disciplina apresenta maior risco. As sessões podem ser arrastadas para outro dia.

## Estudo realizado

Inclui cronómetro, sessões manuais, foco, notas e método de estudo: leitura, exercícios, projeto, revisão ou outro. Compara tempo planeado e realizado e mostra distribuição semanal.

## Alertas

Mostra tarefas atrasadas, tarefas próximas do prazo e avaliações próximas. Quando autorizado, apresenta uma notificação diária do navegador enquanto a origem local está disponível.

## Dados e interoperabilidade

- backup completo JSON;
- restauração da versão anterior;
- exportação e importação ICS;
- importação CSV através de modelo;
- relatório académico imprimível ou guardável em PDF;
- migração automática dos dados da versão 2.0.

## Sincronização opcional

O utilizador pode associar um ficheiro JSON numa pasta sincronizada por OneDrive, Google Drive ou Dropbox. O UniPlan pode gravar automaticamente nesse ficheiro. Não existe servidor próprio nem conta UniPlan.

## Aplicação desktop

O instalador copia a aplicação para a pasta local do utilizador, cria atalhos e abre o UniPlan numa janela própria do Chrome ou Edge. Um servidor HTTP local em PowerShell permite PWA, notificações e armazenamento consistente sem exigir Python.
