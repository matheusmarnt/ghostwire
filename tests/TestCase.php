<?php

namespace Ghostwire\Tests;

use Ghostwire\GhostwireServiceProvider;
use Ghostwire\Tests\Browser\Fixtures\DemoTable;
use Ghostwire\Tests\Browser\Fixtures\Gallery\CardGrid;
use Ghostwire\Tests\Browser\Fixtures\Gallery\GroupedTable;
use Ghostwire\Tests\Browser\Fixtures\Gallery\NodeCount;
use Ghostwire\Tests\Browser\Fixtures\Gallery\PaginatedTable;
use Ghostwire\Tests\Browser\Fixtures\Gallery\RepeatList;
use Ghostwire\Tests\Browser\Fixtures\Gallery\ScrollableKanban;
use Ghostwire\Tests\Browser\Fixtures\GhostAttributeProbe;
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
        Livewire::component('paginated-table', PaginatedTable::class);
        Livewire::component('grouped-table', GroupedTable::class);
        Livewire::component('card-grid', CardGrid::class);
        Livewire::component('repeat-list', RepeatList::class);
        Livewire::component('scrollable-kanban', ScrollableKanban::class);
        Livewire::component('node-count', NodeCount::class);
        Livewire::component('ghost-attribute-probe', GhostAttributeProbe::class);
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
