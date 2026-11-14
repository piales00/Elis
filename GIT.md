# Reglas de Git del equipo

Estas reglas mantienen el historial limpio y fácil de leer durante el hackathon. Si tienes dudas, pregunta antes de subir.

## Formato de los commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/es/):

```
tipo(ámbito opcional): descripción
```

- La descripción va en minúscula y en imperativo ("agrega", "corrige", no "agregado" ni "corregí").
- Sin punto final.
- Máximo unos 72 caracteres en la primera línea.
- Si hace falta explicar más, deja una línea en blanco y escribe el detalle debajo.

## Tipos

| Tipo | Cuándo usarlo | Ejemplo |
|---|---|---|
| `feat` | Una funcionalidad nueva | `feat(web): agrega el reloj del fuego por región` |
| `fix` | Corrección de un error | `fix(api): corrige el filtro de fechas en /detecciones` |
| `docs` | Solo documentación | `docs: explica captura y recaptura en PROYECTO.md` |
| `chore` | Mantenimiento que no cambia el producto | `chore(skills): agrega skills del proyecto` |
| `refactor` | Cambio de código sin cambiar el comportamiento | `refactor(data): separa la carga de CSV en una función` |
| `test` | Agrega o corrige pruebas | `test(metodo): prueba el estimador con datos sintéticos` |
| `style` | Formato, espacios, nombres; sin cambio de lógica | `style(web): ordena las clases del mapa` |
| `perf` | Mejora de rendimiento | `perf(data): lee los CSV con DuckDB en lugar de pandas` |
| `data` | Cambios en scripts de datos o en los agregados generados | `data: regenera el agregado mensual MODIS 2000-2025` |
| `ci` | Integración continua (GitHub Actions, etc.) | `ci: ejecuta las pruebas en cada pull request` |
| `build` | Dependencias, empaquetado, Docker | `build: fija la versión de duckdb en requirements.txt` |

`data` no es parte del estándar de Conventional Commits: es una convención de nuestro equipo para distinguir los cambios de datos del resto del código.

## Ámbitos sugeridos

| Ámbito | Qué cubre |
|---|---|
| `api` | El backend (FastAPI) |
| `web` | La interfaz y el mapa |
| `data` | Descarga, limpieza y agregados de FIRMS |
| `metodo` | Captura y recaptura, equivalente MODIS, pronóstico |
| `docs` | README, PROYECTO.md y demás documentos |
| `pitch` | Presentación, video y material para el jurado |

El ámbito es opcional. Úsalo cuando ayude a ubicar el cambio.

## Ramas

- `main` es la rama estable. Trátala como protegida: durante el hackathon no se hacen commits directos a `main`, salvo documentación urgente.
- Cada cambio va en su propia rama con el formato `tipo/descripcion-corta`, por ejemplo:
  - `feat/reloj-del-fuego`
  - `fix/fechas-viirs`
  - `docs/metodo-recaptura`
- Abre un Pull Request corto: qué cambia, por qué y cómo probarlo.
- Al menos una persona del equipo revisa el PR antes de mezclarlo.
- Mezclamos con **squash and merge**, así cada PR queda como un solo commit en `main`. El título del PR debe seguir el formato de commits.

## Reglas básicas

- No subas `data/raw/` (los CSV de FIRMS), `.venv/` ni ningún secreto.
- La `MAP_KEY` de FIRMS va en un archivo `.env`, que está en `.gitignore`. Nunca la pegues en el código, en un commit ni en un issue.
- Haz commits pequeños: un cambio lógico por commit.
- Antes de hacer `push`, actualiza tu rama con `git pull --rebase`.
- Revisa `git status` y `git diff --staged` antes de cada commit.

## Flujo típico

```bash
git switch main
git pull --rebase
git switch -c feat/reloj-del-fuego
git add web/
git commit -m "feat(web): agrega el reloj del fuego por región"
git pull --rebase origin main
git push -u origin feat/reloj-del-fuego
```

## Ejemplos

Buenos:

```
feat(web): agrega el selector de año en el mapa
fix(metodo): evita la división por cero cuando no hay recapturas
data: agrega el conteo diario VIIRS 2012-2025
docs(pitch): resume el problema en una diapositiva
chore: ignora el archivo .env
```

Malos:

```
cambios                                   sin tipo y no dice nada
Fix: Arreglé el mapa.                     tipo en mayúscula, pasado y punto final
feat: agregué muchas cosas al api y web   pasado y mezcla varios cambios
update                                    no dice qué ni por qué
feat(web): agrega el reloj del fuego, el selector de año, la leyenda y corrige colores del mapa
                                          demasiado largo y con varios cambios juntos
```
