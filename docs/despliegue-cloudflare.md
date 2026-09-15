# Poner Vektor en internet (Cloudflare) — paso a paso

Esto es para **Yago**, no para un programador. Cada paso dice qué ves, dónde
haces clic y qué tiene que pasar. Si algo no coincide con lo que dice aquí,
para y cuéntamelo: es mejor preguntar que adivinar en la pantalla de una
cuenta con tarjeta.

Al final tendrás una dirección tipo `https://vektor.<algo>.workers.dev` que le
puedes pasar a un amigo, y un enlace por partida tipo
`https://vektor.<algo>.workers.dev/duelo/MQXTUV`.

---

## 0. Lo que ya está hecho, para que sepas dónde estamos

El código de esta vuelta ya está escrito y probado **sin conectarse a
Cloudflare**: `wrangler` —el programa de Cloudflare— sabe correr el servidor
entero en tu ordenador, sin cuenta y sin internet, y ahí es donde se han pasado
las pruebas. Lo que falta es exclusivamente **publicarlo**, y para eso hace
falta una cuenta.

Lo que se publica son dos cosas a la vez, en un único sitio:

- **el juego** (los ficheros que hoy ves con `npm run dev`), y
- **las salas de 1v1**, una por código de partida.

---

## 1. Crear la cuenta de Cloudflare

1. Ve a **https://dash.cloudflare.com/sign-up**.
2. Pon tu correo y una contraseña. **No** hace falta tarjeta para este paso.
3. Cloudflare te manda un correo de verificación: ábrelo y pulsa el enlace.
4. Al entrar te va a insistir en **añadir un dominio** («Add a site»). **No
   añadas ninguno.** No hace falta para esto y es lo que empuja hacia planes de
   pago que aquí no pintan nada. Si te deja saltarlo, sáltalo; si no, cierra el
   asistente y ve directo al menú de la izquierda.
5. En el menú de la izquierda busca **Compute (Workers)** —según el mes se llama
   «Workers & Pages» o «Compute»—. Ahí es donde vive todo lo nuestro.
6. La primera vez te pedirá elegir un **subdominio**: es la parte de en medio de
   `https://vektor.ESTO.workers.dev`. Elige algo corto y tuyo (`flicklab`, por
   ejemplo). **Esto no se puede cambiar luego sin rehacerlo**, así que piénsalo
   diez segundos.

---

## 2. Qué plan activar (y por qué)

**Ninguno. El plan gratuito de Workers vale.** Esto es una corrección a lo que
te dije en la vuelta 44, donde puse que Durable Objects exigía los 5 $/mes: los
Durable Objects **con respaldo SQLite** entran en el plan gratuito, y ése es
exactamente el que usa Vektor (está escrito en `wrangler.jsonc`, en la línea
`new_sqlite_classes`). Los del respaldo antiguo sí son de pago, y de ahí venía
mi error.

Lo que cabe en el plan gratuito, con los números de esta vuelta:

| Límite gratuito (al día) | Lo que significa para Vektor |
|---|---|
| 100.000 peticiones | **~4,6 horas de 1v1 al día**, sumando todas las partidas |
| 13.000 GB-s de ejecución | ~29 horas de sala encendida: no es lo que se agota primero |
| 5 GB guardados | cero: una partida vive en memoria y muere con la sala |

De dónde sale lo de 4,6 horas: cada jugador manda 60 mensajes por segundo —uno
por paso del mundo—, o sea 120 entre los dos. Cloudflare cuenta **20 mensajes
como una petición**, así que son 6 peticiones por segundo de partida. 100.000
entre 6 son 16.666 segundos, que son 4 horas y 37 minutos. Cuando se agota, deja
de funcionar hasta el día siguiente; no te cobra nada por sorpresa.

**Cuándo pasarse al plan de pago** (Workers Paid, **5 $/mes**): cuando 4,6 horas
al día se os queden cortas. Incluye 1 millón de peticiones al mes —unas **46
horas de 1v1**— y a partir de ahí cuesta 0,15 $ por millón de peticiones y
12,50 $ por millón de GB-s, que en la práctica son **menos de 1 $ por cada 100
horas de más**. O sea: el salto real son los 5 $ de entrada, y lo de arriba es
calderilla.

**Mi recomendación: empieza gratis.** Se activa el de pago en dos clics el día
que haga falta, y no hay que tocar ni una línea de código para cambiar.

> Los números de arriba son los de la fecha de esta vuelta. Los pone Cloudflare
> y los puede cambiar; si te vas a gastar dinero, mira antes la página de
> precios de Durable Objects.

---

## 3. Publicarlo

Hay dos caminos. **El primero es mejor y te lo recomiendo**, aunque lo pediste
del segundo modo.

### Camino A — lo publicas tú, sin crear ninguna clave (recomendado)

Esto es más seguro que cualquier token, porque **no se crea ninguna clave**: tu
ordenador habla con Cloudflare por una ventana del navegador y el permiso se
queda ahí. También es menos pasos que el camino B.

Necesitas tener el proyecto en tu ordenador y Node instalado (lo que ya usas
para `npm run dev`). En la carpeta del proyecto:

```
git pull
npm install
npx wrangler login
```

`wrangler login` abre el navegador y te pide confirmar. Dale a **Allow**. Se
cierra solo. Entonces:

```
npm run deploy
```

Tarda menos de un minuto y termina escribiendo la dirección. Ésa es la del
juego. La del duelo es esa misma con `/duelo` al final.

