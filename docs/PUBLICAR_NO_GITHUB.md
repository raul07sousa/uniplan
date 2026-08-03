# Publicar o UniPlan no GitHub — passo a passo

## 1. Antes de publicar

1. Abre a pasta e executa `npm test`.
2. Confirma que os 30 testes passam.
3. Abre a aplicação e verifica criação, edição, persistência, exportação e importação.
4. Decide conscientemente a licença. A licença MIT atual permite que terceiros copiem, modifiquem e até vendam o código, desde que mantenham o aviso de licença.

## 2. Criar o repositório

No GitHub, cria um repositório com:

- **Nome:** `uniplan`
- **Descrição:** `Planeador universitário local-first com cálculo de notas, risco académico, calendário adaptativo e histórico.`
- **Visibilidade:** `Public`
- Não seleciones a criação automática de README, `.gitignore` ou licença, porque já existem.

## 3. Enviar pelo Git

Abre o terminal dentro desta pasta e executa:

```bash
git init
git add .
git commit -m "feat: publish UniPlan 3.0"
git branch -M main
git remote add origin https://github.com/TEU_UTILIZADOR/uniplan.git
git push -u origin main
```

Substitui `TEU_UTILIZADOR` pelo teu nome de utilizador do GitHub.

## 4. Configurar a página do repositório

Na secção **About**, adiciona:

- a descrição indicada acima;
- o website da demonstração, depois de ativares GitHub Pages;
- os tópicos: `javascript`, `pwa`, `education`, `productivity`, `local-first`, `student-planner`, `portuguese`.

Ativa também **Issues**, para poderes registar bugs e melhorias.

## 5. Verificar a integração contínua

Abre o separador **Actions**. O workflow `Tests` deve executar automaticamente. Não publiques a versão como concluída se a execução estiver vermelha.

## 6. Ativar uma demonstração com GitHub Pages

1. Abre `Settings` → `Pages`.
2. Em **Build and deployment**, escolhe `Deploy from a branch`.
3. Seleciona a branch `main` e a pasta `/ (root)`.
4. Guarda e espera pela criação do endereço público.
5. Testa a aplicação nesse endereço e adiciona-o à secção **About**.

Os dados da demonstração continuam guardados localmente no navegador de cada visitante.

## 7. Criar a primeira Release

1. Abre `Releases` → `Draft a new release`.
2. Cria a tag `v3.0.0`.
3. Título: `UniPlan 3.0.0`.
4. Resume as novidades com base em `RELEASE_NOTES.md`.
5. Anexa o ficheiro `UniPlan-Windows-v3.0.0.zip`.
6. Publica a release.

Não anexes o código como um segundo ZIP manual: o GitHub já gera automaticamente os arquivos de código-fonte.

## 8. Tornar o projeto visível no perfil

No teu perfil do GitHub, fixa o repositório em **Pinned repositories**. No LinkedIn e no CV, descreve resultados concretos:

- aplicação local-first sem backend;
- 30 testes automáticos;
- regras académicas e simulador de notas;
- PWA e instalador Windows;
- armazenamento local e importação/exportação.

## 9. Como apresentar a tua participação

Não digas que escreveste autonomamente cada linha se isso não aconteceu. Uma formulação defensável é:

> Concebi o produto, defini as funcionalidades, acompanhei a implementação com apoio de IA, validei a arquitetura, executei testes e consigo explicar e evoluir o sistema.

Num recrutamento, o repositório abre a conversa; a tua capacidade de explicar decisões, corrigir um bug e implementar uma alteração é o que sustenta a credibilidade.
