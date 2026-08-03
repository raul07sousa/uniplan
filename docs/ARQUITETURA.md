# Arquitetura do UniPlan 3.0

## 1. Visão geral

O UniPlan é uma aplicação **client-side e local-first**. A interface, as regras académicas e a persistência executam-se no dispositivo do utilizador. Não existe API nem base de dados remota obrigatória.

```text
Utilizador
   │
   ▼
index.html + styles.css
   │ eventos e renderização
   ▼
js/app.js ───────────────► localStorage
   │                         │
   │ regras de domínio       │ cópia anterior / estado atual
   ▼                         │
js/core.js ◄─────────────────┘
   │
   ├── cálculos académicos
   ├── risco e recomendações
   ├── planeamento semanal
   ├── validação e migração
   └── parsing CSV / ICS
```

## 2. Camadas

### Interface

`index.html` contém a estrutura visual e os elementos reutilizados pela aplicação. `styles.css` define o layout, os estados, a responsividade e os temas.

### Aplicação e estado

`js/app.js` liga os eventos da interface às regras de negócio. É responsável por:

- carregar e persistir o estado;
- criar, editar e remover entidades;
- renderizar painéis, formulários e calendários;
- gerir o cronómetro e as notificações;
- importar e exportar dados;
- integrar a sincronização opcional por ficheiro.

O estado principal é guardado em `localStorage`. Antes de alterações relevantes, é mantida uma cópia anterior para recuperação.

### Domínio

`js/core.js` concentra funções determinísticas e testáveis:

- cálculo de notas e aplicação de arredondamentos;
- mínimos por avaliação, componente e assiduidade;
- substituições em exame, recurso e melhoria;
- cálculo de ECTS e médias;
- avaliação de risco académico;
- geração do plano de estudo;
- estatísticas e alertas;
- validação, normalização e migração de backups;
- interpretação de ficheiros CSV e ICS.

Esta separação permite testar as regras sem depender do DOM.

## 3. Modelo de dados

O estado inclui, entre outros elementos:

- `semesters` — períodos letivos;
- `courses` — disciplinas e regras de avaliação;
- `tasks` — trabalho pendente;
- `sessions` — estudo realizado;
- `commitments` — aulas e compromissos;
- `planOverrides` — alterações manuais ao plano;
- `settings` — disponibilidade, tema, notificações, cronómetro e sincronização.

Cada entidade relevante fica associada a um semestre. A versão atual do esquema é indicada por `version: 4`.

## 4. Persistência e migração

Ao iniciar, a aplicação procura o estado atual e versões antigas no armazenamento local. Os dados são normalizados através de `sanitizeState`, que:

1. verifica tipos, limites e datas;
2. remove ou recusa entradas inválidas;
3. reconstrói relações entre entidades;
4. migra estruturas antigas para o esquema atual.

A importação de backups usa validação estrita para evitar substituir o estado por dados incompatíveis.

## 5. Funcionamento offline

`sw.js` guarda os recursos estáticos numa cache. A estratégia tenta primeiro a rede e recorre à cache quando necessário. O manifesto permite instalar a aplicação como PWA em navegadores compatíveis.

## 6. Aplicação Windows

`launcher.ps1` cria um servidor HTTP apenas no endereço local (`127.0.0.1`) e serve os ficheiros da pasta instalada. Também valida os caminhos pedidos para impedir acesso fora da raiz da aplicação.

`instalar.ps1` copia os ficheiros para `%LOCALAPPDATA%\UniPlan`, cria atalhos e regista a aplicação na lista de programas instalados do utilizador.

## 7. Testes

`tests/core.test.js` testa as regras de domínio com o test runner nativo do Node.js. A integração contínua é executada pelo GitHub Actions.

A cobertura atual privilegia o núcleo académico e a consistência dos dados. Testes end-to-end automatizados da interface constituem uma evolução futura natural.

## 8. Decisões e compromissos

### Vantagens

- instalação simples;
- funcionamento sem conta;
- privacidade elevada;
- custos de infraestrutura inexistentes;
- regras de domínio testáveis de forma isolada.

### Limitações

- os dados dependem do armazenamento local e dos backups do utilizador;
- não existe sincronização multiutilizador em tempo real;
- algumas APIs variam entre navegadores;
- `app.js` continua relativamente concentrado e poderá ser dividido em módulos numa futura versão.
