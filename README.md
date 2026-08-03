# UniPlan 3.0

Planeador universitário **local-first** para organizar disciplinas, avaliações, tarefas, sessões de estudo e risco académico — sem conta, subscrição ou servidor central.

![Pré-visualização do painel do UniPlan](docs/preview.png)

## O problema que resolve

Um calendário comum regista datas, mas não compreende regras de avaliação, notas mínimas, ECTS, assiduidade, recursos ou a carga de estudo ainda necessária. O UniPlan reúne essa informação e ajuda o estudante a decidir **onde investir tempo primeiro**.

## Principais funcionalidades

- gestão de vários semestres e histórico académico;
- cálculo de ECTS, média ponderada e previsão de resultados;
- componentes de avaliação, pesos, mínimos e assiduidade;
- época normal, exame, recurso e melhoria;
- simulador de notas sem alterar os dados reais;
- tarefas por disciplina, prazo, prioridade e método de estudo;
- painel de risco com causas e próxima ação recomendada;
- plano semanal adaptativo com aulas e compromissos;
- cronómetro, sessões manuais e comparação entre plano e execução;
- importação e exportação em JSON, CSV e ICS;
- sincronização opcional através de um ficheiro numa pasta cloud;
- tema claro, escuro e automático;
- funcionamento offline como PWA.

A descrição detalhada encontra-se em [`FUNCIONALIDADES.md`](FUNCIONALIDADES.md).

## Executar rapidamente

### Windows — instalação local

1. Descarregar a versão mais recente na área **Releases**.
2. Extrair o ficheiro ZIP.
3. Executar `INSTALAR_UNIPLAN.bat`.
4. Abrir o atalho **UniPlan** criado no Ambiente de Trabalho.

A instalação é feita em `%LOCALAPPDATA%\UniPlan`, sem privilégios de administrador e sem exigir Python ou Node.js.

### Execução para desenvolvimento

```bash
npm start
```

Depois, abrir `http://localhost:8080`.

## Testes

```bash
npm test
```

A versão 3.0 inclui **30 testes automáticos** sobre datas, regras de avaliação, planeamento, risco, importações, migração e validação de dados. O workflow em `.github/workflows/tests.yml` executa-os automaticamente em cada `push` e `pull request`.

## Arquitetura

O UniPlan é uma aplicação web estática, sem backend:

- `index.html` — estrutura da interface;
- `styles.css` — sistema visual e responsividade;
- `js/core.js` — regras académicas, planeamento, risco, importação e validação;
- `js/app.js` — estado, interface, armazenamento local e sincronização;
- `sw.js` — cache offline e comportamento PWA;
- `tests/core.test.js` — testes das regras de domínio;
- `launcher.ps1` — servidor HTTP local e abertura em modo aplicação;
- `instalar.ps1` — instalação por utilizador no Windows.

A explicação completa está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Privacidade

O UniPlan não possui servidor próprio. Os dados académicos ficam no armazenamento local do navegador. A sincronização opcional grava num ficheiro escolhido explicitamente pelo utilizador; a aplicação não recebe credenciais de OneDrive, Google Drive ou Dropbox.

## Limitações conhecidas

- notificações com a aplicação totalmente encerrada dependem do navegador e do sistema operativo;
- a sincronização por ficheiro requer um navegador compatível com a File System Access API;
- regras académicas muito específicas podem exigir configuração manual;
- a versão atual foi concebida prioritariamente para utilização individual.

## Estado do projeto

Versão atual: **3.0.0**. O projeto está funcional e em validação através de utilização real durante o ano letivo.

## Processo de desenvolvimento

Projeto pessoal desenvolvido com apoio de ferramentas de IA na implementação e revisão. O autor assume a responsabilidade pela compreensão da arquitetura, validação, testes e evolução do produto.

## Licença

Distribuído sob a licença [MIT](LICENSE).