Para publicar un cambio más adelante es siempre la misma línea: `npm run deploy`
(que construye el juego y lo sube, en ese orden).

### Camino B — lo publico yo, con un token del mínimo permiso

Si prefieres no tocar la terminal, hazme un token. Tres cosas importantes: que
tenga **un solo permiso**, que esté **atado a tu cuenta y sólo a ella**, y que
**caduque**.

**B.1 — Crear el token**

1. En el panel, arriba a la derecha, pulsa tu **icono de perfil** →
   **Profile** (o ve directo a **https://dash.cloudflare.com/profile/api-tokens**).
2. Pestaña **API Tokens** → botón **Create Token**.
3. Abajo del todo, **Create Custom Token** → **Get started**. (No cojas la
   plantilla «Edit Cloudflare Workers»: trae media docena de permisos que aquí
   no hacen falta.)
4. **Token name**: `vektor-despliegue`.
5. **Permissions** — añade **una sola fila**:

   | | |
   |---|---|
   | **Account** | **Workers Scripts** | **Edit** |

   Ése es el permiso que publica el código, crea el Durable Object y sube los
   ficheros del juego. Nada más. En concreto: **no** le des acceso a Zone, ni a
   DNS, ni a R2, ni a KV, ni a «Account Settings: Edit», ni a nada de
   facturación.
6. **Account Resources**: **Include** → tu cuenta, **sólo la tuya**. No dejes
   «All accounts».
7. **Client IP Address Filtering**: déjalo vacío.
8. **TTL** (caducidad): ponle **una semana**. Es de sobra para esto, y si se
   perdiera por el camino deja de valer solo.
9. **Continue to summary** → **Create Token**.
10. Te enseña el token **una única vez**. No me lo pegues aquí: sigue con B.2.

También necesito el **Account ID**, que **no es un secreto**: está en el panel
de **Compute (Workers)**, en la columna de la derecha, bajo «Account details».
Ése sí me lo puedes pegar en el chat sin problema.

**B.2 — Hacérmelo llegar sin pegármelo en la conversación**

Lo que escribes aquí se queda escrito en el historial de la conversación. Un
token de despliegue no debe acabar ahí. El sitio correcto es **la configuración
del entorno**, que es un almacén de secretos aparte del que yo leo variables
pero que no se imprime en ningún sitio:

1. Ve a **https://claude.ai/code** y abre la **configuración del entorno** que
   usa esta sesión (el mismo sitio donde se configuró el repositorio).
2. Busca **Environment variables** / **Variables de entorno**.
3. Añade dos:
   - `CLOUDFLARE_API_TOKEN` = el token que acabas de crear.
   - `CLOUDFLARE_ACCOUNT_ID` = tu Account ID.
4. Guarda y **dímelo por aquí con un «ya está»** —sin el valor—. La sesión tiene
   que arrancar de nuevo para verlas, así que puede que haga falta empezar una
   sesión nueva; te lo digo yo en cuanto lo compruebe.

Entonces yo hago `npm run deploy` y te paso la dirección.

**B.3 — Cuando terminemos**

Vuelve a **Profile → API Tokens** y **borra** `vektor-despliegue` (los tres
puntos → **Delete**). Un token que ya no se usa es sólo riesgo. Si más adelante
hace falta otra vez, se crea otro en dos minutos. Y si en algún momento sospechas
de él, ése mismo botón lo anula al instante en todas partes.

---

## 4. Jugar

1. Abre `https://vektor.<tu-subdominio>.workers.dev/duelo`.
2. En el centro sale el **código de la partida** y el **enlace**. Dale a
   **copiar**.
3. Pásale el enlace a la otra persona por donde quieras.
4. Los dos hacéis clic en la pantalla para capturar el ratón. Ya estáis dentro.

WASD para moverte, espacio para saltar, C para agacharte, clic izquierdo para
disparar, Escape para soltar el ratón y volver al menú.

En pantalla verás la **mira**, tu **vida** abajo a la izquierda y, si te matan,
**ABATIDO** con la cuenta para reaparecer. Nada más: no hay munición, ni armas
que elegir, ni puntuación todavía.

**F3** enseña los números de red —el RTT de verdad, las correcciones, cuánto
rebobina el servidor cada disparo— y unos mandos para estropear la conexión a
propósito. Vienen apagados y así deben quedarse para jugar: los mandos **empeoran
tu propia conexión**, no la del rival. Son para medir.

**Son dos jugadores por sala.** Si entra un tercero con el mismo código se le
dice que está llena y se queda fuera; los dos de dentro no se enteran.

**Un código distinto es otra partida distinta**, aunque la abráis en el mismo
segundo. Si no os veis, lo primero que hay que mirar es si el código de arriba a
la izquierda es el mismo en las dos pantallas.

---

## 5. Lo que esto todavía no es

El duelo es **sólo movimiento y disparo**. No hay menú, ni armería, ni dianas,
ni bomba, ni puntuación, ni marcador. No hay cuentas ni nicks: eres `p1` o `p2`.
La sala desaparece cuando salís los dos, y con ella la partida.

Y una advertencia honrada sobre trampas: el servidor manda —no puedes
teletransportarte ni darte vida—, pero con un servidor autoritativo siguen
siendo posibles el aimbot y el ver a través de paredes. Entre amigos da igual.
El día que esto sea público, no.
