# Públio Imóveis — Fichas de Imóveis

Sistema da corretora **Públio Imóveis** para cadastrar imóveis e enviar a ficha ao cliente
com a foto e a descrição. O cliente abre o link, vê o imóvel, **baixa a imagem** e
**copia a descrição** com um toque.

> Mais que imóveis, realizamos histórias.

## O que ele faz

- **Tela inicial (abertura)**: logo animada, nome dourado e botão **Entrar** — aparece ao abrir o site
  sem link de ficha (uma vez por sessão do navegador).
- **Públio Cliente** (`publio-cliente.html`): vitrine **somente de consulta**, com busca, filtros por tipo
  e os imóveis em cartões. Toque no imóvel para ver as fotos grandes e a descrição completa.
  Não tem cadastro, edição, exclusão nem área do corretor.
- **Cadastro do imóvel**: título, tipo, finalidade (venda/aluguel), preço, cidade/bairro,
  imagem da casa e descrição completa.
- **Meus imóveis**: lista com busca, abrir ficha, editar e excluir.
  Os dados ficam salvos no próprio navegador (IndexedDB), sem servidor e sem cadastro.
- **Ficha do cliente**: foto grande, descrição, e os botões
  **⬇ Baixar imagem**, **⧉ Copiar descrição** e **⧉ Copiar imagem + descrição**.
- **Link da ficha**: os dados do imóvel viajam dentro do próprio link, então o cliente
  consegue ver, baixar a foto e copiar o texto sem depender de servidor.

## Como usar

1. Abra o `index.html` no navegador (ou publique a pasta em qualquer hospedagem estática).
   Ao abrir, aparece a tela inicial — clique em **Entrar**.
2. Cadastre o imóvel e clique em **Salvar imóvel**.
3. Em **Meus imóveis**, clique em **Abrir ficha**.
4. Clique em **Copiar link** e envie para o cliente pelo WhatsApp.

### Para o cliente

Envie o endereço do site terminado em **`/publio-cliente.html`**. Nessa página o cliente vê só as casas
(foto, preço, local e descrição) e não tem acesso a nada de administração.
No painel do corretor, o botão **👁️ Área do cliente** abre essa página para conferência.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `index.html` | Estrutura das telas: abertura, painel do corretor, área do corretor e ficha do cliente |
| `estilo.css` | Tema escuro com dourado |
| `app.js` | Cadastro, armazenamento local, link compartilhável e botões de copiar |
| `abertura.js`, `estilo-abertura.css` | Tela inicial animada com a logo e o botão **Entrar** |
| `publio-cliente.html`, `cliente.js`, `estilo-cliente.css` | Área do cliente: vitrine somente de consulta dos imóveis |
| `manifest.webmanifest` | Instalação como app no celular |
| `logo-publio.png`, `logo-publio-512.png` | Logo da Públio Imóveis |
| `icone-192.png`, `icone-512.png`, `icone-maskable-512.png`, `apple-touch-icon.png` | Ícones do app |

## Observações

- A imagem é reduzida automaticamente (máx. 1400 px, JPEG) para o link não ficar pesado.
- Funciona offline depois de carregado, e pode ser instalado na tela inicial do celular.
- Não há backend: os imóveis ficam no navegador de quem cadastra. Para acessar o mesmo
  acervo de outro aparelho, use o link da ficha de cada imóvel.

## Cadastro rápido: só a descrição

No painel do corretor agora existe **um campo principal: a descrição**. Cole ali o texto
do imóvel do jeito que você já escreve no WhatsApp e o sistema tira sozinho:

- **preço** (procura `R$ 450.000,00`, `450.000` etc.)
- **cidade / bairro** (linhas como `Centro — São Luís/MA`, `Bairro Jardim, Cidade`)
- **tipo** (casa, apartamento, terreno, sítio, galpão, sala comercial)
- **finalidade** (venda ou aluguel)
- **título** (a primeira linha da descrição)

Os campos manuais ficam dentro de *Ajustar os dados lidos (opcional)*, e só são usados se
você preencher — caso contrário vale o que foi lido da descrição.

## Fotos e vídeos

- Até **300 fotos** por imóvel (comprimidas no aparelho antes de subir)
- Até **5 vídeos** por imóvel, 50 MB cada (vão para o bucket `fotos`, pasta `videos/`)
- Na página do cliente os vídeos aparecem dentro do anúncio, com play

> Rode o trecho final do `SUPABASE.sql` uma vez no SQL Editor do Supabase: ele cria a
> coluna `videos` e libera 50 MB no bucket.

## Quem entra é cliente (e só vê as casas)

Todo aparelho novo que abre o site entra **direto como Cliente**, sem pedir código e sem
liberação de ninguém. Nesse modo o site mostra **só as casas**: o cadastro, o excluir, a
Área do corretor e a Área do desenvolvedor ficam escondidos.

Para mudar a função de um aparelho (Cliente → Funcionário → ADM) é preciso entrar em
**⚙️ Área do desenvolvedor** (usuário e senha do dono) → cartão *Modo Desenvolvedor* →
tabela de aparelhos → trocar o cargo na coluna da função. Só o dono vê esse botão e só
ele muda função de aparelho.

- **Cliente** — só vê as casas, não cadastra nem apaga
- **Funcionário** — cadastra e publica imóveis
- **ADM** — cadastra, publica e apaga imóveis de todos os aparelhos
