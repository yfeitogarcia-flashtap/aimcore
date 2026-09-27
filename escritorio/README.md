# Vektor de escritorio (Tauri)

Una **ventana nativa de Windows y nada más**: se abre, carga
`https://ancient-violet-678.fly.dev/` y ahí se juega. Sin barra de
direcciones, sin pestañas y sin menú.

Desde la vuelta 97 hace dos cosas que una pestaña no puede: **pantalla completa
de verdad** (F11, y un ajuste para arrancar así) y **`Ctrl` como tecla de
agacharse**, que es la de toda la vida en un shooter y que en un navegador no se
puede tener porque `Ctrl+W` cierra la pestaña.

## Por qué así, y no empaquetando el juego

Lo que hay aquí **no contiene el juego**. Es una ventana que apunta al
despliegue que ya existe, y eso es el diseño entero:

- **Una sola fuente de verdad.** El juego se actualiza como se actualiza hoy
  —un empujón a la rama y el despliegue automático de la vuelta 81— y la app
  lo ve en cuanto se vuelve a abrir. No hay una segunda copia que mantener
  sincronizada, ni una versión de escritorio que se quede vieja.
- **Y se acabó cerrar el juego sin querer.** Era el motivo del encargo: en un
  navegador, `Ctrl+W` cierra la pestaña y `Ctrl+Shift+Q` el navegador entero,
  y eso pasa por encima de la página (por eso Vektor no mapea modificadores
  desde la vuelta 27). Aquí no hay pestaña que cerrar.

Lo que se paga es que **hace falta internet**: sin conexión la ventana se abre
vacía. Es lo mismo que pasa hoy con el navegador, así que no cambia nada.

## Lo que la app hace y el navegador no

### Pantalla completa (F11)

**F11 la alterna y lo que dejes puesto es lo que se recuerda**: no hay dos
ajustes que cuadrar, hay uno —*Opciones → Arrancar en pantalla completa*— y F11
escribe ese mismo valor. La próxima vez la ventana abre como la dejaste.

Cómo está repartido, que es lo que hay que saber para tocarlo:

- **Quién decide es la página**, con su ajuste, guardado donde se guardan todos
  (`localStorage`). En un navegador ese interruptor **no se enseña**: ahí F11 es
  del navegador y la API de pantalla completa exige un gesto, así que «arrancar
  así» es imposible por construcción.
- **La ventana obedece y copia.** La página se lo pide por IPC, y el proceso
  nativo deja escrito lo que había puesto en un fichero junto a su configuración
  (`ventana.txt`). Hace falta porque el arranque ocurre **antes de que la página
  exista**: no hay a quién preguntar. La verdad sigue siendo el ajuste del juego.
- **Y F11 lo atiende la ventana** (vuelta 98). Es un atajo que el proceso nativo
  registra **sólo mientras la ventana tiene el foco** —F11 en el navegador de al
  lado sigue siendo del navegador—: pone o quita la pantalla completa, la copia
  en `ventana.txt` y **se lo cuenta a la página** (`vektor:pantalla-completa`),
  que pone su ajuste igual. En la 97 lo escuchaba la página, y eso lo dejaba
  colgando de que la página supiera que estaba en la app — que es exactamente lo
  que falló en el primer `.exe`.

### `Ctrl` para agacharse

En la app, agacharse sale **de fábrica en `Ctrl`**, y el panel de controles lo
acepta si se reasigna. En un navegador sigue siendo la `C` y `Ctrl` sigue
prohibido, por lo de siempre: `Ctrl+W`.

La página sabe dónde está por **dos señales, y le basta una** (vuelta 98): la
marca que esta ventana lleva en su agente de usuario (`VektorEscritorio`, en
`tauri.conf.json` y en `src/config.js`) y una marca que la ventana **inyecta en
cada documento** antes que ningún script de la página
(`window.__VEKTOR_ESCRITORIO__`, con la versión dentro). Por eso la ventana se
declara en `tauri.conf.json` con `create: false` y se construye en `main.rs`: la
segunda marca sólo se puede poner desde Rust. Ninguna depende del origen. No es
un parámetro en la dirección a propósito: eso lo podría escribir cualquiera en un
navegador y se llevaría de premio que `Ctrl` cerrase su pestaña.

**Y se ve si se ha enterado**: al pie de *Opciones* —y arriba a la derecha de
los menús desde la vuelta 99— pone «Vektor de escritorio 0.4.0». Si pone «este
navegador» dentro de la app, la app es anterior a la 0.3.

### Salir (vuelta 99, 0.4.0)

