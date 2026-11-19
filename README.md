# Públio Imóveis — Fichas de Imóveis

Sistema da corretora **Públio Imóveis** para cadastrar imóveis e enviar a ficha ao cliente
com a foto e a descrição. O cliente abre o link, vê o imóvel, **baixa a imagem** e
**copia a descrição** com um toque.

> Mais que imóveis, realizamos histórias.

## O que ele faz

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
2. Cadastre o imóvel e clique em **Salvar imóvel**.
3. Em **Meus imóveis**, clique em **Abrir ficha**.
4. Clique em **Copiar link** e envie para o cliente pelo WhatsApp.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `index.html` | Estrutura das duas telas: painel do corretor e ficha do cliente |
| `estilo.css` | Tema escuro com dourado |
| `app.js` | Cadastro, armazenamento local, link compartilhável e botões de copiar |
| `manifest.webmanifest` | Instalação como app no celular |
| `logo-publio.png`, `logo-publio-512.png` | Logo da Públio Imóveis |
| `icone-192.png`, `icone-512.png`, `icone-maskable-512.png`, `apple-touch-icon.png` | Ícones do app |

## Observações

- A imagem é reduzida automaticamente (máx. 1400 px, JPEG) para o link não ficar pesado.
- Funciona offline depois de carregado, e pode ser instalado na tela inicial do celular.
- Não há backend: os imóveis ficam no navegador de quem cadastra. Para acessar o mesmo
  acervo de outro aparelho, use o link da ficha de cada imóvel.
