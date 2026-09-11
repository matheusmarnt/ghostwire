<?php

namespace Ghostwire;

use Ghostwire\Commands\ExportCommand;
use Ghostwire\Commands\InspectCommand;
use Ghostwire\Livewire\GhostComponentHook;
use Ghostwire\Support\ConfigResolver;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;
use Livewire\Drawer\Utils;
use Livewire\Livewire;

class GhostwireServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/ghostwire.php', 'ghostwire');

        $this->app->singleton(ConfigResolver::class);

        // Registered here, not in boot(): ComponentHookRegistry::boot()
        // (vendor/livewire/livewire/src/ComponentHookRegistry.php:34-56) consumes the
        // hook array exactly once, at the end of LivewireServiceProvider::bootFeatures()
        // (LivewireServiceProvider.php:217). A componentHook() call made from our own
        // boot() is silently dropped whenever Livewire's provider boots first, which
        // package auto-discovery order does not guarantee.
        Livewire::componentHook(GhostComponentHook::class);
    }

    public function boot(): void
    {
        // Registered here, not in register(): EventBus is only bound as a container
        // singleton inside LivewireServiceProvider::register() (bootEventBus()), and
        // package provider registration order is not guaranteed. Calling
        // Livewire::listen() before that binding exists silently attaches our
        // listener to a throwaway EventBus instance that trigger('render.placeholder')
        // never sees. boot() is safe: every provider's register() (Livewire's
        // included) has already run by the time any provider's boot() runs, and
        // EventBus listeners are read live at trigger()-time, not consumed once
        // like ComponentHookRegistry, so there is no equivalent boot-order hazard here.
        $this->registerLazyPlaceholderListener();

        $this->publishes([
            __DIR__.'/../config/ghostwire.php' => config_path('ghostwire.php'),
        ], 'ghostwire-config');

        $this->publishes([
            __DIR__.'/../resources/dist' => public_path('vendor/ghostwire'),
        ], 'ghostwire-assets');

        Blade::directive('ghostwireStyles', function ($expression) {
            $nonceExpr = trim($expression) !== '' ? $expression : 'null';

            return '<?php $__ghostwireNonce = '.$nonceExpr.'; echo \'<link rel="stylesheet" href="\'.asset(\'vendor/ghostwire/ghostwire.css\').\'"\'.($__ghostwireNonce !== null ? \' nonce="\'.e($__ghostwireNonce).\'"\' : \'\').\'>\'; ?>';
        });

        Blade::directive('ghostwireScripts', function ($expression) {
            $nonceExpr = trim($expression) !== '' ? $expression : 'null';

            return '<?php $__ghostwireNonce = '.$nonceExpr.'; echo \'<script src="\'.asset(\'vendor/ghostwire/ghostwire.js\').\'"\'.($__ghostwireNonce !== null ? \' nonce="\'.e($__ghostwireNonce).\'"\' : \'\').\' defer></script>\'; ?>';
        });

        if ($this->app->runningInConsole()) {
            $this->commands([
                InspectCommand::class,
                ExportCommand::class,
            ]);
        }
    }

    /**
     * SPEC-LRN-02: tag the lazy placeholder root so the runtime can paint a
     * learned skeleton into it before any content exists.
     *
     * 'render.placeholder' is the only mechanism present on both supported Livewire
     * majors (v4 SupportLazyLoading.php:182, v3 :150, v3.6.0 :119).
     * ComponentHook::render() never fires on this path, and
     * ComponentHook::renderPlaceholder() is Livewire 4 only.
     */
    private function registerLazyPlaceholderListener(): void
    {
        Livewire::listen('render.placeholder', function ($component, $view, $params) {
            if (! $this->shouldTagLazyPlaceholder($component)) {
                return; // returning null registers no middleware (EventBus.php:89-91)
            }

            $name = $component->getName();

            return function ($html, $replaceHtml, $viewContext) use ($name) {
                // Only ever ADD an attribute. Replacing the markup would stomp a
                // developer-declared placeholder, which SPEC-LRN-05 forbids.
                $replaceHtml(Utils::insertAttributesIntoHtmlRoot($html, [
                    'data-ghost-lazy' => $name,
                ]));
            };
        });
    }

    private function shouldTagLazyPlaceholder(object $component): bool
    {
        if (! app(ConfigResolver::class)->resolve(get_class($component))['lazy']) {
            return false;
        }

        // SPEC-LRN-05 / FR-56: a declared placeholder wins absolutely. This single
        // predicate covers a hand-written placeholder() AND a Livewire 4
        // @placeholder block, which the compiler turns into a real method.
        if (method_exists($component, 'placeholder')) {
            return false;
        }

        // A globally configured default placeholder is the developer's choice too.
        // v3 uses lazy_placeholder; v4 uses component_placeholder.
        if (config('livewire.component_placeholder') ?: config('livewire.lazy_placeholder')) {
            return false;
        }

        return (bool) preg_match('/^[a-z0-9\-.]{1,64}$/', (string) $component->getName());
    }
}
