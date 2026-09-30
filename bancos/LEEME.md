# Bancos

Los bancos de medida de Vektor. Cada uno es un `node bancos/<nombre>.mjs` que
imprime lo que mide y **sale con 1 si algo falla** (vuelta 105). Los que no
afirman nada lo dicen en su cabecera: son informes.

## Cómo se pasan

```sh
bash bancos/dev.sh          # servidor de desarrollo en el 5192 (en su propia orden)
npx vite build              # el huésped sirve dist/
bash bancos/bateria.sh      # la batería entera; o `bash bancos/bateria.sh A E`
```

Los registros y el resumen quedan en `$BANCOS_LOG` (de fábrica
`/tmp/vektor-bancos`). Las capturas van a `scratchpad/`, que no viaja en git.

## Los grupos

Un huésped sólo puede estar de una forma a la vez, así que cada banco va en el
grupo de lo que necesita. `bateria.sh` relanza el huésped al entrar en cada uno
con `bancos/host.sh`.

| Grupo | Qué pide | Para qué |
|---|---|---|
| A | nada: Node solo | la partida, el movimiento, el formato de mapa, git de Alchemist, el catálogo de textos |
| E | el servidor de desarrollo | el juego, los menús y Alchemist (`/editor/`) |
| B | huésped `VEKTOR_LOBBY=0 VEKTOR_RONDAS=0 VEKTOR_DEBUG=1` | el motor y la red: quien llega juega y el mundo no se reinicia |
| B2 | huésped `VEKTOR_LOBBY=0 VEKTOR_DEBUG=1` | lo que se juega a rondas |
| C | huésped `VEKTOR_DEBUG=1 VEKTOR_BAJAS=2` | el lobby y el todos contra todos |
| D | el huésped de serie, con `VEKTOR_FEEDBACK_CLAVE=banco107` | las peanas en red y la beta (el buzón y el contador) |
| F | nada: se monta lo suyo | el despliegue (reconstruye `dist/`) |

## Tres reglas

- **No se pasan dos a la vez** (vuelta 61): cada uno abre navegadores con WebGL
  por software y se quitan frames.
- **No se toca `src/` mientras corre la batería** (CLAUDE.md §4): el HMR puede
  duplicar el store de ajustes y los rojos que salen no son del código.
- **Ninguno de la batería puede quedarse en rojo.** Si mide una regla que se
  enmendó a propósito, se retira a `retirados/` con su motivo en su `LEEME.md`.
