# Propuesta 19 — Una versión estable y una de pruebas

**Estado:** propuesta, vuelta 108. Sin construir. Es el punto 4 de
`docs/beta-cerrada.md` desarrollado entero.

## 0. La respuesta corta

- **Dos aplicaciones de Fly con el mismo código.** La de hoy,
  `ancient-violet-678`, pasa a ser **pruebas**: se sigue desplegando sola con cada
  empujón, como desde la vuelta 81. Una nueva, **estable** (aquí `vektor-beta`),
  sólo cambia cuando Yago **promociona** una versión.
- **Promocionar es pulsar un botón en GitHub** («Promocionar a estable», en la
  pestaña *Actions*). Por defecto publica en estable **el mismo commit que está
  sirviendo pruebas en ese momento**, o sea lo que Yago acaba de probar. Construye
  la imagen desde ese commit, la despliega con las mismas comprobaciones que hoy
  (una sola máquina y `/salud` tres veces) y deja una etiqueta `estable-…` en git
  para poder volver atrás.
- **La app de escritorio de los testers apunta a estable**, y la de Yago puede
  seguir apuntando a pruebas: son **dos instalaciones distintas** («Vektor» y
  «Vektor Pruebas»), que salen del mismo workflow.
- **`VEKTOR_DOMINIO` es de cada aplicación, y nunca cruza de una a otra.** Si
  estable estrena dominio propio, `VEKTOR_DOMINIO` va en estable. Pruebas no lo
  lleva, o lleva el suyo, **nunca el de estable**: la redirección mandaría a los
  navegadores a otra máquina, o sea a otro mundo.
- **Coste:** una máquina más y una IPv4 dedicada más. Unos **5 $ al mes** con la
  tarifa de hoy (máquina `shared-cpu-1x` de 512 MB y IPv4 dedicada a 2 $).
  Compruébalo en <https://fly.io/docs/about/pricing/> antes de crearla.

## 1. Por qué hace falta

Hoy cada empujón a la rama de trabajo se despliega solo (vuelta 81) en la misma
dirección que abriría un tester. Desde la vuelta 93, además, **su pestaña se
recarga sola** con lo nuevo en cuanto la página dice que se puede. Para Yago eso
es perfecto. Para una beta es malo: un tester que juega un martes por la tarde
recibe lo que se esté construyendo ese martes, bancos en rojo incluidos, y un
feedback de «esto no va» no se puede cruzar con nada.

Lo que se quiere es lo contrario para los testers: **una versión que no se mueve
salvo que alguien decida moverla**, y que cuando se mueva se sepa a qué commit.

## 2. Las dos aplicaciones

| | Pruebas | Estable |
|---|---|---|
| Aplicación de Fly | `ancient-violet-678` (la de hoy) | `vektor-beta` (nueva; el nombre que esté libre) |
| Se despliega | Sola, con cada empujón a `main` o `claude/**` | Sólo al promocionar |
| Workflow | `desplegar.yml` (el de hoy) | `promocionar.yml` (nuevo) |
| Token de GitHub | `FLY_API_TOKEN` (el de hoy) | `FLY_API_TOKEN_ESTABLE` (nuevo) |
| Dirección | `https://ancient-violet-678.fly.dev/` | `https://vektor-beta.fly.dev/`, o un dominio propio |
| App de escritorio | «Vektor Pruebas» (la de Yago) | «Vektor» (la de los testers) |
| Buzón de feedback | Su webhook y su clave | Otro webhook (otro canal) y otra clave |
| Región | `cdg`, como hoy | `cdg` hasta la propuesta 17 |

Tres cosas que salen de la tabla y conviene decir:

- **Mismo `fly.toml` para las dos.** La única línea que cambia es `app`, y eso
  lo pisa `flyctl deploy --app vektor-beta`. Todo lo demás (una sola máquina,
  512 MB, `auto_stop_machines = 'off'`, la comprobación de `/salud`) vale igual
  para las dos, y dos ficheros serían dos sitios donde una regla se queda a medias.
- **Un token por aplicación.** El que se guarda hoy en GitHub sale de
  `fly tokens create deploy`, que es **de una aplicación**: no despliega en otra.
  Por eso hacen falta dos secretos y no uno.
- **Cada una su memoria.** Las salas, el buzón y el contador viven en el proceso
  (vuelta 59), así que un código de sala de pruebas no existe en estable, y
  viceversa. Es lo correcto: son dos mundos a propósito. Cuando llegue Supabase
  (propuesta 20), las dos escriben en el mismo proyecto con una columna `entorno`.