La pantalla de inicio lleva abajo a la izquierda un botón **Salir** con su
pictograma, y en la app **cierra la aplicación**: se lo pide a la ventana con la
orden `salir` (`main.rs`), y si esa orden no llegara, la página le pide a Tauri
que cierre la ventana (`core:window:allow-close`), que al ser la única también
termina la app. **En un navegador ese botón no sale**: una página no puede cerrar
una pestaña que no abrió ella —el navegador ignora `window.close()`—, y un botón
que no puede hacer lo que dice es peor que no tenerlo.

**Hace falta instalar la 0.4.0 para tenerlo**: con una app anterior el botón
sale igual (la página es la del despliegue) pero la ventana no sabe la orden
`salir`; entonces cierra la ventana por la otra puerta, que es el mismo efecto.

Y **lo guardado sobrevive a jugar en los dos sitios**: `localStorage` es por
origen, así que la app y el navegador comparten el mismo almacén de teclas. Se
guarda **lo que elegiste** y se usa **lo que este sitio admite**, así que abrir el
juego en un navegador no le borra el `Ctrl` a la app.

## El día que Vektor tenga dominio propio

La app abre una dirección que está escrita dentro del `.exe`, así que la pregunta
es qué pasa con quien lo instaló hace meses. La respuesta, desde la vuelta 97:
**no tiene que reinstalar nada, y no hay nada que hacer en su PC.**

- **El huésped sabe redirigir.** Poniéndole la variable de entorno
  `VEKTOR_DOMINIO` a la dirección buena, todo lo que llegue por otro nombre se
  manda ahí con un 302. Es una línea en Fly y cero código.
- **Y la app no se redirige, a propósito.** Se reconoce por la marca de su agente
  de usuario y se le sirve el juego en la dirección vieja **para siempre**. El
  motivo no es sentimental: el canal por el que la ventana habla con su proceso
  —o sea la pantalla completa— está atado al origen, y está escrito en
  `src-tauri/capabilities/principal.json`. Una app que acabara en un dominio que
  ese fichero no nombra seguiría jugando **y se quedaría sin pantalla completa**,
  sin un error en ninguna pantalla.

Lo que se paga va escrito porque no se adivina: **`localStorage` es por origen**,
así que a partir de ese día la app y el navegador guardan sus ajustes por
separado.

**Y un `.exe` nuevo sí debería salir**, apuntando ya al dominio. Lo que hay que
tocar son dos líneas y están juntas: `app.windows[0].url` en `tauri.conf.json` y
`remote.urls` en la capacidad, que pasa a llevar **las dos** direcciones. Con eso,
quien descargue el instalador nuevo entra directo y quien no lo haga sigue
jugando.

**El actualizador automático de Tauri no hace falta para esto**, y por eso no
está: pide una clave de firma, un manifiesto publicado y firmar cada versión, y
lo único que compraría aquí es empujar un cambio a una ventana que no contiene el
juego. El día que la ventana **sí** tenga que cambiar por su cuenta —una
mecánica nativa, un certificado— es cuando toca montarlo.

## De dónde se descarga el `.exe`

**No hay que compilar nada** (vuelta 94): lo hace GitHub en un ordenador con
Windows cada vez que cambia algo de esta carpeta, y también a mano cuando se le
pide. Hay dos sitios donde queda, y el segundo es el que se le pasa a alguien:

**1. El enlace fijo** — siempre el último compilado, y no cambia nunca:

```
https://github.com/yfeitogarcia-flashtap/aimcore/releases/download/escritorio-ultima/Vektor-instalador.exe
https://github.com/yfeitogarcia-flashtap/aimcore/releases/download/escritorio-ultima/Vektor-portable.exe
```

La página de esa publicación es
`https://github.com/yfeitogarcia-flashtap/aimcore/releases/tag/escritorio-ultima`.
El repositorio es público, así que **un tester no necesita cuenta de GitHub**:
pincha y descarga.

- **Vektor-instalador.exe** es lo normal: instala, deja acceso directo en el menú
  de inicio y se desinstala desde *Aplicaciones* de Windows.
- **Vektor-portable.exe** es el ejecutable suelto: doble clic donde se deje, sin
  instalar nada. En Windows 10 y 11 el WebView2 que necesita ya viene puesto.

**2. La ejecución que lo compiló**, si hace falta uno concreto: pestaña
**Actions** del repositorio → *Compilar el escritorio (.exe)* → la ejecución de
arriba → abajo, en **Artifacts**, `vektor-escritorio`. Es un `.zip` con los dos
ficheros dentro. Un artefacto **caduca a los 90 días**; el enlace fijo, no.

### Compilarlo cuando se quiera, sin tocar código

