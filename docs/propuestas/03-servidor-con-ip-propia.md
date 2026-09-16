# Propuesta 03 — Sacar la partida de Cloudflare a una IP propia

**Estado:** evaluado, **sin construir nada**. Pendiente de una comprobación que
hay que hacer desde España y en día de partido (§1.3), porque toda la propuesta
se apoya en una premisa y esa premisa no la puedo medir desde aquí.

**El hecho nuevo:** el bloqueo de IPs de Cloudflare que LaLiga ordena a las
operadoras españolas ha dejado `vektor.vektorbyflicklab.workers.dev`
inaccesible desde España **dos veces confirmadas**, en jornadas con partido. El
público objetivo de Vektor es español y los días de partido son exactamente
cuando la gente juega.

---

## 1. Primero, una corrección: el bloqueo también se lleva la página

El encargo daba por hecho que «el bloqueo afecta al tráfico de la partida en
tiempo real, no a servir la página en sí». **No es así, y conviene que quede
escrito porque cambia la forma de la solución.**

Las operadoras españolas están bloqueando **la IP entera, ignorando el SNI**. El
SNI es el nombre del dominio, que viaja en claro al abrir una conexión TLS: con
él se podría bloquear un dominio y dejar en paz al resto de los que comparten esa
IP. No se está usando. Lo que se bloquea es la dirección, y con ella **todo** lo
que haya detrás: la página, el WebSocket, la API, el favicon. La propia evidencia
lo confirma sin necesidad de más: lo que dejó de ser accesible fue el host
entero.

De ahí salen tres consecuencias:

### 1.1 No es un problema que se arregle desde dentro de Cloudflare

- **Un dominio propio no cambia nada.** `vektor.com` apuntando a Cloudflare
  resuelve a las mismas IPs compartidas. El bloqueo es por dirección, no por
  nombre.
- **Una IP dedicada en Cloudflare** existe, pero es producto de plan Enterprise.
  Fuera de escala para esto.
- **No es un fallo de Cloudflare que vayan a arreglar.** Es un pulso: otros
  proveedores —Vercel, Scaleway, Gcore, Twitch— han firmado acuerdos de
  colaboración con LaLiga y por eso sus bloqueos son quirúrgicos; Cloudflare no
  ha firmado, y por eso es el que se lleva los bloqueos de rango. Mientras eso
  siga así, estar en IP compartida de Cloudflare **es** el problema.

### 1.2 Y por tanto hay que mover la página también

Esto, que parece que empeora el trabajo, en realidad lo simplifica — y es la
mejor noticia de toda la evaluación. En la vuelta 47 se decidió **un solo
origen**: el mismo huésped sirve el juego y las salas, porque el cliente saca la
dirección del WebSocket **de la página en la que está** (`urlDeSala`, en
`net/sala-cliente.js`), así que no hay ninguna URL de servidor que configurar.

Si moviéramos sólo la partida, romperíamos esa decisión: habría que introducir
una dirección de servidor configurable, que es justo lo que la 47 quitó. Moviendo
**las dos cosas al mismo sitio**, la regla se conserva intacta y el cliente
**no cambia ni una línea**.

### 1.3 La premisa que hay que comprobar antes de mover nada

Toda la propuesta descansa en esto: **que una IP exclusiva en el proveedor
elegido no esté bloqueada desde España en día de partido**.

**Y esta comprobación no se puede hacer desde el repositorio, ni desde ninguna
máquina que no esté en una operadora española.** Se intentó (vuelta 58) y no es
una limitación de permisos: el bloqueo **lo aplica la operadora al tráfico de sus
propios clientes**. Un contenedor en la nube no es cliente de Movistar, así que
desde aquí todo responde siempre — incluido lo que en Madrid está caído. Un verde
medido desde fuera no dice «no está bloqueado», dice «no estoy donde se bloquea»,
que es el mismo error de instrumento de la vuelta 49 (medir desde fuera con
`evaluate` daba 33 u/s donde la sonda de dentro daba 6.5) y de la 57 (la pestaña
frenada medía el frenado). **La sonda tiene que estar donde ocurre el fenómeno.**

Así que el instrumento es una persona con una conexión española, y el
procedimiento es de navegador, no de consola. Tres pestañas, en este orden:

1. **Confirmar que el bloqueo está activo ahora**, en `hayahora.futbol`. Sin
   esto la prueba es a ciegas: un verde fuera de ventana de bloqueo no significa
   nada, que es la trampa de la vuelta 46 —cinco «100% de acuerdo» sobre cero
   disparos—.
2. **El control:** el despliegue actual, `vektor.vektorbyflicklab.workers.dev`.
   **Tiene que estar caído.** Si contesta con el bloqueo confirmadamente activo,
   entonces las dos caídas observadas tuvieron otra causa y esta propuesta entera
   está atacando el problema equivocado. El control va **antes** que la medida.
