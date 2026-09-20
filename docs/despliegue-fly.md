# Poner Vektor en Fly.io, paso a paso

Guía para publicar el juego **y** las partidas en Fly.io, con una **IPv4
dedicada**. Escrita sin dar nada por sabido: si algo parece obvio, está puesto
igual.

El porqué de mudarse está en `docs/propuestas/03-servidor-con-ip-propia.md`, y en
una frase: las operadoras españolas anulan IPs **enteras** de Cloudflare por
orden de LaLiga, ignorando el nombre del dominio, así que los días de partido cae
la página igual que la partida. Aquí compramos una dirección que **no comparte
nadie**.

---

## 0. Lo que ya está hecho

Todo menos crear la cuenta y escribir cinco comandos.

- **El servidor ya sirve las dos cosas.** `net/servidor.mjs` era el huésped de
  sobremesa —una sola partida, sin páginas— y ahora encamina por código de sala,
  lleva un reloj por sala y sirve los ficheros del juego. Es el mismo fichero que
  usas en local con `npm run net`.
- **La partida no ha cambiado ni una línea.** `net/partida.js` no tiene código de
  red: da igual quién le ponga el cable. Es la razón de que esta mudanza sea
  pequeña.
- **El cliente tampoco.** El navegador saca la dirección de la partida de la
  página en la que está, así que con la página y el servidor en el mismo sitio no
  hay ninguna dirección que configurar en ningún lado.
- **Está verificado contra los bancos de siempre**, sin tocar una aserción. El
  detalle, al final de esta guía.
- **Los ficheros de configuración están escritos:** `Dockerfile`, `.dockerignore`
  y `fly.toml`, en la raíz del repositorio.
- **Cloudflare sigue en pie.** No se ha borrado nada de `worker/`: se queda como
  respaldo unas semanas, tal como quedó decidido.

Lo que falta es tuyo porque lleva tarjeta: crear la cuenta y desplegar.

---

## 1. Instalar la herramienta de Fly

Fly se maneja con un programa de línea de comandos que se llama `flyctl`. En tu
ordenador, abre una terminal y pega esto:

**En Mac o Linux:**

```sh
curl -L https://fly.io/install.sh | sh
```

**En Windows** (en PowerShell):

```powershell
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Al terminar te dirá que añadas una carpeta al `PATH`. Hazlo, cierra la terminal y
abre una nueva. Para comprobar que ha ido bien:

```sh
fly version
```

Si responde con un número de versión, está listo. Si dice «command not found»,
cierra y abre la terminal otra vez; si sigue, es lo del `PATH`.

---

## 2. Crear la cuenta

```sh
fly auth signup
```

Se abre el navegador. Puedes entrar con GitHub o con correo. Al terminar, la
terminal te dirá que estás dentro.

Fly **pide una tarjeta desde el principio**, aunque el gasto sea de unos pocos
dólares: es su forma de evitar abusos. No te cobra por registrarte.

Si ya tenías cuenta, es `fly auth login`.

---

## 3. Elegir el nombre de la aplicación

El nombre decide la dirección gratuita: `vektor.fly.dev`, por ejemplo. Tiene que
estar libre en todo Fly, así que puede que `vektor` esté cogido.

Abre `fly.toml` (está en la raíz del repositorio) y cambia la primera línea:

```toml
app = 'vektor'
```

por el nombre que quieras, en minúsculas y con guiones si hace falta. Por
ejemplo `vektor-flicklab`.

> **No hace falta dominio propio todavía**, igual que no hizo falta con
> `workers.dev`. Y ojo a una diferencia que juega a favor: en Cloudflare no
> controlabas la IP, y aquí **sí** — si algún día esta dirección se ganara un
> bloqueo, se suelta y se pide otra con dos comandos, sin tocar el enlace que le
> hayas pasado a nadie.

---

## 4. Crear la aplicación (sin desplegar todavía)

Desde la carpeta del repositorio:

```sh
fly apps create vektor-flicklab
```

—con el nombre que hayas elegido, el mismo que pusiste en `fly.toml`—.

Si dice que el nombre está cogido, elige otro y **cámbialo también en
`fly.toml`**. Los dos tienen que decir lo mismo.

---

## 5. La IPv4 dedicada — **este paso es el motivo de toda la mudanza**

Por defecto Fly te da una IPv4 **compartida** con otras aplicaciones suyas, y eso
es exactamente el problema del que venimos huyendo: si un vecino se gana un
bloqueo, te lo comes tú. Hay que pedir la dedicada **a mano**:

```sh
fly ips allocate-v4 --app vektor-flicklab
```

Te dirá que cuesta unos **2 $ al mes** y te pedirá confirmación. Acepta.

De propina, y gratis:

```sh
fly ips allocate-v6 --app vektor-flicklab
```

Para comprobar qué tienes:

```sh
fly ips list --app vektor-flicklab
```

Tiene que salir una línea de tipo **`v4`** que **no** diga `shared`. Si pone
`shared`, no has hecho este paso y **no hemos resuelto nada**: la mudanza entera
se apoya en esta línea.

Si por lo que sea te quedó también la compartida, se suelta con
`fly ips release <la-dirección>`.

---

## 6. Desplegar — **con una sola máquina**

```sh
fly deploy --ha=false
```

**El `--ha=false` no es opcional, y es el error que ya nos costó una prueba.**
Por defecto `fly deploy` crea **dos** máquinas por alta disponibilidad, y aquí
eso rompe el juego: las salas viven en la memoria del proceso, así que dos
máquinas son **dos mundos** para el mismo código de partida. El reparto de carga
manda a cada jugador a una, las dos crean su sala con ese código, los dos se
creen el primer jugador y **no se ven**.

Si ya habías desplegado sin esa opción, se arregla en un comando:

```sh
fly scale count 1
```

Esto construye el juego y lo sube. La primera vez tarda unos minutos —está
instalando y compilando dentro de una imagen—; las siguientes, bastante menos.

Cuando acabe:

```sh
fly status
```

Tiene que salir **una sola** máquina, en estado `started`. Si salen dos, vuelve
al `fly scale count 1` de arriba.

Y para ver si está viva de verdad, abre en el navegador:

```
https://vektor-flicklab.fly.dev/salud
```

Devuelve una línea de datos: **qué máquina contesta**, **qué build sirve**,
cuántas salas hay, cuántas ocupadas, cuántos jugadores y cuánto lleva encendido. Si eso responde, el
servidor está sirviendo.

**Y recárgalo tres o cuatro veces seguidas mirando el campo `maquina`.** Tiene
que ser **siempre el mismo**. Si cambia, hay más de una máquina y el duelo no va
a funcionar por mucho que la página cargue: `fly scale count 1`.

---

## 7. Jugar

- **El juego:** `https://vektor-flicklab.fly.dev/`
- **El duelo:** `https://vektor-flicklab.fly.dev/duelo` — se crea un código solo
  y la barra de direcciones se queda con el enlace que hay que pasar.