## 3. Promocionar una versión

### 3.1 Qué es «una versión»

**Un commit.** No una imagen de Docker: las imágenes de Fly viven en el registro de
cada aplicación, y copiar una de una aplicación a otra depende de permisos del
registro que no merece la pena atar. Construir otra vez desde el mismo commit da
el mismo juego, porque el build es determinista (Vite pone la huella del
contenido en el nombre de cada fichero, y `/salud` la publica desde la vuelta 61).
Tarda unos minutos más que copiar, y a cambio es un mecanismo que ya existe.

Para que «el commit que sirve pruebas» se pueda saber sin adivinarlo, **`/salud`
tiene que decir su commit**. Hoy dice los nombres de los ficheros del build, que
identifican el contenido pero no el commit. Son tres líneas:

```dockerfile
# En la etapa «servir» del Dockerfile:
ARG VEKTOR_COMMIT=desconocido
ENV VEKTOR_COMMIT=$VEKTOR_COMMIT
```

`net/servidor.mjs` añade `commit: process.env.VEKTOR_COMMIT` a la respuesta de
`/salud`, y `desplegar.yml` pasa `--build-arg VEKTOR_COMMIT=${{ github.sha }}`.
Con eso, `/salud` de pruebas dice exactamente qué commit tiene delante Yago.

### 3.2 El botón

Un workflow nuevo, `.github/workflows/promocionar.yml`, que **sólo se lanza a mano**
(`workflow_dispatch`). El borrador:

```yaml
name: Promocionar a estable

on:
  workflow_dispatch:
    inputs:
      commit:
        description: 'Commit que publicar. Vacío = el que sirve pruebas ahora mismo.'
        required: false

concurrency:
  group: fly-estable
  cancel-in-progress: false

jobs:
  promocionar:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: write          # para dejar la etiqueta estable-…
    env:
      FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_ESTABLE }}
      APP: ${{ vars.FLY_APP_ESTABLE }}   # vektor-beta
    steps:
      - name: Qué commit
        id: que
        run: |
          c="${{ inputs.commit }}"
          if [ -z "$c" ]; then
            c="$(curl -fsS https://ancient-violet-678.fly.dev/salud | jq -r .commit)"
          fi
          test -n "$c" && test "$c" != "null" && test "$c" != "desconocido"
          echo "commit=$c" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v5
        with:
          ref: ${{ steps.que.outputs.commit }}
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: Desplegar en estable
        run: flyctl deploy --remote-only --ha=false --app "$APP" --build-arg VEKTOR_COMMIT=${{ steps.que.outputs.commit }}
      # Aquí van las dos comprobaciones de desplegar.yml tal cual:
      # una sola máquina, y /salud tres veces con la misma máquina.
      # Y una más: que /salud de estable diga el commit pedido.
      - name: Etiqueta para poder volver
        run: |
          t="estable-$(date -u +%Y%m%d-%H%M)"
          git tag "$t" ${{ steps.que.outputs.commit }}
          git push origin "$t"
```

Tres decisiones del borrador:

- **Por defecto, lo que sirve pruebas ahora mismo.** El gesto de Yago es «esto
  que acabo de probar, a estable», y ése es el único caso en que no hay que
  copiar ningún número. Para publicar otra cosa se escribe el commit.
- **La etiqueta es la historia de estable.** `git tag -l 'estable-*'` dice qué se
  publicó y cuándo, sin entrar en Fly. Volver atrás es lanzar el mismo botón con
  el commit de la etiqueta anterior (§3.3).
- **La aprobación es que lo lance Yago.** Sólo quien tiene permiso de escritura
  en el repositorio puede lanzar un `workflow_dispatch`. Si algún día hay más
  gente con ese permiso, GitHub deja exigir un aprobador con un *environment*
  (`environment: estable` y *Required reviewers*), pero en un repositorio
  privado eso pide un plan de pago de GitHub: no vale la pena mientras sea Yago
  solo.

### 3.3 Volver atrás

Dos formas, según la prisa:

- **Con calma** (unos minutos): *Actions* → *Promocionar a estable* → *Run
  workflow* → el commit de la etiqueta anterior (`git tag -l 'estable-*'`).
