# Propuesta 20 — Los datos que sobreviven a un despliegue, en Supabase

**Estado:** propuesta, vuelta 108. Sin construir. Sustituye el «volumen de Fly»
que proponían `docs/beta-cerrada.md` §3 y el comentario de `net/beta.js`. Va en
**el mismo proyecto de Supabase que las cuentas** de la propuesta 14, y respeta
su decisión de fondo: **el navegador no habla con Supabase; habla el huésped**.

## 0. La respuesta corta

- **Un solo proyecto, «vektor»**, en una organización de Supabase propia de
  Vektor (no la de FlickLAB), en la **región de París** (`eu-west-3`).
- **Dos tablas nuevas**: `contador_dias` y `feedback`. Las escribe **sólo el
  huésped**, con la clave secreta, y **nadie más las puede leer**: tienen RLS
  encendido y ninguna política, y se retiran los permisos a los roles públicos.
- **Las dos versiones (pruebas y estable, propuesta 19) y todas las regiones
  (propuesta 17) escriben en el mismo sitio**, cada fila con su `entorno` y su
  `region`. El contador de un día es la suma de sus filas.
- **El juego nunca espera a Supabase.** El contador se acumula en memoria y se
  vuelca una vez por minuto; el feedback se guarda en memoria primero y se manda
  después. Si Supabase está caído o pausado, se reintenta, y lo que no quepa en
  la cola se sigue viendo en la página de leer. Es la regla del webhook de la
  vuelta 107: si el otro lado tarda, el jugador no se entera.
