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

## Compilar (una vez por versión)

En Windows, con [Rust](https://rustup.rs) y Node instalados:

```
cd escritorio
npm install
npm run build
```

Sale un `.exe` y un instalador en
`escritorio/src-tauri/target/release/bundle/`.

**El ejecutable va sin firmar**, así que Windows enseña un aviso de «editor
desconocido» la primera vez: *Más información → Ejecutar de todas formas*. Es
lo que hay hasta que haya certificado, y está aceptado.

Para probar sin compilar el instalador: `npm run dev`.

## El icono

Sale con el icono por defecto de Tauri, a propósito: un `icons/` a medias es lo
que hace que una compilación falle en el PC de otro. Para ponerle la marca, una
vez y desde esta carpeta:

```
npx tauri icon ../Reference/Logo/<el png de la marca>
```

Eso escribe `src-tauri/icons/` entero, y entonces hay que añadirle a
`src-tauri/tauri.conf.json`, dentro de `bundle`:

```
"icon": ["icons/icon.ico"],
```