3. **La medida:** cualquier servicio público alojado en el candidato. Para
   empezar no hace falta desplegar nada ni pagar nada: lo que se está preguntando
   es si las operadoras tienen anulados los rangos del proveedor.

La lectura del punto 3 **no es simétrica**, y conviene saberlo antes de mirar:

- **Responde** → los rangos del proveedor no están anulados en bloque. Como la
  IP que se compraría además **no la comparte nadie**, una IP dedicada sólo puede
  estar mejor que la compartida que se acaba de probar. Verde, y del bueno.
- **No responde** → no condena la propuesta, sólo deja de resolverla: podría ser
  que esa IP compartida concreta se llevara un bloqueo por un vecino, que es
  exactamente el daño colateral del que se huye. Ahí sí hace falta la prueba cara
  —máquina mínima con IP dedicada— antes de decidir.

Si el control falla o la medida sale roja, **no se construye nada** y la decisión
vuelve a la mesa.

---

## 2. El criterio, en orden

Con el criterio nuevo delante, el orden de prioridades cambia respecto a la
evaluación de la vuelta 44:

1. **Inmunidad al bloqueo por IP compartida.** Innegociable. Una IP que no
   comparte nadie no puede ser daño colateral de la piratería de otro.
2. **Que se pueda repuntar en minutos.** Si algún día la IP cae igualmente, hay
   que poder cambiarla sin tocar código y sin esperar a nadie. Eso pide **dominio
   propio**, no un subdominio del proveedor.
3. **Mantenimiento que pueda llevar alguien que no programa.**
4. **Coste.**
5. **Latencia.** Va el último a propósito: el netcode está medido con **error de
   reconciliación cero hasta 300 ms de RTT**, y hoy jugáis a menos de 40. Hay
   margen de sobra.

---

## 3. Candidatos

### 3.1 Quedarse en Cloudflare

- **Inmunidad:** ninguna. Es el proveedor concreto que está en el pulso.
- **Coste:** 0 €.
- **Lo que cuesta de verdad:** el juego no está disponible en España las tardes
  de partido, que son las tardes en que se juega. Y no hay nada que se pueda
  hacer desde dentro.

Se descarta por el criterio 1, que es el que manda.

### 3.2 Fly.io — **el candidato**

- **Inmunidad:** una IP dedicada por aplicación (`fly ips allocate-v4`), que no
  comparte ningún otro cliente. Fly **no aparece** en ninguna de las listas de
  proveedores afectados, que son las de proxies/CDN compartidos: Cloudflare,
  Alicloud, Sucuri, Backblaze.
- **Certificados:** automáticos, incluida la renovación (`fly certs add`). Cero
  trabajo.
- **Reinicio si se cae:** la plataforma reinicia la máquina sola. Es su
  comportamiento por defecto, no algo que haya que montar.
- **Despliegue:** `fly deploy`. Es **la misma forma** que el `wrangler deploy` de
  hoy: un comando, y ya.
- **Región:** Madrid (`mad`) **está cerrada** desde la consolidación de regiones
  de 2025. La más cercana es París (`cdg`): unos +15 ms de RTT respecto a un
  servidor en España. Dentro del margen medido con mucho.
- **Riesgo de plataforma:** esa misma consolidación borró 17 regiones de golpe.
  Es un aviso: Fly cambia el mapa cuando le conviene. Lo que lo hace tolerable es
  que el huésped son ~250 líneas (§4) y mudarlo a otro sitio es un día, no una
  migración.

### 3.3 Un VPS con IP propia (Hetzner, OVH, Scaleway, DigitalOcean, o uno español)

- **Inmunidad:** la misma que Fly, y por la misma razón: la IP es tuya. Un VPS en
  **Madrid** además quita los +15 ms.
- **Lo que cambia es el mantenimiento, y cambia mucho.** Con un VPS te haces
  cargo del sistema operativo: actualizaciones de seguridad, el proceso como
  servicio (`systemd`) para que arranque solo al reiniciar, un servidor delante
  para los certificados (Caddy los saca y los renueva solo, pero hay que
  ponerlo), cortafuegos, claves SSH y algo que avise si se cae. Nada de eso es
  difícil; todo eso es **tuyo**, para siempre, y ninguna de esas tareas se parece
  a jugar ni a hacer un juego.
- **Coste:** el catálogo se ha movido mucho en 2026 —Hetzner subió precios dos
  veces y descatalogó el CX22—, así que el rango honesto hoy es **5-12 €/mes**
  según proveedor, más ~0,50 €/mes por la IPv4. No es más barato que Fly.

