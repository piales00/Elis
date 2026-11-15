# Despliegue de FireChronos Perú

Guía interna para publicar la API y la web. Ejecutar los bloques Bash desde `/tmp/fc-deploy`, rama `chore/despliegue`. No hace falta instalar Vercel CLI. No se publican ni regeneran datos: el contenedor sirve los agregados versionados de `data/processed/`.

## 1. Preparar las dos direcciones

La API tendrá una URL HTTPS de Cloud Run (`https://…run.app`) o Render (`https://…onrender.com`). La web tendrá otra de Vercel (`https://firechronos.vercel.app`, ejemplo que debes reemplazar).

Crea primero el proyecto de Vercel para conocer su dominio definitivo; puedes hacer el primer deploy después de tener la API. Anota el dominio exacto, sin ruta ni barra final. Los dominios de preview son distintos: no quedan autorizados automáticamente.

El despliegue inicial deja `CHAT_ENABLED=0`. Las consultas de datos funcionan sin clave de Anthropic. La clave solo se añade al backend si se decide activar el asistente.

## 2. Opción A recomendada: API en Google Cloud Run

### 2.1 Cuenta, crédito e instalación

Entra con la cuenta registrada en Space Apps y consulta los [Global Offers oficiales](https://www.spaceappschallenge.org/2026/). Si tienes la oferta de Google Cloud de USD 300, sigue su enlace de canje y comprueba en **Billing → Credits** que se aplicó a tu cuenta de facturación. No supongas que se combina con el crédito de bienvenida. El importe, elegibilidad y caducidad dependen del canje; esta guía no puede comprobar el beneficio de tu cuenta. Activa una cuenta de facturación y vincúlala al proyecto; Google puede pedir tarjeta incluso con crédito. Configura una alerta de presupuesto en Billing (la alerta no detiene el gasto).

En Ubuntu/Debian, instalar gcloud una sola vez siguiendo la [instalación oficial](https://cloud.google.com/sdk/docs/install):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates gnupg curl
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main' | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt-get update
sudo apt-get install -y google-cloud-cli
gcloud --version
gcloud auth login
```

En Windows o macOS usa el instalador de esa misma página y abre una terminal Bash para los bloques siguientes. No necesitas instalar Python ni dependencias científicas en tu equipo para desplegar.

### 2.2 Proyecto y permisos

El ID debe ser globalmente único, en minúsculas, de 6 a 30 caracteres, empezar con una letra y no terminar en guion. Sustituye los valores de ejemplo y conserva esta terminal abierta:

```bash
cd /tmp/fc-deploy
export FC_PROJECT_ID='firechronos-peru-tu-sufijo'
export FC_REGION='southamerica-west1'
export FC_WEB_ORIGIN='https://firechronos.vercel.app'
gcloud projects create "$FC_PROJECT_ID" --name='FireChronos Peru'
gcloud config set project "$FC_PROJECT_ID"
gcloud billing accounts list
```

Copia el ID de tu cuenta de facturación:

```bash
export FC_BILLING_ACCOUNT='XXXXXX-XXXXXX-XXXXXX'
gcloud billing projects link "$FC_PROJECT_ID" --billing-account="$FC_BILLING_ACCOUNT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com compute.googleapis.com
export FC_PROJECT_NUMBER="$(gcloud projects describe "$FC_PROJECT_ID" --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding "$FC_PROJECT_ID" \
  --member="serviceAccount:${FC_PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder
gcloud iam service-accounts create firechronos-api --display-name='FireChronos API runtime'
export FC_RUNTIME_SA="firechronos-api@${FC_PROJECT_ID}.iam.gserviceaccount.com"
```

El usuario que despliega necesita permisos para crear servicios y usar esas cuentas. En un proyecto personal recién creado, su propietario puede hacerlo; si la organización lo restringe, pide al administrador los permisos indicados en la [guía de despliegue desde código](https://cloud.google.com/run/docs/deploying-source-code). Espera unos minutos si acabas de asignar permisos. Si el proyecto ya existe, omite su creación y selecciona ese ID.

Usamos Santiago (`southamerica-west1`), una elección razonable para usuarios en Perú por proximidad. Cloud Run no ofrece región en Perú en la [lista consultada](https://cloud.google.com/run/docs/locations). Mide latencia real si cambia el público; São Paulo es otra alternativa sudamericana.

### 2.3 Desplegar desde este código

```bash
gcloud run deploy firechronos-api \
  --source . \
  --region "$FC_REGION" \
  --allow-unauthenticated \
  --service-account "$FC_RUNTIME_SA" \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 8 \
  --timeout 300 \
  --set-env-vars "CORS_ORIGINS=${FC_WEB_ORIGIN},CHAT_ENABLED=0,CHAT_DAILY_BUDGET_USD=5"
export FC_API_URL="$(gcloud run services describe firechronos-api --region "$FC_REGION" --format='value(status.url)')"
printf '%s\n' "$FC_API_URL"
curl -fsS -o /dev/null -w '%{http_code}\n' "$FC_API_URL/regions"
```

Acepta crear el repositorio de Artifact Registry si gcloud lo pregunta. `--source .` usa el Dockerfile incluido; `.gcloudignore` limita la subida y `.dockerignore` limita el contexto de Docker. Solo entran dependencias, `api/` y `data/processed/`, sin `.env`, scripts ni datos crudos/intermedios. El puerto se toma de `PORT`; uvicorn corre como UID 10001, con un worker. El healthcheck de Docker consulta `/regions`; Cloud Run gestiona sus propias sondas de arranque, no ejecuta automáticamente el `HEALTHCHECK` de Docker. No hay endpoint `/health`.

Puedes repetir el deploy para actualizar código y datos. El comando anterior vuelve a apagar el chat: si ya lo habilitaste, ajusta `CHAT_ENABLED` conscientemente. Consulta la [referencia de banderas](https://cloud.google.com/sdk/gcloud/reference/run/deploy).

### 2.4 Activar el chat con Secret Manager (opcional)

Crea el secreto desde la consola de Google Cloud: **Secret Manager → Create secret**, nombre `firechronos-anthropic-key`; pega la clave en **Secret value** y guarda la versión 1. Así no pasa por el historial de comandos, el repositorio ni los argumentos de un proceso. Nunca crees una variable `VITE_` para esta clave.

Da acceso solo a la cuenta del servicio:

```bash
gcloud secrets add-iam-policy-binding firechronos-anthropic-key \
  --member="serviceAccount:${FC_RUNTIME_SA}" \
  --role=roles/secretmanager.secretAccessor
gcloud run services update firechronos-api \
  --region "$FC_REGION" \
  --update-secrets ANTHROPIC_API_KEY=firechronos-anthropic-key:1 \
  --update-env-vars CHAT_ENABLED=1,CHAT_DAILY_BUDGET_USD=5
```

Al rotar la clave, crea otra versión y actualiza `:1` al número nuevo. Más información en [secretos de Cloud Run](https://cloud.google.com/run/docs/configuring/services/secrets).

El código selecciona `claude-opus-5-5` por defecto y permite `CHAT_MODEL`. Antes de presentar, verifica con una pregunta real que tu cuenta de Anthropic tiene acceso al modelo configurado; si no, define en el backend un ID compatible disponible en tu cuenta y prueba de nuevo. Esta preparación no llama a Anthropic ni valida crédito, modelo o streaming remoto con una clave real.

`CHAT_DAILY_BUDGET_USD=5` es un control aproximado en memoria por proceso y día UTC: se reinicia al reiniciar el contenedor, no coordina réplicas y puede sobrepasarse con peticiones concurrentes. Las tarifas están codificadas para los modelos del proyecto; otro modelo requiere revisar su cálculo. Un máximo de una instancia y un worker reduce la dispersión, pero no convierte este control en un límite de facturación global. Revisa el gasto en Anthropic. Para apagar el asistente:

```bash
gcloud run services update firechronos-api --region "$FC_REGION" --update-env-vars CHAT_ENABLED=0
```

### 2.5 Logs

```bash
gcloud run services logs read firechronos-api --region "$FC_REGION" --limit=50
```

También están en **Cloud Run → firechronos-api → Logs**. Si hay errores de construcción, abre el build enlazado por el deploy en Cloud Build. [Referencia del comando de logs](https://cloud.google.com/sdk/gcloud/reference/run/services/logs/read).

## 3. Opción B: API gratis en Render, sin tarjeta

El repositorio incluye `render.yaml`, un Blueprint con el mismo Dockerfile, plan `free`, healthcheck `/regions` y chat apagado. No requiere gcloud.

1. Crea una cuenta en Render y conecta el proveedor Git del repositorio.
2. En **New → Blueprint**, selecciona el repo y la rama `chore/despliegue`, donde está `render.yaml`. Revisa que el servicio use **Free** antes de confirmar.
3. Cuando solicite `CORS_ORIGINS`, escribe el origen HTTPS de Vercel sin barra final.
4. Crea el servicio y espera a que termine el build. Copia su URL `https://…onrender.com` para `VITE_API_BASE`.
5. Si falla el flujo Blueprint, usa **New → Web Service**, el mismo repo y rama, lenguaje/runtime **Docker**, contexto `.`, Dockerfile `./Dockerfile`, instancia **Free**, healthcheck `/regions` y las tres variables del YAML. No configures un start command: el Dockerfile ya lo proporciona y respeta el `PORT` de Render.
6. Para activar chat, añade `ANTHROPIC_API_KEY` en **Environment** del servicio, cambia `CHAT_ENABLED` a `1`, guarda y redespliega. Nunca la pongas en el YAML. Las consultas a Anthropic requieren saldo aunque el hosting sea gratis.

El plan gratuito puede operar sin método de pago, con cuotas; al agotarlas puede suspender el servicio o los builds. Render puede solicitar verificación de cuenta: no se puede garantizar la admisión sin tarjeta para todas las cuentas. Se duerme tras 15 minutos sin tráfico y el arranque en frío puede tardar alrededor de un minuto. Abre `/regions` antes de la demo y espera a que responda. No tiene disco persistente; aquí los datos vienen en la imagen. Consulta [límites gratuitos](https://render.com/docs/free), [puerto HTTP](https://render.com/docs/web-services) y [formato del Blueprint](https://render.com/docs/blueprint-spec).

Cuando el equipo mezcle esta rama, actualiza `branch` en `render.yaml` o la rama de despliegue del servicio para seguir la rama definitiva. Si cambias variables en el panel y luego sincronizas el Blueprint, revisa que no vuelva a apagar el chat.

## 4. Web estática en Vercel

1. En Vercel, **Add New → Project**, importa el repositorio y selecciona la rama `chore/despliegue` para desplegar esta versión. Configúrala como **Production Branch** en Git Settings mientras la versión viva allí; tras integrarla, cambia a la rama definitiva.
2. **Root Directory:** `web`. **Framework Preset:** Vite. **Node.js:** 24.x en Project Settings.
3. **Install Command:** `npm ci`. **Build Command:** `npm run build`. **Output Directory:** `dist`. `web/vercel.json` fija Vite, build, salida y el rewrite SPA a `/index.html` para las rutas de la interfaz.
4. Añade en **Environment Variables**, al menos para **Production** (y también Preview si lo usarás):

   | Nombre | Valor |
   |---|---|
   | `VITE_DATA_SOURCE` | `api` |
   | `VITE_API_BASE` | URL HTTPS real de Cloud Run o Render, sin `/api`, sin ruta y sin barra final |

5. Haz **Deploy**. Si cambias variables, ejecuta **Redeploy**: Vite las incorpora al construir el JS, no las consulta en tiempo de ejecución.
6. Confirma el dominio asignado por Vercel y actualiza `CORS_ORIGINS` si difiere del previsto. En Render cambia la variable en Environment; en Cloud Run usa el bloque siguiente.

```bash
export FC_WEB_ORIGIN='https://tu-proyecto.vercel.app'
gcloud run services update firechronos-api --region "$FC_REGION" \
  --update-env-vars "CORS_ORIGINS=${FC_WEB_ORIGIN}"
```

`web/src/config.js`, el cliente de datos y el cliente SSE comparten `API_BASE`. Las consultas `/regions`, `/series`, `/map`, `/methodology` y `POST /chat` van directamente a esa URL. El proxy `/api` de `vite.config.js` solo sirve para desarrollo. No necesitas proxy de Vercel ni una función serverless para chat. Imágenes y teselas de NASA GIBS y el mapa base usan sus proveedores externos, como está previsto en el contrato.

No omitas las variables: sin ellas el código elige mock y una API local. Las variables `VITE_` son públicas. La configuración se apoya en la [referencia de Vercel](https://vercel.com/docs/project-configuration/vercel-json) y [Node 24 para builds](https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions).

Comprobación local opcional:

```bash
cd /tmp/fc-deploy/web
npm ci
VITE_DATA_SOURCE=api VITE_API_BASE=https://firechronos-api.example.com npm run build
```

La URL anterior es solo de ejemplo; nunca la uses en el deploy real.

## 5. Dominio de Porkbun (opcional)

Desde tu cuenta de Space Apps abre la oferta de Porkbun si aparece habilitada y canjea el cupón según sus condiciones. No des por hecho una extensión, duración o renovación gratuita: revisa el total antes de registrar y la fecha/precio de renovación. No se ha podido verificar desde este entorno la oferta específica de tu cuenta.

En Vercel entra en **Project → Settings → Domains** y añade tu dominio y, si quieres, `www`. En **Porkbun → Domain Management → DNS**, copia exactamente los registros A/CNAME y cualquier TXT de verificación que Vercel indique para ese dominio. Elimina solo los registros que entren en conflicto con esos nombres; conserva los MX/TXT de correo. Espera a que Vercel muestre dominio y certificado HTTPS válidos. No fijamos IPs de Vercel porque el panel proporciona los valores correctos. [Pasos oficiales para conectar dominios](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

Después, autoriza tanto el dominio nuevo como el anterior si seguirás usando ambos. Para pasar comas dentro del valor a gcloud usa un delimitador alternativo:

```bash
gcloud run services update firechronos-api --region "$FC_REGION" \
  --update-env-vars '^@^CORS_ORIGINS=https://tu-dominio.com,https://tu-proyecto.vercel.app'
```

CORS compara orígenes completos: `https://www.tu-dominio.com` y `https://tu-dominio.com` son distintos. No pongas rutas, barras finales ni `*.vercel.app`; el código no interpreta comodines parciales.

Para mañana conviene conservar la URL `run.app` de la API. Un CNAME `api` hacia `run.app` por sí solo no configura el enrutamiento ni TLS. El mapeo directo de dominios de Cloud Run tiene disponibilidad limitada y Santiago no aparece entre sus regiones compatibles en la [guía de dominios](https://cloud.google.com/run/docs/mapping-custom-domains). Para `api.tu-dominio.com` en Santiago, configura un Application Load Balancer externo con serverless NEG hacia el servicio de Cloud Run y certificado gestionado siguiendo esa guía; añade después el registro DNS que proporcione el balanceador. Esto añade coste y pasos, por lo que es opcional. Cuando el HTTPS funcione, cambia `VITE_API_BASE` y reconstruye la web. Si usas Render, puedes añadir el subdominio desde **Settings → Custom Domains** del servicio y seguir sus registros DNS.

## 6. Comprobación final y fallos frecuentes

Define las URLs reales; este bloque vale para Cloud Run o Render:

```bash
export FC_API_URL='https://tu-api.run.app'
export FC_WEB_ORIGIN='https://tu-proyecto.vercel.app'
for route in '/regions' '/series?region=peru' '/map?year=2024&month=9' '/methodology' '/forecast'; do
  curl -fsS -o /dev/null -w "$route: %{http_code}\n" "$FC_API_URL$route"
done
curl -fsS -o /dev/null -w 'web: %{http_code}\n' "$FC_WEB_ORIGIN/"
curl -sS -D - -o /dev/null -H "Origin: $FC_WEB_ORIGIN" "$FC_API_URL/regions"
curl -sS -D - -o /dev/null -X OPTIONS "$FC_API_URL/chat" \
  -H "Origin: $FC_WEB_ORIGIN" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
curl -sS -i -N "$FC_API_URL/chat" \
  -H "Origin: $FC_WEB_ORIGIN" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What was activity in Peru in September 2024?"}],"region":"peru","locale":"en"}'
```

- Las cinco rutas de datos y la página web deben responder **200**. El preflight debe responder **200** y permitir `POST`; las respuestas de CORS deben incluir `Access-Control-Allow-Origin` igual al origen enviado.
- Chat apagado: **503** con `detail` en inglés es lo esperado. Chat encendido con clave: **200** y eventos SSE; verifica que termine con `done`, sin evento `error`, y que los rangos mensuales aparezcan. Un 200 SSE solo no demuestra que el proveedor haya respondido bien.
- En DevTools → Network de la web, verifica que datos y chat vayan a la API HTTPS real, sin localhost ni `/api`, y que el mapa y las series carguen datos reales. Prueba recargar una ruta de interfaz para comprobar el rewrite SPA.
- Error CORS: compara origen exacto, protocolo y `www`; actualiza la variable del backend. Un curl sin `Origin` no comprueba CORS. Un origen rechazado puede obtener 200 sin cabecera CORS y seguir bloqueado en el navegador.
- 404 o HTML en una llamada de datos: probablemente apunta a Vercel o tiene `/api` añadido. Corrige `VITE_API_BASE` y redeploy.
- 503 de datos: revisa que los agregados estén en Git y dentro de la imagen. No ejecutes ETL en el servidor. 500 de `/map`: revisa logs y compatibilidad del esquema Parquet.
- Fallo de arranque: revisa build y logs; la app debe escuchar `0.0.0.0:$PORT`. Render puede estar despertando. En Cloud Run, un error IAM de build requiere revisar `roles/run.builder`, facturación y APIs habilitadas; restricciones de organización pueden impedir acceso público.
- Chat: 503 indica apagado, clave ausente o presupuesto alcanzado; 429 indica límite de preguntas. Un evento SSE `error` requiere revisar clave, saldo, acceso al modelo y logs. Para la demo puedes apagarlo sin afectar las series.

### Datos intermedios y límites conocidos

`api/chat_tools.py` busca `data/interim/series_replicates.parquet` para rangos anuales y estacionales. No se copia: su ausencia está prevista en el código. Las herramientas siguen funcionando, con `est_low`/`est_high: null` para esos agregados y un `range_note` explícito; los rangos mensuales de `series.json` permanecen disponibles. No se suman extremos mensuales ni se inventan rangos. Esta decisión no cambia datos, contrato, rutas ni código de la API. Recuperar esos intervalos sería una tarea aparte que debe revisar el contrato y la honestidad de su presentación.

### Repetir la prueba Docker

```bash
cd /tmp/fc-deploy
docker build -t firechronos-api .
docker run -d --name firechronos-api-check -p 8080:8080 \
  -e PORT=8080 -e CORS_ORIGINS=https://firechronos.vercel.app firechronos-api
```

Espera al arranque, usa el bloque de comprobaciones con `FC_API_URL=http://localhost:8080` y luego limpia:

```bash
docker logs firechronos-api-check
docker image inspect firechronos-api --format '{{.Size}}'
docker stop firechronos-api-check
docker rm firechronos-api-check
```

El tamaño anterior se expresa en bytes locales sin comprimir. No incluye una clave real ni prueba los servicios remotos. El README no se reescribió en esta tarea: aún propone todas las dependencias científicas para la API, solo muestra ejecución PowerShell de esta y no explica la configuración Vite, CORS, chat ni despliegue. La nota que llama a `scripts/recaptura.py` un borrador tampoco describe el flujo actual de `capture_recapture.py`.

## Encender el asistente "Ask Elis" con Gemini

El asistente usa Google Gemini por defecto en Render (`CHAT_PROVIDER=gemini`, modelo `gemini-3.1-flash-lite`). En Render → `elis-api` → **Environment**:

| Variable | Valor |
|---|---|
| `GEMINI_API_KEY` | La clave de Google AI Studio. Solo aquí, nunca en Vercel ni en el código |
| `CHAT_ENABLED` | `1` para encenderlo (`0` lo apaga y la web muestra solo las preguntas de ejemplo) |
| `CHAT_DAILY_BUDGET_USD` | Tope diario de gasto estimado; por defecto `0.5` |
| `CHAT_PRICE_INPUT_PER_MTOK`, `CHAT_PRICE_OUTPUT_PER_MTOK` | Precio por millón de tokens del modelo, según la página de precios de Google. Si se dejan vacíos, el control de gasto usa el precio de Claude Opus, que es mucho más alto, y el tope se alcanza antes: es seguro, pero corta el chat pronto |

Además, en la consola de Google AI Studio conviene fijar un límite de uso o de gasto en la propia cuenta.
