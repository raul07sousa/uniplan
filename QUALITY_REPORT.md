# Relatório de qualidade — UniPlan 3.0

## Testes automáticos

30 testes aprovados com `node --test`, cobrindo:

- datas locais e horário de verão;
- componentes, pesos e mínimos;
- assiduidade e arredondamentos;
- exames, recursos, melhorias e substituições;
- simulação hipotética;
- planeamento, compromissos e movimentos manuais;
- risco académico;
- estatísticas e histórico;
- alertas;
- importação CSV e ICS;
- migração e validação de backups.

## Teste de interface

Executado em Chromium headless com:

- carregamento de demonstração;
- três disciplinas e respetivo painel de risco;
- calendário semanal com plano;
- histórico de estudo;
- simulador de notas;
- histórico de semestres.

Não foram detetados erros de JavaScript no fluxo testado.

## Segurança e privacidade

- sem backend ou transmissão automática de dados;
- texto apresentado através de escaping HTML;
- importações validadas e normalizadas;
- proteção contra travessia de diretórios no servidor PowerShell;
- instalação por utilizador, sem privilégios administrativos;
- sincronização por ficheiro sujeita a permissão explícita do navegador.

## Limitações conhecidas

- notificações com a aplicação totalmente encerrada dependem das capacidades do navegador e do sistema;
- a sincronização por ficheiro requer Chrome ou Edge compatível com File System Access API;
- o instalador Inno Setup está incluído como projeto, mas o pacote principal utiliza um instalador PowerShell;
- regras académicas excecionais podem exigir adaptação manual.