Es la opción correcta el día que la latencia importe de verdad o que Fly haga
algo que no guste. Hoy no compra nada que Fly no dé, y cobra en trabajo tuyo.

### 3.4 Railway, Render y compañía

Se descartan **por el criterio 1**. Son PaaS con entrada compartida: no dan una
IP exclusiva en su plan normal, que es justo lo que hay que comprar. Perfil de
coste y comodidad parecido a Fly, sin lo único que importa aquí.

---

## 4. Cuánto del trabajo ya hecho se reutiliza

Esto es lo que hace que la migración sea pequeña, y viene de una decisión de la
vuelta 47 que se tomó por otro motivo: **`net/partida.js` no tiene una sola línea
de red**. Un jugador entra con una función `enviar(texto)` y quién la implementa
no se sabe desde ahí. Ya hay dos huéspedes —Node y un Durable Object— corriendo
esa misma partida. Un tercero es el mismo ejercicio por tercera vez.

### Lo que no se toca

| | Líneas | |
|---|---|---|
| `src/config.js` | 3.104 | el mismo fichero en los dos lados |
| `src/game/movement.js` | 1.251 | ya corre en Node, sin `three` |
| `src/game/scenario.js` | 519 | |
| `src/game/player.js` | 345 | `hitPlayer` es matemática |
| `src/game/sight.js` | 57 | |
| `net/partida.js` | 684 | **la partida entera** |
| `net/protocolo.js`, `codigo.js`, `disparo.js`, `pose.js` | 312 | |
| **Servidor, reutilizado tal cual** | **6.272** | |
| `net/cliente.js`, `transporte.js`, `prueba.js`, `sala-cliente.js` | **1.744** | **cero cambios** |

El cliente no cambia porque `urlDeSala` deduce el servidor de la página, y la
página va a estar en el mismo sitio (§1.2).

### Lo que se borra

`worker/index.js` (55), `worker/sala.js` (154) y `wrangler.jsonc` (31): **240
líneas menos**. Con ellas se va la dependencia de `wrangler`.

### Lo que hay que construir

`net/servidor.mjs` son hoy **84 líneas** y le faltan tres cosas para ser un
servidor de verdad. Ninguna es de juego:

1. **Encaminar por código de sala.** Hoy el de sobremesa es **una sola partida**
   y el código lo ignora; en la nube eso lo resolvía `idFromName(código)` gratis.
   Aquí es un `Map<código, Partida>` que crea al entrar el primero y borra al
   salir el último. El modelo exacto está escrito en `worker/sala.js`. **~70
   líneas.**
2. **Un reloj para N salas.** Hoy hay un `programar()` para una. Con varias, un
   solo bucle de 60 Hz que recorre las salas ocupadas — conservando la regla de
   la 47: **una sala vacía no gasta reloj**. **~25 líneas.**
3. **Servir los ficheros del juego** (`dist/`), que es lo que hace hoy el binding
   de assets de Cloudflare, más la ruta `/duelo/<código>`. **~40 líneas**, o
   menos con una dependencia.

Más la configuración del despliegue: un `Dockerfile` y un `fly.toml`, entre los
dos **~30 líneas** que se escriben una vez.

### El número

**8.016 líneas se reutilizan sin tocarlas** —6.272 del servidor y 1.744 del
cliente— contra **~135 líneas nuevas** de huésped y ~30 de configuración. Es un
**98%**, y no es casualidad: es el dividendo de haber sacado la partida del
servidor en la vuelta 47.

Y hay una prueba de aceptación ya escrita: la vuelta 47 pasó **los bancos de las
vueltas 45 y 46 contra el Durable Object sin cambiar una aserción**. El listón de
esta migración es exactamente ése, contra el huésped nuevo: `red45`, `tiro46`,
`sala47`, `jugable48`, `reaparecer50`, `aviso51`, `conexion51`, `abatido52`, las
tres de pausas y `motor56`, verdes y sin tocar una línea de test. Si hace falta
tocar una aserción, es que se ha movido algo que no debía moverse.

---

## 5. El coste, en euros al mes

| | Hoy (Cloudflare) | Fly.io | VPS |
|---|---|---|---|
| Plataforma | 0 € | ~5 $/mes (plan mínimo, con 5 $ de crédito) | 5-12 €/mes |
| IP exclusiva | no existe en este plan | **2 $/mes** | ~0,50 €/mes |
| Máquina | — | ~2 $/mes | incluida |
| Tráfico | contado en peticiones | ~0,5 GB por hora de 1v1 → **~1 $ por 100 horas** | normalmente incluido |
| Dominio propio | — | **10-15 €/año**, o sea ~1 €/mes | igual |
| **Total realista** | **0 €** | **~5-6 $/mes** | **~6-13 €/mes** |

