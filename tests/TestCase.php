<?php

namespace Ghostwire\Tests;

use Ghostwire\GhostwireServiceProvider;
use Ghostwire\Tests\Browser\Fixtures\DemoTable;
use Livewire\Livewire;
use Livewire\LivewireServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;

class TestCase extends Orchestra
{
    protected function getPackageProviders($app): array
    {
        return [GhostwireServiceProvider::class, LivewireServiceProvider::class];
    }

    protected function defineEnvironment($app): void
    {
        $app['config']->set('app.key', 'base64:'.base64_encode(random_bytes(32)));
        $app['view']->addNamespace('ghostwire-fixtures', __DIR__.'/Browser/Fixtures/views');
        Livewire::component('demo-table', DemoTable::class);
    }

    protected function defineRoutes($router): void
    {
        require __DIR__.'/Browser/Fixtures/routes.php';
    }

    protected function setUp(): void
    {
        parent::setUp();

        $publicDist = public_path('vendor/ghostwire');
        if (! is_dir($publicDist)) {
            mkdir($publicDist, 0755, true);
        }
        copy(__DIR__.'/../resources/dist/ghostwire.js', $publicDist.'/ghostwire.js');
        copy(__DIR__.'/../resources/dist/ghostwire.css', $publicDist.'/ghostwire.css');
    }
}