Funciona igual que en Cloudflare porque el cliente saca la dirección de la
partida de la página en la que está. No hay nada que configurar.

**Compruébalo desde España un día de partido.** Es la medida que importa y la
única que no se puede hacer desde ningún otro sitio.

---

## 8. Lo que cuesta

| | Al mes |
|---|---|
| Máquina `shared-cpu-1x` con 512 MB, encendida siempre | ~4 $ |
| **IPv4 dedicada** | **2 $** |
| Tráfico | ~1 $ por cada 100 horas de 1v1 |
| **Total realista** | **~6-7 $** |

De dónde salen los números del tráfico: cada jugador recibe 59-81 KB/s, así que
una partida de dos son unos **0,5 GB por hora**.

**Y se va el techo de las 4,6 horas al día** que tenía el plan gratuito de
Cloudflare. Allí el límite era de *peticiones* y los mensajes se facturaban 20 a
1; aquí se paga máquina y tráfico. Una partida cuesta 2,55 µs de CPU por paso
—el **0,015% de un núcleo**— y la misma máquina lleva decenas de salas a la vez.

Sobre la memoria: medido con 33 salas en memoria y una partida en marcha, el
proceso ocupa **93 MB**. Por eso `fly.toml` pide 512 MB y no 256: sobra sitio y
quedarse corto sería tirar a dos jugadores en mitad de una partida.

> Los precios son los de la fecha de esta vuelta y los pone Fly. Míralos en su
> página antes de gastar.

---

## 9. El día a día

| Qué quieres hacer | Qué escribes |
|---|---|
| Publicar un cambio | `fly deploy --ha=false` |
| Comprobar que sigue habiendo una sola máquina | `fly status` |
| Ver si está encendido | `fly status` |
| Comprobar que sirve lo último que subiste | abrir `/salud` y mirar `build` |
| Ver qué está pasando | `fly logs` |
| Reiniciarlo a mano | `fly apps restart vektor-flicklab` |
| Ver la factura | `fly dashboard` (se abre el navegador) |

**Lo que no tienes que hacer nunca:** actualizar un sistema operativo, renovar un
certificado, ni volver a levantar el proceso si se cae. El certificado de
`fly.dev` es automático, y si el proceso se muere Fly lo reinicia solo — hay
además una comprobación cada 30 segundos contra `/salud` para que no haga falta
que se muera del todo para que alguien se entere.

---

## 10. Cuando esto lleve semanas funcionando

Sólo entonces, y sin prisa:

1. **Retirar Cloudflare.** Borrar `worker/`, `wrangler.jsonc` y la dependencia de
   `wrangler`. Hasta ese día se queda donde está, que no estorba y es la red de
   seguridad.
2. **Dominio propio**, si apetece. No hace falta para nada de lo de arriba.

---

## 11. Cómo se ha verificado

El mismo listón que se exigió en la vuelta 47 al migrar a Cloudflare: **los
bancos de red de siempre, verdes contra el huésped nuevo y sin tocar una
aserción.** Se levantó el servidor de Node en el puerto 8787 —el que usaba
`wrangler dev`—, así que las suites corrieron literalmente sin cambiar una línea.

