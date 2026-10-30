# Mi economía

Aplicación local para cerrar cada mes mediante saldos reales, movimientos enlazados, obligaciones y planificación. Los datos se guardan en IndexedDB dentro del navegador; únicamente la consulta de TRM se comunica con la fuente pública de la Superintendencia Financiera.

## Uso local

Para usar la aplicación sin compilaciones al cambiar de sección:

```bash
npm install
npm run build
npm start
```

Abre [http://localhost:3000](http://localhost:3000). El periodo seleccionado se conserva al navegar entre secciones.

`npm run dev` queda reservado para modificar el código. Usa Webpack y conserva hasta 20 rutas durante una hora; la primera visita a una ruta todavía puede compilar porque es el comportamiento normal del modo de desarrollo.

## Flujo mensual

1. Abre **Cierre mensual** y copia las tasas y flujos recurrentes como previstos.
2. Consulta la TRM oficial o escribe una tasa manual.
3. Registra ingresos, gastos y transferencias indicando siempre la cuenta o tarjeta.
4. Ingresa los saldos reales y clasifica las diferencias.
5. Cierra el periodo para congelar snapshots y TRM. Para corregirlo después usa **Reabrir mes**.

El salario y otros ingresos externos se muestran separados del rendimiento pasivo. Las transferencias internas no se consideran ingreso, gasto ni ganancia.

## Respaldo de datos

En **Datos y entidades → Respaldo de tus finanzas** puedes:

- descargar todas las tablas en un archivo JSON;
- validar y restaurar un respaldo sin modificarlo;
- recuperar archivos históricos que usen la versión 1 del formato y migrarlos automáticamente a la versión 2.

La importación valida primero la estructura completa y solo después, con confirmación explícita, reemplaza los datos locales dentro de una transacción. Las tablas históricas `incomes` y `projectedIncomes` permanecen en el formato para conservar compatibilidad aunque ya no tengan un flujo duplicado en la interfaz.

Para comprobar el respaldo más reciente de la carpeta `Save`:

```bash
npm run validate:backup
```

También puedes indicar otro archivo:

```bash
npm run validate:backup -- "ruta/al/respaldo.json"
```

## Verificación del proyecto

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