- **Ya** (menos de un minuto, sin construir): Fly guarda las imágenes de cada
  despliegue de la aplicación.
  ```sh
  fly releases -a vektor-beta --image          # la lista, con la imagen de cada una
  fly deploy -a vektor-beta --ha=false --image registry.fly.io/vektor-beta@sha256:<la huella de antes>
  ```
  Fly no promete guardar las imágenes para siempre: una que lleva tiempo sin
  desplegarse puede desaparecer del registro. Para ir más atrás, la vía con calma.

### 3.4 Qué se comprueba antes de pulsar

La regla de siempre: **la batería entera en verde** en el commit que se promociona
(la pasa Claude antes de cada subida) y **la prueba de Yago en pruebas**. El
workflow no pasa los bancos: necesitan un navegador con WebGL por software y horas
de máquina, y ya se pasaron antes de subir.

## 4. La app de escritorio de los testers

La app **no contiene el juego**: abre una dirección (vuelta 91). La dirección está
escrita en dos sitios que tienen que decir lo mismo: `tauri.conf.json` (qué abre)
y `capabilities/principal.json` (a qué origen le deja hablar con la ventana: la
pantalla completa, F11, ESC, Salir). Si no coinciden, la app juega pero **sin
pantalla completa ni ESC de la ventana**, sin un error en ninguna pantalla (§3,
«La dirección vieja sigue siendo la de la app, para siempre»).

**Los testers instalan una app que apunta a estable.** Hoy ningún tester tiene
instalada la 0.5.0 (la beta no ha empezado), así que no hay nada que migrar: la
primera que reciban ya apunta a estable.

**Y Yago conserva la suya apuntando a pruebas, sin desinstalar nada.** El
workflow del `.exe` (`escritorio.yml`) compila **dos variantes** en la misma
ejecución, cambiando cuatro campos antes de compilar:

| Campo | «Vektor» (testers) | «Vektor Pruebas» (Yago) |
|---|---|---|
| `productName` | Vektor | Vektor Pruebas |
| `identifier` | `com.flicklab.vektor` | `com.flicklab.vektor.pruebas` |
| `url` de la ventana | la de estable | `https://ancient-violet-678.fly.dev/` |
| `remote.urls` de la capacidad | la de estable | la de pruebas |

Con identificadores distintos, Windows las trata como dos programas: dos iconos,
dos entradas en *Aplicaciones*, y cada una con su `localStorage` (son orígenes
distintos, así que los ajustes no se comparten). La publicación rodante lleva los
dos instaladores: `Vektor-instalador.exe`, que es el que se manda en la carta, y
`Vektor-Pruebas-instalador.exe`. Un banco como `escritorio97` comprueba que en
cada variante la `url` y la capacidad dicen el mismo origen.

### 4.1 ¿Dirección de Fly o dominio propio?

**Con dominio propio desde el primer día, mejor**, aunque ninguna de las dos
opciones obliga a reinstalar después:

- **Si la app apunta a `https://vektor-beta.fly.dev/`** y más adelante llega un
  dominio, se pone `VEKTOR_DOMINIO` en estable: los navegadores se mudan al
  dominio con un 302 y **la app no** (se la reconoce por su marca y no se la
  redirige, vuelta 97), y sigue funcionando en `fly.dev` porque la misma
  aplicación sirve los dos nombres. El único precio: la app y el navegador
  quedan en orígenes distintos y guardan ajustes por separado.
- **Si la app apunta a un dominio propio** (por ejemplo `juego.<tu dominio>`), el
  día que haya que mover estable a otra aplicación de Fly, o repartirla por
  regiones (propuesta 17), se cambia a dónde apunta el DNS y **ningún tester se
  entera**. Es la dirección que no depende de cómo se llame la máquina.

Por el principio de la vuelta 58 (§0.1 de `decisions.md`), el dominio va con el
DNS en modo **sólo DNS** (en Cloudflare, la nube gris) hacia la **IPv4 dedicada**
de estable. Nunca con el proxy de Cloudflare delante.

## 5. `VEKTOR_DOMINIO`, en cada una

`VEKTOR_DOMINIO` hace una sola cosa: si una petición llega por otro nombre, la
manda con un 302 al nombre bueno. Hay cuatro excepciones: `/salud`, `localhost` y
las IP, las salas y la app. Con dos aplicaciones:

- **Estable**: `VEKTOR_DOMINIO=juego.<tu dominio>` cuando exista el dominio.
  Mientras no exista, sin poner.
