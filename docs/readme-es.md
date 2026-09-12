<p align="center">
  <a href="../README.md">🇬🇧 English</a> · <a href="readme-pt.md">🇧🇷 Português</a> · <strong>🇪🇸 Español</strong>
</p>

# Ghostwire

Cargadores automáticos de esqueleto en tiempo de ejecución para Livewire — sintetizados desde tu DOM en vivo, sin marcado.

Agrega `wire:ghost` a cualquier elemento (o `#[Ghost]` a una clase de componente, sin cambios en la vista) y Ghostwire sintetiza un esqueleto correspondiente a partir del DOM en vivo en el instante en que se inicia una petición de Livewire — sin marcado de placeholder escrito a mano, sin layout shift, y funciona de forma idéntica sin importar si tu aplicación usa Livewire 3.6+ o 4.x.

## Funcionalidades

- **Síntesis sin marcado** — recorre el DOM en vivo, clasifica nodos de texto/título/medios/control/contenedor, y genera un Bone Tree correspondiente, todo en un único paso de lectura en lote (sin forzar reflow)
- **Bridge dual para Livewire** — Livewire 3.6+ y 4.x soportados desde el mismo paquete, seleccionados mediante detección de características en tiempo de ejecución (nunca mediante verificación de cadena de versión)
- **Seguro para morph** — la Ghost Layer se monta fuera del árbol reconciliado por Livewire; la ocultación usa solo `visibility`/`opacity`/`pointer-events`, nunca un cambio estructural del DOM
- **Modo `freeze`** — atenúa y deshabilita el host en vivo en su lugar, para layouts que la síntesis no puede cubrir de forma segura
- **Atributo `#[Ghost]`** — a nivel de clase o método, con una cascada de precedencia de 7 niveles (modificador de directiva → expresión de directiva → método → clase → heredado → config → valor predeterminado del paquete), sin ningún cambio en la vista
- **Silencio por defecto** — los mensajes solo de sync y de polling nunca disparan un ghost, por lo que las actualizaciones en segundo plano permanecen invisibles
- **Muestreo de hermanos repetidos, recorte de áreas con scroll, geometría sticky/fixed** — los layouts reales (tablas paginadas, tableros kanban, paneles con scroll) se sintetizan correctamente, no solo tarjetas simples
- **Temas** — animaciones shimmer/pulse/wave, modo oscuro automático, soporte para `prefers-reduced-motion`, todo en CSS puro respaldado por tokens de datos/variables CSS
- **Accesibilidad** — `aria-busy`, preservación del foco durante toda la ventana del ghost, una live region compartida que anuncia el estado de carga/inactivo; limpio en axe-core en el nivel más estricto
- **Seguro para CSP** — funciona bajo una Content-Security-Policy estricta (sin scripts inline, sin `eval`); soporte de nonce de stylesheet incorporado
- **`php artisan ghost:inspect`** — mira exactamente qué nivel de precedencia decidió la configuración de cada componente
- **Aprendizaje** — recuerda el esqueleto sintetizado de un componente localmente (opt-in, rechazado en producción), de modo que el primer paint lazy de un componente en una visita posterior ya tenga un placeholder correspondiente — expórtalo con `php artisan ghost:export` como un `@placeholder` Blade estático

## Requisitos y compatibilidad

| | Compatible |
|---|---|
| PHP | 8.2, 8.3, 8.4 |
| Laravel | 12.x, 13.x |
| Livewire | 3.6+, 4.x |

### Matriz de tiers (FR-81)

La selección del bridge se basa en detección de características en tiempo de ejecución, nunca en una cadena de versión. Todo lo siguiente se verifica en ambas líneas en CI.

| Tier | Capacidades |
|---|---|
| **A — idéntico** | Directiva + todos los modificadores excepto `.island` · `#[Ghost]` completo (clase, método, herencia, precedencia) · síntesis · `freeze` · temporización (delay/hold/timeout) · silencio de sync · tema y tokens · accesibilidad · coexistencia con morph |
| **B — degradado en 3.x** | Eliminación post-pintado (emulada mediante `requestAnimationFrame` doble) · finalización (compuesta a partir de múltiples hooks) · cancelación (resuelta como finalización) · detección de poll (heurística de origen) · interceptación por acción (filtro a nivel de bridge — mismo comportamiento observable) |
| **C — solo 4.x** | Alcance de island (`.island`) · manejo de message-skip |

