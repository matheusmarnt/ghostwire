<?php

namespace Ghostwire;

use Ghostwire\Commands\ExportCommand;
use Ghostwire\Commands\InspectCommand;
use Ghostwire\Commands\InstallCommand;
use Ghostwire\Livewire\GhostComponentHook;
use Ghostwire\Support\ConfigResolver;
use Ghostwire\Support\LearnedTree;
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
        //
        // `enabled` is a real kill switch (not a fourth spelling of mode: off):
        // false means the hook is never registered, so no component ever pays the
        // reflection or the root-HTML re-parse. mergeConfigFrom() above has already
        // run, so config() is readable here. Read once at boot — with a cached
        // config, changing GHOSTWIRE_ENABLED needs `php artisan config:clear`.
        if (config('ghostwire.enabled', true)) {
            Livewire::componentHook(GhostComponentHook::class);
        }
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

        $this->autoPublishAssetsInDev();

        Blade::directive('ghostwireStyles', function ($expression) {
            $nonceExpr = trim($expression) !== '' ? $expression : 'null';

            return '<?php if (config(\'ghostwire.enabled\', true)) { $__ghostwireNonce = '.$nonceExpr.'; echo \'<link rel="stylesheet" href="\'.asset(\'vendor/ghostwire/ghostwire.css\').\'"\'.($__ghostwireNonce !== null ? \' nonce="\'.e($__ghostwireNonce).\'"\' : \'\').\'>\'; } ?>';
        });

        Blade::directive('ghostwireScripts', function ($expression) {
            $nonceExpr = trim($expression) !== '' ? $expression : 'null';

            return '<?php if (config(\'ghostwire.enabled\', true)) { $__ghostwireNonce = '.$nonceExpr.'; $__ghostwireDebug = ! app()->isProduction(); echo \'<script src="\'.asset(\'vendor/ghostwire/ghostwire.js\').\'"\'.($__ghostwireNonce !== null ? \' nonce="\'.e($__ghostwireNonce).\'"\' : \'\').($__ghostwireDebug ? \' data-ghostwire-debug="1"\' : \'\').\' defer></script>\'; } ?>';
        });

        if ($this->app->runningInConsole()) {
            $this->commands([
                InspectCommand::class,
                ExportCommand::class,
                InstallCommand::class,
            ]);
        }
    }

    /**
     * Tag the lazy placeholder root so the runtime can paint a
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
                // developer-declared placeholder, which is forbidden.
                $replaceHtml(Utils::insertAttributesIntoHtmlRoot($html, [
                    'data-ghost-lazy' => $name,
                ]));
            };
        });
    }

    /**
     * Dev-only safety net: if a developer never ran the publish command,
     * copy the compiled runtime into public/ automatically at boot so
     * wire:ghost still works locally. Restricted to `local` so
     * production/staging boot pays zero extra filesystem I/O.
     */
    private function autoPublishAssetsInDev(): void
    {
        if (! $this->app->environment('local')) {
            return;
        }

        $publicDist = public_path('vendor/ghostwire');

        if (file_exists($publicDist.'/ghostwire.js')) {
            return;
        }

        if (! is_dir($publicDist)) {
            mkdir($publicDist, 0755, true);
        }

        copy(__DIR__.'/../resources/dist/ghostwire.js', $publicDist.'/ghostwire.js');
        copy(__DIR__.'/../resources/dist/ghostwire.css', $publicDist.'/ghostwire.css');
    }

    private function shouldTagLazyPlaceholder(object $component): bool
    {
        if (! config('ghostwire.enabled', true)) {
            return false;
        }

        if (! app(ConfigResolver::class)->resolve(get_class($component))['lazy']) {
            return false;
        }

        // A declared placeholder wins absolutely. This single
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

        return (bool) preg_match(LearnedTree::NAME_PATTERN, (string) $component->getName());
    }
}
