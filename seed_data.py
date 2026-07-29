# -*- coding: utf-8 -*-
"""
Conteúdo inicial do blog — 20 posts publicados por Allan Dev.
Usado só na primeira execução (banco vazio) para popular o SQLite.
"""

SEED_PERFIL = {
    "nome": "Allan Dev",
    "titulo": "Analista de Segurança da Informação",
    "bio": "Escrevo sobre segurança para gente normal. Linux, redes e Python sem enrolação — o que realmente protege você no dia a dia.",
    "email": "allandevjr@gmail.com",
    "local": "Brasil",
    "avatar": "AD",
}

SEED_POSTS = [
    {
        "titulo": "Senha boa não é senha complicada: é senha longa",
        "categoria": "Usuários",
        "tags": ["senha", "básico", "autenticação"],
        "resumo": "Trocar 'a' por '@' engana humano, não engana computador. O que realmente aumenta a força de uma senha é o comprimento.",
        "data": "2026-07-20",
        "corpo": """A regra que te ensinaram — "use maiúscula, número e símbolo" — nasceu em 2003, num documento do NIST escrito por Bill Burr. Em 2017 ele mesmo se retratou publicamente. O conselho estava errado.

## Por que "P@ssw0rd!" é ruim

Programas de quebra de senha não testam letra por letra às cegas. Eles usam listas de senhas vazadas e aplicam regras de substituição:

- `a` vira `@` ou `4`
- `o` vira `0`
- `s` vira `$` ou `5`
- primeira letra maiúscula, símbolo no final

Ou seja: as substituições "espertas" que você faz são exatamente as primeiras que o atacante testa. `P@ssw0rd!` cai em menos de um segundo.

## O que funciona: comprimento

Cada caractere a mais multiplica o espaço de busca. Uma frase de 4 palavras aleatórias tem mais entropia que 10 caracteres embaralhados — e você consegue lembrar.

```
ruim   : Jv7$k!2Qz        (10 chars, impossível de lembrar)
bom    : cavalo bateria grampo azul   (26 chars, você lembra)
```

O detalhe crítico: as palavras precisam ser **aleatórias**. "meu nome é allan silva" não vale — é uma frase previsível.

## Regras práticas

1. **Mínimo de 16 caracteres** em contas importantes.
2. **Nunca repita senha** entre serviços. Vazou num site, vazou em todos.
3. **Use um gerenciador de senhas.** Bitwarden e KeePassXC são gratuitos e de código aberto.
4. **A única senha que você decora** é a do gerenciador — essa sim, faça uma frase longa.
5. **Troca periódica obrigatória não ajuda.** Faz as pessoas criarem senha1, senha2, senha3. Troque quando houver suspeita de vazamento.

## Testando o que você já usa

Entre em `haveibeenpwned.com` e digite seu email. O serviço é mantido por Troy Hunt, pesquisador de segurança respeitado, e mostra em quais vazamentos públicos seu endereço apareceu. Se aparecer, troque as senhas daqueles serviços — e só delas.

Nunca digite sua senha real em sites que prometem "testar a força da senha". Você está literalmente entregando a senha.""",
    },
    {
        "titulo": "Gerenciador de senhas: qual escolher e como começar",
        "categoria": "Usuários",
        "tags": ["senha", "ferramentas", "básico"],
        "resumo": "Guia direto para sair do 'anotei no caderninho' sem se perder no caminho.",
        "data": "2026-07-19",
        "corpo": """A objeção mais comum: "e se hackearem o gerenciador, perco tudo de uma vez?"

É uma preocupação legítima, mas o cálculo é a favor do gerenciador. Sem ele você reusa senhas — e um único vazamento em qualquer site derruba todas as suas contas. Com ele, cada conta tem uma senha única e um vazamento fica isolado.

## As opções

**Bitwarden** — código aberto, plano gratuito generoso, sincroniza entre dispositivos. É a recomendação padrão para a maioria das pessoas.

**KeePassXC** — código aberto, o cofre é um arquivo no seu computador. Sem nuvem, sem conta. Mais controle, mais trabalho: você sincroniza manualmente.

**1Password** — pago, interface muito boa, ótimo para famílias. Se você quer algo que "simplesmente funciona" e não se importa em pagar.

**Gerenciador do navegador** — o do Chrome/Firefox é melhor do que nada e melhor do que reusar senha. Mas fica preso ao navegador e a proteção do cofre é mais fraca.

## Como o cofre é protegido

O ponto que importa: gerenciadores sérios usam **criptografia de conhecimento zero**. Sua senha mestra nunca sai do seu dispositivo. Ela deriva uma chave (via PBKDF2 ou Argon2) que descriptografa o cofre localmente. O servidor guarda só um blob cifrado que ele mesmo não consegue ler.

Consequência direta: **se você esquecer a senha mestra, ninguém recupera.** Nem o suporte. Isso é uma característica, não um defeito.

## Roteiro de migração (uma hora, sem pressa)

1. Instale o gerenciador e a extensão do navegador.
2. Crie a senha mestra — frase longa, 5 palavras aleatórias. Escreva num papel e guarde num lugar seguro **por enquanto**, até decorar.
3. Ative 2FA no próprio gerenciador.
4. Importe as senhas salvas no navegador (todos têm importador).
5. Não troque tudo de uma vez. Comece pelas **cinco contas críticas**: email principal, banco, gerenciador, conta do celular (Apple/Google), rede social principal.
6. Depois, cada vez que fizer login em algum site, deixe o gerenciador gerar uma senha nova ali mesmo. Em dois meses o cofre inteiro estará limpo.

## Kit de emergência

Anote num papel e guarde fisicamente: senha mestra e códigos de recuperação do 2FA. Papel num lugar trancado é mais seguro que um arquivo `senhas.txt` no desktop.""",
    },
    {
        "titulo": "Seu email é a chave mestra — proteja ele primeiro",
        "categoria": "Usuários",
        "tags": ["email", "conta", "recuperação"],
        "resumo": "Quem controla seu email controla todas as suas outras contas via 'esqueci minha senha'.",
        "data": "2026-07-18",
        "corpo": """Pense em quantos serviços mandam link de redefinição de senha para o seu email. Banco, redes sociais, loja online, trabalho. Todos.

Isso significa que seu email não é "mais uma conta". Ele é a **chave mestra**. Um atacante que entra no seu email não precisa quebrar mais nenhuma senha — ele pede redefinição em cada serviço e recebe os links.

Por isso a ordem de proteção é: email primeiro, resto depois.

## Checklist do email principal

**1. Senha única e longa.** Nunca reutilizada em lugar nenhum. Se a senha do seu email já foi usada em outro site, troque hoje.

**2. 2FA ativo, de preferência com app.** SMS é vulnerável a SIM swap (explico em outro post). Use Aegis, 2FAS ou Google Authenticator.

**3. Revise a recuperação de conta.** Vá nas configurações e confira:
- O telefone de recuperação ainda é seu?
- O email secundário ainda existe e é seu?
- Tem algum endereço estranho cadastrado?

Atacantes que entram numa conta costumam adicionar um email de recuperação próprio para manter acesso mesmo depois de você trocar a senha.

**4. Confira as regras de encaminhamento.** Esse é o truque mais silencioso: o invasor cria uma regra que encaminha cópia de todos os emails para o endereço dele e sai da conta. Você troca a senha, se sente seguro, e ele continua lendo tudo. No Gmail: Configurações → Encaminhamento e POP/IMAP, e Configurações → Filtros.

**5. Revise apps com acesso.** Google e Microsoft têm uma página de "aplicativos de terceiros com acesso à conta". Remova o que você não reconhece ou não usa mais.

**6. Veja a atividade recente.** Gmail mostra no rodapé "Última atividade da conta". Clique em Detalhes e veja os IPs e locais.

## Estratégia de separação

Uma prática que reduz muito o risco: **use emails diferentes por finalidade**.

- Um email só para banco e documentos — nunca divulgado, nunca usado em cadastro de loja.
- Um email para o dia a dia — redes sociais, trabalho.
- Um email descartável para cadastros de site aleatório e newsletter.

Se o terceiro vazar, não acontece nada. Serviços como `addy.io` e o Ocultar Meu Email da Apple criam aliases automáticos com esse propósito.

## Sinais de que sua conta foi invadida

- Emails na pasta "Enviados" que você não escreveu
- Notificações de redefinição de senha de serviços que você não pediu
- Contatos avisando que receberam mensagem estranha sua
- Emails sumindo (o invasor apaga os avisos de segurança)

Se acontecer: troque a senha de outro dispositivo, encerre todas as sessões ativas, revise encaminhamento e recuperação, depois avise os contatos.""",
    },
    {
        "titulo": "2FA na prática: app autenticador, chave física e por que evitar SMS",
        "categoria": "Usuários",
        "tags": ["2fa", "autenticação", "conta"],
        "resumo": "O segundo fator é a diferença entre 'vazou minha senha' e 'vazou minha conta'.",
        "data": "2026-07-17",
        "corpo": """Autenticação em dois fatores significa provar quem você é com duas coisas de categorias diferentes:

- **Algo que você sabe** — senha
- **Algo que você tem** — celular, chave física
- **Algo que você é** — digital, rosto

Senha sozinha é um fator só. Se ela vazar, acabou. Com 2FA, o vazamento da senha não basta.

## Os tipos, do pior ao melhor

**SMS** — melhor que nada, mas é o mais fraco. Vulnerável a SIM swap: o criminoso convence a operadora a transferir seu número para um chip dele, com engenharia social ou suborno de funcionário. A partir daí recebe seus códigos. Também é interceptável via falhas do protocolo SS7.

**App autenticador (TOTP)** — gera códigos de 6 dígitos que mudam a cada 30 segundos, calculados a partir de um segredo compartilhado e do horário atual. Funciona offline. Não depende da operadora. É o ponto ideal entre segurança e praticidade para a maioria das pessoas.

Boas opções: **Aegis** (Android, código aberto), **2FAS** (Android/iOS, código aberto), **Ente Auth** (multiplataforma). Evite o Authy pela dificuldade de exportar seus dados.

**Chave de segurança física (FIDO2/WebAuthn)** — um dispositivo USB/NFC como YubiKey ou SoloKey. É o único método **imune a phishing**: a chave verifica criptograficamente o domínio do site. Se você estiver num `bancodobrasi1.com` falso, ela simplesmente se recusa a autenticar. Nenhum outro método faz isso.

**Passkeys** — a evolução do WebAuthn, sem hardware extra: a chave privada fica no seu celular ou gerenciador de senhas, protegida por biometria. Também é imune a phishing e dispensa senha. Onde estiver disponível, ative.

## Códigos de recuperação: não pule essa parte

Ao ativar 2FA, o serviço mostra uma lista de códigos de uso único. **Guarde.** Perder o celular sem ter os códigos significa perder a conta — e o suporte de muitos serviços não recupera.

Onde guardar: impresso num papel guardado em lugar seguro, ou dentro do seu gerenciador de senhas (desde que o gerenciador não use aquele mesmo 2FA — senão você tranca a chave dentro do cofre).

## Onde ativar primeiro

Nessa ordem: email principal → gerenciador de senhas → banco → conta do celular (Apple ID / Google) → redes sociais → resto.

## O 2FA que ainda pode ser burlado

Kits de phishing modernos fazem proxy reverso: mostram a página real do banco, você digita senha e código TOTP, e o kit repassa em tempo real e rouba o cookie da sessão. Contra isso, só chave física ou passkey protegem de verdade.

Por isso 2FA não substitui atenção ao endereço do site.""",
    },
    {
        "titulo": "Como identificar phishing antes de clicar",
        "categoria": "Usuários",
        "tags": ["phishing", "engenharia social", "básico"],
        "resumo": "Golpes por mensagem seguem padrões. Depois que você reconhece o padrão, fica difícil cair.",
        "data": "2026-07-16",
        "corpo": """Phishing é a porta de entrada da maioria dos incidentes. Não porque as vítimas são ingênuas — porque as mensagens são boas e chegam no momento certo.

## Os quatro gatilhos

Praticamente todo phishing usa um destes:

1. **Urgência** — "sua conta será bloqueada em 24 horas"
2. **Medo** — "detectamos acesso suspeito, confirme seus dados"
3. **Ganância** — "você tem um reembolso disponível"
4. **Autoridade** — mensagem que finge vir do chefe, do banco, da Receita

Quando uma mensagem produz reação emocional imediata e pede ação rápida, **é justamente aí que você deve desacelerar**. A pressa é a ferramenta.

## Checando o remetente de verdade

O nome de exibição é livre — qualquer um pode se chamar "Banco Itaú". O que importa é o domínio depois do `@`.

Cuidado com estes truques:

```
itau.com.br          <- legítimo
itau.com.br.seg.co   <- o domínio real é seg.co
itaú.com.br          <- caractere unicode (homográfico)
ltau.com.br          <- L minúsculo no lugar do I
itau-seguranca.com   <- domínio totalmente diferente
```

Leia o domínio **da direita para a esquerda**: o que vale é o que vem imediatamente antes da primeira barra.

## Checando o link antes de clicar

No computador, passe o mouse sobre o link e olhe o endereço na barra de status, canto inferior. No celular, segure o dedo sobre o link até aparecer o preview.

O texto do link pode mentir. Um link pode exibir "www.bb.com.br" e apontar para outro endereço completamente diferente.

Encurtadores (bit.ly, tinyurl) escondem o destino. Se veio numa mensagem inesperada, não abra.

## Sinais que ainda funcionam

- Saudação genérica ("Prezado cliente") quando a empresa sabe seu nome
- Pedido de senha, código do 2FA ou dados de cartão — **nenhuma instituição séria pede isso**
- Anexo inesperado, principalmente `.zip`, `.iso`, `.htm`, `.docm` ou `.exe`
- Português com erros ou tradução automática esquisita
- Domínio criado há poucos dias

Atenção: IA generativa acabou com o sinal do "português ruim". Não conte mais com isso.

## A regra que resolve quase tudo

**Nunca use o link da mensagem para acessar uma conta.** Recebeu um aviso do banco? Feche a mensagem, abra o app do banco que você já tem instalado ou digite o endereço à mão. Se o aviso for real, ele vai estar lá dentro.

Isso vale para email, SMS, WhatsApp e ligação.

## Variantes

- **Smishing** — por SMS. "Sua encomenda está retida na alfândega."
- **Vishing** — por ligação. "Aqui é do setor de segurança do banco." Bancos não ligam pedindo que você transfira dinheiro para "conta segura".
- **QR code malicioso** — adesivo colado em cima do QR legítimo do estacionamento ou do restaurante.
- **Spear phishing** — feito sob medida para você, com dados reais coletados nas suas redes. É o mais perigoso.

## Se você clicou

Não entre em pânico, aja rápido: desconecte da internet, troque a senha do serviço afetado de **outro** dispositivo, encerre as sessões ativas, ative 2FA, monitore a conta e avise a instituição.""",
    },
    {
        "titulo": "Golpe do PIX e fraudes bancárias: o que checar antes de transferir",
        "categoria": "Usuários",
        "tags": ["fraude", "pix", "banco"],
        "resumo": "Transferência instantânea é irreversível. A verificação precisa vir antes.",
        "data": "2026-07-15",
        "corpo": """A característica que faz o PIX ser bom — dinheiro cai na hora — é a mesma que faz o golpe funcionar. Depois de confirmado, não tem estorno automático.

## Os golpes mais comuns

**Falso parente no WhatsApp.** "Oi mãe, troquei de número, meu celular quebrou." Depois vem o pedido de dinheiro urgente. O criminoso usa foto de perfil pega das redes sociais.

Como quebrar: **ligue para o número antigo.** Ou pergunte algo que só a pessoa real saberia e que não esteja na internet — o apelido do cachorro da infância, não a data de aniversário.

**Falsa central de segurança do banco.** Ligam dizendo que houve uma compra suspeita e que você precisa transferir o saldo para uma "conta segura" ou instalar um app para "proteção". Banco nunca faz isso. Não existe "conta segura".

Como quebrar: desligue e ligue você mesmo para o número que está atrás do seu cartão.

**Produto barato demais em marketplace.** Anúncio fora da plataforma, vendedor pedindo PIX direto, preço muito abaixo do mercado.

Como quebrar: pague dentro da plataforma, que tem mecanismo de disputa.

**Boleto ou chave adulterada.** Malware no computador troca a chave PIX copiada na área de transferência. Você copia uma, cola outra.

Como quebrar: **sempre confira o nome do favorecido na tela de confirmação.** O app mostra antes de você confirmar. Leia.

**Falso emprego / falsa vaga.** Pedem pagamento de "taxa de cadastro" ou dados bancários completos para "depositar o salário".

## O ritual de 30 segundos

Antes de confirmar qualquer PIX para alguém novo:

1. O **nome do favorecido** na tela bate com quem eu penso que é?
2. O **valor** está certo, com a vírgula no lugar?
3. Alguém está me **apressando**? (Se sim, pare e verifique por outro canal.)
4. Esse pedido chegou por mensagem? Já **confirmei por voz** com a pessoa?

## Proteções que você pode ligar hoje

- **Limite noturno do PIX** — todos os bancos permitem definir um teto entre 20h e 6h. Deixe baixo.
- **Limites diários** por tipo de transação, ajustados ao seu uso real.
- **Notificação push** para toda movimentação.
- **PIX por aproximação e chaves cadastradas** — revise periodicamente quais chaves estão no seu CPF no site do Banco Central.

## Se você caiu

1. Ligue **imediatamente** para o banco e peça o **MED** (Mecanismo Especial de Devolução). Há chance real de recuperação se for rápido.
2. Registre boletim de ocorrência — muitos estados têm delegacia virtual.
3. Reúna prints, comprovante e o número da transação.
4. Registre reclamação no Banco Central.

O MED tem prazo. Quanto antes você ligar, maior a chance.""",
    },
    {
        "titulo": "Wi-Fi público sem susto: o que realmente é risco em 2026",
        "categoria": "Redes",
        "tags": ["wifi", "rede", "vpn"],
        "resumo": "Muita coisa que se fala sobre Wi-Fi público está desatualizada. O risco real mudou de lugar.",
        "data": "2026-07-14",
        "corpo": """O medo clássico do Wi-Fi público é alguém "capturar sua senha do banco no ar". Isso era verdade em 2010. Hoje, quase todo site usa HTTPS, e o conteúdo trafega criptografado ponta a ponta. Quem está na mesma rede vê que você acessou `bb.com.br`, mas não vê sua senha nem o saldo.

Isso não significa que Wi-Fi público seja inofensivo. Significa que o risco mudou.

## O que um atacante na mesma rede ainda consegue

**Ver metadados.** Quais domínios você acessa, quando, com que frequência. Via consultas DNS e via SNI no handshake TLS. É bastante coisa sobre você.

**Montar um gêmeo do ponto de acesso.** Ele cria uma rede chamada "Aeroporto_WiFi_Free", igual à legítima. Seu celular conecta sozinho se já conhecer o nome. A partir daí ele é seu gateway.

**Portal cativo falso.** Aquela tela de "aceite os termos para conectar" é o lugar perfeito para pedir login do Google, do Facebook ou dados de cartão. Portal cativo legítimo **nunca** pede senha de outra conta.

**Forçar downgrade ou explorar erro de certificado.** Se você clicar em "prosseguir mesmo assim" num aviso de certificado inválido, você acabou de aceitar um intermediário lendo tudo.

## Regras práticas

1. **Desligue a conexão automática** a redes abertas. Android: Wi-Fi → Preferências. iOS: Ajustes → Wi-Fi → Entrar em Redes → Perguntar. E remova redes antigas salvas.
2. **Nunca ignore aviso de certificado.** Nunca. Esse aviso é o sistema funcionando.
3. **Confira o cadeado e o domínio** antes de digitar credencial. Cadeado significa "criptografado", não "confiável" — um site de phishing também tem cadeado.
4. **Prefira dados móveis** para banco e coisas sensíveis. 4G/5G é criptografado da antena até a operadora e é muito mais difícil de atacar do que Wi-Fi aberto.
5. **Roteador 4G pessoal / tethering** resolve de vez em viagem.
6. **Desative compartilhamento de arquivos e AirDrop para todos** enquanto estiver em rede pública.

## E a VPN?

VPN move a confiança: em vez de confiar no dono do Wi-Fi, você confia no provedor da VPN. Isso é útil quando a rede é hostil e o provedor é sério.

**A VPN ajuda de verdade quando:** você quer esconder metadados do dono da rede, está numa rede que você não confia nada, ou precisa contornar bloqueio de rede.

**A VPN não faz:** te tornar anônimo, impedir phishing, proteger contra malware, esconder você de sites onde você faz login.

**Nunca use VPN gratuita.** O modelo de negócio dela é vender seus dados. Se você vai usar, use paga e com auditoria pública. Ou monte a sua com WireGuard num VPS — é mais simples do que parece e você é o único dono do log.""",
    },
    {
        "titulo": "Roteador doméstico: 10 ajustes que valem a hora gasta",
        "categoria": "Redes",
        "tags": ["roteador", "rede", "casa"],
        "resumo": "O roteador é a porta da sua casa digital. Quase ninguém troca a fechadura que veio de fábrica.",
        "data": "2026-07-13",
        "corpo": """Seu roteador vê todo o tráfego da casa e é acessível pela internet com mais frequência do que você imagina. Vale uma hora de atenção.

Acesse o painel em `192.168.0.1` ou `192.168.1.1` no navegador.

## 1. Troque a senha de administração

Não é a senha do Wi-Fi — é a senha do painel. Muitos roteadores saem com `admin/admin` e existem listas públicas de credenciais padrão por modelo.

## 2. Use WPA3, ou WPA2-AES no mínimo

Se o painel oferecer WPA3 ou "WPA2/WPA3", use. **Desative WEP e WPA (TKIP)** — são quebráveis em minutos.

## 3. Senha de Wi-Fi longa

Vinte caracteres ou mais. Ataques de WPA2 capturam o handshake e testam offline, sem limite de tentativas. Só o comprimento protege.

## 4. Desligue o WPS

Aquele botão de "conectar sem senha". O modo PIN de 8 dígitos tem uma falha de projeto que reduz o esforço de quebra para poucas horas. Desative.

## 5. Atualize o firmware

Roteador é computador e tem falhas críticas. Procure "Atualização de Firmware" e verifique se há versão nova. Se o fabricante parou de dar suporte ao seu modelo há anos, considere trocar o aparelho — é a peça mais exposta da rede.

## 6. Desative administração remota (WAN)

Procure por "Remote Management", "Acesso remoto" ou "Gerenciamento WAN" e desligue. Sem isso, o painel só é acessível de dentro de casa.

## 7. Desligue UPnP

UPnP permite que qualquer programa da rede abra portas para a internet sozinho — inclusive malware. Desative e abra portas manualmente quando precisar. Alguns jogos e consoles reclamam; nesse caso abra a porta específica.

## 8. Crie uma rede de convidados

Duas coisas devem morar nela: as visitas e os dispositivos de IoT (TV, câmera, lâmpada inteligente, aspirador). Assim, se a câmera chinesa de R$ 80 for comprometida, ela não enxerga seu notebook nem seu NAS.

Ative o **isolamento de clientes** nessa rede.

## 9. Troque o DNS

O DNS do provedor costuma ser lento e registra tudo. Alternativas com filtro de malware:

```
Cloudflare seguro : 1.1.1.2 / 1.0.0.2
Quad9             : 9.9.9.9 / 149.112.112.112
```

Configure no roteador para valer para a casa inteira.

## 10. Revise os dispositivos conectados

O painel tem uma lista de clientes conectados. Passe o olho de vez em quando. Aparelho que você não reconhece merece investigação.

## Bônus: mude o nome da rede

Nomes padrão como `VIVOFIBRA-A1B2` entregam provedor e modelo, o que ajuda quem procura falhas conhecidas. Escolha um nome neutro, sem seu sobrenome ou número do apartamento.""",
    },
    {
        "titulo": "Entendendo o modelo TCP/IP sem decoreba",
        "categoria": "Redes",
        "tags": ["fundamentos", "tcp/ip", "protocolos"],
        "resumo": "Quatro camadas, uma analogia. Depois disso, ler um log de rede fica muito mais fácil.",
        "data": "2026-07-12",
        "corpo": """Quase todo problema de rede — e boa parte dos ataques — faz sentido quando você sabe em qual camada está olhando.

## A analogia da carta

Você quer mandar uma carta:

- **Aplicação** — o texto que você escreveu. HTTP, DNS, SSH, SMTP.
- **Transporte** — o tipo de serviço postal: registrado com aviso de recebimento (TCP) ou simples, sem garantia (UDP).
- **Internet** — o endereço no envelope: de onde vem, para onde vai. IP.
- **Enlace/Física** — o carteiro, o caminhão, a estrada. Ethernet, Wi-Fi.

Cada camada envelopa a anterior. Isso se chama encapsulamento.

## TCP versus UDP

**TCP** estabelece conexão antes de mandar dados, com o famoso three-way handshake:

```
cliente --SYN-->      servidor
cliente <-SYN/ACK--   servidor
cliente --ACK-->      servidor
```

Garante entrega, ordem e retransmissão. Usado por HTTP, SSH, SMTP — tudo onde perder um pedaço estraga o resultado.

**UDP** dispara e esquece. Sem handshake, sem garantia. Usado por DNS, streaming, jogos e VoIP — onde chegar rápido importa mais do que chegar completo.

Detalhe relevante para segurança: como UDP não tem handshake, é trivial forjar o IP de origem. Por isso ataques de amplificação (DNS, NTP, memcached) usam UDP.

## Endereço IP e porta

O IP identifica a **máquina**; a porta identifica o **serviço** naquela máquina.

```
192.168.1.10:22    -> SSH naquele host
192.168.1.10:443   -> HTTPS no mesmo host
```

Portas conhecidas que vale memorizar:

```
20/21  FTP        22   SSH         23   Telnet (inseguro)
25     SMTP       53   DNS         67/68 DHCP
80     HTTP       110  POP3        143  IMAP
443    HTTPS      445  SMB         3306 MySQL
3389   RDP        5432 PostgreSQL  8080 HTTP alt
```

## O caminho de um acesso

Quando você digita `exemplo.com` no navegador:

1. **DNS** traduz o nome para um IP (UDP porta 53).
2. **ARP** descobre o MAC do gateway na rede local.
3. **TCP** faz o handshake com o IP de destino na porta 443.
4. **TLS** negocia a criptografia e valida o certificado.
5. **HTTP** finalmente pede a página.
6. **NAT** no roteador traduz seu IP privado para o IP público na saída e mantém a tabela para devolver a resposta.

Cada etapa dessa é um ponto onde algo pode falhar — e onde alguém pode atacar. DNS spoofing na etapa 1, ARP spoofing na 2, SYN flood na 3, certificado forjado na 4.

## Faixas privadas

```
10.0.0.0/8       10.0.0.0     - 10.255.255.255
172.16.0.0/12    172.16.0.0   - 172.31.255.255
192.168.0.0/16   192.168.0.0  - 192.168.255.255
```

Esses IPs não são roteáveis na internet. Se um serviço externo tenta te mandar para um desses, desconfie.""",
    },
    {
        "titulo": "DNS: como funciona e por que é alvo constante",
        "categoria": "Redes",
        "tags": ["dns", "protocolos", "privacidade"],
        "resumo": "A agenda telefônica da internet — e um dos pontos mais atacados e mais reveladores da sua navegação.",
        "data": "2026-07-11",
        "corpo": """Computadores falam por número; humanos, por nome. O DNS faz a tradução. Toda navegação começa com uma consulta DNS, o que faz dele um ponto privilegiado tanto para vigilância quanto para ataque.

## A cadeia de resolução

Ao pedir `www.exemplo.com.br`:

1. **Cache local** do navegador e do sistema
2. **Resolver recursivo** — o do seu provedor, ou o que você configurou
3. **Servidores raiz** — quem cuida de `.br`?
4. **TLD** — quem cuida de `exemplo.com.br`?
5. **Autoritativo** — qual o IP de `www`?

A resposta volta e fica em cache pelo tempo definido no **TTL**.

## Tipos de registro que importam

```
A       nome -> IPv4
AAAA    nome -> IPv6
CNAME   apelido para outro nome
MX      servidor de email do domínio
TXT     texto livre (SPF, DKIM, verificações)
NS      servidores autoritativos
PTR     IP -> nome (DNS reverso)
```

Os registros TXT são onde vivem SPF e DKIM — a base do combate a email falsificado.

## Ataques via DNS

**Cache poisoning** — o atacante injeta uma resposta falsa no resolver, que passa a mandar todo mundo para o servidor errado. DNSSEC assina as respostas e mitiga isso.

**DNS hijacking** — malware ou invasão do roteador troca o servidor DNS configurado. Vale checar de vez em quando qual DNS sua máquina está usando.

**Tunelamento DNS** — exfiltração de dados codificados em subdomínios. Como DNS quase nunca é bloqueado, vira canal de saída para malware.

**Domain fronting e DGA** — malware gera milhares de domínios por algoritmo para achar seu servidor de comando. Detectável por volume anômalo de consultas que falham.

## Privacidade: DoH e DoT

DNS tradicional é **texto puro**. Seu provedor — e qualquer um no caminho — vê todo site que você visita.

- **DoT (DNS over TLS)** — porta 853, criptografado, fácil de identificar e bloquear.
- **DoH (DNS over HTTPS)** — porta 443, misturado com tráfego web normal.

Firefox e Chrome suportam nativamente. No Linux, o `systemd-resolved` faz DoT configurando `DNS=` e `DNSOverTLS=yes` em `/etc/systemd/resolved.conf`.

Vale a ressalva: DoH esconde suas consultas do provedor, mas entrega tudo ao operador do DoH. Escolha com critério.

## Comandos úteis

```
dig exemplo.com A +short          # consulta direta
dig exemplo.com MX                # servidores de email
dig +trace exemplo.com            # cadeia completa
dig @1.1.1.1 exemplo.com          # usando resolver específico
dig -x 8.8.8.8                    # reverso
host exemplo.com                  # versão simplificada
resolvectl status                 # qual DNS estou usando (Linux)
```

O `+trace` é excelente para aprender: ele mostra cada salto da raiz até o autoritativo.""",
    },
    {
        "titulo": "Permissões no Linux: chmod, chown e o que os números significam",
        "categoria": "Linux",
        "tags": ["linux", "permissões", "fundamentos"],
        "resumo": "Se você decora '755' sem saber de onde vem, esse post resolve em cinco minutos.",
        "data": "2026-07-10",
        "corpo": """Permissão errada é uma das causas mais comuns de vazamento em servidor. E o modelo é simples quando você vê a lógica.

## Lendo o ls -l

```
-rwxr-xr--  1 allan devs  4096 Jul 10 14:22 script.sh
```

O primeiro caractere é o tipo: `-` arquivo, `d` diretório, `l` link simbólico.

Os nove seguintes são três grupos de três:

```
rwx        r-x        r--
dono       grupo      outros
```

- **r** (read, 4) — ler o conteúdo
- **w** (write, 2) — modificar
- **x** (execute, 1) — executar; em diretório, entrar

## De onde vem o número

Some os valores de cada grupo:

```
rwx = 4+2+1 = 7
rw- = 4+2   = 6
r-x = 4+0+1 = 5
r-- = 4     = 4
```

Então `755` = `rwxr-xr-x`: dono faz tudo, resto lê e executa.

Valores que você vai usar sempre:

```
600  rw-------  arquivo privado (chave, credencial)
644  rw-r--r--  arquivo comum de leitura pública
700  rwx------  diretório privado
755  rwxr-xr-x  diretório ou script padrão
```

## Permissão em diretório é diferente

Isso confunde muita gente:

- **r** no diretório — listar os nomes dos arquivos
- **w** no diretório — criar e **apagar** arquivos dentro
- **x** no diretório — entrar e acessar arquivos pelo caminho

Consequência importante: **w num diretório permite apagar um arquivo mesmo sem ter permissão de escrita no arquivo**. Quem manda é o diretório.

## Comandos

```
chmod 600 ~/.ssh/id_ed25519       # notação octal
chmod u+x script.sh               # adiciona execução ao dono
chmod go-w arquivo                # tira escrita de grupo e outros
chmod -R 755 /var/www             # recursivo (cuidado)
chown allan:devs arquivo          # muda dono e grupo
chgrp devs arquivo                # muda só o grupo
```

Cuidado com `chmod -R` — ele aplica `x` em arquivos que não deveriam ser executáveis. O jeito certo de tratar árvores mistas é aplicar 755 apenas nos diretórios e 644 apenas nos arquivos, separadamente com `find`.

## Bits especiais

**SUID (4000)** — o programa roda com privilégio do dono, não de quem executou. É assim que `passwd` consegue escrever em `/etc/shadow`. Também é vetor clássico de escalada de privilégio.

```
find / -perm -4000 -type f 2>/dev/null   # lista todos SUID
```

Rode isso num servidor e revise. Binário SUID que não deveria estar ali é sinal de comprometimento.

**SGID (2000)** — em diretório, arquivos criados herdam o grupo do diretório. Ótimo para pastas compartilhadas.

**Sticky bit (1000)** — em diretório com escrita pública, só o dono do arquivo pode apagá-lo. É por isso que `/tmp` é `1777`.

## umask

Define a permissão padrão de arquivos novos, por subtração:

```
umask          # mostra o valor atual, normalmente 022
umask 077      # arquivos novos ficam 600, diretórios 700
```

Em servidor com múltiplos usuários, `umask 077` no perfil evita vazamento por descuido.""",
    },
    {
        "titulo": "SSH seguro: chaves, hardening e boas práticas",
        "categoria": "Linux",
        "tags": ["linux", "ssh", "servidor"],
        "resumo": "Porta 22 aberta na internet recebe milhares de tentativas por dia. Configure certo uma vez.",
        "data": "2026-07-09",
        "corpo": """Coloque um servidor na internet e em minutos começam as tentativas de login automatizadas. Senha não aguenta isso. Chave aguenta.

## Gerando a chave

```
ssh-keygen -t ed25519 -C "allan@notebook"
```

Use **Ed25519**, não RSA. É mais rápido, a chave é menor e a segurança é melhor. Só use RSA de 4096 bits se o servidor for muito antigo.

**Coloque uma passphrase.** Se roubarem o arquivo da chave privada sem ela, seus servidores são do ladrão. Para não digitar toda hora, use o agente:

```
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

## Instalando no servidor

```
ssh-copy-id -i ~/.ssh/id_ed25519.pub usuario@servidor
```

Manual, se preferir: cole o conteúdo do `.pub` em `~/.ssh/authorized_keys` do servidor. Permissões importam — o SSH recusa se estiverem frouxas:

```
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/id_ed25519
```

## Hardening do sshd

Em `/etc/ssh/sshd_config`, os ajustes essenciais: desative login de root, desative autenticação por senha, permita só autenticação por chave pública, restrinja os usuários que podem entrar, limite tentativas e reduza o tempo de espera no login.

**Antes de reiniciar, teste a configuração e mantenha a sessão atual aberta:**

```
sudo sshd -t                      # valida sintaxe
sudo systemctl restart sshd
```

Abra uma **segunda** sessão para confirmar que ainda entra. Se travar, você ainda tem a primeira para corrigir. Já perdi acesso a servidor por pular esse passo.

## Trocar a porta ajuda?

Mudar de 22 para outra porta alta reduz muito o ruído nos logs, mas não é segurança de verdade — um scan encontra em segundos. Faça pela higiene dos logs, não pela proteção.

## fail2ban

Bane IPs depois de N falhas de autenticação:

```
sudo apt install fail2ban
```

Configure a jail do sshd com poucas tentativas permitidas e um tempo de banimento razoável, depois confira o status com `fail2ban-client status sshd`.

## O arquivo ~/.ssh/config

Facilita muito a vida: dá para nomear cada servidor com um apelido curto, fixar usuário, porta e chave específica, e até encadear acesso através de um bastion com `ProxyJump`. Depois disso, basta digitar o apelido para conectar.

## Verificando a impressão digital

Na primeira conexão o SSH pergunta se você confia na chave do host. **Não aceite no automático.** Peça a fingerprint por outro canal e compare antes de confirmar.

Se a fingerprint mudar depois, o SSH bloqueia e avisa. Ou trocaram o servidor, ou tem alguém no meio.""",
    },
    {
        "titulo": "Lendo logs no Linux: journalctl, auth.log e o que procurar",
        "categoria": "Linux",
        "tags": ["linux", "logs", "monitoramento"],
        "resumo": "Todo incidente deixa rastro. O problema é saber onde olhar e o que filtrar.",
        "data": "2026-07-08",
        "corpo": """Log só serve se for lido. Vale conhecer os arquivos principais e ter alguns filtros na ponta da língua.

## Onde ficam

```
/var/log/auth.log      autenticação (Debian/Ubuntu)
/var/log/secure        autenticação (RHEL/Fedora)
/var/log/syslog        geral do sistema
/var/log/kern.log      kernel
/var/log/dmesg         boot e hardware
/var/log/nginx/        acesso e erro do nginx
```

Em sistemas com systemd, o journal centraliza tudo.

## journalctl

```
journalctl -f                       # acompanhar em tempo real
journalctl -u ssh -n 100            # últimas 100 linhas do serviço
journalctl -p err -b                # só erros deste boot
journalctl --since "1 hour ago"
journalctl --since "2026-07-08 09:00" --until "2026-07-08 10:00"
journalctl -k                       # mensagens do kernel
journalctl _UID=1000                # de um usuário específico
```

O `-p` aceita: emerg, alert, crit, err, warning, notice, info, debug.

## Caçando tentativas de invasão

Vale ter na ponta da língua alguns filtros sobre o `auth.log`: contar falhas de senha agrupadas por IP para achar quem está tentando força bruta, listar os logins que deram certo, revisar todo uso de `sudo`, e listar os nomes de usuário inexistentes que os bots ficam testando.

Esse último é interessante: mostra quais nomes os bots tentam. Se aparecer um nome real da sua equipe, alguém fez reconhecimento antes.

## Sinais de alerta

- **Login bem-sucedido depois de uma rajada de falhas do mesmo IP** — força bruta que deu certo
- **Acesso em horário improvável** para aquele usuário
- **IP de país onde ninguém da equipe está**
- **Criação de usuário** que ninguém pediu
- **Alteração em `/etc/passwd`, `/etc/sudoers` ou `authorized_keys`**
- **Log com buraco** — período sem nenhuma entrada costuma significar apagamento
- **Serviço reiniciando sozinho** em horário estranho

## Quem está logado agora

```
who              # sessões ativas
w                # sessões + o que estão rodando
last -20         # histórico de logins
lastb -20        # tentativas que falharam
```

## Logs no nginx

Vale a pena analisar o log de acesso regularmente: veja quais IPs mais acessam, procure por tentativas de path traversal e assinaturas de scanner automático (como `../` ou busca por `.env`), e separe as respostas com erro 5xx para investigar falhas do próprio serviço.

## Não deixe o log só no servidor

Se o invasor tem root, ele apaga o rastro. Duas medidas simples:

1. **Envie os logs para fora** — outro host, um coletor central.
2. **Torne append-only** em pontos críticos com o atributo `+a` via `chattr`. Nem root apaga sem antes remover o atributo — e essa remoção também vira evidência.""",
    },
    {
        "titulo": "Firewall no Linux: ufw e nftables na prática",
        "categoria": "Linux",
        "tags": ["linux", "firewall", "rede"],
        "resumo": "Regra padrão é negar tudo na entrada. O resto é exceção justificada.",
        "data": "2026-07-07",
        "corpo": """A postura correta de firewall é simples de enunciar: **bloqueie toda entrada por padrão e libere só o necessário**. A dificuldade está em não se trancar para fora.

## ufw — o caminho fácil

```
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'ssh'
sudo ufw allow 443/tcp comment 'https'
sudo ufw enable
sudo ufw status verbose
```

**Libere o SSH antes do enable.** Sério. É o erro clássico que custa um acesso ao console de recuperação do provedor.

Regras mais específicas permitem, por exemplo, liberar uma porta de banco de dados só para a faixa de IP da rede interna, ou aplicar um limite de tentativas (`ufw limit`) numa porta sensível como a do SSH para conter força bruta.

## nftables — controle real

O nftables substituiu o iptables. A estrutura básica de uma tabela `inet filter` define três correntes — entrada, encaminhamento e saída — cada uma com uma política padrão. Para a entrada, a política padrão deve ser `drop`, com exceções explícitas: aceitar conexões já estabelecidas, aceitar tráfego da interface local, aceitar ICMP básico, e liberar as portas de serviço (22, 80, 443) com limite de taxa nas mais sensíveis.

Depois de escrever o arquivo, aplique com `nft -f` e confira com `nft list ruleset`.

A regra que aceita conexões com estado "established/related" é o coração do firewall com estado: respostas ao tráfego que **você** iniciou passam automaticamente. Sem ela, nada funciona.

## Rede de segurança contra auto-bloqueio

Antes de aplicar regra nova num servidor remoto, uma tática simples: agende em background um comando que desfaz tudo (`nft flush ruleset`) daqui a 5 minutos, e cancele esse agendamento manualmente assim que confirmar que a regra nova não te trancou para fora. Se você se trancar, é só esperar os 5 minutos.

## Conferindo o que está aberto

```
sudo ss -tulpn                    # portas em escuta e processos
sudo lsof -i -P -n | grep LISTEN
```

Rode isso e questione cada linha. Serviço que escuta em `0.0.0.0` sem necessidade deveria escutar em `127.0.0.1`.

## Erro comum

Bloquear ICMP inteiro "por segurança". Isso quebra o **Path MTU Discovery** e causa conexões que travam misteriosamente em transferências grandes. Permita ICMP — no mínimo os tipos 3 e 4.""",
    },
    {
        "titulo": "Hardening de servidor Linux: checklist do primeiro dia",
        "categoria": "Linux",
        "tags": ["linux", "servidor", "hardening"],
        "resumo": "Uma sequência de passos para aplicar antes de colocar qualquer coisa em produção.",
        "data": "2026-07-06",
        "corpo": """VPS recém-criada está exposta desde o primeiro minuto. Esta é a ordem que eu sigo.

## 1. Atualize tudo

```
sudo apt update && sudo apt full-upgrade -y
sudo reboot   # se atualizou kernel
```

Ative atualizações de segurança automáticas com o pacote `unattended-upgrades`.

## 2. Crie um usuário sem privilégio

Crie um usuário comum, adicione ao grupo sudo, copie sua chave pública para o `authorized_keys` dele e ajuste as permissões (`700` na pasta `.ssh`, `600` no arquivo). Teste o login com esse usuário **numa segunda sessão** antes de seguir.

## 3. Trave o SSH

Já detalhado em outro post — o essencial: desative login de root, desative senha, permita só chave pública, e restrinja os usuários autorizados.

## 4. Firewall

Bloqueie entrada por padrão, libere SSH, 80 e 443.

## 5. fail2ban

Instale e ative o serviço para banir automaticamente IPs com excesso de tentativas.

## 6. Desligue o que não usa

Liste os serviços rodando com `systemctl list-units --type=service --state=running` e desative o que não precisa. Menos serviço rodando, menos superfície de ataque. Questione cada um.

## 7. Ajuste parâmetros do kernel

No arquivo de configuração do sysctl, vale endurecer parâmetros de rede: ativar filtro de rota reversa, desativar redirecionamentos ICMP e roteamento por origem, ativar SYN cookies contra flood, restringir o acesso ao `dmesg` e proteger hardlinks e symlinks. Aplique com `sysctl --system`.

## 8. Mantenha o AppArmor / SELinux ligado

Desligar "porque estava dando erro" é jogar fora uma camada inteira de contenção. Aprenda a criar a exceção específica em vez de desligar tudo.

## 9. Backup testado

Backup que nunca foi restaurado não é backup. Regra 3-2-1: três cópias, dois meios, uma fora do local. **Uma cópia offline**, porque ransomware criptografa o backup em rede junto.

Agende uma restauração de teste. Trimestral, no mínimo.

## 10. Auditoria periódica

A ferramenta Lynis (`lynis audit system`) dá uma nota de segurança e uma lista de sugestões priorizadas. Não siga tudo cegamente — entenda cada item antes de aplicar.

## O que revisar todo mês

- Pacotes desatualizados
- Usuários e chaves em `authorized_keys`
- Portas em escuta (`ss -tulpn`)
- Binários SUID novos
- Tarefas no cron que você não criou
- Espaço em disco (log cheio derruba serviço)""",
    },
    {
        "titulo": "Python para automatizar tarefas de segurança",
        "categoria": "Python",
        "tags": ["python", "automação", "scripts"],
        "resumo": "Três scripts curtos que resolvem problemas reais do dia a dia.",
        "data": "2026-07-05",
        "corpo": """Python é a linguagem franca de segurança porque a biblioteca padrão já cobre quase tudo que você precisa.

## Verificando se uma senha vazou, sem enviá-la

A API do Have I Been Pwned usa **k-anonymity**: você manda só os 5 primeiros caracteres do hash SHA-1 da senha, recebe todos os sufixos que batem com esse prefixo e compara localmente. A senha em si nunca sai da sua máquina — só um pedacinho do hash.

```python
import hashlib
import requests

def senha_vazada(senha: str) -> int:
    sha1 = hashlib.sha1(senha.encode("utf-8")).hexdigest().upper()
    prefixo, sufixo = sha1[:5], sha1[5:]

    resp = requests.get(
        f"https://api.pwnedpasswords.com/range/{prefixo}",
        headers={"Add-Padding": "true"},
        timeout=10,
    )
    resp.raise_for_status()

    for linha in resp.text.splitlines():
        hash_sufixo, _, contagem = linha.partition(":")
        if hash_sufixo == sufixo:
            return int(contagem)
    return 0
```

Repare no uso de `getpass` na hora de ler a senha do terminal — evita que ela apareça na tela e fique salva no histórico do shell.

## Gerador de senha decente

Um gerador de senha forte combina letras, números e símbolos, exigindo pelo menos um de cada categoria, e um gerador de frase-senha sorteia várias palavras de uma lista e as junta com separador.

```python
import secrets
import string

def gerar_senha(tamanho: int = 20) -> str:
    alfabeto = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
    while True:
        senha = "".join(secrets.choice(alfabeto) for _ in range(tamanho))
        if (any(c.islower() for c in senha)
                and any(c.isupper() for c in senha)
                and any(c.isdigit() for c in senha)):
            return senha
```

Use **`secrets`, nunca `random`.** O módulo `random` usa o Mersenne Twister, que é previsível: com algumas saídas observadas, dá para reconstruir o estado interno e prever todas as próximas. `secrets` usa a fonte de entropia do sistema operacional.

## Monitor de certificado TLS

Um script simples que abre uma conexão TLS com o servidor, lê o certificado apresentado e calcula quantos dias faltam até o vencimento, usando os módulos `socket` e `ssl` da biblioteca padrão. Rodar isso via cron contra a lista de domínios que você mantém evita ser surpreendido por certificado vencido em produção.

## Regras que valem para qualquer script de segurança

- **`secrets` para tudo que precisa ser imprevisível** — senhas, tokens, IDs de sessão
- **`hmac.compare_digest`** para comparar segredos, evitando ataque de temporização
- **Timeout em toda requisição de rede** — sem isso o script trava para sempre
- **Nunca hardcode credencial** — use variável de ambiente ou um cofre""",
    },
    {
        "titulo": "Hash de senha em Python: o jeito certo com Argon2 e bcrypt",
        "categoria": "Python",
        "tags": ["python", "criptografia", "senha"],
        "resumo": "Se o seu código usa SHA-256 para guardar senha, ele tem um problema sério.",
        "data": "2026-07-04",
        "corpo": """Erro que ainda aparece muito em código real: calcular `hashlib.sha256(senha.encode()).hexdigest()` e guardar isso como "hash da senha".

SHA-256 foi projetado para ser **rápido**. Uma GPU moderna calcula bilhões desses hashes por segundo. Contra senha, velocidade é exatamente o defeito.

Funções de hash de senha são deliberadamente **lentas e caras em memória**.

## Argon2 — a escolha padrão hoje

Vencedor da Password Hashing Competition e recomendação atual do OWASP.

```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)

# no cadastro
hash_armazenado = ph.hash(senha)

# no login
def verificar(hash_armazenado: str, senha: str) -> bool:
    try:
        ph.verify(hash_armazenado, senha)
    except (VerifyMismatchError, VerificationError):
        return False

    if ph.check_needs_rehash(hash_armazenado):
        salvar_novo_hash(ph.hash(senha))
    return True
```

O `check_needs_rehash` é ótimo: quando você aumentar os parâmetros no futuro, os hashes antigos migram sozinhos conforme os usuários fazem login.

## bcrypt — alternativa consolidada

```python
import bcrypt

hash_armazenado = bcrypt.hashpw(senha.encode(), bcrypt.gensalt(rounds=12))
ok = bcrypt.checkpw(senha.encode(), hash_armazenado)
```

Duas pegadinhas do bcrypt:

1. **Trunca em 72 bytes.** Senha maior tem o excedente ignorado silenciosamente.
2. **Byte nulo termina a string** em algumas implementações.

Se precisar suportar senha longa, faça um pré-hash da senha com SHA-256 e codifique em base64 antes de passar para o bcrypt.

## Salt e pepper

O **salt** é um valor aleatório único por senha, guardado junto do hash. Argon2 e bcrypt fazem isso automaticamente — você não precisa gerenciar. O salt impede rainbow tables e faz duas senhas iguais terem hashes diferentes.

O **pepper** é um segredo global, guardado fora do banco (variável de ambiente, HSM). Se o banco vazar mas o pepper não, os hashes ficam inúteis. Na prática, você aplica um HMAC com o pepper sobre a senha antes de passar pro Argon2.

## Comparação em tempo constante

Ao comparar tokens ou assinaturas, nunca use `==`:

```python
import hmac

# ERRADO — vaza informação pelo tempo de execução
if token_recebido == token_esperado: ...

# CERTO
if hmac.compare_digest(token_recebido, token_esperado): ...
```

O `==` para na primeira diferença. Medindo o tempo com precisão, um atacante descobre o token caractere por caractere.

## Checklist de autenticação

- Argon2id, ou bcrypt com custo ≥ 12
- Mínimo de 12 caracteres, **sem** exigir composição de símbolos
- Bloqueie senhas conhecidas de vazamentos (HIBP)
- Rate limit no login, por IP **e** por conta
- Mensagem de erro genérica — "usuário ou senha inválidos", nunca "esse usuário não existe"
- Tempo de resposta parecido para usuário inexistente e senha errada
- Invalide todas as sessões ao trocar a senha""",
    },
    {
        "titulo": "Validando entrada em Python: SQL injection e path traversal",
        "categoria": "Python",
        "tags": ["python", "owasp", "validação"],
        "resumo": "Duas falhas antigas que continuam derrubando aplicação nova. Ambas têm solução de uma linha.",
        "data": "2026-07-03",
        "corpo": """A regra que resume tudo: **nunca construa comando com string vinda do usuário.**

## SQL injection

Montar a consulta com f-string, colando o valor do usuário direto no texto do SQL, é o erro clássico. Com um email malicioso contendo aspas e uma condição sempre verdadeira, a consulta retorna todos os usuários do banco; com um `; DROP TABLE`, o estrago é maior.

```python
# CERTO — consulta parametrizada
cursor.execute("SELECT * FROM users WHERE email = ?", (email,))

# PostgreSQL (psycopg)
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

A diferença é fundamental: com parâmetro, o banco recebe a estrutura da consulta e os dados **separadamente**. O valor nunca é interpretado como SQL, não importa o que contenha.

Com SQLAlchemy, use `text()` com parâmetros nomeados (`:email`) e passe um dicionário — nunca monte a string com f-string por dentro do `text()`, isso anula a proteção.

**Nomes de tabela e coluna não podem ser parametrizados.** Se precisar deles dinâmicos, valide contra uma lista fechada de valores permitidos antes de usar. Allowlist, nunca blocklist.

## Path traversal

Abrir um arquivo concatenando o nome vindo do usuário direto num caminho (`f"/var/uploads/{nome}"`) permite que um valor como `../../etc/passwd` escape da pasta e sirva qualquer arquivo do sistema.

```python
from pathlib import Path

BASE = Path("/var/uploads").resolve()

def baixar(nome: str) -> bytes:
    destino = (BASE / nome).resolve()
    if not destino.is_relative_to(BASE):
        raise ValueError("caminho fora do diretório permitido")
    if not destino.is_file():
        raise FileNotFoundError(nome)
    return destino.read_bytes()
```

O `.resolve()` é essencial: ele normaliza `..` **e** segue links simbólicos. Sem ele, um symlink dentro da pasta escapa da verificação.

O `is_relative_to` existe desde o Python 3.9. Em versões antigas, compare os caminhos como string com o separador de diretório no final.

## Injeção de comando

Rodar `os.system` ou `subprocess.run` com `shell=True` sobre uma string montada com dado do usuário permite injetar `;`, `|`, `&&` e `$()` — comandos extras executados pelo shell.

```python
# CERTO — lista de argumentos, sem shell
import subprocess
subprocess.run(["ping", "-c", "1", host], check=True, timeout=10)
```

Com lista e `shell=False` (o padrão), não existe shell para interpretar metacaracteres. O `host` é passado como argumento literal.

## Validação com Pydantic

Para APIs, deixe a validação declarativa: defina os campos com seus tipos e restrições (tamanho mínimo, faixa de valores, formato de email) na própria classe do modelo, e use um `field_validator` para regras extras, como rejeitar senhas muito comuns.

## Princípios

1. **Allowlist supera blocklist** — defina o que é válido, rejeite o resto
2. **Valide no servidor** — validação no cliente é usabilidade, não segurança
3. **Tipagem forte na fronteira** — converta e valide na entrada, confie depois
4. **Erro genérico para fora, detalhe no log** — não entregue estrutura interna na mensagem de erro""",
    },
    {
        "titulo": "Segredos em Python: nunca versione credencial",
        "categoria": "Python",
        "tags": ["python", "segredos", "boas práticas"],
        "resumo": "Chave de API commitada no Git é encontrada por bots em minutos.",
        "data": "2026-07-02",
        "corpo": """Existem bots varrendo o GitHub em tempo real atrás de credenciais em commits novos. O tempo médio entre publicar uma chave de API e ela ser usada por alguém é medido em **minutos**.

E o pior: apagar num commit posterior não resolve. O histórico do Git guarda tudo.

## O jeito errado

Definir a chave de API ou a senha do banco como constante direto no código-fonte (`API_KEY = "sk-proj-abc123..."`) é o erro mais comum — e o mais fácil de vazar sem perceber.

## Variáveis de ambiente

```python
import os

API_KEY = os.environ["API_KEY"]  # falha alto e cedo se faltar
DEBUG = os.environ.get("DEBUG", "false").lower() == "true"
```

Prefira `os.environ[...]` a `.get()` para segredos obrigatórios. Melhor a aplicação não subir do que subir sem credencial e falhar de forma estranha depois.

## Arquivo .env no desenvolvimento

Com a biblioteca `python-dotenv`, basta chamar `load_dotenv()` no início da aplicação para carregar um arquivo `.env` local com as variáveis de ambiente — que **nunca** deve ser versionado.

**Primeira coisa a fazer**, antes mesmo de criar o `.env`: adicione `.env` e `.env.*` ao `.gitignore`, com uma exceção para um `.env.example` com valores falsos, que documenta o que a aplicação precisa.

## Configuração tipada com Pydantic

O pacote `pydantic-settings` permite declarar as configurações da aplicação como uma classe tipada que lê automaticamente do `.env`, usando o tipo `SecretStr` para os campos sensíveis.

O `SecretStr` evita o acidente mais comum: o segredo vazar num log ou num traceback. Ele só aparece quando você pede explicitamente o valor real.

## Se você já commitou

1. **Revogue a credencial imediatamente.** Esse é o passo que importa. Considere-a comprometida.
2. Gere uma nova.
3. Só depois limpe o histórico, se quiser — com `git filter-repo` ou BFG. Mas note: se o repositório é público, alguém já pode ter clonado.

A ordem importa. Limpar o histórico primeiro e revogar depois deixa uma janela aberta.

## Prevenção automática

A ferramenta `detect-secrets`, integrada como hook do `pre-commit`, varre o conteúdo de cada commit em busca de padrões de credencial antes que ele saia da sua máquina. Ative também o **push protection** nas configurações do repositório no GitHub.

## Em produção

- **Docker** — passe por variável de ambiente ou Docker secrets, nunca no `ENV` do Dockerfile (fica na imagem)
- **Kubernetes** — Secrets com criptografia em repouso ativada, ou External Secrets Operator
- **Nuvem** — AWS Secrets Manager, Google Secret Manager, Azure Key Vault
- **Self-hosted** — HashiCorp Vault ou SOPS com age

Rotacione credenciais periodicamente e revogue tudo que pertencia a quem saiu da equipe.""",
    },
    {
        "titulo": "Backup e ransomware: a regra 3-2-1 explicada",
        "categoria": "Usuários",
        "tags": ["backup", "ransomware", "básico"],
        "resumo": "Backup só existe depois que você conseguiu restaurar. Antes disso é esperança.",
        "data": "2026-07-01",
        "corpo": """Ransomware criptografa seus arquivos e cobra resgate. A defesa que funciona não é antivírus — é backup que o ransomware não alcança.

Sim, porque a primeira coisa que ransomware moderno faz é procurar e criptografar backups: drives de rede mapeados, pastas sincronizadas na nuvem, HD externo que ficou plugado.

## A regra 3-2-1

- **3 cópias** dos dados (o original mais duas)
- **2 mídias diferentes** (disco interno + externo, ou disco + nuvem)
- **1 cópia fora do local** — outra casa, cofre, nuvem

A versão moderna é **3-2-1-1-0**: uma cópia **imutável ou offline**, e **zero erros** na verificação de restauração.

O "offline" é o que derrota ransomware. HD externo que você conecta uma vez por semana, faz o backup e desconecta é imune a criptografia remota.

## Sincronização não é backup

Dropbox, Google Drive e OneDrive **sincronizam**. Se um arquivo for criptografado ou apagado na sua máquina, a alteração propaga para a nuvem.

Eles ajudam por causa do **versionamento** — dá para restaurar versões anteriores. Mas isso tem prazo (30 dias no plano gratuito costuma ser o padrão) e restaurar milhares de arquivos um a um é sofrimento.

Use versionamento como rede de segurança, não como backup principal.

## Ferramentas

**Restic** — código aberto, criptografia ponta a ponta, deduplicação, funciona com quase qualquer armazenamento. O fluxo básico é inicializar o repositório, rodar `restic backup` apontando para as pastas desejadas, e usar `restic forget --prune` com uma política de retenção para não acumular snapshots para sempre.

**Borg** — parecido, excelente deduplicação, ideal para Linux.

**Time Machine** (macOS) e **Histórico de Arquivos** (Windows) — nativos e suficientes para o básico. Um HD externo dedicado resolve.

## Automatize e verifique

Backup manual é backup que você esquece. Coloque no cron ou no agendador de tarefas.

E **teste a restauração**. Marque no calendário: a cada três meses, escolha alguns arquivos aleatórios e restaure de verdade. Já vi backup rodando havia dois anos com o diretório errado configurado.

## O que priorizar

Nem tudo precisa de backup. Faça uma lista honesta:

- Documentos e fotos pessoais — insubstituíveis, prioridade máxima
- Código e projetos — se está no Git remoto, já tem cópia
- Configurações do sistema — economizam horas de retrabalho
- Filmes e jogos — recuperáveis, não gaste espaço

## Se for atingido por ransomware

1. **Desconecte da rede imediatamente** — cabo e Wi-Fi. Isso limita a propagação.
2. **Não desligue a máquina** — algumas variantes deixam a chave na memória, e ela some no desligamento.
3. **Não pague.** Financia o crime e não garante nada — parte das vítimas que paga não recebe a chave, ou recebe um decodificador quebrado.
4. **Identifique a variante** no projeto No More Ransom — que reúne decodificadores gratuitos para várias famílias de ransomware.
5. **Registre ocorrência** e preserve evidências.
6. **Restaure do backup offline**, depois de formatar a máquina.""",
    },
    {
        "titulo": "Engenharia social: por que o elo mais fraco é sempre humano",
        "categoria": "Usuários",
        "tags": ["engenharia social", "básico", "phishing"],
        "resumo": "Nenhum firewall impede alguém de simplesmente pedir a senha educadamente e com boa desculpa.",
        "data": "2026-06-30",
        "corpo": """A empresa mais protegida tecnicamente ainda cai em incidente porque alguém atendeu o telefone e confiou na pessoa errada. Engenharia social é a técnica de manipular pessoas para obter acesso ou informação, e ela funciona porque explora comportamentos humanos normais e desejáveis: educação, vontade de ajudar, respeito à autoridade, medo de causar problema.

## Os princípios que os golpistas exploram

**Reciprocidade.** Fazem um pequeno favor antes de pedir algo grande. "Deixa eu te ajudar a resolver esse chamado" antes de pedir sua senha "para confirmar".

**Prova social.** "Todo mundo do seu setor já preencheu esse formulário." Ninguém quer ser o único a recusar.

**Autoridade.** Uma voz confiante, um crachá, um vocabulário técnico convincente, o nome de um cargo alto. As pessoas obedecem a quem parece ter autoridade, mesmo sem verificar.

**Urgência e escassez.** "Preciso disso em cinco minutos ou o sistema vai cair." Pressa é inimiga da verificação.

**Simpatia.** Golpistas são treinados para parecer agradáveis, interessados em você, com quem você se identifica.

## Técnicas comuns

**Pretexting** — criar uma história falsa e coerente para justificar o pedido. "Sou do suporte de TI, houve uma falha e preciso confirmar seu login para restaurar seu acesso."

**Baiting** — deixar um pendrive "esquecido" no estacionamento da empresa, rotulado como "Folha de pagamento 2026". Curiosidade natural leva a pessoa a conectar no computador do trabalho.

**Tailgating** — seguir alguém de perto pela porta de acesso controlado, contando com a gentileza de quem segura a porta.

**Quid pro quo** — ligar se passando por suporte técnico oferecendo ajuda não solicitada, em troca de acesso remoto ou credencial.

**Vishing e phishing dirigido** — detalhados em outros posts, mas vale lembrar que a ligação ou mensagem convincente costuma vir depois de um trabalho de reconhecimento nas suas redes sociais.

## Como as informações públicas viram munição

Um perfil no LinkedIn revela seu cargo, seu chefe, seus colegas e a estrutura da empresa. Uma foto de aniversário no Instagram revela nome de familiares. Um post reclamando do sistema da empresa revela qual sistema é. Cada peça pública é um tijolo para um pretexto convincente.

Reveja a privacidade das suas redes e pense: essa informação, combinada com outras, ajudaria alguém a se passar por conhecido meu?

## Defesas que funcionam

1. **Verifique por um canal diferente.** Ligação pedindo algo sensível? Desligue e ligue de volta usando um número que você já tinha, não um que a pessoa te passou.
2. **Desconfie de urgência.** Pedido genuíno raramente exige decisão em sessenta segundos.
3. **Confirme identidade antes de conceder acesso**, mesmo que pareça grosseiro. Segurança de verdade às vezes soa desconfiada.
4. **Tenha um processo formal** para pedidos sensíveis — reset de senha, liberação de acesso — que não dependa só da palavra de quem pede.
5. **Treine, não puna.** Quem cair num teste de phishing interno deve aprender, não ser humilhado — senão as próximas vítimas escondem o erro em vez de reportar.

## Se você suspeitar que caiu

Reporte imediatamente, mesmo com vergonha. Quanto antes a equipe de segurança souber, menor a janela de dano. Vergonha custa minutos; silêncio custa muito mais.""",
    },
]
