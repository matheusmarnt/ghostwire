<?php

namespace Ghostwire;

use Ghostwire\Commands\InspectCommand;
use Ghostwire\Livewire\GhostComponentHook;
use Ghostwire\Support\ConfigResolver;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;
use Livewire\Livewire;

class GhostwireServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/ghostwire.php', 'ghostwire');

        $this->app->singleton(ConfigResolver::class);
    }

    public function boot(): void
    {
        Livewire::componentHook(GhostComponentHook::class);

        $this->publishes([
            __DIR__.'/../config/ghostwire.php' => config_path('ghostwire.php'),
        ], 'ghostwire-config');

        $this->publishes([
            __DIR__.'/../resources/dist' => public_path('vendor/ghostwire'),
        ], 'ghostwire-assets');

        Blade::directive('ghostwireStyles', function () {
            return "<?php echo '<link rel=\"stylesheet\" href=\"'.asset('vendor/ghostwire/ghostwire.css').'\">'; ?>";
        });

        Blade::directive('ghostwireScripts', function () {
            return "<?php echo '<script src=\"'.asset('vendor/ghostwire/ghostwire.js').'\" defer></script>'; ?>";
        });

        if ($this->app->runningInConsole()) {
            $this->commands([
                InspectCommand::class,
            ]);
        }
    }
}