- **El webhook de Discord se queda**: Supabase guarda y Discord avisa.
- **Lo que hace Yago**: crear la organización y el proyecto, pegar un SQL en el
  editor del panel y poner **tres secretos** en cada aplicación de Fly
  (`SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `VEKTOR_ENTORNO`).
- **Coste: 0 €** en el plan gratuito mientras sea la beta cerrada. El día que
  haya cuentas abiertas a desconocidos, Supabase Pro (~25 $/mes), por los motivos
  que da la propuesta 14 §7 (pausa por inactividad y copias de seguridad), no por
  estas dos tablas.

## 1. Por qué Supabase y no un volumen de Fly

La razón de Yago es la buena, y conviene escribirla entera porque es la que
decide: **habrá dos versiones, varias regiones y cuentas.**

- **Un volumen de Fly es un disco atado a una máquina.** Con dos aplicaciones
  (propuesta 19) son dos discos y dos contadores. Con una máquina por región
  (propuesta 17) son cinco. Para saber cuánta gente jugó ayer habría que abrir
  cinco páginas y sumar a mano.
- **Y un volumen no se mueve con la máquina.** Fly lo crea en una zona concreta:
  si esa máquina se recrea en otra, el disco no la sigue sin una migración a mano.
  Es infraestructura que mantener para guardar unos pocos números.
- **Las cuentas ya van a Supabase** (propuesta 14). Poner ahí también el contador
  y el feedback es una base de datos que mirar en vez de dos, con el mismo panel,
  la misma clave y las mismas copias de seguridad cuando las haya.

Lo que se paga es depender de un servicio de fuera para algo que hoy no depende
de nadie. Por eso §4 es la mitad de la propuesta: qué pasa cuando no está.

## 2. El esquema

```sql
-- Vuelta 108 · propuesta 20. Se pega entero en SQL Editor → New query → Run.

-- ── El contador ─────────────────────────────────────────────────────
-- Una fila por día, por versión y por región. «pico» es el máximo de gente
-- a la vez EN ESA MÁQUINA: el pico global no es la suma de los picos (dos
-- regiones pueden tener su pico a horas distintas), y la página lo dice.
create table public.contador_dias (
  dia        date    not null,
  entorno    text    not null check (entorno in ('pruebas', 'estable', 'local')),
  region     text    not null,
  salas      integer not null default 0,
  partidas   integer not null default 0,
  jugadores  integer not null default 0,
  entrenos   integer not null default 0,
  pico       integer not null default 0,
  primary key (dia, entorno, region)
);

-- Sumar sin leer primero. El huésped manda lo que ha contado desde la última
-- vez (deltas), no el total: dos máquinas escribiendo la misma fila no se
-- pisan, y un reintento de un volcado que sí llegó cuenta dos veces un minuto,
-- que es un error acotado y visible (§4.2).
create function public.sumar_contador(
  p_dia date, p_entorno text, p_region text,
  p_salas int, p_partidas int, p_jugadores int, p_entrenos int, p_pico int
) returns void language sql security definer set search_path = '' as $$
  insert into public.contador_dias as c
    (dia, entorno, region, salas, partidas, jugadores, entrenos, pico)
  values (p_dia, p_entorno, p_region, p_salas, p_partidas, p_jugadores, p_entrenos, p_pico)
  on conflict (dia, entorno, region) do update set
    salas     = c.salas     + excluded.salas,
    partidas  = c.partidas  + excluded.partidas,
    jugadores = c.jugadores + excluded.jugadores,
    entrenos  = c.entrenos  + excluded.entrenos,
    pico      = greatest(c.pico, excluded.pico);
$$;

-- ── El feedback ─────────────────────────────────────────────────────
create table public.feedback (
  id        bigint generated always as identity primary key,
  cuando    timestamptz not null default now(),
  entorno   text not null,
  region    text not null,
  texto     text not null check (char_length(texto) between 1 and 1500),
  donde     text not null default '',
  modo      text not null default '',
  mapa      text not null default '',
  version   text not null default '',
  app       boolean not null default false
  -- Con cuentas (propuesta 14) se añadirá `cuenta uuid references
  -- public.perfiles(id) on delete set null`, y SÓLO si el jugador marca
  -- «que me puedan contestar». Sin esa casilla, un comentario no dice de quién es.
);
create index feedback_cuando on public.feedback (cuando desc);

-- Los comentarios se borran solos a los 180 días. Es lo que dice el texto de
-- privacidad, y un plazo escrito que nadie aplica es una promesa falsa.
create extension if not exists pg_cron;
select cron.schedule('feedback-180-dias', '23 4 * * *', $$
  delete from public.feedback where cuando < now() - interval '180 days'
$$);

-- ── Nadie de fuera lee ni escribe ───────────────────────────────────
-- RLS encendido y sin políticas: los roles públicos (anon, authenticated) no
-- ven ni una fila. Sólo la clave secreta, que se salta RLS y vive en Fly.
alter table public.contador_dias enable row level security;
alter table public.feedback      enable row level security;
revoke all on public.contador_dias, public.feedback from anon, authenticated;
revoke execute on function public.sumar_contador from public, anon, authenticated;
```

Tres cosas del esquema que son decisiones:

- **`entorno` y `region` son parte de la clave del contador.** Con la propuesta
  19 hay dos versiones y con la 17 varias máquinas. Mezclar sus números en una
  fila sería no poder saber después si el pico de ayer fue de testers o de Yago
  probando.
- **Deltas y no totales.** Si cada máquina mandara «hoy llevo 14 salas», dos
  máquinas de la misma región (no debería pasar, vuelta 59, pero pasa en un
  despliegue) se pisarían. Con deltas se suman. El precio está en §4.2.
- **El feedback no lleva de quién es.** Hoy no lo lleva (vuelta 107) y, cuando
  haya cuentas, sólo lo llevará si el jugador lo pide. Así el texto de privacidad
  de `beta-cerrada.md` §7 sigue valiendo tal cual, más una frase sobre dónde se
  guarda (§6).

## 3. Cómo escribe el huésped

**Sin `supabase-js`.** El huésped habla con la API REST de Supabase (PostgREST)
con `fetch`, que ya usa para el webhook: dos llamadas y ninguna dependencia nueva.
Todo va en un módulo nuevo, `net/datos.js`, que `net/beta.js` usa **si hay
`SUPABASE_URL`** y, si no, sigue exactamente como hoy (memoria, y disco si hay
`VEKTOR_DATOS`). O sea que en local y en los bancos no cambia nada.

```js
// Lo esencial de net/datos.js (borrador).
const URL = process.env.SUPABASE_URL             // https://<ref>.supabase.co
const CLAVE = process.env.SUPABASE_SECRET_KEY    // sb_secret_… (o la service_role antigua)
const ENTORNO = process.env.VEKTOR_ENTORNO || 'local'
const REGION = process.env.FLY_REGION || 'local' // Fly la pone en cada máquina

function llamar(ruta, cuerpo) {
  return fetch(`${URL}/rest/v1/${ruta}`, {
    method: 'POST',
    headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`,
               'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(5000),
  })
}
// contador: llamar('rpc/sumar_contador', { p_dia, p_entorno: ENTORNO, p_region: REGION, … })
// feedback: llamar('feedback', { entorno: ENTORNO, region: REGION, texto, donde, … })
```

Hay que comprobar un detalle con el panel delante: las **claves nuevas** de
Supabase (`sb_secret_…`, de 2025) se mandan en `apikey`, y la documentación de
cada una dice si también valen en `Authorization`. Con la clave `service_role`
antigua valen las dos cabeceras. Se prueba con un `curl` antes de escribir el
módulo (§5, paso 5).

**Cuándo escribe:**

- **Contador**: igual que el disco de hoy, **una vez por minuto y sólo si ha
  cambiado algo**, con lo contado desde el último volcado que salió bien. Y **al
  apagarse**: un despliegue manda la señal de parada con unos segundos de margen,
  y el huésped vuelca antes de salir. Son como mucho 1 440 llamadas al día por
  máquina, nada para Supabase.
- **Feedback**: en el momento, sin esperar la respuesta para contestar al
  jugador (el `{ ok: true }` sale en cuanto se ha guardado en memoria, como hoy).

## 4. Cuando Supabase no está

### 4.1 Qué ve cada uno

| Situación | El jugador | Yago |
|---|---|---|
| Supabase caído o lento | Nada: juega y su comentario sale como «enviado» | Llega igual a Discord. La página de leer lo enseña desde la memoria. El contador se acumula y se vuelca cuando vuelve. |
| Proyecto pausado (plan gratuito, §4.3) | Nada | Igual que arriba, hasta que se despause desde el panel. |
| Clave mal puesta | Nada | `/salud` dice `datos: "error 401"` (§4.4), y la página de leer y la del contador avisan en rojo. |
| Despliegue con un comentario en la cola | Nada | Se reintenta al apagarse. Lo que no salga se pierde de la base, pero ya llegó a Discord. |

### 4.2 La cola, con tope

- **Feedback**: una cola en memoria de hasta 300 mensajes (el mismo
  `BETA_UI.feedbackGuardados` de hoy), con reintentos a los 10 s, 1 min, 5 min y
  luego cada 15 min. Pasado el tope se tira el más viejo **de la cola**, no de la
  página de leer.
- **Contador**: no hay cola que crezca. Si un volcado falla, los deltas se quedan
  en memoria y se suman al siguiente. Lo único que puede salir mal es un volcado
  que **sí llegó pero cuya respuesta se perdió**: el siguiente lo vuelve a sumar,
  y ese minuto cuenta doble. Con una beta de diez personas es un error de una
  partida arriba o abajo. Si algún día importa, cada volcado lleva un número y la
  función ignora los repetidos.

### 4.3 La pausa del plan gratuito

Supabase pausa un proyecto gratuito tras **una semana de poca actividad**
(propuesta 14 §7). Con el contador volcando cada minuto que haya juego, un
proyecto con testers jugando **probablemente** no se pausa nunca. Pero «actividad»
la define Supabase y no está claro si una escritura por minuto basta: **hay que
comprobarlo con el panel** la primera semana. Si una semana sin testers lo pausa,
no se rompe nada del juego (§4.1): se despausa desde el panel en minutos.

### 4.4 Que se vea que falla

El fallo de la vuelta 60 —degradar en silencio— aplicado a esto: `/salud` gana un
campo `datos` con el resultado de la última escritura (`"ok hace 42 s"`,
`"error 401"`, `"sin configurar"`), y las páginas `/contador` y `/feedback/leer`
lo ponen arriba.

## 5. Lo que tiene que hacer Yago

1. **Una organización nueva** en <https://supabase.com/dashboard>: *New
   organization* → «Vektor». Separada de la de FlickLAB por dos motivos: el plan
   gratuito da **dos proyectos activos por organización**, y los permisos y la
   facturación de Vektor no se mezclan con los de FlickLAB.
2. **El proyecto**: *New project* → nombre `vektor`, región **Europe West
   (Paris)**, y una contraseña de base de datos larga guardada en el gestor de
   contraseñas (no se usa en esta propuesta, pero no se puede recuperar).
   - **La región no se puede cambiar después**, y es la decisión que más pesa.
     Paris porque está junto a la máquina de Fly de hoy (`cdg`) y porque **las
     cuentas de la propuesta 14 son datos personales de personas de la UE con un
     responsable en España**: guardarlos en la UE evita justificar una
     transferencia internacional en la política de privacidad. Desde Latinoamérica
     (propuesta 17), entrar en la cuenta añade ~200 ms **una vez**, al iniciar
     sesión; el contador y el feedback no se notan, porque no van en el bucle.
3. **El SQL de §2**: *SQL Editor* → *New query* → pegar → *Run*. Si `pg_cron` no
   está activado, se activa en *Database* → *Extensions* → `pg_cron`, y se vuelve
   a pasar el SQL.
4. **Las dos claves**: *Project Settings* → *API Keys*. Hace falta la **Project
   URL** (`https://<ref>.supabase.co`) y una **secret key** (`sb_secret_…`; si
   el panel sólo enseña las antiguas, la `service_role`). La secreta **nunca** va
   en el juego, ni en el repositorio, ni en un mensaje.
5. **Comprobar que la clave vale**, desde el PC, antes de ponerla en Fly:
   ```sh
   curl -sS -X POST "https://<ref>.supabase.co/rest/v1/rpc/sumar_contador" \
     -H "apikey: <secret key>" -H "Authorization: Bearer <secret key>" \
     -H 'Content-Type: application/json' \
     -d '{"p_dia":"2026-01-01","p_entorno":"local","p_region":"prueba","p_salas":1,"p_partidas":0,"p_jugadores":0,"p_entrenos":0,"p_pico":0}'
   ```
   Sin salida y sin error: vale. Luego, en *Table Editor* → `contador_dias`, hay
   una fila del 1 de enero de 2026 en `local`, que se puede borrar.
6. **Los secretos, en cada aplicación de Fly** (con `--stage`, para no reiniciar
   la máquina con salas abiertas; ver `beta-cerrada.md`, «El buzón, en concreto»):
   ```sh
   fly secrets set --stage -a ancient-violet-678 \
     SUPABASE_URL='https://<ref>.supabase.co' \
     SUPABASE_SECRET_KEY='<secret key>' \
     VEKTOR_ENTORNO=pruebas

   fly secrets set --stage -a vektor-beta \
     SUPABASE_URL='https://<ref>.supabase.co' \
     SUPABASE_SECRET_KEY='<secret key>' \
     VEKTOR_ENTORNO=estable
   ```
   La región no hace falta ponerla: Fly la da en cada máquina (`FLY_REGION`).

**Leer, sin programar**: *Table Editor* → `feedback` (ordenar por `cuando`) y
`contador_dias`. Y las dos páginas de siempre, `/feedback/leer?clave=…` y
`/contador`, pasan a leer de Supabase (con un minuto de caché) y a enseñar las
dos versiones y todas las regiones, con un filtro por `entorno`.

## 6. Encaje con la propuesta 14

- **Mismo proyecto, misma clave, mismo portero.** Las rutas `/cuenta/...` de la
  14 usan exactamente `SUPABASE_URL` y `SUPABASE_SECRET_KEY`. La 14 necesitará
  además la clave pública (`sb_publishable_…`) sólo si algún día el navegador
  habla directo con Supabase, que la 14 descarta. Así que **estos dos secretos
  son los de la 14**: ponerlos ahora es adelantar su paso de configuración.
- **Una sola base de usuarios para las dos versiones.** Pruebas y estable
  comparten `auth.users`: la cuenta de Yago vale en las dos, y un tester que
  prueba algo de pruebas no tiene que registrarse otra vez. Lo que se paga: un
  fallo en pruebas **puede escribir en las cuentas de verdad**. Mientras sea la
  beta cerrada, es aceptable. Cuando se abra el registro, el sitio de pruebas va
  en **otro proyecto** (o en la *branch* de Supabase Pro), y eso sale en la 14
  §7 («Dos proyectos activos gratis»).
- **El feedback con cuenta, sólo si se pide.** Con cuentas, el panel de feedback
  gana una casilla «que me puedan contestar». Marcada, la fila lleva `cuenta`
  y Yago puede escribirle. Sin marcar, sigue siendo anónimo. El texto de
  privacidad lo dice en una frase.
- **El orden**: esta propuesta va **antes** que la fase 1 de la 14, porque es
  más pequeña (medio día de trabajo) y deja montado lo que la 14 necesita: el
  proyecto, la región, las claves en Fly y el patrón de «el huésped escribe y el
  juego no espera».

## 7. El texto de privacidad, con esto

Al párrafo de `beta-cerrada.md` §7 se le cambia una frase: «Los mensajes se leen
en un canal privado de Discord de Vektor y **se guardan en una base de datos de
Vektor alojada en la Unión Europea (Supabase), que los borra a los 180 días**.»
El contador no necesita frase: son sumas por día sin nada de nadie.

## 8. Lo que hay que construir (cuando se apruebe)

1. `net/datos.js` (§3) con su cola (§4.2) y el volcado al apagarse.
2. `net/beta.js`: usar `datos.js` si hay `SUPABASE_URL`. Si no, lo de hoy.
3. `/salud` con `datos` (§4.4) y las dos páginas leyendo de Supabase.
4. Un banco sin navegador, `datos108`, contra un PostgREST de mentira en local:
   que el contador mande deltas y no totales, que un fallo no pierda cuentas, que
   el feedback salga una vez, y que sin `SUPABASE_URL` todo sea como antes. Es la
   regla de siempre: que se mida contra el código de antes y el de después.
5. `docs/despliegue-fly.md` y `beta-cerrada.md` con los pasos de §5.

## 9. Riesgos

- **La clave secreta en un sitio equivocado.** Salta RLS: quien la tenga lee y
  escribe todo, cuentas incluidas cuando existan. Vive sólo en los secretos de
  Fly. Si se filtra, se rota en el panel (*API Keys* → crear otra, cambiarla en
  Fly, borrar la vieja).
- **La región equivocada.** No se cambia después sin migrar la base entera. Por
  eso §5.2 la razona antes de crear nada.
- **El plan gratuito en una beta que crece.** Sin copias de seguridad: perder la
  base es perder el histórico del contador y del feedback (lo de Discord sigue).
  Aceptable en la beta cerrada. El paso a Pro va con la decisión de abrir
  cuentas, no con esta propuesta.