**271 aserciones verdes** en trece suites: `sala47`, `jugable48`, `fondo49`,
`reaparecer50`, `aviso51`, `conexion51`, `abatido52`, `pausa53`, `pausa54`,
`pausa55`, `motor56`, `red45` y `tiro46`.

`sala47.mjs` es la que prueba el huésped y pasó entera: mismo código = misma
sala, códigos distintos = mundos que no se tocan, «mo-xtuv» normaliza a
`MQXTUV`, un código malo da 400 y uno bueno sin WebSocket da 426, el tercero de
un 1v1 se queda fuera, **una sala vacía no gasta reloj** —17 pasos en 5,4 s
vacía, contra los 328 que habría dado el reloj— **conservando el número de
paso**, y sin `VEKTOR_DEBUG` no hay forma de teletransportarse.

Y una cosa que cambió y conviene saber si alguna vez abres dos pestañas a mano
en local: **ahora hace falta el código en la dirección**
(`http://localhost:5199/duelo/MQXTUV`, o `...#MQXTUV` con `vite`). Antes el
servidor de sobremesa era una sola partida y el código se ignoraba; ahora
encamina por sala, como el de la nube, así que dos pestañas sin código abren cada
una la suya.

El detalle completo está en `docs/decisions.md` §58.

---

## 12. Que se despliegue solo al empujar un commit (vuelta 81)

Todo lo de arriba sigue siendo verdad y sigue funcionando a mano. Lo que esta
sección añade es que **no haga falta**: `.github/workflows/desplegar.yml`
despliega en cuanto llega un commit a la rama de trabajo, con el mismo
`flyctl deploy --ha=false` de siempre.

Esto **no es para ahorrarse un comando**, es para que publicar deje de depender
de que quien publica tenga el portátil delante y se acuerde del `--ha=false`.
Ese es el error que ya costó una prueba real (vuelta 59) y ahora, además de no
poder olvidarse, lo comprueba el propio despliegue.

### Lo único que hay que hacer, una vez

El servidor de GitHub necesita una credencial para hablar con Fly en tu nombre.
Se guarda en GitHub y **no se pega en ningún sitio más**: ni en un fichero del
repositorio, ni en un chat, ni en un correo. Quien tenga ese texto puede
desplegar en tu cuenta de Fly.

1. En tu ordenador, con `flyctl` ya instalado y con la sesión iniciada:

   ```sh
   fly tokens create deploy -x 8760h
   ```

   Suelta una línea larga que empieza por `FlyV1 ...`. Es un token **sólo de
   despliegue** —no da acceso a la facturación ni a borrar la aplicación— y
   **caduca en un año**, que es lo que pide el `-x 8760h`. Cópiala.

2. En el navegador, en el repositorio de GitHub:
   **Settings → Secrets and variables → Actions → New repository secret**.

3. **Name:** `FLY_API_TOKEN`. **Secret:** pega la línea. **Add secret**.

Ya está. A partir del siguiente empujón se despliega solo.

> Si la aplicación de Fly no se llama como dice `fly.toml`, hay una salida sin
> tocar código: en esa misma pantalla, pestaña **Variables**, crea
> `FLY_APP` con el nombre de verdad. Si no está, manda `fly.toml`.

### Qué hace exactamente cada despliegue

1. **Construye la imagen en los servidores de Fly** (`--remote-only`), que es
   el mismo `Dockerfile` de siempre: `npm ci`, `npm run build` y el servidor de
   Node sirviendo `dist/`.
2. **Despliega con `--ha=false`.**
3. **Comprueba que queda una sola máquina** y, si hubiera más, la corrige con
   `fly scale count 1` y lo dice. Es la regla de la vuelta 59 convertida en
   comprobación en vez de en una nota que hay que acordarse de leer.
4. **Pide `/salud` tres veces** y exige que el campo `maquina` sea el mismo las
   tres. Es la comprobación que la sección 6 te pedía hacer a mano, hecha por
   la máquina: la lista puede decir una y contestar dos.

Si algo de eso falla, el despliegue sale en rojo en la pestaña **Actions** con
el motivo escrito. Lo que **no** pasa nunca es que salga en verde sirviendo dos
mundos, que es el fallo que no da ningún error por su cuenta.

### Para volver a desplegar sin cambiar nada

Pestaña **Actions** → **Desplegar en Fly** → **Run workflow**. Sirve para
después de tocar algo en el panel de Fly, o para reintentar si se cayó la red a
mitad.

### Y lo que sigue estando en tu ordenador

El **editor** (`/editor/`) no entra en el despliegue a propósito: es una
herramienta de desarrollo y escribe ficheros en el repositorio. Para eso está
`Alchemist.bat` (Windows) o `Alchemist.command` (Mac y Linux), en la raíz del
proyecto: **doble clic y ya**. Trae lo último sin pisar tus mapas, instala lo
que haya cambiado si algo ha cambiado y abre el editor. Está explicado en el
`README.md`.
