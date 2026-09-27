# Vektor de escritorio (Tauri)

Una **ventana nativa de Windows y nada más**: se abre, carga
`https://ancient-violet-678.fly.dev/` y ahí se juega. Sin barra de
direcciones, sin pestañas y sin menú.

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

Los cinco sitios donde esta ventana puede fallar y no el navegador:

1. **Abre y carga.** Doble clic. Tiene que salir la pantalla de inicio de Vektor,
   no una ventana blanca. Blanca = no hay internet o el despliegue está caído:
   compruébalo abriendo `https://ancient-violet-678.fly.dev/` en el navegador.
2. **`Ctrl+W` no hace nada.** Era el motivo del encargo. Pulsa `Ctrl+W` jugando:
   la ventana sigue ahí. En un navegador eso cierra la pestaña por encima de la
   página.
3. **El ratón se captura.** Entra a Entrenamiento y pincha: la mira tiene que
   quedarse en el centro. `Esc` suelta el ratón y abre el menú, como en el
   navegador.
4. **El icono es la marca.** En la barra de tareas y en el acceso directo sale la
   marca de Vektor en naranja, no el icono por defecto de Tauri.
5. **Se actualiza sola.** Como no contiene el juego, un despliegue nuevo le llega
   sin volver a descargar el `.exe`: la propia página lo detecta y recarga
   (vuelta 93). Para verlo, deja la ventana abierta mientras entra un despliegue.

La primera vez Windows enseña **«Windows protegió tu PC»**, porque el ejecutable
va sin firmar: *Más información → Ejecutar de todas formas*. Es lo que hay hasta
que haya certificado, y está aceptado.

## Compilarlo en tu PC (no hace falta)

Sólo si se quiere tocar la ventana en sí. En Windows, con
[Rust](https://rustup.rs) y Node instalados:

```
cd escritorio
npm install
npx tauri icon ../Reference/Logo/vektor-mark-orange.png
npm run build
```

Sale un instalador en `escritorio/src-tauri/target/release/bundle/`.

**El paso del icono no es opcional**: `src-tauri/icons/` está en `.gitignore`
porque es material derivado —sale de la marca, igual que las siluetas de las
armas salen de `Reference/Weapons/`— así que en un árbol recién clonado no está y
la compilación falla diciendo que le falta `icons/icon.ico`. Lo genera esa orden,
una vez.

Para probar sin empaquetar: `npm run dev`.