Dos cosas que no se ven en la tabla y que importan:

- **Se quita el techo de las 4,6 horas.** El límite gratuito de Cloudflare no es
  de CPU ni de tráfico: es de **peticiones**, y los mensajes entrantes se
  facturan 20:1, así que dos jugadores a 60 pasos por segundo gastan 6 peticiones
  por segundo de partida. 100.000 al día son **4 horas y 37 minutos de 1v1 al
  día, entre todos**. En Fly no se cuentan mensajes: se paga máquina y tráfico, y
  una partida cuesta 2,55 µs de CPU por paso —**0,015% de un núcleo**—. La misma
  máquina de 5 $ aguanta decenas de salas a la vez, y el primer límite que
  aparecería es el tráfico, a ~1 $ por cada 100 horas.
- **El coste de quedarse** no es 0 €: es el juego caído las tardes de partido,
  para el público al que va dirigido.

> Los precios de arriba salen de agregadores, no de las páginas de los
> proveedores, y el catálogo de 2026 se ha movido dos veces. Antes de pagar,
> míralos en la página del proveedor. Es el mismo aviso que ya lleva
> `docs/despliegue-cloudflare.md`.

---

## 6. Qué implica de mantenimiento para ti

Con **Fly**, en el día a día:

- **Publicar un cambio:** un comando, `fly deploy`. Exactamente la misma forma
  que el `npm run deploy` de hoy.
- **Si el proceso se cae:** se reinicia solo. No hay nada que hacer.
- **Certificados:** automáticos y se renuevan solos. No hay nada que hacer.
- **Sistema operativo:** no lo tocas. No hay nada que actualizar.
- **Lo que sí es tuyo, y es todo:** una tarjeta puesta, mirar la factura de vez
  en cuando, y renovar el dominio una vez al año.

Con un **VPS** se añaden, y son para siempre: actualizar el sistema, tener el
proceso como servicio para que vuelva solo al reiniciar la máquina, poner un
servidor delante para los certificados, cerrar el cortafuegos y enterarte de que
se ha caído. Es asumible, no es difícil, y no es trabajo de hacer un juego.

Y una cosa que sí tienes que hacer en los dos casos, una vez: **comprar un
dominio**. Es lo que te deja cambiar de IP o de proveedor en minutos sin tocar
código ni volver a pasarle el enlace a nadie. Los DNS pueden seguir en
Cloudflare, en modo **«sólo DNS»** —la nube gris—: así Cloudflare te resuelve el
nombre pero el tráfico va directo a tu IP y no pasa por el rango bloqueado.

---

## 7. Lo que esto no arregla

- **No te protege de que bloqueen a tu proveedor entero.** Protege de ser daño
  colateral de otro, que es lo que está pasando. Si algún día bloquearan rangos
  de Fly, el dominio propio es lo que te deja mover la IP el mismo día.
- **No mejora la latencia**, la empeora en ~15 ms respecto a un servidor en
  España, por estar en París. Es irrelevante frente a los 300 ms hasta los que
  está medido el netcode, pero es un empeoramiento y queda dicho.
- **No toca nada de lo que hay por debajo.** Ni protocolo, ni antitrampas, ni el
  problema de que la foto se mande entera a todo el mundo. Todo eso sigue en
  `docs/roadmap.md` donde estaba.

---

## 8. Recomendación

**Fly.io, moviendo las dos cosas —la página y la partida— al mismo sitio, con
dominio propio y una IPv4 dedicada. ~5-6 $ al mes.**

El orden, y el primero no es construir:

1. **Comprobar la premisa** (§1.3), y **la tiene que hacer una persona en España**:
   desde fuera de una operadora española la medida no existe. Tres pestañas con
   el bloqueo confirmado activo, empezando por el control. Si el control no cae o
   la medida sale roja, esta propuesta se cae entera y hay que replantear.
2. **Comprar el dominio.** Vale por sí solo, pase lo que pase con el resto: hoy
   el enlace que le mandas a un amigo es un subdominio de Cloudflare del que no
   te puedes mover.
3. **El huésped nuevo:** las tres piezas del §4, ~135 líneas en `net/servidor.mjs`.
4. **La prueba de aceptación:** los bancos existentes, verdes contra el huésped
   nuevo y **sin tocar una aserción**, igual que en la vuelta 47.
5. **Apuntar el dominio a Fly** y dejar el Worker de Cloudflare en pie unas
   semanas como respaldo. No cuesta nada tenerlo ahí.

Lo que **no** recomiendo: dejar el cliente en Cloudflare y mover sólo la partida.
No resuelve el problema —la página está igual de bloqueada— y encima rompe la
decisión de un solo origen de la vuelta 47, que es la que hace que hoy no haya
ninguna dirección de servidor que configurar.