- **Pruebas**: sin poner, o su propio dominio (`pruebas.<tu dominio>`).
- **Nunca** el dominio de estable en pruebas, ni al revés. La redirección cambia
  de máquina, y con la máquina cambia de mundo: un enlace de sala creado en una
  llevaría a una sala vacía en la otra. Es el fallo de la vuelta 59 (dos mundos
  para el mismo código) por la puerta del DNS.

## 6. Lo que tiene que hacer Yago

Con `flyctl` instalado y la sesión iniciada (`fly auth login`), desde cualquier
carpeta. Sustituye `vektor-beta` si el nombre está cogido; el que elijas va
también en la variable de GitHub del paso 4.

```sh
# 1. Crear la aplicación estable (sin desplegar nada todavía)
fly apps create vektor-beta

# 2. Su IPv4 propia (principio de la vuelta 58) y su IPv6
fly ips allocate-v4 -a vektor-beta
fly ips allocate-v6 -a vektor-beta

# 3. Un token de despliegue sólo para ella, de un año
fly tokens create deploy -a vektor-beta -x 8760h
```

4. En GitHub → *Settings* → *Secrets and variables* → *Actions*:
   - *Secrets* → *New repository secret*: `FLY_API_TOKEN_ESTABLE` = el token del paso 3.
   - *Variables* → *New repository variable*: `FLY_APP_ESTABLE` = `vektor-beta`.

5. Los secretos del buzón, **otro canal** para no mezclar lo de los testers con lo
   de pruebas:
   ```sh
   fly secrets set --stage -a vektor-beta \
     VEKTOR_FEEDBACK_WEBHOOK='https://discord.com/api/webhooks/<id>/<token>' \
     VEKTOR_FEEDBACK_CLAVE="<otra clave larga>"
   ```
   (`--stage` porque la aplicación todavía no tiene máquina: se aplican en el
   primer despliegue.)

6. **El primer despliegue**: *Actions* → *Promocionar a estable* → *Run workflow*,
   con el campo vacío.

7. **Si hay dominio**, una vez:
   ```sh
   fly certs add juego.<tu dominio> -a vektor-beta
   fly ips list -a vektor-beta     # las dos direcciones para el DNS
   ```
   En el DNS: un registro `A` con la IPv4 y un `AAAA` con la IPv6, **sin proxy**.
   Cuando `fly certs show juego.<tu dominio> -a vektor-beta` diga que el
   certificado está emitido:
   ```sh
   fly secrets set -a vektor-beta VEKTOR_DOMINIO=juego.<tu dominio>
   ```
   (Éste sin `--stage` a propósito: reinicia la máquina, y conviene hacerlo antes
   de invitar a nadie.)

Lo que **no** tiene que hacer: tocar `fly.toml`, crear volúmenes ni cambiar la
aplicación de pruebas. La de pruebas sigue exactamente igual.

## 7. Lo que hay que construir (cuando se apruebe)

1. `commit` en `/salud`, con el argumento de build en el `Dockerfile` y en
   `desplegar.yml` (§3.1).
2. `.github/workflows/promocionar.yml` (§3.2), con las comprobaciones de
   `desplegar.yml` copiadas y la del commit añadida.
3. Las dos variantes del `.exe` en `escritorio.yml`, con su comprobación de que
   la `url` y la capacidad coinciden (§4).
4. `escritorio/README.md` y la carta de invitación con el enlace del instalador
   de estable.
5. En `docs/despliegue-fly.md`, una sección «Dos aplicaciones» con el §6 de aquí.

Es una vuelta corta: nada de esto toca el juego, y lo único que se mide es que
`/salud` de cada aplicación diga el commit que tiene que decir.

## 8. Riesgos

- **Olvidar un secreto en estable.** El buzón de estable no funciona hasta que
  tenga su webhook y su clave. La página de leer contesta 404, y eso no se
  distingue de «no hay clave». Se comprueba con el `curl` de
  `docs/beta-cerrada.md` («El buzón, en concreto») contra la dirección de estable.
- **Promocionar algo que no se ha probado.** Con el campo vacío se publica lo que
  sirve pruebas en ese momento. Si entró un empujón mientras Yago probaba, lo que
  se publica es ese empujón y no lo que probó. El workflow escribe en su resumen
  qué commit publicó y su mensaje. Para ir a tiro fijo, se copia el commit de
  `/salud` de pruebas antes de probar y se pega en el campo.
- **Dos apps en el PC de un tester por error.** Si alguien recibe el instalador
  de pruebas, juega en pruebas. La carta enlaza uno solo, y la ventana de pruebas
  se llama «Vektor Pruebas» en su barra de título.