Actions → *Compilar el escritorio (.exe)* → **Run workflow**. Tarda entre dos y
veinte minutos según si la caché de Rust está caliente.

Y **no se recompila con cada cambio del juego, a propósito**: esta ventana no
contiene el juego, así que un `.exe` nuevo por cada commit sería un `.exe`
idéntico al anterior. Sólo corre cuando cambia `escritorio/`.

## Cómo probar que va

Los seis sitios donde esta ventana puede fallar y no el navegador:

1. **Abre y carga.** Doble clic. Tiene que salir la pantalla de inicio de Vektor,
   no una ventana blanca. Blanca = no hay internet o el despliegue está caído:
   compruébalo abriendo `https://ancient-violet-678.fly.dev/` en el navegador.
2. **`Ctrl+W` no hace nada, y `Ctrl` agacha.** Era el motivo del encargo. Pulsa
   `Ctrl+W` jugando: la ventana sigue ahí **y el jugador se agacha andando**. En
   un navegador eso cierra la pestaña por encima de la página.
3. **El ratón se captura.** Entra a Entrenamiento y pincha: la mira tiene que
   quedarse en el centro. `Esc` suelta el ratón y abre el menú, como en el
   navegador.
4. **El icono es la marca.** En la barra de tareas y en el acceso directo sale la
   marca de Vektor en naranja, no el icono por defecto de Tauri. **Y el
   instalador también** (vuelta 97): la marca arriba a la izquierda, el logotipo
   entero en el lateral de la bienvenida, y abajo «Vektor Installer» con su
   versión en lugar de «Nullsoft Install System».
5. **F11 y la pantalla completa.** Primero, al pie de *Opciones* tiene que
   poner «Vektor de escritorio 0.4.0» (si no, es una instalación vieja). Pulsa
   F11: la ventana se pone a pantalla completa y el interruptor de *Opciones* se
   marca solo. Ciérrala y vuelve a abrirla: tiene que abrir así. En un navegador
   esa fila no sale.
6. **Salir.** En la pantalla del logotipo, abajo a la izquierda, **Salir**
   cierra la app entera. Ábrela otra vez: arranca normal.
7. **Se actualiza sola.** Como no contiene el juego, un despliegue nuevo le llega
   sin volver a descargar el `.exe`: la propia página lo detecta y recarga
   (vuelta 93). Para verlo, deja la ventana abierta mientras entra un despliegue.

La primera vez Windows enseña **«Windows protegió tu PC»**, porque el ejecutable
va sin firmar: *Más información → Ejecutar de todas formas*. Es lo que hay hasta
que haya certificado, y está aceptado.

## Las imágenes del instalador

NSIS usa dos imágenes, **BMP de 24 bits sin transparencia**, y **no las escala**:

| Imagen | Medida exacta | Dónde sale |
|---|---|---|
| Cabecera | **150 × 57 px** | arriba a la izquierda, en las páginas del medio |
| Lateral | **164 × 314 px** | a la izquierda, en la bienvenida y en el final |

Se generan desde la marca en cada compilación. **Para usar las tuyas**, déjalas
en `Reference/Instalador/` como `cabecera.png` y `lateral.png` (vale también
`.bmp` o `.jpg`): el generador las pasa a BMP de 24 bits y las aplana sobre el
negro de Vektor si traen transparencia. Si no miden exactamente eso, las ajusta
**cubriendo y recortando por el centro** —nunca estirando— y lo avisa en el
registro de la compilación. Subirlas lanza una compilación nueva del `.exe`.

Un detalle de Windows que no se puede arreglar desde aquí: con el escalado de
pantalla por encima del 100 %, Windows estira esas imágenes y se ven algo
blandas. Diséñalas con trazos gruesos y sin texto pequeño.

## Compilarlo en tu PC (no hace falta)

Sólo si se quiere tocar la ventana en sí. En Windows, con
[Rust](https://rustup.rs) y Node instalados:

```
npm install
npm run escritorio:instalador
cd escritorio
npm install
npx tauri icon ../Reference/Logo/vektor-mark-orange.png
npm run build
```

Sale un instalador en `escritorio/src-tauri/target/release/bundle/`.

**Los dos pasos de imágenes no son opcionales**: `src-tauri/icons/` y
`src-tauri/instalador/` están en `.gitignore` porque son material derivado —salen
de la marca, igual que las siluetas de las armas salen de `Reference/Weapons/`—
así que en un árbol recién clonado no están y la compilación falla diciendo que le
falta `icons/icon.ico` o `instalador/cabecera.bmp`. Los generan esas dos órdenes,
una vez. El primer `npm install` es el de la raíz, que es de donde sale `jimp`.

Para probar sin empaquetar: `npm run dev`.