Detalle completo: [`/docs/compat`](https://matheusmarnt.github.io/ghostwire/docs/compat/).

## Instalación

```bash
composer require matheusmarnt/ghostwire
```

```blade
<div wire:ghost>
    {{-- your existing Livewire markup, unchanged --}}
</div>
```

Consulta [`/docs/install`](https://matheusmarnt.github.io/ghostwire/docs/install/) para ver el recorrido completo del primer efecto, y [`/playground`](https://matheusmarnt.github.io/ghostwire/playground/) para probar la síntesis en tu propio marcado sin instalar nada.

## Aprendizaje

Ghostwire puede recordar el esqueleto sintetizado de un componente localmente en el navegador y reutilizarlo la próxima vez que ese componente esté a punto de cargarse de forma lazy — así, el primer lazy paint de una visita posterior ya tiene un esqueleto correspondiente, en lugar de un placeholder en blanco. Desactivado por defecto, y rechazado en el servidor en producción sin importar la config.

```bash
GHOSTWIRE_LEARNING=true
```

```php
#[Ghost(lazy: true)]
class OrdersTable extends Component
{
    // ...
}
```

```
Ghostwire.exportLearned()      // en el navegador: descarga ghostwire-learned.json
php artisan ghost:export --component=orders-table --breakpoint=lg --from=~/Downloads/ghostwire-learned.json
```

Recorrido completo, detalles de almacenamiento/privacidad, y la postura de seguridad del comando de exportación: [`/docs/learning`](https://matheusmarnt.github.io/ghostwire/docs/learning/).

## Documentación

Documentación completa, playground en vivo y galería: **<https://matheusmarnt.github.io/ghostwire/>**

- [`/docs/wire-ghost`](https://matheusmarnt.github.io/ghostwire/docs/wire-ghost/) — directiva y modificadores
- [`/docs/ghost-attribute`](https://matheusmarnt.github.io/ghostwire/docs/ghost-attribute/) — atributo `#[Ghost]` y precedencia
- [`/docs/learning`](https://matheusmarnt.github.io/ghostwire/docs/learning/) — persistencia local, esqueletos lazy, `ghost:export`
- [`/docs/choosing`](https://matheusmarnt.github.io/ghostwire/docs/choosing/) — directiva vs. atributo
- [`/docs/compat`](https://matheusmarnt.github.io/ghostwire/docs/compat/) — matriz de tiers de Livewire 3/4
- [`/docs/theming`](https://matheusmarnt.github.io/ghostwire/docs/theming/) — tokens, modo oscuro, animación
- [`/docs/how-it-works`](https://matheusmarnt.github.io/ghostwire/docs/how-it-works/) — el algoritmo de síntesis
- [`/docs/security`](https://matheusmarnt.github.io/ghostwire/docs/security/) — CSP, transporte, cadena de suministro
- [`/docs/testing`](https://matheusmarnt.github.io/ghostwire/docs/testing/) — helpers de Pest y tests de navegador
- [`/docs/interop`](https://matheusmarnt.github.io/ghostwire/docs/interop/) — `@placeholder`, Wirebones, Flux, livecharts, scoutify

## Seguridad

Consulta [`SECURITY.md`](SECURITY.md) y [`/docs/security`](https://matheusmarnt.github.io/ghostwire/docs/security/). Ningún dato del DOM sale del navegador; el aprendizaje es completamente local; cero telemetría (FR-93).

## Otros paquetes del autor

- [livecharts](https://github.com/matheusmarnt/livecharts)
- [scoutify](https://github.com/matheusmarnt/scoutify)
- [scoutify-mcp](https://github.com/matheusmarnt/scoutify-mcp)

## Licencia

MIT © [Matheus Mariano](https://github.com/matheusmarnt). Consulta [LICENSE.md](LICENSE.md).
